import { type CellView, type Frame, FrameKind, Line, linePosition } from './Frame';
import { hash, Salt } from './hash';
import { type Town, TownKind } from './Towns';

/** A radial town has its rings and spokes inside the disc of this share of its radius; outside, grids point at the center. */
export const RADIAL_EXTENT = 0.65;
/** Distance between two rings is 26 to 36 cells, and a ring moves up to 3 cells off its place (two rings stay at least 20 cells apart). */
const RING_MIN = 26;
const RING_SPAN = 11;
const RING_JITTER = 3;
/** Every 4th ring and the ring that bounds the disc are avenues, and so are the 8 main spokes; the rest are streets. */
const RING_AVENUE_EVERY = 4;
const AVENUE_WIDTH = 2;
/** The plaza at the center is a disc of this share of the ring spacing. */
export const PLAZA_SHARE = 0.6;
/** Spokes of the innermost rings, doubled every time the ring index doubles, up to `SPOKE_LEVELS` doublings (128 spokes from the 16th ring on). */
const SPOKES = 8;
const SPOKE_LEVELS = 4;
/** How far a cell reaches from its center across a line of its own direction at most: the half diagonal of the cell. */
const REACH = Math.SQRT1_2;

/**
 * The ring road of a metropolis and of a radial city: a highway on a circle at this share of the radius, 3 cells wide. It runs near the edge
 * of the disc of the rings and is outside it only for the biggest towns: below a radius of 360 it can overlap the bounding ring (radius 220,
 * spacing 26: the disc edge at 156 +- 3, the road at 158.4 +- 2.1), and both are passable.
 */
export const RING_ROAD_SHARE = 0.72;
export const RING_ROAD_WIDTH = 3;
export const hasRingRoad = (town: Town): boolean => town.tier === 3 || (town.kind === TownKind.RADIAL && town.tier >= 2);

/** The frame of the rings and spokes of a radial town: centered on the town, `blockA` is the distance between two rings. */
export const radialFrame = (town: Town): Frame => {
	const key = hash(town.id, 0, 0, Salt.RADIAL);
	const spacing = RING_MIN + (hash(key, 0, 0, Salt.FRAME) % RING_SPAN);
	return {
		kind: FrameKind.RADIAL,
		ox: town.x,
		oy: town.y,
		c: town.axisX,
		s: town.axisY,
		half: 0.5,
		aligned: false,
		blockA: spacing,
		blockB: 0,
		phaseA: 0,
		phaseB: 0,
		jitterA: RING_JITTER,
		jitterB: 0,
		avenueEvery: RING_AVENUE_EVERY,
		avenueWidth: AVENUE_WIDTH,
		warp: 0,
		warpSet: 0,
		drop: 0,
		culDeSac: false,
		spine: 0,
		rings: Math.max(2, Math.round((RADIAL_EXTENT * town.radius) / spacing)),
		key,
	};
};

/**
 * The diamond angle of the direction (dx, dy), in [0, 4): 0 along +x, 1 along +y, 2 along -x, 3 along -y, and the cell of the L1 circle
 * `|dx| + |dy| = 1` at the same fraction in between. Exact (one division), no trigonometry. `directionX` and `directionY` are its inverse
 * on that circle, `|x| + |y| = 1`.
 */
const diamond = (dx: number, dy: number): number => {
	if (dy >= 0) return dx >= 0 ? dy / (dx + dy) : 1 - dx / (dy - dx);
	return dx < 0 ? 2 - dy / (-dx - dy) : 3 + dx / (dx - dy);
};
const directionX = (p: number): number => {
	const f = p - Math.floor(p);
	const quadrant = Math.floor(p) & 3;
	return quadrant === 0 ? 1 - f : quadrant === 1 ? -f : quadrant === 2 ? f - 1 : f;
};
const directionY = (p: number): number => {
	const f = p - Math.floor(p);
	const quadrant = Math.floor(p) & 3;
	return quadrant === 0 ? f : quadrant === 1 ? 1 - f : quadrant === 2 ? -f : f - 1;
};
/** Squared length of the L1 unit direction of `p`: 1 on the axes down to 0.5 on the diagonals, which is how fast the diamond angle turns per radian. */
const turnRate = (p: number): number => {
	const x = directionX(p);
	const y = directionY(p);
	return x * x + y * y;
};

/**
 * The rings and spokes of a radial town over a tile. The coordinates of a cell at (dx, dy) from the center are `a = r`, so the rings are
 * the circles `r = L(k)` with `L(k) = k * spacing` plus a hashed jitter, and `b = p * K / 4` for the diamond angle `p`, so the `K` spokes
 * are the rays at whole `b`. `K` doubles with the ring index (8 spokes up to ring 1, 16 from ring 2, 32 from ring 4, 64 from 8, 128 from 16),
 * so a new spoke starts on a ring and every old spoke is one of the even ones of the next level.
 *
 * A line holds the cells whose extent along its axis reaches it, as in `FrameView`: a ring of width `w` the cells with
 * `-w * ha <= r - L < w * ha` for `ha = (|dx| + |dy|) / (2 r)`, a spoke the cells with `-w * hb <= b - j < w * hb` for `hb = K / (8 (|dx| + |dy|))`.
 * Both are exactly half of the sum of the two partial derivatives of `r` and of `b` (the diamond angle changes by `1 / (|dx| + |dy|)` per
 * cell, summed over the two axes, in every quadrant), so no finite difference and no wrap of the angle is needed. They are 0.5 to 0.707 per
 * unit of width, so a line is a 4-connected band at any angle.
 *
 * The block between two rings and two spokes is cut in lots in `(u, v)`: `u = r - inner`, with `inner` the first radius clear of the ring,
 * and `v` the distance along the inner ring from the first spoke. A cell moves by at most one unit of `u` and of `v` per cell (`v` is scaled
 * by `inner / r` and by the turn rate of the block, at its fastest end), so two buildings two units apart are at least that many cells
 * apart and the yards between them stay 4-connected: the spokes diverge, which only widens a gap. Not meant to locate the center cell,
 * which is the plaza.
 */
export class RadialView implements CellView {
	readonly frame: Frame;
	line: number = Line.NONE;
	lineA: number = Line.NONE;
	lineB: number = Line.NONE;
	hitA = 0;
	hitB = 0;
	ka = 0;
	kb = 0;
	u = 0;
	v = 0;
	width = 0;
	height = 0;
	readonly plaza: number;
	private readonly rings: Float64Array;
	/** Cells closer than this are in the disc whatever their extent: the radius of the ring that bounds it. */
	private readonly edge: number;
	/** Limits and widths of the block of the last cell, NaN before it so that no cell passes the comparison. */
	private lowR = Number.NaN;
	private highR = Number.NaN;
	private thickLowR = 0;
	private thickHighR = 0;
	private lowB = Number.NaN;
	private highB = Number.NaN;
	private thickLowB = 0;
	private thickHighB = 0;
	/** `K / 4`: the diamond angle is multiplied by it to give `b`. */
	private quarter = 2;
	private first = 0;
	private inner = 0;
	private cellsPerB = 1;
	private offset = 0;

	constructor(frame: Frame) {
		this.frame = frame;
		this.rings = new Float64Array(frame.rings + 2);
		for (let k = 1; k < this.rings.length; k++) this.rings[k] = linePosition(frame, 0, k);
		this.edge = this.rings[frame.rings];
		this.plaza = PLAZA_SHARE * frame.blockA;
	}

	/** Whether the cell is in the disc: inside the ring that bounds it, or on it. */
	contains(x: number, y: number): boolean {
		const dx = x - this.frame.ox;
		const dy = y - this.frame.oy;
		const squared = dx * dx + dy * dy;
		if (squared < this.edge * this.edge) return true;
		const r = Math.sqrt(squared);
		return r - this.edge < (AVENUE_WIDTH * (Math.abs(dx) + Math.abs(dy))) / (2 * r);
	}

	locate(x: number, y: number): void {
		const dx = x - this.frame.ox;
		const dy = y - this.frame.oy;
		const r = Math.sqrt(dx * dx + dy * dy);
		const along = Math.abs(dx) + Math.abs(dy);
		const ha = along / (2 * r);
		if (r - this.lowR >= this.thickLowR * ha && this.highR - r > this.thickHighR * ha) {
			const b = diamond(dx, dy) * this.quarter;
			const hb = this.quarter / (2 * along);
			if (b - this.lowB >= this.thickLowB * hb && this.highB - b > this.thickHighB * hb) {
				this.line = Line.NONE;
				this.u = r - this.inner;
				this.v = (b - this.first) * this.cellsPerB - this.offset;
				return;
			}
		}
		this.resolve(dx, dy, r, along, ha);
	}

	worldX(u: number, v: number): number {
		const p = (this.first + (v + this.offset) / this.cellsPerB) / this.quarter;
		const x = directionX(p);
		return this.frame.ox + ((this.inner + u) * x) / Math.sqrt(x * x + directionY(p) ** 2);
	}

	worldY(u: number, v: number): number {
		const p = (this.first + (v + this.offset) / this.cellsPerB) / this.quarter;
		const y = directionY(p);
		return this.frame.oy + ((this.inner + u) * y) / Math.sqrt(y * y + directionX(p) ** 2);
	}

	private ringWidth(k: number): number {
		return k > 0 && (k % RING_AVENUE_EVERY === 0 || k === this.frame.rings) ? AVENUE_WIDTH : 1;
	}

	private spokeWidth(j: number, spokes: number): number {
		return (j * SPOKES) % spokes === 0 ? AVENUE_WIDTH : 1;
	}

	/** Finds the lines and the block of the cell, and keeps that block as the one the next cell is compared with. */
	private resolve(dx: number, dy: number, r: number, along: number, ha: number): void {
		const { rings } = this;
		const last = this.frame.rings;
		let i = Math.min(last, Math.floor(r / this.frame.blockA));
		while (i < last && rings[i + 1] <= r) i++;
		while (i > 0 && rings[i] > r) i--;
		const widthLow = this.ringWidth(i);
		const widthHigh = this.ringWidth(i + 1);
		let lineA: number = Line.NONE;
		if (r - rings[i] < widthLow * ha) {
			lineA = widthLow === AVENUE_WIDTH ? Line.AVENUE : Line.STREET;
			this.hitA = i;
		}
		if (rings[i + 1] - r <= widthHigh * ha) {
			const other = widthHigh === AVENUE_WIDTH ? Line.AVENUE : Line.STREET;
			if (other > lineA) {
				lineA = other;
				this.hitA = i + 1;
			}
		}

		const spokes = SPOKES << (i < 2 ? 0 : Math.min(SPOKE_LEVELS, 31 - Math.clz32(i)));
		const quarter = spokes / 4;
		const b = diamond(dx, dy) * quarter;
		const hb = quarter / (2 * along);
		const j = Math.min(spokes - 1, Math.floor(b));
		const spokeLow = this.spokeWidth(j, spokes);
		const spokeHigh = this.spokeWidth(j + 1 === spokes ? 0 : j + 1, spokes);
		let lineB: number = Line.NONE;
		if (b - j < spokeLow * hb) {
			lineB = spokeLow === AVENUE_WIDTH ? Line.AVENUE : Line.STREET;
			this.hitB = j;
		}
		if (j + 1 - b <= spokeHigh * hb) {
			const other = spokeHigh === AVENUE_WIDTH ? Line.AVENUE : Line.STREET;
			if (other > lineB) {
				lineB = other;
				this.hitB = j + 1;
			}
		}
		this.lineA = lineA;
		this.lineB = lineB;
		this.line = Math.max(lineA, lineB);

		this.ka = i;
		this.kb = j;
		this.lowR = rings[i];
		this.highR = rings[i + 1];
		this.thickLowR = widthLow;
		this.thickHighR = widthHigh;
		this.lowB = j;
		this.highB = j + 1;
		this.thickLowB = spokeLow;
		this.thickHighB = spokeHigh;
		this.quarter = quarter;
		this.first = j;
		this.inner = i === 0 ? this.plaza : rings[i] + widthLow * REACH;
		this.width = rings[i + 1] - widthHigh * REACH - this.inner;
		/** The block is as wide as its inner ring at the end where the diamond angle turns fastest (`turnRate` is convex, so an end of the block). */
		this.cellsPerB = this.inner / (quarter * Math.max(turnRate(j / quarter), turnRate((j + 1) / quarter)));
		this.offset = spokeLow * REACH;
		this.height = this.cellsPerB - (spokeLow + spokeHigh) * REACH;
		this.u = r - this.inner;
		this.v = (b - j) * this.cellsPerB - this.offset;
	}
}

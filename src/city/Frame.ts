import { hash, Salt } from './hash';
import { SampledField, ValueNoise } from './Noise';

/**
 * How a district lays its streets out: a straight grid, a grid bent by a smooth warp, rings and spokes around the center. GRID and WARP
 * are evaluated, RADIAL is reserved so a frame can switch to it without a new type.
 */
export const FrameKind = { GRID: 0, WARP: 1, RADIAL: 2 } as const;
export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

/**
 * The coordinates of one district. A cell at (x, y) has `a = dx * c + dy * s` and `b = -dx * s + dy * c`, with (dx, dy) measured from the
 * origin: the streets are the lines of constant `a` (family A) and of constant `b` (family B), the blocks are the rectangles between them.
 * A WARP frame adds a smooth field to each: `a += warp * (2 * wA - 1)`, `b += warp * (2 * wB - 1)`, which bends the lines into curves and
 * leaves the blocks in the coordinates of the straight grid.
 */
export interface Frame {
	kind: FrameKind;
	ox: number;
	oy: number;
	/** Unit vector of the A axis. */
	c: number;
	s: number;
	/** `(|c| + |s|) / 2`: how far a cell reaches along an axis from its center, 0.5 for an axis-aligned frame and 0.707 at 45 degrees. */
	half: number;
	/** Whether the axes run along x and y: the cells are exactly the units of the frame. */
	aligned: boolean;
	blockA: number;
	blockB: number;
	phaseA: number;
	phaseB: number;
	/** A line moves up to this many units off its place on the regular grid: lines stay in order and the grid does not look ruled. */
	jitterA: number;
	jitterB: number;
	/** Every `avenueEvery`th line is an avenue, `avenueWidth` times as thick as a street. */
	avenueEvery: number;
	avenueWidth: number;
	/** Amplitude of the warp in cells, 0 for a GRID frame, and the `WarpSet` it reads. */
	warp: number;
	warpSet: 0 | 1;
	/** Share of the street segments between two crossings that are left out; a cul-de-sac frame keeps the start of them as a dead end. */
	drop: number;
	culDeSac: boolean;
	/** Uint32 hash that names the frame in the hashes of its lines and blocks. */
	key: number;
}

export const Line = { NONE: 0, STREET: 1, AVENUE: 2 } as const;

/** Position on its axis of the line number `k` of family A (`family` 0) or B (1). */
export const linePosition = (frame: Frame, family: 0 | 1, k: number): number => {
	const block = family === 0 ? frame.blockA : frame.blockB;
	const jitter = family === 0 ? frame.jitterA : frame.jitterB;
	return (family === 0 ? frame.phaseA : frame.phaseB) + k * block + (hash(frame.key, k, family, Salt.LINE_JITTER) % (2 * jitter + 1)) - jitter;
};

/** World x and y of the point (a, b) of the frame; the block centers use it, the warp is ignored. */
export const frameX = (frame: Frame, a: number, b: number): number => frame.ox + a * frame.c - b * frame.s;
export const frameY = (frame: Frame, a: number, b: number): number => frame.oy + a * frame.s + b * frame.c;

/**
 * Period of the warp noise per style: 56 cells bends the lanes of an organic quarter every few blocks, 140 cells gives the long sweeping
 * curves of the sprawl. The amplitude of a frame is at most `0.18 * period` (9 and 24 cells are used): the noise changes at most 1.5 per
 * period, so `a` changes by at most `2 * warp * 1.5 / period * sqrt(2) = 0.76` per cell on top of its unit slope, which keeps the lines
 * from folding back on themselves (0.76 < 1). The values are sampled every 4 cells, which is smooth enough for 56.
 */
const WARP_PERIOD: readonly number[] = [56, 140];
const WARP_STEP = 4;
const WARP_SALTS: readonly (readonly [number, number])[] = [
	[Salt.FABRIC_WARP_A, Salt.FABRIC_WARP_B],
	[Salt.SPRAWL_WARP_A, Salt.SPRAWL_WARP_B],
];

/**
 * The two warp fields of one style over a tile, at every cell plus one more row and column: the extent of a cell comes from the next
 * cell's value. Per-tile state, `prepare` fills it once for a (x0, y0, size) however many towns and districts read it.
 */
export class WarpSet {
	a = new Float64Array(0);
	b = new Float64Array(0);
	private readonly fieldA: SampledField;
	private readonly fieldB: SampledField;
	private x0 = 0;
	private y0 = 0;
	private size = -1;

	constructor(seed: number, set: 0 | 1) {
		const [saltA, saltB] = WARP_SALTS[set];
		const noiseA = new ValueNoise(seed, saltA, WARP_PERIOD[set]);
		const noiseB = new ValueNoise(seed, saltB, WARP_PERIOD[set]);
		this.fieldA = new SampledField((x, y) => noiseA.at(x, y), WARP_STEP);
		this.fieldB = new SampledField((x, y) => noiseB.at(x, y), WARP_STEP);
	}

	prepare(x0: number, y0: number, size: number): void {
		if (size === this.size && x0 === this.x0 && y0 === this.y0) return;
		const side = size + 1;
		if (this.a.length < side * side) {
			this.a = new Float64Array(side * side);
			this.b = new Float64Array(side * side);
		}
		this.fieldA.fillTile(x0, y0, side, this.a);
		this.fieldB.fillTile(x0, y0, side, this.b);
		this.x0 = x0;
		this.y0 = y0;
		this.size = size;
	}
}

/**
 * The lines of one family over the range of a tile: the line numbers `first ..`, where a line of width `w` holds the cells with
 * `-w * half <= a - L < w * half`. The cell is a closed square and the line is continuous, so every cell it touches shares an edge with the
 * next one it touches: the cells are 4-connected, a staircase at an angle and a single row on an axis. An axis-aligned street (`w = 1`,
 * `half = 0.5`) holds exactly the one cell where `a === L`. A warped frame uses the extent of the cell itself in place of `half`: the
 * same argument holds for a continuous curve.
 */
class Family {
	first = 0;
	/** Position `L` of each line, the end of its band `L - w * half` (where the block before it ends), and the start of the block after it, `L + w * half`. */
	lines = new Float64Array(0);
	ends = new Float64Array(0);
	starts = new Float64Array(0);
	/** Thickness of each line in streets (1 or `avenueWidth`), and whether it is an avenue. */
	widths = new Float64Array(0);
	avenue = new Uint8Array(0);
	/** Number of the line that the last `lineAt` or `lineAtWith` found the position on. */
	hit = 0;

	build(frame: Frame, family: 0 | 1, low: number, high: number): void {
		const block = family === 0 ? frame.blockA : frame.blockB;
		const phase = family === 0 ? frame.phaseA : frame.phaseB;
		/** The margin of 2 lines on each side covers the jitter, which is under an eighth of a block. */
		this.first = Math.floor((low - phase) / block) - 2;
		const count = Math.floor((high - phase) / block) + 2 - this.first + 1;
		this.lines = new Float64Array(count);
		this.ends = new Float64Array(count);
		this.starts = new Float64Array(count);
		this.widths = new Float64Array(count);
		this.avenue = new Uint8Array(count);
		for (let i = 0; i < count; i++) {
			const k = this.first + i;
			const thick = (k % frame.avenueEvery === 0 ? frame.avenueWidth : 1) * frame.half;
			this.lines[i] = linePosition(frame, family, k);
			this.ends[i] = this.lines[i] - thick;
			this.starts[i] = this.lines[i] + thick;
			this.widths[i] = k % frame.avenueEvery === 0 ? frame.avenueWidth : 1;
			this.avenue[i] = k % frame.avenueEvery === 0 ? 1 : 0;
		}
	}

	/** Index in the tables of the last line at or before `p`: the estimate is within one line of the answer. */
	indexAt(frame: Frame, family: 0 | 1, p: number): number {
		const { lines } = this;
		let i = Math.floor((p - (family === 0 ? frame.phaseA : frame.phaseB)) / (family === 0 ? frame.blockA : frame.blockB)) - this.first;
		while (lines[i + 1] <= p) i++;
		while (lines[i] > p) i--;
		return i;
	}

	/** The `Line` the position `p` is on among the lines `i` and `i + 1`, which hold it when it is under the start of line `i`'s band or past the end of line `i + 1`'s. */
	lineAt(p: number, i: number): number {
		let line: number = Line.NONE;
		if (p < this.starts[i]) {
			line = this.avenue[i] === 1 ? Line.AVENUE : Line.STREET;
			this.hit = this.first + i;
		}
		if (p >= this.ends[i + 1]) {
			const other = this.avenue[i + 1] === 1 ? Line.AVENUE : Line.STREET;
			if (other > line) {
				line = other;
				this.hit = this.first + i + 1;
			}
		}
		return line;
	}

	/** `lineAt` for a cell whose extent along the axis is `h` instead of the `half` of the frame. The same tests as the block limits of `FrameView`, to the bit. */
	lineAtWith(p: number, i: number, h: number): number {
		let line: number = Line.NONE;
		if (p - this.lines[i] < this.widths[i] * h) {
			line = this.avenue[i] === 1 ? Line.AVENUE : Line.STREET;
			this.hit = this.first + i;
		}
		if (this.lines[i + 1] - p <= this.widths[i + 1] * h) {
			const other = this.avenue[i + 1] === 1 ? Line.AVENUE : Line.STREET;
			if (other > line) {
				line = other;
				this.hit = this.first + i + 1;
			}
		}
		return line;
	}
}

/**
 * A frame over one tile: the position of every line the tile can touch is computed once on the first `locate`, so a cell finds its lines
 * with no hash. `locate` sets the fields below for a cell of the tile. A cell inside the block of the last cell that was in one only
 * compares its `a` and `b` with the limits of that block, which is most of them. The answer never depends on the cells located before:
 * the block limits are the same comparisons as the line tests.
 */
export class FrameView {
	readonly frame: Frame;
	/** Whether the cell is on a line (`Line`): the avenue wins over the street where they cross. */
	line: number = Line.NONE;
	/**
	 * The line of each family the cell is on, and its number, set when `line` is not NONE: a street cell with the other family NONE is on a
	 * segment of its line, between two cross streets, and one with both families on a street is a crossing.
	 */
	lineA: number = Line.NONE;
	lineB: number = Line.NONE;
	hitA = 0;
	hitB = 0;
	/** Numbers of the lines that bound the block of the cell: its low side, `ka` for family A and `kb` for B. */
	ka = 0;
	kb = 0;
	/**
	 * Position of the cell in its block, in units of the frame: `0 <= u < width` and `0 <= v < height` for a cell inside the block. A cell of
	 * a street is placed against the block it borders, and a warped cell can be a little outside, where no building stands.
	 */
	u = 0;
	v = 0;
	width = 0;
	height = 0;
	/** The `a` and `b` of the corner of the block with the lowest coordinates: block-local (u, v) is at (originA + u, originB + v). */
	originA = 0;
	originB = 0;
	private readonly tileX: number;
	private readonly tileY: number;
	private readonly tileSize: number;
	private readonly warp: WarpSet | null;
	private warpReady = false;
	private ready = false;
	private readonly familyA = new Family();
	private readonly familyB = new Family();
	/** Limits of the block of the last cell, NaN before it: no `a` or `b` passes the comparison with NaN. */
	private endA = Number.NaN;
	private endB = Number.NaN;
	/** The same block for a warped frame: the positions of its four lines and their thickness in streets, since its bands depend on the cell. */
	private lowA = Number.NaN;
	private highA = Number.NaN;
	private thickLowA = 0;
	private thickHighA = 0;
	private lowB = Number.NaN;
	private highB = Number.NaN;
	private thickLowB = 0;
	private thickHighB = 0;

	/**
	 * `warp` is the set of a WARP frame, null for a GRID frame. It is filled for the tile on the first `locate`, not here: a tile that a town's
	 * reach box touches often holds no urban cell, and the fill is the costliest step of a warped frame (0.4 ms per set and tile).
	 */
	constructor(frame: Frame, x0: number, y0: number, size: number, warp: WarpSet | null) {
		this.frame = frame;
		this.tileX = x0;
		this.tileY = y0;
		this.tileSize = size;
		this.warp = warp;
	}

	/** The range of `a` and `b` over the tile comes from its four corners, widened by the warp. */
	private build(): void {
		const { frame, tileX, tileY, tileSize } = this;
		const lowX = tileX - frame.ox;
		const highX = tileX + tileSize - 1 - frame.ox;
		const lowY = tileY - frame.oy;
		const highY = tileY + tileSize - 1 - frame.oy;
		let aLow = Infinity;
		let aHigh = -Infinity;
		let bLow = Infinity;
		let bHigh = -Infinity;
		for (const dx of [lowX, highX]) {
			for (const dy of [lowY, highY]) {
				const a = dx * frame.c + dy * frame.s;
				const b = dy * frame.c - dx * frame.s;
				aLow = Math.min(aLow, a);
				aHigh = Math.max(aHigh, a);
				bLow = Math.min(bLow, b);
				bHigh = Math.max(bHigh, b);
			}
		}
		this.familyA.build(frame, 0, aLow - frame.warp, aHigh + frame.warp);
		this.familyB.build(frame, 1, bLow - frame.warp, bHigh + frame.warp);
		this.ready = true;
	}

	/** Sets the fields for the cell (x, y), which must lie in the tile of the view. */
	locate(x: number, y: number): void {
		const { frame, warp } = this;
		const dx = x - frame.ox;
		const dy = y - frame.oy;
		let a = dx * frame.c + dy * frame.s;
		let b = dy * frame.c - dx * frame.s;
		if (warp === null) {
			if (a >= this.originA && a < this.endA && b >= this.originB && b < this.endB) {
				this.line = Line.NONE;
				this.u = a - this.originA;
				this.v = b - this.originB;
				return;
			}
			this.resolve(a, b, frame.half, frame.half);
			return;
		}

		/** The extent of the cell along each axis is half the change of `a` (or `b`) to the cell on its right plus to the cell below it. */
		if (!this.warpReady) {
			warp.prepare(this.tileX, this.tileY, this.tileSize);
			this.warpReady = true;
		}
		const { a: warpA, b: warpB } = warp;
		const stride = this.tileSize + 1;
		const at = (y - this.tileY) * stride + x - this.tileX;
		const wa = warpA[at];
		const wb = warpB[at];
		const slope = 2 * frame.warp;
		const ha = (Math.abs(frame.c + slope * (warpA[at + 1] - wa)) + Math.abs(frame.s + slope * (warpA[at + stride] - wa))) / 2;
		const hb = (Math.abs(slope * (warpB[at + 1] - wb) - frame.s) + Math.abs(frame.c + slope * (warpB[at + stride] - wb))) / 2;
		a += frame.warp * (2 * wa - 1);
		b += frame.warp * (2 * wb - 1);
		if (a - this.lowA >= this.thickLowA * ha && this.highA - a > this.thickHighA * ha && b - this.lowB >= this.thickLowB * hb && this.highB - b > this.thickHighB * hb) {
			this.line = Line.NONE;
			this.u = a - this.originA;
			this.v = b - this.originB;
			return;
		}
		this.resolve(a, b, ha, hb);
	}

	/** Finds the lines and the block of a cell with coordinates (a, b) and extents (ha, hb), and keeps that block as the one the next cell is compared with. */
	private resolve(a: number, b: number, ha: number, hb: number): void {
		const { frame, familyA, familyB } = this;
		if (!this.ready) this.build();
		const i = familyA.indexAt(frame, 0, a);
		const j = familyB.indexAt(frame, 1, b);
		const warped = this.warp !== null;
		const lineA = warped ? familyA.lineAtWith(a, i, ha) : familyA.lineAt(a, i);
		const lineB = warped ? familyB.lineAtWith(b, j, hb) : familyB.lineAt(b, j);
		this.lineA = lineA;
		this.lineB = lineB;
		this.hitA = familyA.hit;
		this.hitB = familyB.hit;
		this.line = Math.max(lineA, lineB);

		this.ka = i + familyA.first;
		this.kb = j + familyB.first;
		this.originA = familyA.starts[i];
		this.originB = familyB.starts[j];
		this.endA = familyA.ends[i + 1];
		this.endB = familyB.ends[j + 1];
		this.width = this.endA - this.originA;
		this.height = this.endB - this.originB;
		this.u = a - this.originA;
		this.v = b - this.originB;
		if (warped) {
			this.lowA = familyA.lines[i];
			this.highA = familyA.lines[i + 1];
			this.thickLowA = familyA.widths[i];
			this.thickHighA = familyA.widths[i + 1];
			this.lowB = familyB.lines[j];
			this.highB = familyB.lines[j + 1];
			this.thickLowB = familyB.widths[j];
			this.thickHighB = familyB.widths[j + 1];
		}
	}
}

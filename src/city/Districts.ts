import { type Frame, FrameKind, FrameView } from './Frame';
import { hash, Salt, unit } from './hash';
import { type Town, TownKind, type Towns } from './Towns';

/** Side of the lattice that holds the district seeds, per tier: a village is one district, a city has districts of 260 cells. */
const DISTRICT_SIZE: readonly number[] = [0, 170, 210, 260];
/**
 * A seed sits up to this share of the lattice side off the center of its square. The 3 x 3 squares around a cell hold its nearest seed
 * as long as this stays under 0.328: the own seed is at most `sqrt(2) * (0.5 + jitter)` sides away, a seed two squares over at least
 * `1.5 - jitter`, and the two meet at `jitter = 0.7929 / 2.4142`.
 */
const DISTRICT_JITTER = 0.3;
/** A boundary is an avenue of this many streets' thickness: the bisector of two seeds is a straight line, so the same 4-connected band as a frame line. */
const BOUNDARY_WIDTH = 2;
/**
 * A seed whose square is not near the tile cannot be the nearest or the second nearest of any of its cells, so a cell only compares the
 * candidates: the seeds no farther from the tile than `U + MARGIN`, where `U` is the least over the seeds of the distance to the farthest
 * corner (every cell has a seed within `U`). A seed `k` is the second nearest of a boundary cell only if
 * `d_k^2 - d_1^2 < BOUNDARY_WIDTH * (|nx| + |ny|)`, and `|nx| + |ny| <= sqrt(2) * (d_k + d_1)` with `d_1 <= U` gives `d_k <= U + BOUNDARY_WIDTH * sqrt(2) / 2`.
 */
const CANDIDATE_MARGIN = 3;
/** Below this level of its seed a district of a planned or organic town is sprawl instead, with this chance. */
const EDGE_LEVEL = 0.25;
const PLANNED_SPRAWL = 0.4;
const ORGANIC_SPRAWL = 0.5;
/** The metropolis downtown (a district seed above this level) has blocks of 28 to 36 cells. */
export const CBD_LEVEL = 0.75;
/**
 * Tangent of the half angle that a district turns off the axis of its town, at most: 0.2217 is 25 degrees in all, 0.0875 is 10. 30% of the
 * districts of a planned town keep the axis of the town exactly.
 */
const PLANNED_SPREAD = 0.2217;
const RING_SPREAD = 0.0875;
const KEEP_AXIS_SHARE = 0.3;
const AVENUE_WIDTH = 2;

/** Ranges of the block sizes of a style, in cells: `blockB` is `blockA` times 0.6 to 1.6 when `ratio`. */
interface Style {
	minA: number;
	spanA: number;
	minB: number;
	spanB: number;
	ratio: boolean;
	avenueEvery: number;
}

const PLAN_STYLE: Style = { minA: 18, spanA: 12, minB: 0, spanB: 0, ratio: true, avenueEvery: 4 };
const CBD_STYLE: Style = { minA: 28, spanA: 9, minB: 28, spanB: 9, ratio: false, avenueEvery: 4 };
const ORGANIC_STYLE: Style = { minA: 10, spanA: 7, minB: 10, spanB: 7, ratio: false, avenueEvery: 6 };
const SPRAWL_STYLE: Style = { minA: 28, spanA: 13, minB: 12, spanB: 7, ratio: false, avenueEvery: 5 };
/** The cross streets are close (family A runs across the axis), the long streets along the axis are far apart. */
const LINEAR_STYLE: Style = { minA: 14, spanA: 9, minB: 40, spanB: 21, ratio: false, avenueEvery: 4 };

/** Ids of the hashes of one frame, so the parameters of a district are independent. */
const Param = { ANGLE: 0, SPRAWL: 1, KEEP: 2, BLOCK_A: 3, BLOCK_B: 4, PHASE_A: 5, PHASE_B: 6 } as const;

export interface District {
	/** Index among the candidate districts of the prepared tile: part of the block keys of `Fabric`. */
	slot: number;
	sx: number;
	sy: number;
	view: FrameView;
}

/**
 * The districts of a town: the plane is cut into the Voronoi cells of seeds placed on a lattice anchored at the town center (one hashed
 * seed per square), each with its own street frame, and the boundary between two districts is an avenue. A village and a linear town are
 * one district. `prepare` finds the seeds that matter for a tile and builds their frames, and a cell only compares those, so a tile of any
 * size and origin gives a cell the same district.
 */
export class Districts {
	private readonly towns: Towns;
	private entries: District[] = [];
	/** Whether the last `locate` cell is within the boundary avenue of its district. */
	boundary = false;

	constructor(towns: Towns) {
		this.towns = towns;
	}

	/** Builds the districts that can own a cell of the `size` x `size` tile at (x0, y0): the seeds of the squares around it, pruned to the candidates. */
	prepare(town: Town, x0: number, y0: number, size: number): void {
		const side = town.kind === TownKind.LINEAR ? 0 : DISTRICT_SIZE[town.tier];
		const entries: District[] = [];
		this.entries = entries;
		if (side === 0) {
			entries.push({ slot: 0, sx: town.x, sy: town.y, view: new FrameView(this.frameOf(town, 0, 0, town.x, town.y), x0, y0, size) });
			return;
		}

		const x1 = x0 + size - 1;
		const y1 = y0 + size - 1;
		const firstI = Math.floor((x0 - town.x) / side) - 1;
		const firstJ = Math.floor((y0 - town.y) / side) - 1;
		const lastI = Math.floor((x1 - town.x) / side) + 1;
		const lastJ = Math.floor((y1 - town.y) / side) + 1;
		const jitter = 2 * DISTRICT_JITTER * side;
		const seeds: { i: number; j: number; sx: number; sy: number; near: number }[] = [];
		let reach = Infinity;
		for (let j = firstJ; j <= lastJ; j++) {
			for (let i = firstI; i <= lastI; i++) {
				const sx = Math.round(town.x + (i + 0.5) * side + (unit(hash(town.id, i, j, Salt.DISTRICT_X)) - 0.5) * jitter);
				const sy = Math.round(town.y + (j + 0.5) * side + (unit(hash(town.id, i, j, Salt.DISTRICT_Y)) - 0.5) * jitter);
				const nearX = Math.max(x0 - sx, 0, sx - x1);
				const nearY = Math.max(y0 - sy, 0, sy - y1);
				const farX = Math.max(sx - x0, x1 - sx);
				const farY = Math.max(sy - y0, y1 - sy);
				reach = Math.min(reach, Math.sqrt(farX * farX + farY * farY));
				seeds.push({ i, j, sx, sy, near: Math.sqrt(nearX * nearX + nearY * nearY) });
			}
		}
		for (const seed of seeds) {
			if (seed.near > reach + CANDIDATE_MARGIN) continue;
			entries.push({ slot: entries.length, sx: seed.sx, sy: seed.sy, view: new FrameView(this.frameOf(town, seed.i, seed.j, seed.sx, seed.sy), x0, y0, size) });
		}
	}

	/**
	 * The district of the cell (x, y) of the prepared tile, and `boundary` for whether the cell is on the avenue between it and the next
	 * seed. The nearest seed wins, a tie goes to the lower (j, i), which is the order of the candidates. The boundary test is the distance
	 * to the bisector of the two nearest seeds, `(d2^2 - d1^2) / (2 |n|)` for the offset `n` between them, against
	 * `BOUNDARY_WIDTH * (|nx| + |ny|) / (2 |n|)`: the `2 |n|` cancels.
	 */
	locate(x: number, y: number): District {
		const { entries } = this;
		let best = entries[0];
		if (entries.length === 1) {
			this.boundary = false;
			return best;
		}
		let second = best;
		let bestD = Infinity;
		let secondD = Infinity;
		for (let k = 0; k < entries.length; k++) {
			const e = entries[k];
			const d = (x - e.sx) * (x - e.sx) + (y - e.sy) * (y - e.sy);
			if (d < bestD) {
				second = best;
				secondD = bestD;
				best = e;
				bestD = d;
			} else if (d < secondD) {
				second = e;
				secondD = d;
			}
		}
		this.boundary = secondD - bestD < BOUNDARY_WIDTH * (Math.abs(second.sx - best.sx) + Math.abs(second.sy - best.sy));
		return best;
	}

	/** The street frame of the district of seed (sx, sy) in square (i, j), chosen by the kind of the town and the level at the seed. */
	private frameOf(town: Town, i: number, j: number, sx: number, sy: number): Frame {
		const key = hash(town.id, i, j, Salt.DISTRICT);
		const param = (id: number): number => hash(key, id, 0, Salt.FRAME);
		const level = this.towns.urban(town, sx, sy);
		const { kind } = town;

		let style = PLAN_STYLE;
		let spread = 0;
		let free = false;
		if (kind === TownKind.LINEAR) {
			style = LINEAR_STYLE;
		} else if (kind === TownKind.SPRAWL || (town.tier >= 1 && level < EDGE_LEVEL && ((kind === TownKind.PLANNED && unit(param(Param.SPRAWL)) < PLANNED_SPRAWL) || (kind === TownKind.ORGANIC && unit(param(Param.SPRAWL)) < ORGANIC_SPRAWL)))) {
			style = SPRAWL_STYLE;
			free = true;
		} else if (kind === TownKind.ORGANIC) {
			style = ORGANIC_STYLE;
			free = true;
		} else {
			style = town.tier === 3 && level > CBD_LEVEL ? CBD_STYLE : PLAN_STYLE;
			spread = kind === TownKind.PLANNED ? PLANNED_SPREAD : RING_SPREAD;
		}

		/** The half angle tangent `t` of a hashed value gives a unit vector with no trigonometry. */
		const keep = kind === TownKind.PLANNED && unit(param(Param.KEEP)) < KEEP_AXIS_SHARE;
		const t = free ? 2 * unit(param(Param.ANGLE)) - 1 : keep ? 0 : spread * (2 * unit(param(Param.ANGLE)) - 1);
		const cosine = (1 - t * t) / (1 + t * t);
		const sine = (2 * t) / (1 + t * t);
		const c = free ? cosine : town.axisX * cosine - town.axisY * sine;
		const s = free ? sine : town.axisY * cosine + town.axisX * sine;

		const blockA = style.minA + (param(Param.BLOCK_A) % style.spanA);
		const blockB = style.ratio ? Math.round(blockA * (0.6 + unit(param(Param.BLOCK_B)))) : style.minB + (param(Param.BLOCK_B) % style.spanB);
		return {
			kind: FrameKind.GRID,
			ox: sx,
			oy: sy,
			c,
			s,
			half: (Math.abs(c) + Math.abs(s)) / 2,
			aligned: s === 0 || c === 0,
			blockA,
			blockB,
			phaseA: param(Param.PHASE_A) % blockA,
			phaseB: param(Param.PHASE_B) % blockB,
			jitterA: blockA >> 3,
			jitterB: blockB >> 3,
			avenueEvery: style.avenueEvery,
			avenueWidth: AVENUE_WIDTH,
			key,
		};
	}
}

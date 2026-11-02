import { hash, Salt } from './hash';
import { ValueNoise } from './Noise';
import { BEACH_TOP, HILL_LEVEL, type Relief, SEA_LEVEL } from './Relief';
import { type Town, Towns } from './Towns';
import { LAKE_LEVEL, LAKE_QUAY, type Water } from './Water';

/** Where a cell is relative to the rampart of a walled town: outside it, on it, or inside (the gates and the cells of the rampart that are water count as inside). */
export const WallZone = { OUT: 0, RAMPART: 1, IN: 2 } as const;

/** The wall of a town of tier 1 and 2 stands at 0.3 radii from the center, at least 40 cells; that of a metropolis, whose downtown is large, at 0.18. */
const WALL_SHARE = 0.3;
const METRO_WALL_SHARE = 0.18;
const WALL_MIN = 40;
/** The wall wanders by up to 8% of its radius with a noise of period 90: a lobe every few hundred cells, not a circle. */
const WALL_WOBBLE = 0.08;
const WALL_PERIOD = 90;
/**
 * The rampart is the band of cells with `0 <= r - R < thickness`, where `R` is the wall radius at the cell. A 4-connected walk cannot cross
 * it when the band is thicker than the biggest change of `r - R` between two cells that share an edge: `|dx| / r` or `|dy| / r` for `r`, which
 * the term `(|dx| + |dy|) / r` of the band covers, plus the slope of the wobble. The slope per axis is at most `1.5 / WALL_PERIOD` of the
 * noise (the steepest point of a smoothstep) times `2 * WALL_WOBBLE` of the wall radius, which `WALL_SLOPE` is for each unit of the radius: up
 * to 0.29 for the biggest wall of a city (108) and 0.46 for a metropolis (171). The factor 1.2 on the band of `r` that would stand for it is
 * under the 1.29 and 1.46 that an axis-aligned stretch of those walls needs, so the slope is added instead. `WALL_SLACK` covers the
 * curvature of `r` (under 1 / (2 * 40)) and the rounding.
 */
const WALL_SLOPE = (2 * WALL_WOBBLE * 1.5) / WALL_PERIOD;
const WALL_SLACK = 0.05;
/**
 * The cells within this many cells of an axis of the town, at the rampart, are a gate; the avenue of a gate runs out to this far past the wall
 * radius. 24 cells left it a dead end in a radial city (the next ring is up to 39 cells out, 36 apart plus the jitter), whose walled core was
 * then a road component of its own, cut off from the highways (seed 2, town at region 3,13); 40 reaches a ring or a street of the grids around.
 */
const GATE_HALF = 3;
const GATE_ROAD = 40;
/** Band around the wall radius that can hold the rampart: the wobble of 8%, the thickness (under 2) and a margin. Inside and beyond it a cell needs no noise. */
const BAND_SHARE = 0.1;
const BAND_MARGIN = 3;

/**
 * The wall of a walled old town: a rampart at `wallRadius` from the center, with a gate on each of the four axes of the town (along its
 * axis and across it), and an avenue through every gate from the center out to `GATE_ROAD` cells past the wall. It tells `Districts` and
 * `Fabric` where a cell is, and holds the state of the town it was prepared for.
 */
export class Walls {
	private readonly noise: ValueNoise;
	private x = 0;
	private y = 0;
	private c = 1;
	private s = 0;
	private radius = 0;
	private lowSquared = 0;
	private highSquared = 0;
	private roadSquared = 0;
	private slope = 0;

	constructor(seed: number) {
		this.noise = new ValueNoise(seed, Salt.WALL_SHAPE, WALL_PERIOD);
	}

	static radiusOf(town: Town): number {
		return Math.max(WALL_MIN, (town.tier === 3 ? METRO_WALL_SHARE : WALL_SHARE) * town.radius);
	}

	/** Farthest from the center that a cell inside the wall or on it can be. */
	private static bandReach(radius: number): number {
		return (1 + BAND_SHARE) * radius + BAND_MARGIN;
	}

	/** Farthest from the center that a cell of the wall or of the avenue of a gate can be: a tile farther than this holds none. */
	static reachOf(town: Town): number {
		const radius = Walls.radiusOf(town);
		return Math.max(Walls.bandReach(radius), radius + GATE_ROAD);
	}

	prepare(town: Town): void {
		const radius = Walls.radiusOf(town);
		this.x = town.x;
		this.y = town.y;
		this.c = town.axisX;
		this.s = town.axisY;
		this.radius = radius;
		const low = (1 - BAND_SHARE) * radius - BAND_MARGIN;
		const high = Walls.bandReach(radius);
		this.lowSquared = low * low;
		this.highSquared = high * high;
		this.roadSquared = (radius + GATE_ROAD) * (radius + GATE_ROAD);
		this.slope = WALL_SLOPE * radius + WALL_SLACK;
	}

	/** The `WallZone` of the cell (x, y) of the prepared town. Only the cells near the wall evaluate the noise. */
	zone(x: number, y: number): number {
		const dx = x - this.x;
		const dy = y - this.y;
		const squared = dx * dx + dy * dy;
		if (squared < this.lowSquared) return WallZone.IN;
		if (squared >= this.highSquared) return WallZone.OUT;
		const r = Math.sqrt(squared);
		const f = r - this.radius * (1 + WALL_WOBBLE * (2 * this.noise.at(x, y) - 1));
		if (f < 0) return WallZone.IN;
		if (f >= (Math.abs(dx) + Math.abs(dy)) / r + this.slope) return WallZone.OUT;
		const along = dx * this.c + dy * this.s;
		const across = dy * this.c - dx * this.s;
		return Math.min(Math.abs(along), Math.abs(across)) < GATE_HALF ? WallZone.IN : WallZone.RAMPART;
	}

	/** Whether the cell is on the avenue of a gate: within a street's thickness of an axis of the town and under `GATE_ROAD` past the wall radius. */
	road(x: number, y: number): boolean {
		const dx = x - this.x;
		const dy = y - this.y;
		if (dx * dx + dy * dy >= this.roadSquared) return false;
		const along = dx * this.c + dy * this.s;
		const across = dy * this.c - dx * this.s;
		return Math.min(Math.abs(along), Math.abs(across)) < Math.abs(this.c) + Math.abs(this.s);
	}
}

/** The piers of a town are the lines across its shore, every `PIER_SPACING` cells, `PIER_WIDTH` streets thick (4 half-widths of a cell). */
const PIER_SPACING = 40;
const PIER_WIDTH = 2;
/** A pier is `PIER_MIN` to `PIER_REACH` cells long, by the roll of its line: the walk from any of its cells to the quay is at most that many steps. */
const PIER_MIN = 14;
const PIER_REACH = 30;
/**
 * A pier stays on water at most this shallow: depth under the sea is `SEA_LEVEL - e`, under a lake `lake value - LAKE_LEVEL`.
 */
const PIER_DEPTH = 0.02;
const PIER_LAKE_DEPTH = 0.03;

/**
 * The quays and piers of a harbor over a tile. The quay is the dry ground in the beach band of the sea (`e < BEACH_TOP`) or in the band of
 * `LAKE_QUAY` below the lake level. The piers are lines of the grid of the whole town across the shore (its axis runs along the shore) that
 * go on over shallow water; a cell is on one when the walk from it toward the center of the town, in steps along the line, stays on cells of
 * the pier and reaches dry ground within `PIER_REACH` steps. So a pier is never cut off from the quay: a shoal off the coast gets none, and a
 * cell that passes has the next cell of its walk pass too. The walk is the same for every tile, since a cell outside the tile is read with
 * point queries (the same values as the tile arrays), and the lines belong to the town, not to a district whose grid would change under it.
 */
export class Harbor {
	private readonly towns: Towns;
	private readonly relief: Relief;
	private readonly water: Water;
	private elevations: Float64Array = new Float64Array(0);
	private lakes: Float64Array | null = null;
	private mask: Uint8Array = new Uint8Array(0);
	private x0 = 0;
	private y0 = 0;
	private size = 0;

	constructor(towns: Towns, relief: Relief, water: Water) {
		this.towns = towns;
		this.relief = relief;
		this.water = water;
	}

	/**
	 * Loads the tile, and returns whether it can hold a quay or a pier at all. `Water.fill` has prepared the same tile, whose lake values this reads;
	 * a tile with no cell under `BEACH_TOP` and no lake in reach has neither, so its elevations are never interpolated.
	 */
	prepare(x0: number, y0: number, size: number, mask: Uint8Array): boolean {
		const { relief } = this;
		relief.prepare(x0, y0, size);
		this.lakes = this.water.lakeValues();
		if (relief.lowE >= BEACH_TOP && this.lakes === null) return false;
		this.elevations = relief.elevations();
		this.mask = mask;
		this.x0 = x0;
		this.y0 = y0;
		this.size = size;
		return true;
	}

	/** Whether the dry cell `i` of the tile is on the quay. */
	quay(i: number): boolean {
		const e = this.elevations[i];
		if (e < BEACH_TOP) return true;
		const { lakes } = this;
		/** A dry cell has a lake value over the band only where the hill level cuts the lake off, so the elevation bounds the band there. */
		return lakes !== null && lakes[i] > LAKE_LEVEL - LAKE_QUAY && e < HILL_LEVEL + LAKE_QUAY;
	}

	/** 0 dry (rock included), 1 river, 2 sea or lake at (x, y): the mask inside the tile, the point queries outside, which know no rock. */
	private wetAt(x: number, y: number): number {
		const col = x - this.x0;
		const row = y - this.y0;
		if (col >= 0 && col < this.size && row >= 0 && row < this.size) {
			const wet = this.mask[row * this.size + col];
			return wet === 3 ? 0 : wet;
		}
		return this.water.wideAt(x, y) ? 2 : this.water.riverAt(x, y) ? 1 : 0;
	}

	/** Whether the water cell (x, y) is shallow enough for a pier. */
	private shallow(x: number, y: number): boolean {
		const col = x - this.x0;
		const row = y - this.y0;
		const inside = col >= 0 && col < this.size && row >= 0 && row < this.size;
		const e = inside ? this.elevations[row * this.size + col] : this.relief.elevationAt(x, y);
		if (e < SEA_LEVEL) return SEA_LEVEL - e < PIER_DEPTH;
		const lake = inside ? this.lakes?.[row * this.size + col] ?? 0 : this.water.lakeValueAt(x, y);
		return lake - LAKE_LEVEL < PIER_LAKE_DEPTH;
	}

	/** Whether `Fabric` paints the cell (x, y) for the town: the same test, from the tile arrays inside the tile and by point queries outside. */
	private paints(town: Town, x: number, y: number): boolean {
		const { towns } = this;
		const col = x - this.x0;
		const row = y - this.y0;
		if (col < 0 || col >= this.size || row < 0 || row >= this.size) return towns.paints(town, x, y);
		const shape = towns.shapes[row * this.size + col];
		const level = Towns.level(town, x, y, shape);
		return level > 0 && towns.owns(town, x, y, level, shape);
	}

	/**
	 * Whether the cell (x, y), which is sea or lake and painted for `town`, is on a pier of `town`. The cells of the walk to the quay, and the
	 * dry cell that ends it, must be painted for the town too: else the pier would be cut off from the land by cells that are not painted, or
	 * end on the ground of another town.
	 */
	pier(town: Town, x: number, y: number): boolean {
		if (!this.shallow(x, y)) return false;
		const { axisX: c, axisY: s } = town;
		/** The half thickness of a pier is `PIER_WIDTH` half extents of a cell along the axis, as for the lines of a frame, and its lines are `PIER_SPACING` apart. */
		const half = (PIER_WIDTH * (Math.abs(c) + Math.abs(s))) / 2;
		const phase = hash(town.id, 0, 0, Salt.PIER) % PIER_SPACING;
		const line = Math.round((((x - town.x) * c + (y - town.y) * s) - phase) / PIER_SPACING);
		const reach = PIER_MIN + (hash(town.id, line, 1, Salt.PIER) % (PIER_REACH - PIER_MIN + 1));
		let px = x;
		let py = y;
		for (let step = 0; step < reach; step++) {
			const dx = px - town.x;
			const dy = py - town.y;
			const along = dx * c + dy * s - phase;
			const offset = along - line * PIER_SPACING;
			if (offset < -half || offset >= half) return false;
			if (step > 0 && !(this.wetAt(px, py) === 2 && this.shallow(px, py) && this.paints(town, px, py))) return false;
			/** The walk goes toward the line `b = 0` through the center, along the line of the pier: one step in x and one in y bring it closer, and the one that keeps it nearer the middle of the pier is taken. */
			const toward = dy * c - dx * s > 0 ? -1 : 1;
			const stepX = toward * -s > 0 ? 1 : toward * -s < 0 ? -1 : 0;
			const stepY = toward * c > 0 ? 1 : toward * c < 0 ? -1 : 0;
			let best = Infinity;
			let nextX = px;
			let nextY = py;
			if (stepX !== 0) {
				const o = offset + stepX * c;
				if (o >= -half && o < half) { best = Math.abs(o); nextX = px + stepX; nextY = py; }
			}
			if (stepY !== 0) {
				const o = offset + stepY * s;
				if (o >= -half && o < half && Math.abs(o) <= best) { nextX = px; nextY = py + stepY; best = Math.abs(o); }
			}
			if (best === Infinity) return false;
			if (this.wetAt(nextX, nextY) === 0) return this.paints(town, nextX, nextY);
			px = nextX;
			py = nextY;
		}
		return false;
	}
}

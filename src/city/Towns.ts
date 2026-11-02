import { CellType } from '../core/CellType';
import { hash, Salt, unit } from './hash';
import { SampledField, ValueNoise } from './Noise';
import type { Water } from './Water';

export type Tier = 0 | 1 | 2;

export interface Town {
	/** Uint32 hash that names the town in the hashes of the layers that follow. */
	id: number;
	/** Region of the town: the 512 x 512 square of cells that holds its center. */
	rx: number;
	ry: number;
	/** Center, in cells. */
	x: number;
	y: number;
	radius: number;
	/** 0 village, 1 town, 2 city. */
	tier: Tier;
	/** Cells between two streets of the grid, and the offset of the first street. */
	block: number;
	phaseX: number;
	phaseY: number;
}

/** Share of the regions that hold a town. */
const TOWN_CHANCE = 0.6;
/** The center stays 96 cells inside its region, so a town only ever reaches the regions around its own. */
const CENTER_MARGIN = 96;
const CENTER_SPREAD = 320;
const VILLAGE_SHARE = 0.6;
const TOWN_SHARE = 0.9;
/** Radius range in cells, block range in cells, per tier. */
const RADIUS: readonly (readonly [number, number])[] = [[48, 80], [110, 170], [200, 280]];
const BLOCK: readonly (readonly [number, number])[] = [[20, 32], [20, 32], [18, 26]];
/**
 * The outline is two octaves of noise: the coarse one (period 128) gives lobes and bays, the fine one (period 48) breaks the border up into
 * streets-long bumps. A single octave read as a smooth round blob.
 */
const SHAPE_COARSE_PERIOD = 128;
const SHAPE_FINE_PERIOD = 48;
const SHAPE_COARSE_WEIGHT = 0.6;
const SHAPE_STEP = 8;
/** How much the shape noise pushes the border in and out, as a share of the radius: the border of a town of tier 1 or 2 is 0.46 radii farther out in its farthest direction than in its closest (median of 3 seeds). */
const SHAPE_WEIGHT = 0.8;
/** Urban stays at 0 or below once the distance passes `(1 + SHAPE_WEIGHT / 2)` radii, since the shape noise is below 1. */
const BORDER_REACH = 1 + SHAPE_WEIGHT / 2;
const MAX_MEMO = 4096;

/** Where a town of tier 1 and up is downtown, and keeps its whole grid. */
export const DOWNTOWN_LEVEL = 0.55;
/** Below this level a town thins out into suburbs: street segments drop out, lots stay empty more often. The same level is the inner ring of a town. */
export const INNER_LEVEL = 0.3;

/**
 * Where the towns are and which cells are urban. The world is cut into regions of 512 cells with a town in 60% of them, so towns are
 * spread out and a cell only ever needs the towns of the regions around it.
 */
export class Towns {
	static readonly REGION_BITS = 9;
	/** Farthest a town reaches from its center: the largest radius times `BORDER_REACH`, rounded up. */
	static readonly MAX_REACH = 392;

	private readonly seed: number;
	private readonly water: Water;
	private readonly shape: SampledField;
	private readonly nearby: Town[] = [];
	private shapeValues = new Float64Array(0);
	/** Memo of `at`: the road layer asks for the same few regions at every tile, and each answer costs a water lookup. */
	private readonly regions = new Map<number, Town | null>();
	private preparedX = Number.NaN;
	private preparedY = Number.NaN;
	private preparedSize = Number.NaN;

	constructor(seed: number, water: Water) {
		this.seed = seed;
		this.water = water;
		const coarse = new ValueNoise(seed, Salt.TOWN_SHAPE, SHAPE_COARSE_PERIOD);
		const fine = new ValueNoise(seed, Salt.TOWN_SHAPE_FINE, SHAPE_FINE_PERIOD);
		this.shape = new SampledField((x, y) => SHAPE_COARSE_WEIGHT * coarse.at(x, y) + (1 - SHAPE_COARSE_WEIGHT) * fine.at(x, y), SHAPE_STEP);
	}

	/**
	 * The towns that can have an urban cell in the tile last passed to `prepare`, sorted like `near`. Valid until the next `prepare`, and
	 * empty or stale before the first.
	 */
	get present(): readonly Town[] {
		return this.nearby;
	}

	/** Shape noise of the cells of the tile last passed to `prepare`, row-major: the fourth argument of `level` for each cell. */
	get shapes(): Float64Array {
		return this.shapeValues;
	}

	/** The town of region (rx, ry), or null when it has none or its center would sit in water. */
	at(rx: number, ry: number): Town | null {
		/** Unique for regions within 2^21 of the origin (a billion cells), far beyond the int32 range the hashes accept anyway. */
		const key = rx * 0x400000 + ry;
		const known = this.regions.get(key);
		if (known !== undefined) return known;
		const town = this.generate(rx, ry);
		if (this.regions.size >= MAX_MEMO) this.regions.clear();
		this.regions.set(key, town);
		return town;
	}

	private generate(rx: number, ry: number): Town | null {
		const { seed } = this;
		if (unit(hash(seed, rx, ry, Salt.TOWN_PRESENT)) >= TOWN_CHANCE) return null;
		const x = (rx << Towns.REGION_BITS) + CENTER_MARGIN + (hash(seed, rx, ry, Salt.TOWN_X) % CENTER_SPREAD);
		const y = (ry << Towns.REGION_BITS) + CENTER_MARGIN + (hash(seed, rx, ry, Salt.TOWN_Y) % CENTER_SPREAD);
		if (this.water.at(x, y)) return null;

		const share = unit(hash(seed, rx, ry, Salt.TOWN_TIER));
		const tier: Tier = share < VILLAGE_SHARE ? 0 : share < TOWN_SHARE ? 1 : 2;
		const [minRadius, maxRadius] = RADIUS[tier];
		const [minBlock, maxBlock] = BLOCK[tier];
		const block = minBlock + (hash(seed, rx, ry, Salt.TOWN_BLOCK) % (maxBlock - minBlock + 1));
		return {
			id: hash(seed, rx, ry, Salt.TOWN_ID),
			rx,
			ry,
			x,
			y,
			radius: minRadius + (hash(seed, rx, ry, Salt.TOWN_RADIUS) % (maxRadius - minRadius + 1)),
			tier,
			block,
			phaseX: hash(seed, rx, ry, Salt.TOWN_PHASE_X) % block,
			phaseY: hash(seed, rx, ry, Salt.TOWN_PHASE_Y) % block,
		};
	}

	/**
	 * Replaces the content of `out` with the towns whose center is within `reach` cells of the `size` x `size` tile at (x0, y0), sorted by
	 * (tier, rx, ry): the biggest comes last, so a layer that paints them in order lets it win, whatever order the regions were visited in.
	 */
	near(x0: number, y0: number, size: number, reach: number, out: Town[]): void {
		out.length = 0;
		const bits = Towns.REGION_BITS;
		const rxMax = (x0 + size + reach) >> bits;
		const ryMax = (y0 + size + reach) >> bits;
		for (let ry = (y0 - reach) >> bits; ry <= ryMax; ry++) {
			for (let rx = (x0 - reach) >> bits; rx <= rxMax; rx++) {
				const town = this.at(rx, ry);
				if (town === null) continue;
				if (town.x < x0 - reach || town.x >= x0 + size + reach || town.y < y0 - reach || town.y >= y0 + size + reach) continue;
				let i = out.push(town) - 1;
				while (i > 0 && Towns.before(town, out[i - 1])) {
					out[i] = out[i - 1];
					i--;
				}
				out[i] = town;
			}
		}
	}

	/**
	 * How far inside the town the cell is: 1 at the center, falling to 0 at the border, which the shape noise pushes in and out. The cell is
	 * urban above 0. A cell in the regions around several towns has one value per town.
	 */
	urban(town: Town, x: number, y: number): number {
		return Towns.level(town, x, y, this.shape.at(x, y));
	}

	/**
	 * Finds the towns that can have an urban cell in the `size` x `size` tile at (x0, y0) and the shape noise of its cells, for `present`
	 * and `shapes`. Asking again for the same tile costs nothing: the layers of one tile share the work.
	 */
	prepare(x0: number, y0: number, size: number): void {
		if (x0 === this.preparedX && y0 === this.preparedY && size === this.preparedSize) return;
		this.preparedX = x0;
		this.preparedY = y0;
		this.preparedSize = size;
		const { nearby } = this;
		this.near(x0, y0, size, Towns.MAX_REACH, nearby);
		let overlapping = 0;
		for (let i = 0; i < nearby.length; i++) if (Towns.overlaps(nearby[i], x0, y0, size)) nearby[overlapping++] = nearby[i];
		nearby.length = overlapping;
		if (overlapping === 0) return;

		if (this.shapeValues.length < size * size) this.shapeValues = new Float64Array(size * size);
		this.shape.fillTile(x0, y0, size, this.shapeValues);
	}

	/**
	 * Sets every urban cell of every town near the `size` x `size` tile at (x0, y0) to ground, except water: a town clears its fields and
	 * forest and leaves the river alone.
	 */
	clearGround(x0: number, y0: number, size: number, out: Uint8Array): void {
		this.prepare(x0, y0, size);
		const { nearby: present, shapeValues } = this;
		for (let t = 0; t < present.length; t++) {
			const town = present[t];
			const reach = Towns.reach(town);
			for (let row = Math.max(0, Math.ceil(town.y - reach) - y0); row < Math.min(size, Math.floor(town.y + reach) - y0 + 1); row++) {
				const y = y0 + row;
				const half = Math.floor(Math.sqrt(reach * reach - (y - town.y) * (y - town.y)));
				for (let col = Math.max(0, town.x - half - x0); col < Math.min(size, town.x + half - x0 + 1); col++) {
					const i = row * size + col;
					if (out[i] !== CellType.WATER && Towns.level(town, x0 + col, y, shapeValues[i]) > 0) out[i] = CellType.GROUND;
				}
			}
		}
	}

	/**
	 * Whether `town` owns the cell: it is the town the cell is deepest in among the towns of the tile last passed to `prepare`, and ties go
	 * to the higher id. `level` and `shape` are the town's level at the cell and the shape noise there. Where towns overlap, the layers that
	 * ask paint one town per cell, so two grids never mix whatever order they paint in.
	 */
	owns(town: Town, x: number, y: number, level: number, shape: number): boolean {
		const { nearby } = this;
		for (let o = 0; o < nearby.length; o++) {
			const other = nearby[o];
			if (other === town) continue;
			const otherLevel = Towns.level(other, x, y, shape);
			if (otherLevel > level || (otherLevel === level && other.id >= town.id)) return false;
		}
		return true;
	}

	/** `urban` for a cell whose shape noise is already known. */
	static level(town: Town, x: number, y: number, shape: number): number {
		const dx = x - town.x;
		const dy = y - town.y;
		return 1 - Math.sqrt(dx * dx + dy * dy) / town.radius + SHAPE_WEIGHT * (shape - 0.5);
	}

	/** Distance from the center beyond which no cell of the town is urban. */
	static reach(town: Town): number {
		return town.radius * BORDER_REACH;
	}

	/** Whether the town can have an urban cell inside the tile. */
	private static overlaps(town: Town, x0: number, y0: number, size: number): boolean {
		const reach = Towns.reach(town);
		return town.x + reach >= x0 && town.x - reach < x0 + size && town.y + reach >= y0 && town.y - reach < y0 + size;
	}

	private static before(a: Town, b: Town): boolean {
		return a.tier !== b.tier ? a.tier < b.tier : a.rx !== b.rx ? a.rx < b.rx : a.ry < b.ry;
	}
}

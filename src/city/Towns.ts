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
const SHAPE_PERIOD = 128;
const SHAPE_STEP = 8;
/** How much the shape noise pushes the border in and out, as a share of the radius. */
const SHAPE_WEIGHT = 0.25;
/** Urban stays at 0 or below once the distance passes `(1 + SHAPE_WEIGHT / 2)` radii, since the shape noise is below 1. */
const BORDER_REACH = 1 + SHAPE_WEIGHT / 2;

/**
 * Where the towns are and which cells are urban. The world is cut into regions of 512 cells with a town in 60% of them, so towns are
 * spread out and a cell only ever needs the towns of the regions around it.
 */
export class Towns {
	static readonly REGION_BITS = 9;
	/** Farthest a town reaches from its center: the largest radius times `BORDER_REACH`, rounded up. */
	static readonly MAX_REACH = 350;

	private readonly seed: number;
	private readonly water: Water;
	private readonly shape: SampledField;
	private readonly nearby: Town[] = [];
	private shapeValues = new Float64Array(0);

	constructor(seed: number, water: Water) {
		this.seed = seed;
		this.water = water;
		const shape = new ValueNoise(seed, Salt.TOWN_SHAPE, SHAPE_PERIOD);
		this.shape = new SampledField((x, y) => shape.at(x, y), SHAPE_STEP);
	}

	/** The town of region (rx, ry), or null when it has none or its center would sit in water. */
	at(rx: number, ry: number): Town | null {
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
	 * Sets every urban cell of every town near the `size` x `size` tile at (x0, y0) to ground, except water: a town clears its fields and
	 * forest and leaves the river alone.
	 */
	clearGround(x0: number, y0: number, size: number, out: Uint8Array): void {
		const { nearby } = this;
		this.near(x0, y0, size, Towns.MAX_REACH, nearby);
		let overlapping = 0;
		for (let i = 0; i < nearby.length; i++) if (Towns.overlaps(nearby[i], x0, y0, size)) nearby[overlapping++] = nearby[i];
		if (overlapping === 0) return;

		if (this.shapeValues.length < size * size) this.shapeValues = new Float64Array(size * size);
		const { shapeValues } = this;
		this.shape.fillTile(x0, y0, size, shapeValues);
		for (let t = 0; t < overlapping; t++) {
			const town = nearby[t];
			const reach = town.radius * BORDER_REACH;
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

	private static level(town: Town, x: number, y: number, shape: number): number {
		const dx = x - town.x;
		const dy = y - town.y;
		return 1 - Math.sqrt(dx * dx + dy * dy) / town.radius + SHAPE_WEIGHT * (shape - 0.5);
	}

	/** Whether the town can have an urban cell inside the tile. */
	private static overlaps(town: Town, x0: number, y0: number, size: number): boolean {
		const reach = town.radius * BORDER_REACH;
		return town.x + reach >= x0 && town.x - reach < x0 + size && town.y + reach >= y0 && town.y - reach < y0 + size;
	}

	private static before(a: Town, b: Town): boolean {
		return a.tier !== b.tier ? a.tier < b.tier : a.rx !== b.rx ? a.rx < b.rx : a.ry < b.ry;
	}
}

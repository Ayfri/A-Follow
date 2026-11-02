import { CellType } from '../core/CellType';
import { DESERT_MOISTURE, DESERT_TEMP } from './Countryside';
import { hash, Salt, unit } from './hash';
import { SampledField, ValueNoise } from './Noise';
import { type Relief, TOWN_MAX_ELEVATION } from './Relief';
import type { Water } from './Water';

/** How a town is laid out: the planned grid, the grown tangle, the rings around a center, the main street, the quays, the loose sprawl. */
export const TownKind = { PLANNED: 0, ORGANIC: 1, RADIAL: 2, LINEAR: 3, HARBOR: 4, SPRAWL: 5 } as const;
export type TownKind = (typeof TownKind)[keyof typeof TownKind];

export type Tier = 0 | 1 | 2 | 3;

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
	/** 0 village, 1 town, 2 city, 3 metropolis. */
	tier: Tier;
	kind: TownKind;
	/** Unit vector of the base street direction: along the shore of a harbor, along the river of a river town. */
	axisX: number;
	axisY: number;
	/** 1, or 2.2 to 3.0 for a linear town: it is that many times longer along its axis than the circle of its radius, and as many times narrower across. */
	stretch: number;
	walled: boolean;
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
/** Share of the towns that are villages, then of those that are villages or towns: the rest are cities. */
const VILLAGE_SHARE = 0.55;
const TOWN_SHARE = 0.85;
/** Radius range in cells, block range in cells, per tier. */
const RADIUS: readonly (readonly [number, number])[] = [[48, 96], [120, 200], [220, 360], [600, 950]];
const BLOCK: readonly (readonly [number, number])[] = [[20, 32], [20, 32], [18, 26], [18, 26]];
/** The metropolis tier has its own lattice of 4096 cells, with a metropolis in `METRO_CHANCE` of its squares, placed in the middle half of the square. */
const METRO_BITS = 12;
const METRO_CHANCE = 0.3;
const METRO_MARGIN = 1 << (METRO_BITS - 2);
const METRO_SPREAD = 1 << (METRO_BITS - 1);
/**
 * No other town has its center within this many radii of a metropolis center. The metropolis square and its 8 neighbors cover it: a
 * metropolis is at most 950 cells wide, and 1.1 times that is under the 2048 cells between a center and the edge of its square.
 */
export const METRO_CLEAR = 1.1;
/** Share of the towns near water that are harbors, and of the towns near a river that are linear, which stretch along it. */
const HARBOR_SHARE = 0.75;
const RIVER_SHARE = 0.4;
const KEEP_AXIS_SHARE = 0.35;
const WALLED_SHARE = 0.5;
/** Share of the towns in a desert that are dropped: the few that stay are oases. */
const DESERT_DROP = 0.6;
/** The harbor probe looks this far out from the center, as a share of the radius within these bounds, in the 12 directions of `DIRS`. */
const HARBOR_PROBE_SHARE = 0.6;
const HARBOR_PROBE_MIN = 40;
const HARBOR_PROBE_MAX = 400;
/** A town with water in 10 or more of the 12 directions is on a peninsula or an islet, not on a shore: its streets have no shore direction to follow. */
const HARBOR_MAX_WET = 9;
/** Distances from the center at which a river is looked for, and the step of the finite difference that gives its direction. */
const RIVER_PROBES: readonly number[] = [30, 60];
const RIVER_STEP = 4;
const STRETCH_MIN = 2.2;
const STRETCH_SPREAD = 0.8;
/** A linear town is never bigger than a city, which bounds its reach: `RADIUS[LINEAR_MAX_TIER]` times `sqrt(STRETCH_MAX)`. */
const LINEAR_MAX_TIER = 2;
const STRETCH_MAX = STRETCH_MIN + STRETCH_SPREAD;
/** The four axes and the two rational directions with a 3-4-5 triangle: 12 exact unit vectors, so no trigonometry is involved. */
const DIRS: readonly (readonly [number, number])[] = [
	[1, 0], [-1, 0], [0, 1], [0, -1],
	[0.6, 0.8], [0.6, -0.8], [-0.6, 0.8], [-0.6, -0.8],
	[0.8, 0.6], [0.8, -0.6], [-0.8, 0.6], [-0.8, -0.6],
];
/** Kind of a town without a shore or a river, per tier: the kind and the share up to which it is chosen, so the last is 1. */
const KINDS: readonly (readonly (readonly [TownKind, number])[])[] = [
	[[TownKind.ORGANIC, 0.4], [TownKind.LINEAR, 0.65], [TownKind.SPRAWL, 1]],
	[[TownKind.PLANNED, 0.3], [TownKind.ORGANIC, 0.6], [TownKind.RADIAL, 0.75], [TownKind.SPRAWL, 1]],
	[[TownKind.PLANNED, 0.4], [TownKind.RADIAL, 0.7], [TownKind.ORGANIC, 1]],
	[[TownKind.PLANNED, 0.55], [TownKind.RADIAL, 1]],
];
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

/** The metropolis of a square of the metropolis lattice, with its center and the region that holds it. */
interface Metropolis {
	x: number;
	y: number;
	rx: number;
	ry: number;
	radius: number;
}

/**
 * Where the towns are and which cells are urban. The world is cut into regions of 512 cells with a town in 60% of them, so towns are
 * spread out and a cell only ever needs the towns of the regions around it. Above them, a lattice of 4096 cells holds a metropolis in 30%
 * of its squares: it takes the place of the town of its region and keeps the other towns out of its way.
 */
export class Towns {
	static readonly REGION_BITS = 9;
	/**
	 * Farthest a town reaches from its center: the metropolis radius or the widest linear town, whichever is larger (950 for the metropolis,
	 * 360 times the square root of the longest stretch for a city), times `BORDER_REACH`, rounded up. 1330 cells, 2.6 regions.
	 */
	static readonly MAX_REACH = Math.ceil(Math.max(RADIUS[3][1], RADIUS[LINEAR_MAX_TIER][1] * Math.sqrt(STRETCH_MAX)) * BORDER_REACH);

	private readonly seed: number;
	private readonly water: Water;
	private readonly relief: Relief;
	private readonly shape: SampledField;
	private readonly nearby: Town[] = [];
	private shapeValues = new Float64Array(0);
	/** Memo of `at`: the road layer asks for the same few regions at every tile, and each answer costs a water lookup. */
	private readonly regions = new Map<number, Town | null>();
	/** Memo of the metropolis lattice, by square. */
	private readonly metropolises = new Map<number, Metropolis | null>();
	private preparedX = Number.NaN;
	private preparedY = Number.NaN;
	private preparedSize = Number.NaN;

	constructor(seed: number, water: Water, relief: Relief) {
		this.seed = seed;
		this.water = water;
		this.relief = relief;
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

	/** Unique number key of a region: cells are int32, so a region coordinate is in [-2^22, 2^22) and its biased value fits 23 bits (the key is below 2^46, exact). */
	static regionKey(rx: number, ry: number): number {
		return (rx + 2 ** 22) * 2 ** 23 + (ry + 2 ** 22);
	}

	/**
	 * The town of region (rx, ry), or null when it has none, when its center would sit in water, too high up the mountains or in a desert,
	 * or when a metropolis is in the way. A metropolis is only ever returned by the region of its center.
	 */
	at(rx: number, ry: number): Town | null {
		const key = Towns.regionKey(rx, ry);
		const known = this.regions.get(key);
		if (known !== undefined) return known;
		const town = this.generate(rx, ry);
		if (this.regions.size >= MAX_MEMO) this.regions.clear();
		this.regions.set(key, town);
		return town;
	}

	/** The metropolis of the square (sx, sy) of the metropolis lattice, or null: its center is rejected on water, too high and in a desert. */
	private metropolis(sx: number, sy: number): Metropolis | null {
		const key = Towns.regionKey(sx, sy);
		const known = this.metropolises.get(key);
		if (known !== undefined) return known;
		const found = this.placeMetropolis(sx, sy);
		if (this.metropolises.size >= MAX_MEMO) this.metropolises.clear();
		this.metropolises.set(key, found);
		return found;
	}

	private placeMetropolis(sx: number, sy: number): Metropolis | null {
		const { seed, water, relief } = this;
		if (unit(hash(seed, sx, sy, Salt.METRO_PRESENT)) >= METRO_CHANCE) return null;
		const x = (sx << METRO_BITS) + METRO_MARGIN + (hash(seed, sx, sy, Salt.METRO_X) % METRO_SPREAD);
		const y = (sy << METRO_BITS) + METRO_MARGIN + (hash(seed, sx, sy, Salt.METRO_Y) % METRO_SPREAD);
		if (water.at(x, y) || relief.elevationAt(x, y) >= TOWN_MAX_ELEVATION) return null;
		if (relief.temperatureAt(x, y) > DESERT_TEMP && relief.moistureAt(x, y) < DESERT_MOISTURE) return null;
		const rx = x >> Towns.REGION_BITS;
		const ry = y >> Towns.REGION_BITS;
		return { x, y, rx, ry, radius: this.radiusOf(rx, ry, 3) };
	}

	private radiusOf(rx: number, ry: number, tier: Tier): number {
		const [minRadius, maxRadius] = RADIUS[tier];
		return minRadius + (hash(this.seed, rx, ry, Salt.TOWN_RADIUS) % (maxRadius - minRadius + 1));
	}

	private generate(rx: number, ry: number): Town | null {
		const { seed, water, relief } = this;
		const sx = rx >> (METRO_BITS - Towns.REGION_BITS);
		const sy = ry >> (METRO_BITS - Towns.REGION_BITS);
		const own = this.metropolis(sx, sy);
		if (own !== null && own.rx === rx && own.ry === ry) return this.make(rx, ry, own.x, own.y, 3);

		if (unit(hash(seed, rx, ry, Salt.TOWN_PRESENT)) >= TOWN_CHANCE) return null;
		const x = (rx << Towns.REGION_BITS) + CENTER_MARGIN + (hash(seed, rx, ry, Salt.TOWN_X) % CENTER_SPREAD);
		const y = (ry << Towns.REGION_BITS) + CENTER_MARGIN + (hash(seed, rx, ry, Salt.TOWN_Y) % CENTER_SPREAD);
		for (let j = sy - 1; j <= sy + 1; j++) {
			for (let i = sx - 1; i <= sx + 1; i++) {
				const metropolis = this.metropolis(i, j);
				if (metropolis === null) continue;
				const clear = METRO_CLEAR * metropolis.radius;
				if ((x - metropolis.x) ** 2 + (y - metropolis.y) ** 2 < clear * clear) return null;
			}
		}
		if (water.at(x, y) || relief.elevationAt(x, y) >= TOWN_MAX_ELEVATION) return null;
		if (relief.temperatureAt(x, y) > DESERT_TEMP && relief.moistureAt(x, y) < DESERT_MOISTURE && unit(hash(seed, rx, ry, Salt.TOWN_DESERT)) < DESERT_DROP) return null;

		const share = unit(hash(seed, rx, ry, Salt.TOWN_TIER));
		return this.make(rx, ry, x, y, share < VILLAGE_SHARE ? 0 : share < TOWN_SHARE ? 1 : 2);
	}

	/** The town of tier `tier` centered at (x, y) in region (rx, ry): its kind comes from the shore and the rivers around the center. */
	private make(rx: number, ry: number, x: number, y: number, tier: Tier): Town {
		const { seed, water } = this;
		const radius = this.radiusOf(rx, ry, tier);
		/** An axis in any direction: the half angle tangent `t` of a hashed value, with no trigonometry. */
		const t = 2 * unit(hash(seed, rx, ry, Salt.TOWN_AXIS)) - 1;
		let axisX = (1 - t * t) / (1 + t * t);
		let axisY = (2 * t) / (1 + t * t);

		const probe = Math.max(HARBOR_PROBE_MIN, Math.min(HARBOR_PROBE_MAX, HARBOR_PROBE_SHARE * radius));
		let wet = 0;
		let shoreX = 0;
		let shoreY = 0;
		for (const [dx, dy] of DIRS) {
			if (!water.wideAt(x + Math.round(dx * probe), y + Math.round(dy * probe))) continue;
			wet++;
			shoreX += dx;
			shoreY += dy;
		}

		let kind: TownKind | null = null;
		if (wet >= 1 && wet <= HARBOR_MAX_WET && unit(hash(seed, rx, ry, Salt.TOWN_HARBOR)) < HARBOR_SHARE) {
			kind = TownKind.HARBOR;
			/** The streets run along the shore: perpendicular to the sum of the directions that reach water. */
			const length = Math.sqrt(shoreX * shoreX + shoreY * shoreY);
			if (length > 0) {
				axisX = -shoreY / length;
				axisY = shoreX / length;
			}
		} else if (tier <= LINEAR_MAX_TIER && unit(hash(seed, rx, ry, Salt.TOWN_RIVER)) < RIVER_SHARE) {
			let river = false;
			for (let p = 0; p < RIVER_PROBES.length && !river; p++) {
				for (let d = 0; d < DIRS.length && !river; d++) {
					const px = x + Math.round(DIRS[d][0] * RIVER_PROBES[p]);
					const py = y + Math.round(DIRS[d][1] * RIVER_PROBES[p]);
					if (!water.riverAt(px, py)) continue;
					river = true;
					/** The gradient of the river's height field points across the river, so the town stretches along its perpendicular. */
					const gx = water.heightAt(px + RIVER_STEP, py) - water.heightAt(px - RIVER_STEP, py);
					const gy = water.heightAt(px, py + RIVER_STEP) - water.heightAt(px, py - RIVER_STEP);
					const length = Math.sqrt(gx * gx + gy * gy);
					if (length > 0) {
						axisX = -gy / length;
						axisY = gx / length;
					}
				}
			}
			if (river) kind = TownKind.LINEAR;
		}
		if (kind === null) {
			const roll = unit(hash(seed, rx, ry, Salt.TOWN_KIND));
			const shares = KINDS[tier];
			kind = shares.find(([, upTo]) => roll < upTo)?.[0] ?? shares[shares.length - 1][0];
			if (kind === TownKind.PLANNED && unit(hash(seed, rx, ry, Salt.TOWN_AXIS_KEEP)) < KEEP_AXIS_SHARE) {
				axisX = 1;
				axisY = 0;
			}
		}

		const walled = kind === TownKind.ORGANIC ? tier >= 1 : (kind === TownKind.PLANNED || kind === TownKind.RADIAL) && tier >= 2 && unit(hash(seed, rx, ry, Salt.TOWN_WALLED)) < WALLED_SHARE;
		const [minBlock, maxBlock] = BLOCK[tier];
		const block = minBlock + (hash(seed, rx, ry, Salt.TOWN_BLOCK) % (maxBlock - minBlock + 1));
		return {
			id: hash(seed, rx, ry, Salt.TOWN_ID),
			rx,
			ry,
			x,
			y,
			radius,
			tier,
			kind,
			axisX,
			axisY,
			stretch: kind === TownKind.LINEAR ? STRETCH_MIN + STRETCH_SPREAD * unit(hash(seed, rx, ry, Salt.TOWN_STRETCH)) : 1,
			walled,
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
	 * Sets every urban cell of every town near the `size` x `size` tile at (x0, y0) to ground, except water and rock: a town clears its
	 * fields, forest, sand and hills, and leaves the river and the mountain rock alone.
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
					if (out[i] !== CellType.WATER && out[i] !== CellType.ROCK && Towns.level(town, x0 + col, y, shapeValues[i]) > 0) out[i] = CellType.GROUND;
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

	/**
	 * `urban` for a cell whose shape noise is already known. The distance is measured in the frame of the axis, shrunk by `stretch` along it
	 * and stretched across it, so a linear town is an ellipse of the same area as the circle of its radius.
	 */
	static level(town: Town, x: number, y: number, shape: number): number {
		const dx = x - town.x;
		const dy = y - town.y;
		if (town.stretch === 1) return 1 - Math.sqrt(dx * dx + dy * dy) / town.radius + SHAPE_WEIGHT * (shape - 0.5);
		const along = dx * town.axisX + dy * town.axisY;
		const across = dy * town.axisX - dx * town.axisY;
		return 1 - Math.sqrt((along * along) / town.stretch + across * across * town.stretch) / town.radius + SHAPE_WEIGHT * (shape - 0.5);
	}

	/** Distance from the center beyond which no cell of the town is urban: the far end of the axis of a linear town. */
	static reach(town: Town): number {
		return town.radius * Math.sqrt(town.stretch) * BORDER_REACH;
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

import { Salt } from './hash';
import { SampledField, ValueNoise } from './Noise';
import { HILL_LEVEL, MOUNTAIN_LEVEL, type Relief, SEA_LEVEL } from './Relief';

/** Water is smooth at a scale of hundreds of cells: a lattice of 16 puts the bank within a fraction of a cell of the exact contour. */
const WATER_STEP = 16;
const WARP_PERIOD = 700;
/** How far the warp moves a point, so a river bends back and forth instead of following the lattice of the noise. */
const WARP_AMPLITUDE = 180;
const RIVER_COARSE_PERIOD = 1400;
const RIVER_FINE_PERIOD = 500;
/** A river is the contour line of a noise: contours have no ends, so a river never stops. */
const RIVER_LEVEL = 0.5;
/**
 * Half width of a river in cells: `RIVER_HALF_MIN` at `MOUNTAIN_LEVEL`, where rivers start, growing to `RIVER_HALF_MAX` at `SEA_LEVEL`, so
 * a river widens as it runs downhill. The bank is where the distance to the contour, estimated as the height above the level divided by the
 * slope, reaches this: a band of constant height gets 10 times wider where the noise is flat than where it is steep.
 */
const RIVER_HALF_MIN = 2;
const RIVER_HALF_MAX = 5;
/** Step of the finite difference that measures the slope: small against the 500 cells of the finest octave. */
const SLOPE_STEP = 8;
/** Slope bounds in height per cell. The floor keeps a river continuous where the noise is flat, the cap bounds the band that rules tiles out. */
const SLOPE_MIN = 1e-4;
const SLOPE_MAX = 4e-3;
/** Height distance from the river level beyond which a river is out of reach: the widest half width times the steepest slope, with 1% margin. */
const RIVER_REACH = RIVER_HALF_MAX * SLOPE_MAX * 1.01;
const LAKE_PERIOD = 640;
/** Value noise only passes this level around a lattice peak, so lakes are rare. */
const LAKE_LEVEL = 0.9;

/** Half width of the river at elevation `e`; a river in the sea is as wide as at the coast. */
const halfWidth = (e: number): number => RIVER_HALF_MIN + (RIVER_HALF_MAX - RIVER_HALF_MIN) * Math.min(1, (MOUNTAIN_LEVEL - e) / (MOUNTAIN_LEVEL - SEA_LEVEL));

/**
 * The sea, the rivers and the lakes as a pure function of the seed and the cell position. The sea is the land under `SEA_LEVEL`. A river
 * only runs below `MOUNTAIN_LEVEL` and a lake only below `HILL_LEVEL`, so neither climbs a mountain. The sea and the lakes are wide water
 * (code 2 in the mask), a river is code 1: a road bridges a river and a sea strait, but an avenue stops at wide water.
 */
export class Water {
	private readonly relief: Relief;
	private readonly height: SampledField;
	private readonly distance: SampledField;
	private readonly lake: SampledField;
	private distanceCells = new Float64Array(0);
	private lakeCells = new Float64Array(0);
	private hasLakes = false;

	constructor(seed: number, relief: Relief) {
		this.relief = relief;
		const warpX = new ValueNoise(seed, Salt.WARP_X, WARP_PERIOD);
		const warpY = new ValueNoise(seed, Salt.WARP_Y, WARP_PERIOD);
		const coarse = new ValueNoise(seed, Salt.RIVER_COARSE, RIVER_COARSE_PERIOD);
		const fine = new ValueNoise(seed, Salt.RIVER_FINE, RIVER_FINE_PERIOD);
		const height = (x: number, y: number): number => {
			const wx = x + (2 * warpX.at(x, y) - 1) * WARP_AMPLITUDE;
			const wy = y + (2 * warpY.at(x, y) - 1) * WARP_AMPLITUDE;
			return 0.8 * coarse.at(wx, wy) + 0.2 * fine.at(wx, wy);
		};
		this.height = new SampledField(height, WATER_STEP);
		/** Signed, so that bilinear interpolation puts the zero crossing, and so the bank, where the exact field has it. */
		this.distance = new SampledField((x, y) => {
			const h = height(x, y);
			const dx = height(x + SLOPE_STEP, y) - h;
			const dy = height(x, y + SLOPE_STEP) - h;
			const slope = Math.sqrt(dx * dx + dy * dy) / SLOPE_STEP;
			return (h - RIVER_LEVEL) / Math.min(SLOPE_MAX, Math.max(SLOPE_MIN, slope));
		}, WATER_STEP);
		const lake = new ValueNoise(seed, Salt.LAKE, LAKE_PERIOD);
		this.lake = new SampledField((x, y) => lake.at(x, y), WATER_STEP);
	}

	/** Same answer as the cell `fill` writes at (x, y): the sea, a lake or a river. */
	at(x: number, y: number): boolean {
		const e = this.relief.elevationAt(x, y);
		return this.wide(x, y, e) || this.river(x, y, e);
	}

	/** Whether (x, y) is sea or lake, rivers excluded: the cells `fill` writes as 2. */
	wideAt(x: number, y: number): boolean {
		return this.wide(x, y, this.relief.elevationAt(x, y));
	}

	/** Whether (x, y) is in the band of a river, even where the sea or a lake covers it. */
	riverAt(x: number, y: number): boolean {
		return this.river(x, y, this.relief.elevationAt(x, y));
	}

	private wide(x: number, y: number, e: number): boolean {
		return e < SEA_LEVEL || (e < HILL_LEVEL && this.lake.at(x, y) > LAKE_LEVEL);
	}

	/**
	 * The distance costs three heights per lattice point and most cells are far from any river, so the four heights around the cell rule
	 * it out first, with the same bound `fill` uses for a tile: it never changes the answer.
	 */
	private river(x: number, y: number, e: number): boolean {
		if (e >= MOUNTAIN_LEVEL) return false;
		const { height, distance } = this;
		height.boundsAt(x, y);
		if (!(height.lowest < RIVER_LEVEL + RIVER_REACH && height.highest > RIVER_LEVEL - RIVER_REACH)) return false;
		return Math.abs(distance.at(x, y)) < halfWidth(e);
	}

	/** Lake noise of the cells of the tile last passed to `fill`, row-major, or null when no lake can touch it. */
	lakeValues(): Float64Array | null {
		return this.hasLakes ? this.lakeCells : null;
	}

	/**
	 * Writes 0 for dry, 1 for a river and 2 for the sea or a lake into the `size` x `size` tile at (x0, y0), row-major, and returns the
	 * number of wet cells. It prepares the relief for the tile.
	 */
	fill(x0: number, y0: number, size: number, mask: Uint8Array): number {
		const { relief, height, distance, lake } = this;
		const cells = size * size;
		relief.prepare(x0, y0, size);
		this.hasLakes = false;
		if (relief.highE < SEA_LEVEL) {
			mask.fill(2, 0, cells);
			return cells;
		}
		/**
		 * An interpolated value stays between the lattice values under the tile, so most tiles are ruled out without touching a cell. The
		 * cheap height says first whether any river is near, since the distance costs three heights per lattice point.
		 */
		height.sample(x0, y0, size);
		lake.sample(x0, y0, size);
		let rivers = relief.lowE < MOUNTAIN_LEVEL && height.lowest < RIVER_LEVEL + RIVER_REACH && height.highest > RIVER_LEVEL - RIVER_REACH;
		if (rivers) {
			distance.sample(x0, y0, size);
			rivers = distance.lowest < RIVER_HALF_MAX && distance.highest > -RIVER_HALF_MAX;
		}
		const lakes = relief.lowE < HILL_LEVEL && lake.highest > LAKE_LEVEL;
		if (!rivers && !lakes && relief.lowE >= SEA_LEVEL) {
			mask.fill(0, 0, cells);
			return 0;
		}

		if (this.distanceCells.length < cells) {
			this.distanceCells = new Float64Array(cells);
			this.lakeCells = new Float64Array(cells);
		}
		const { distanceCells, lakeCells } = this;
		if (rivers) distance.interpolate(x0, y0, size, distanceCells);
		if (lakes) lake.interpolate(x0, y0, size, lakeCells);
		this.hasLakes = lakes;
		const elevations = relief.elevations();
		let count = 0;
		for (let i = 0; i < cells; i++) {
			const e = elevations[i];
			if (e < SEA_LEVEL || (lakes && e < HILL_LEVEL && lakeCells[i] > LAKE_LEVEL)) {
				mask[i] = 2;
				count++;
			} else if (rivers && e < MOUNTAIN_LEVEL && Math.abs(distanceCells[i]) < halfWidth(e)) {
				mask[i] = 1;
				count++;
			} else mask[i] = 0;
		}
		return count;
	}
}

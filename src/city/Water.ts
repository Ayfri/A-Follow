import { Salt } from './hash';
import { SampledField, ValueNoise } from './Noise';

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
 * Half width of a river in cells. The bank is where the distance to the contour, estimated as the height above the level divided by the
 * slope, reaches this: a band of constant height gets 10 times wider where the noise is flat than where it is steep.
 */
const RIVER_HALF_WIDTH = 2.5;
/** Step of the finite difference that measures the slope: small against the 500 cells of the finest octave. */
const SLOPE_STEP = 8;
/** Slope bounds in height per cell. The floor keeps a river continuous where the noise is flat, the cap bounds the band that rules tiles out. */
const SLOPE_MIN = 1e-4;
const SLOPE_MAX = 4e-3;
/** Height distance from the river level beyond which a river is out of reach: the half width times the steepest slope, with 1% margin. */
const RIVER_REACH = RIVER_HALF_WIDTH * SLOPE_MAX * 1.01;
const LAKE_PERIOD = 640;
/** Value noise only passes this level around a lattice peak, so lakes are rare. */
const LAKE_LEVEL = 0.9;

/** Rivers and lakes as a pure function of the seed and the cell position. */
export class Water {
	private readonly height: SampledField;
	private readonly distance: SampledField;
	private readonly lake: SampledField;
	private distanceValues = new Float64Array(0);
	private lakeValues = new Float64Array(0);

	constructor(seed: number) {
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

	/** Same answer as the cell `fill` writes at (x, y). */
	at(x: number, y: number): boolean {
		return this.lake.at(x, y) > LAKE_LEVEL || this.riverAt(x, y);
	}

	/**
	 * The distance costs three heights per lattice point and most cells are far from any river, so the four heights around the cell rule
	 * it out first, with the same bound `fill` uses for a tile: it never changes the answer.
	 */
	private riverAt(x: number, y: number): boolean {
		const { height, distance } = this;
		height.boundsAt(x, y);
		if (!(height.lowest < RIVER_LEVEL + RIVER_REACH && height.highest > RIVER_LEVEL - RIVER_REACH)) return false;
		return Math.abs(distance.at(x, y)) < RIVER_HALF_WIDTH;
	}

	/** Whether (x, y) is in a lake, rivers excluded. A cell is water in `at` when it is a lake cell or a river cell. */
	lakeAt(x: number, y: number): boolean {
		return this.lake.at(x, y) > LAKE_LEVEL;
	}

	/** Writes 1 for water and 0 for dry into the `size` x `size` tile at (x0, y0), row-major, and returns the number of water cells. */
	fill(x0: number, y0: number, size: number, mask: Uint8Array): number {
		const { height, distance, lake } = this;
		const cells = size * size;
		/**
		 * An interpolated value stays between the lattice values under the tile, so most tiles are ruled out without touching a cell. The
		 * cheap height says first whether any river is near, since the distance costs three heights per lattice point.
		 */
		height.sample(x0, y0, size);
		lake.sample(x0, y0, size);
		let rivers = height.lowest < RIVER_LEVEL + RIVER_REACH && height.highest > RIVER_LEVEL - RIVER_REACH;
		if (rivers) {
			distance.sample(x0, y0, size);
			rivers = distance.lowest < RIVER_HALF_WIDTH && distance.highest > -RIVER_HALF_WIDTH;
		}
		const lakes = lake.highest > LAKE_LEVEL;
		if (!rivers && !lakes) {
			mask.fill(0, 0, cells);
			return 0;
		}

		if (this.distanceValues.length < cells) {
			this.distanceValues = new Float64Array(cells);
			this.lakeValues = new Float64Array(cells);
		}
		const { distanceValues, lakeValues } = this;
		if (rivers) distance.interpolate(x0, y0, size, distanceValues);
		if (lakes) lake.interpolate(x0, y0, size, lakeValues);
		let count = 0;
		for (let i = 0; i < cells; i++) {
			const wet = (rivers && Math.abs(distanceValues[i]) < RIVER_HALF_WIDTH) || (lakes && lakeValues[i] > LAKE_LEVEL);
			mask[i] = wet ? 1 : 0;
			if (wet) count++;
		}
		return count;
	}
}

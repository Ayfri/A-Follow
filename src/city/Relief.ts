import { Salt } from './hash';
import { SampledField, ValueNoise } from './Noise';

/**
 * Elevation levels, in the units of the elevation field. They are quantiles of the elevation far from the origin floor (point queries every
 * 64 cells over 32768 x 32768 cells centered at (60000, -40000), seeds 1 to 3 pooled, 786432 samples): the elevation spans 0.09 to 0.93 with
 * a median of 0.49. Below SEA_LEVEL is 14.4% of the cells (11.9% to 17.1% per seed: the 6000-cell octave leaves only a few independent
 * features per seed), below HILL_LEVEL 80.8% (hills and higher are 19%), below MOUNTAIN_LEVEL 89.8%, below SNOW_LEVEL 96.3% (snow at a
 * temperature of 0.5).
 */
export const SEA_LEVEL = 0.35;
export const BEACH_TOP = SEA_LEVEL + 0.008;
export const MARSH_TOP = SEA_LEVEL + 0.05;
export const HILL_LEVEL = 0.6;
export const MOUNTAIN_LEVEL = 0.65;
export const SNOW_LEVEL = 0.71;
/** Towns are not placed above the middle of the hills and the mountains. */
export const TOWN_MAX_ELEVATION = (HILL_LEVEL + MOUNTAIN_LEVEL) / 2;

/** The finest elevation octave has a period of 110 cells, so a lattice of 8 gives it 14 samples per period. */
const ELEVATION_STEP = 8;
const CLIMATE_STEP = 16;
/** Cooling per unit of elevation above 0.5: the mountains are cold whatever the latitude noise says. */
const LAPSE = 0.6;
const LAND_FLOOR = MARSH_TOP + 0.01;
/**
 * The floor under the elevation falls from `LAND_FLOOR` at the origin to `SEA_LEVEL` at this distance, and keeps falling past it, so every
 * seed has land around (0, 0) where the player starts. No cell within 600 cells of the origin is sea (`originLand` test): the rest is margin
 * for the interpolation between lattice points, which lies under the cone.
 */
const LAND_RADIUS = 800;
const LAND_SLOPE = (LAND_FLOOR - SEA_LEVEL) / LAND_RADIUS;

/**
 * Elevation, moisture and temperature of the world as pure functions of the seed and the cell position. The point queries read nothing
 * from the tile; `prepare` samples the three lattices of a tile once, so the layers of a tile share them and rule the tile out from the
 * bounds before interpolating anything.
 */
export class Relief {
	private readonly elevation: SampledField;
	private readonly moisture: SampledField;
	private readonly warmth: SampledField;
	/** Bounds of the lattice points under the prepared tile: every interpolated value lies between them. `lowT0` and `highT0` bound the base temperature. */
	lowE = 0;
	highE = 0;
	lowM = 0;
	highM = 0;
	lowT0 = 0;
	highT0 = 0;
	private elevationValues = new Float64Array(0);
	private moistureValues = new Float64Array(0);
	private temperatureValues = new Float64Array(0);
	private elevationsReady = false;
	private moisturesReady = false;
	private temperaturesReady = false;
	private preparedX = Number.NaN;
	private preparedY = Number.NaN;
	private preparedSize = Number.NaN;

	constructor(seed: number) {
		const e1 = new ValueNoise(seed, Salt.ELEVATION_1, 6000);
		const e2 = new ValueNoise(seed, Salt.ELEVATION_2, 1800);
		const e3 = new ValueNoise(seed, Salt.ELEVATION_3, 450);
		const e4 = new ValueNoise(seed, Salt.ELEVATION_4, 110);
		/** The floor is part of the lattice values, not applied after the interpolation, so tiles and point queries keep agreeing. */
		this.elevation = new SampledField(
			(x, y) => Math.max(0.5 * e1.at(x, y) + 0.25 * e2.at(x, y) + 0.15 * e3.at(x, y) + 0.1 * e4.at(x, y), LAND_FLOOR - LAND_SLOPE * Math.sqrt(x * x + y * y)),
			ELEVATION_STEP
		);
		const m1 = new ValueNoise(seed, Salt.MOISTURE_1, 2600);
		const m2 = new ValueNoise(seed, Salt.MOISTURE_2, 700);
		this.moisture = new SampledField((x, y) => 0.7 * m1.at(x, y) + 0.3 * m2.at(x, y), CLIMATE_STEP);
		const t1 = new ValueNoise(seed, Salt.TEMPERATURE_1, 5200);
		const t2 = new ValueNoise(seed, Salt.TEMPERATURE_2, 1300);
		this.warmth = new SampledField((x, y) => 0.75 * t1.at(x, y) + 0.25 * t2.at(x, y), CLIMATE_STEP);
	}

	elevationAt(x: number, y: number): number {
		return this.elevation.at(x, y);
	}

	moistureAt(x: number, y: number): number {
		return this.moisture.at(x, y);
	}

	/** The base temperature lowered by the elevation. It is never stored in a lattice, so the lapse follows the exact elevation of each cell. */
	temperatureAt(x: number, y: number): number {
		return this.warmth.at(x, y) - LAPSE * (this.elevation.at(x, y) - 0.5);
	}

	/** Upper bound of the temperature of every cell of the prepared tile. */
	get highestTemperature(): number {
		return this.highT0 - LAPSE * (this.lowE - 0.5);
	}

	/** Lower bound of the temperature of every cell of the prepared tile. */
	get lowestTemperature(): number {
		return this.lowT0 - LAPSE * (this.highE - 0.5);
	}

	/** Samples the lattices under the `size` x `size` tile at (x0, y0) and sets the bounds. Asking again for the same tile costs nothing. */
	prepare(x0: number, y0: number, size: number): void {
		if (x0 === this.preparedX && y0 === this.preparedY && size === this.preparedSize) return;
		this.preparedX = x0;
		this.preparedY = y0;
		this.preparedSize = size;
		this.elevation.sample(x0, y0, size);
		this.lowE = this.elevation.lowest;
		this.highE = this.elevation.highest;
		this.moisture.sample(x0, y0, size);
		this.lowM = this.moisture.lowest;
		this.highM = this.moisture.highest;
		this.warmth.sample(x0, y0, size);
		this.lowT0 = this.warmth.lowest;
		this.highT0 = this.warmth.highest;
		this.elevationsReady = false;
		this.moisturesReady = false;
		this.temperaturesReady = false;
	}

	/** Elevation of the cells of the prepared tile, row-major. Interpolated on the first call after `prepare`. */
	elevations(): Float64Array {
		if (!this.elevationsReady) {
			const cells = this.preparedSize * this.preparedSize;
			if (this.elevationValues.length < cells) this.elevationValues = new Float64Array(cells);
			this.elevation.interpolate(this.preparedX, this.preparedY, this.preparedSize, this.elevationValues);
			this.elevationsReady = true;
		}
		return this.elevationValues;
	}

	moistures(): Float64Array {
		if (!this.moisturesReady) {
			const cells = this.preparedSize * this.preparedSize;
			if (this.moistureValues.length < cells) this.moistureValues = new Float64Array(cells);
			this.moisture.interpolate(this.preparedX, this.preparedY, this.preparedSize, this.moistureValues);
			this.moisturesReady = true;
		}
		return this.moistureValues;
	}

	temperatures(): Float64Array {
		if (!this.temperaturesReady) {
			const cells = this.preparedSize * this.preparedSize;
			if (this.temperatureValues.length < cells) this.temperatureValues = new Float64Array(cells);
			const { temperatureValues } = this;
			this.warmth.interpolate(this.preparedX, this.preparedY, this.preparedSize, temperatureValues);
			const elevations = this.elevations();
			for (let i = 0; i < cells; i++) temperatureValues[i] -= LAPSE * (elevations[i] - 0.5);
			this.temperaturesReady = true;
		}
		return this.temperatureValues;
	}
}

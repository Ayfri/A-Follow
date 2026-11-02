import { CellType } from '../core/CellType';
import { hash, Salt, unit } from './hash';
import { SampledField, ValueNoise } from './Noise';
import { BEACH_TOP, HILL_LEVEL, MARSH_TOP, MOUNTAIN_LEVEL, type Relief, SEA_LEVEL, SNOW_LEVEL } from './Relief';

/** Noise is sampled every 8 cells: smooth fields at periods of 96 and up show no difference, and it cuts the hashing per cell. */
const FIELD_STEP = 8;
/** Rock and marsh have periods of 28 and 36 cells: a lattice of 4 gives them 7 and 9 samples per period. */
const DETAIL_STEP = 4;
const FOREST_LEVEL = 0.64;
const FARM_LEVEL = 0.45;
/** Farm parcels are 36 x 24 cells in a brick layout: each parcel row is shifted by its own offset. */
const PARCEL_WIDTH = 36;
const PARCEL_HEIGHT = 24;
/** Parcel kinds by the roll of the parcel: field, meadow, orchard (vineyard rows), then bare ground. */
const FIELD_SHARE = 0.5;
const MEADOW_PARCEL_END = 0.62;
const ORCHARD_PARCEL_END = 0.72;
const KIND_FIELD = 0;
const KIND_MEADOW = 1;
const KIND_ORCHARD = 2;
const KIND_BARE = 3;
/** Orchards need a warm parcel: the temperature is read at the middle of the parcel, so every tile that shows the parcel agrees. */
const ORCHARD_TEMP = 0.45;
/** A farmstead is a 5 x 4 building in a corner of a field parcel: 6% of them, so a farm zone shows a few buildings and not a village. */
const FARMSTEAD_SHARE = 0.06;
const FARMSTEAD_WIDTH = 5;
const FARMSTEAD_HEIGHT = 4;

/** Meadow noise levels: lowland meadows are rarer than the ones in the hills, and the desert keeps its sand except in scrub patches. */
const MEADOW_LEVEL = 0.7;
const HILL_MEADOW_LEVEL = 0.6;
const SCRUB_LEVEL = 0.72;
/** Desert is warmer than `DESERT_TEMP` and drier than `DESERT_MOISTURE`; the towns read the same limits to keep out of it. */
export const DESERT_TEMP = 0.6;
export const DESERT_MOISTURE = 0.36;
const MARSH_MOISTURE = 0.64;
const MARSH_PATCH = 0.45;
/** Lowland forest is pine below this temperature, broadleaf above it. */
const PINE_TEMP = 0.42;
/** Snow starts at `SNOW_LEVEL` for a temperature of 0.5 and this much lower per unit of cold: a cold peak is white sooner. */
const SNOW_TEMP = 0.25;
/** Rock is the noise above `ROCK_LEVEL`, lowered with the elevation but never under `ROCK_MIN_LEVEL`, which is what keeps the passable part of a mountain connected. */
const ROCK_LEVEL = 0.66;
const ROCK_GROWTH = 0.6;
const ROCK_MIN_LEVEL = 0.62;
/** Marks a cell the lowland pass still has to decide. */
const LOWLAND = 255;
/** Stands in for an array a tile does not need: the flags that guard each read keep it from being indexed. */
const NONE = new Float64Array(0);

/**
 * The biome of every cell: sand, marsh and rock, snow, hills and pine forest on the slopes, and in the lowlands forest, meadow and farmland
 * zones cut into hedged parcels (fields with the odd farmstead, meadows, vineyard rows) with ground in between. The relief decides, the sea
 * itself is left to the water layer.
 */
export class Countryside {
	private readonly seed: number;
	private readonly relief: Relief;
	private readonly forest: SampledField;
	private readonly farm: SampledField;
	private readonly meadow: SampledField;
	private readonly rock: SampledField;
	private readonly marsh: SampledField;
	private forestValues = new Float64Array(0);
	private farmValues = new Float64Array(0);
	private meadowValues = new Float64Array(0);
	private rockValues = new Float64Array(0);
	private marshValues = new Float64Array(0);
	/** Whether the parcels of the row `warmRow` are warm enough for an orchard, by parcel column. */
	private readonly warm = new Map<number, boolean>();
	private warmRow = Number.NaN;

	constructor(seed: number, relief: Relief) {
		this.seed = seed;
		this.relief = relief;
		const coarse = new ValueNoise(seed, Salt.FOREST_COARSE, 320);
		const fine = new ValueNoise(seed, Salt.FOREST_FINE, 96);
		this.forest = new SampledField((x, y) => 0.7 * coarse.at(x, y) + 0.3 * fine.at(x, y), FIELD_STEP);
		const farm = new ValueNoise(seed, Salt.FARM_ZONE, 900);
		this.farm = new SampledField((x, y) => farm.at(x, y), FIELD_STEP);
		const meadow = new ValueNoise(seed, Salt.MEADOW, 220);
		this.meadow = new SampledField((x, y) => meadow.at(x, y), FIELD_STEP);
		const rockCoarse = new ValueNoise(seed, Salt.ROCK_COARSE, 80);
		const rockFine = new ValueNoise(seed, Salt.ROCK_FINE, 28);
		this.rock = new SampledField((x, y) => 0.7 * rockCoarse.at(x, y) + 0.3 * rockFine.at(x, y), DETAIL_STEP);
		const marsh = new ValueNoise(seed, Salt.MARSH_PATCH, 36);
		this.marsh = new SampledField((x, y) => marsh.at(x, y), DETAIL_STEP);
	}

	/**
	 * Writes every byte of the `size` x `size` tile at (x0, y0) into `out`, row-major, and returns whether it wrote ROCK. It prepares the
	 * relief for the tile.
	 *
	 * Most tiles are lowland with no desert, so the bounds of the relief rule the slope, shore, desert and marsh rules out and only the
	 * lowland pass runs. The other tiles first decide every cell the slope, shore, desert and marsh rules take, and leave the rest to the same
	 * lowland pass, so a cell gets the same type whichever tile it is generated in.
	 */
	fill(x0: number, y0: number, size: number, out: Uint8Array): boolean {
		const { relief } = this;
		const cells = size * size;
		relief.prepare(x0, y0, size);
		if (relief.highE < SEA_LEVEL) {
			out.fill(CellType.GROUND, 0, cells);
			return false;
		}
		if (this.forestValues.length < cells) {
			this.forestValues = new Float64Array(cells);
			this.farmValues = new Float64Array(cells);
			this.meadowValues = new Float64Array(cells);
			this.rockValues = new Float64Array(cells);
			this.marshValues = new Float64Array(cells);
		}
		const { forest, farm, meadow, forestValues, farmValues, meadowValues } = this;
		/** A field is interpolated only when it passes a level somewhere in the tile: the lattice values bound every cell. */
		forest.sample(x0, y0, size);
		const hasForest = forest.highest > FOREST_LEVEL;
		if (hasForest) forest.interpolate(x0, y0, size, forestValues);
		farm.sample(x0, y0, size);
		const hasFarm = farm.highest > FARM_LEVEL;
		if (hasFarm) farm.interpolate(x0, y0, size, farmValues);
		meadow.sample(x0, y0, size);
		const hasMeadow = meadow.highest > HILL_MEADOW_LEVEL;
		if (hasMeadow) meadow.interpolate(x0, y0, size, meadowValues);

		const desert = relief.highestTemperature > DESERT_TEMP && relief.lowM < DESERT_MOISTURE;
		const lowland = relief.lowE >= MARSH_TOP && relief.highE < HILL_LEVEL && !desert;
		let rocky = false;
		if (!lowland) rocky = this.slopes(x0, y0, size, out, desert, hasForest, hasMeadow);

		/** Pine or broadleaf forest: the same for the whole tile when its temperatures are on one side of `PINE_TEMP`, else cell by cell. */
		const forestType = relief.lowestTemperature >= PINE_TEMP ? CellType.FOREST : relief.highestTemperature < PINE_TEMP ? CellType.PINE : -1;
		const temperatures = hasForest && forestType < 0 ? relief.temperatures() : NONE;
		this.warm.clear();
		this.warmRow = Number.NaN;
		const { seed } = this;

		for (let row = 0; row < size; row++) {
			const parcelRow = Math.floor((y0 + row) / PARCEL_HEIGHT);
			const v = y0 + row - parcelRow * PARCEL_HEIGHT;
			const hedgeFree = v >= 1 && v <= PARCEL_HEIGHT - 2;
			const offset = hash(seed, parcelRow, 0, Salt.PARCEL_ROW) % PARCEL_WIDTH;
			let parcelCol = Number.NaN;
			let kind = KIND_BARE;
			/** Corner of the parcel, in cells from its hedge, that the farmstead covers: -1 without one. */
			let farmU = -1;
			let farmV = -1;

			for (let col = 0; col < size; col++) {
				const i = row * size + col;
				if (!lowland && out[i] !== LOWLAND) continue;
				if (hasForest && forestValues[i] > FOREST_LEVEL) {
					out[i] = forestType >= 0 ? forestType : temperatures[i] < PINE_TEMP ? CellType.PINE : CellType.FOREST;
					continue;
				}
				out[i] = CellType.GROUND;
				if (!hasFarm || farmValues[i] <= FARM_LEVEL) {
					if (hasMeadow && meadowValues[i] > MEADOW_LEVEL) out[i] = CellType.MEADOW;
					continue;
				}
				if (!hedgeFree) continue;

				const x = x0 + col - offset;
				const column = Math.floor(x / PARCEL_WIDTH);
				if (column !== parcelCol) {
					parcelCol = column;
					kind = this.parcelKind(column, parcelRow, offset);
					farmU = -1;
					if (kind === KIND_FIELD && unit(hash(seed, column, parcelRow, Salt.FARMSTEAD)) < FARMSTEAD_SHARE) {
						const corner = hash(seed, column, parcelRow, Salt.FARM_CORNER);
						farmU = (corner & 1) === 0 ? 1 : PARCEL_WIDTH - 1 - FARMSTEAD_WIDTH;
						farmV = (corner & 2) === 0 ? 1 : PARCEL_HEIGHT - 1 - FARMSTEAD_HEIGHT;
					}
				}
				const u = x - column * PARCEL_WIDTH;
				if (kind === KIND_BARE || u < 1 || u > PARCEL_WIDTH - 2) continue;
				if (kind === KIND_FIELD) {
					out[i] = farmU >= 0 && u >= farmU && u < farmU + FARMSTEAD_WIDTH && v >= farmV && v < farmV + FARMSTEAD_HEIGHT ? CellType.BUILDING : CellType.FIELD;
				} else if (kind === KIND_MEADOW) out[i] = CellType.MEADOW;
				else if ((v & 1) === 1) out[i] = CellType.ORCHARD;
			}
		}
		return rocky;
	}

	/** The kind of a parcel: a function of the parcel only. An orchard parcel in a cold place is a field. */
	private parcelKind(column: number, parcelRow: number, offset: number): number {
		const roll = unit(hash(this.seed, column, parcelRow, Salt.PARCEL_KIND));
		if (roll < FIELD_SHARE) return KIND_FIELD;
		if (roll < MEADOW_PARCEL_END) return KIND_MEADOW;
		if (roll >= ORCHARD_PARCEL_END) return KIND_BARE;
		if (this.warmRow !== parcelRow) {
			this.warm.clear();
			this.warmRow = parcelRow;
		}
		let warm = this.warm.get(column);
		if (warm === undefined) {
			warm = this.relief.temperatureAt(column * PARCEL_WIDTH + offset + (PARCEL_WIDTH >> 1), parcelRow * PARCEL_HEIGHT + (PARCEL_HEIGHT >> 1)) > ORCHARD_TEMP;
			this.warm.set(column, warm);
		}
		return warm ? KIND_ORCHARD : KIND_FIELD;
	}

	/**
	 * Decides the cells that depend on the elevation or the climate: the shore, marsh, desert, hills and mountains. The others get the
	 * `LOWLAND` mark. Returns whether a cell is ROCK.
	 */
	private slopes(x0: number, y0: number, size: number, out: Uint8Array, desert: boolean, hasForest: boolean, hasMeadow: boolean): boolean {
		const { relief, forestValues, meadowValues } = this;
		const cells = size * size;
		const marsh = relief.lowE < MARSH_TOP && relief.highM > MARSH_MOISTURE;
		const rocky = relief.highE >= MOUNTAIN_LEVEL;
		const elevations = relief.elevations();
		const moistures = desert || marsh ? relief.moistures() : NONE;
		const temperatures = desert || rocky ? relief.temperatures() : NONE;
		if (marsh) this.marsh.fillTile(x0, y0, size, this.marshValues);
		if (rocky) this.rock.fillTile(x0, y0, size, this.rockValues);
		const { marshValues, rockValues } = this;

		let rock = false;
		for (let i = 0; i < cells; i++) {
			const e = elevations[i];
			if (e < SEA_LEVEL) out[i] = CellType.GROUND;
			else if (e < BEACH_TOP) out[i] = CellType.SAND;
			else if (e >= MOUNTAIN_LEVEL) {
				if (rockValues[i] > Math.max(ROCK_MIN_LEVEL, ROCK_LEVEL - ROCK_GROWTH * (e - MOUNTAIN_LEVEL))) {
					out[i] = CellType.ROCK;
					rock = true;
				} else if (e + SNOW_TEMP * (0.5 - temperatures[i]) >= SNOW_LEVEL) out[i] = CellType.SNOW;
				else out[i] = hasForest && forestValues[i] > FOREST_LEVEL ? CellType.PINE : CellType.HILL;
			} else if (e >= HILL_LEVEL) {
				out[i] = hasForest && forestValues[i] > FOREST_LEVEL ? CellType.PINE : hasMeadow && meadowValues[i] > HILL_MEADOW_LEVEL ? CellType.MEADOW : CellType.HILL;
			} else if (desert && temperatures[i] > DESERT_TEMP && moistures[i] < DESERT_MOISTURE) {
				out[i] = hasMeadow && meadowValues[i] > SCRUB_LEVEL ? CellType.GROUND : CellType.SAND;
			} else if (marsh && e < MARSH_TOP && moistures[i] > MARSH_MOISTURE && marshValues[i] > MARSH_PATCH) out[i] = CellType.MARSH;
			else out[i] = LOWLAND;
		}
		return rock;
	}
}

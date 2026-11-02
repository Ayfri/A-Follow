import { CellType } from '../core/CellType';
import { hash, Salt, unit } from './hash';
import { SampledField, ValueNoise } from './Noise';

/** Noise is sampled every 8 cells: smooth fields at periods of 96 and up show no difference, and it cuts the hashing per cell. */
const FIELD_STEP = 8;
const FOREST_LEVEL = 0.64;
const FARM_LEVEL = 0.45;
/** Farm parcels are 36 x 24 cells in a brick layout: each parcel row is shifted by its own offset. */
const PARCEL_WIDTH = 36;
const PARCEL_HEIGHT = 24;
const FIELD_SHARE = 0.6;

/** Forests, and farmland zones cut into hedged field parcels; ground everywhere else. */
export class Countryside {
	private readonly seed: number;
	private readonly forest: SampledField;
	private readonly farm: SampledField;
	private forestValues = new Float64Array(0);
	private farmValues = new Float64Array(0);

	constructor(seed: number) {
		this.seed = seed;
		const coarse = new ValueNoise(seed, Salt.FOREST_COARSE, 320);
		const fine = new ValueNoise(seed, Salt.FOREST_FINE, 96);
		this.forest = new SampledField((x, y) => 0.7 * coarse.at(x, y) + 0.3 * fine.at(x, y), FIELD_STEP);
		const farm = new ValueNoise(seed, Salt.FARM_ZONE, 900);
		this.farm = new SampledField((x, y) => farm.at(x, y), FIELD_STEP);
	}

	/** Writes every byte of the `size` x `size` tile at (x0, y0) into `out`, row-major. */
	fill(x0: number, y0: number, size: number, out: Uint8Array): void {
		if (this.forestValues.length < size * size) {
			this.forestValues = new Float64Array(size * size);
			this.farmValues = new Float64Array(size * size);
		}
		const { seed, forestValues, farmValues } = this;
		this.forest.fillTile(x0, y0, size, forestValues);
		this.farm.fillTile(x0, y0, size, farmValues);

		for (let row = 0; row < size; row++) {
			const parcelRow = Math.floor((y0 + row) / PARCEL_HEIGHT);
			const v = y0 + row - parcelRow * PARCEL_HEIGHT;
			const hedgeFree = v >= 1 && v <= PARCEL_HEIGHT - 2;
			const offset = hash(seed, parcelRow, 0, Salt.PARCEL_ROW) % PARCEL_WIDTH;
			let parcelCol = Number.NaN;
			let isField = false;

			for (let col = 0; col < size; col++) {
				const i = row * size + col;
				if (forestValues[i] > FOREST_LEVEL) {
					out[i] = CellType.FOREST;
					continue;
				}
				out[i] = CellType.GROUND;
				if (!hedgeFree || farmValues[i] <= FARM_LEVEL) continue;

				const x = x0 + col - offset;
				const column = Math.floor(x / PARCEL_WIDTH);
				if (column !== parcelCol) {
					parcelCol = column;
					isField = unit(hash(seed, column, parcelRow, Salt.PARCEL)) < FIELD_SHARE;
				}
				const u = x - column * PARCEL_WIDTH;
				if (isField && u >= 1 && u <= PARCEL_WIDTH - 2) out[i] = CellType.FIELD;
			}
		}
	}
}

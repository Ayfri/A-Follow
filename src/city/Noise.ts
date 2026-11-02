import { hash, unit } from './hash';

/**
 * Smooth noise in [0, 1): random values on a lattice of `period` cells, blended with a smoothstep.
 * Only `+ - * /` and `Math.floor` on doubles, which every engine rounds the same way, so two threads get the same bits.
 */
export class ValueNoise {
	private readonly seed: number;
	private readonly salt: number;
	private readonly period: number;

	constructor(seed: number, salt: number, period: number) {
		this.seed = seed;
		this.salt = salt;
		this.period = period;
	}

	at(x: number, y: number): number {
		const fx = x / this.period;
		const fy = y / this.period;
		const ix = Math.floor(fx);
		const iy = Math.floor(fy);
		const tx = fx - ix;
		const ty = fy - iy;
		const sx = tx * tx * (3 - 2 * tx);
		const sy = ty * ty * (3 - 2 * ty);
		const { seed, salt } = this;
		return SampledField.lerp2(
			unit(hash(seed, ix, iy, salt)),
			unit(hash(seed, ix + 1, iy, salt)),
			unit(hash(seed, ix, iy + 1, salt)),
			unit(hash(seed, ix + 1, iy + 1, salt)),
			sx,
			sy
		);
	}
}

/**
 * A field evaluated only on the global lattice of multiples of `step` and bilinearly interpolated in between. The lattice is anchored at
 * the origin, not at the tile, so `at` and every `fillTile` give the same value for a cell whatever the tile origin. That is what makes a
 * chunk generated alone equal to the same cells generated as part of a bigger tile.
 * Float64, not Float32: a comparison against a threshold must not depend on the storage precision.
 */
export class SampledField {
	private readonly evaluate: (x: number, y: number) => number;
	private readonly step: number;
	private corners = new Float64Array(0);
	private columns = 0;
	private columnOffset = new Int32Array(0);
	private columnWeight = new Float64Array(0);
	/** Bounds of the lattice points of the last `sample`. */
	lowest = 0;
	highest = 0;

	constructor(evaluate: (x: number, y: number) => number, step: number) {
		this.evaluate = evaluate;
		this.step = step;
	}

	/** The one interpolation formula, shared by `at` and `fillTile`: it is what keeps their results identical. */
	static lerp2(v00: number, v10: number, v01: number, v11: number, tx: number, ty: number): number {
		const top = v00 + (v10 - v00) * tx;
		const bottom = v01 + (v11 - v01) * tx;
		return top + (bottom - top) * ty;
	}

	at(x: number, y: number): number {
		const { step, evaluate } = this;
		const gx = Math.floor(x / step);
		const gy = Math.floor(y / step);
		const x0 = gx * step;
		const y0 = gy * step;
		return SampledField.lerp2(
			evaluate(x0, y0),
			evaluate(x0 + step, y0),
			evaluate(x0, y0 + step),
			evaluate(x0 + step, y0 + step),
			(x - x0) / step,
			(y - y0) / step
		);
	}

	/** Sets `lowest` and `highest` to the bounds of the four lattice points around (x, y), which `at` interpolates between. */
	boundsAt(x: number, y: number): void {
		const { step, evaluate } = this;
		const x0 = Math.floor(x / step) * step;
		const y0 = Math.floor(y / step) * step;
		const a = evaluate(x0, y0);
		const b = evaluate(x0 + step, y0);
		const c = evaluate(x0, y0 + step);
		const d = evaluate(x0 + step, y0 + step);
		this.lowest = Math.min(a, b, c, d);
		this.highest = Math.max(a, b, c, d);
	}

	/** Writes the `size` x `size` tile at (x0, y0) into `out`, row-major, evaluating each lattice point once. */
	fillTile(x0: number, y0: number, size: number, out: Float64Array): void {
		this.sample(x0, y0, size);
		this.interpolate(x0, y0, size, out);
	}

	/**
	 * Evaluates the lattice points under the tile and keeps them for `interpolate`. Every interpolated value lies between the lowest and the
	 * highest of them, so a caller can rule a tile out from `lowest` and `highest` alone, without touching its cells.
	 */
	sample(x0: number, y0: number, size: number): void {
		const { step, evaluate } = this;
		const gx0 = Math.floor(x0 / step);
		const gy0 = Math.floor(y0 / step);
		const columns = Math.floor((x0 + size - 1) / step) - gx0 + 2;
		const rows = Math.floor((y0 + size - 1) / step) - gy0 + 2;
		if (this.corners.length < columns * rows) this.corners = new Float64Array(columns * rows);
		const { corners } = this;
		let low = Infinity;
		let high = -Infinity;
		for (let j = 0; j < rows; j++) {
			for (let i = 0; i < columns; i++) {
				const v = evaluate((gx0 + i) * step, (gy0 + j) * step);
				corners[j * columns + i] = v;
				if (v < low) low = v;
				if (v > high) high = v;
			}
		}
		this.lowest = low;
		this.highest = high;
		this.columns = columns;
	}

	/**
	 * Writes the tile last passed to `sample`, which must be the same (x0, y0, size). The lattice column and the weight of every column of
	 * the tile are computed once, not once per cell: the same arithmetic, 0.146 to 0.080 ms on a tile of 129 (mean of 3000 tiles).
	 */
	interpolate(x0: number, y0: number, size: number, out: Float64Array): void {
		const { step, corners, columns } = this;
		const gx0 = Math.floor(x0 / step);
		const gy0 = Math.floor(y0 / step);
		if (this.columnOffset.length < size) {
			this.columnOffset = new Int32Array(size);
			this.columnWeight = new Float64Array(size);
		}
		const { columnOffset, columnWeight } = this;
		for (let col = 0; col < size; col++) {
			const x = x0 + col;
			const gx = Math.floor(x / step);
			columnOffset[col] = gx - gx0;
			columnWeight[col] = (x - gx * step) / step;
		}

		for (let row = 0; row < size; row++) {
			const y = y0 + row;
			const gy = Math.floor(y / step);
			const ty = (y - gy * step) / step;
			const base = (gy - gy0) * columns;
			for (let col = 0; col < size; col++) {
				const at = base + columnOffset[col];
				out[row * size + col] = SampledField.lerp2(corners[at], corners[at + 1], corners[at + columns], corners[at + columns + 1], columnWeight[col], ty);
			}
		}
	}
}

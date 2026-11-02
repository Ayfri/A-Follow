/** lowbias32 finalizer: every output bit depends on every input bit. Integer operations only, so every engine gives the same bits. */
export const mix32 = (x: number): number => {
	x ^= x >>> 16;
	x = Math.imul(x, 0x7feb352d);
	x ^= x >>> 15;
	x = Math.imul(x, 0x846ca68b);
	x ^= x >>> 16;
	return x >>> 0;
};

/** Uint32 hash of a seed, two int32 coordinates and a salt (which keeps the uses of one position independent). */
export const hash = (seed: number, a: number, b: number, salt: number): number => {
	let h = mix32(seed ^ Math.imul(salt + 1, 0x9e3779b1));
	h = mix32(h ^ Math.imul(a, 0x85ebca6b));
	return mix32(h ^ Math.imul(b, 0xc2b2ae35));
};

/** A hash as a float in [0, 1). */
export const unit = (h: number): number => h / 2 ** 32;

/** One salt per use of `hash`, so two layers never read correlated values at the same position. */
export const Salt = {
	FOREST_COARSE: 1,
	FOREST_FINE: 2,
	FARM_ZONE: 3,
	PARCEL_ROW: 4,
	PARCEL: 5,
} as const;

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
	WARP_X: 6,
	WARP_Y: 7,
	RIVER_COARSE: 8,
	RIVER_FINE: 9,
	LAKE: 10,
	TOWN_PRESENT: 11,
	TOWN_X: 12,
	TOWN_Y: 13,
	TOWN_TIER: 14,
	TOWN_RADIUS: 15,
	TOWN_ID: 16,
	TOWN_SHAPE: 20,
	ROAD_KEEP: 24,
	ROAD_BEND: 25,
	TOWN_SHAPE_FINE: 26,
	BLOCK: 27,
	SPLIT: 28,
	LOT: 29,
	TREE: 30,
	FARMSTEAD: 31,
	FARM_CORNER: 32,
	RIBBON: 33,
	RIBBON_SIZE: 34,
	ELEVATION_1: 35,
	ELEVATION_2: 36,
	ELEVATION_3: 37,
	ELEVATION_4: 38,
	MOISTURE_1: 39,
	MOISTURE_2: 40,
	TEMPERATURE_1: 41,
	TEMPERATURE_2: 42,
	ROCK_COARSE: 43,
	ROCK_FINE: 44,
	MARSH_PATCH: 45,
	MEADOW: 46,
	PARCEL_KIND: 47,
	TOWN_KIND: 48,
	TOWN_HARBOR: 49,
	TOWN_RIVER: 50,
	TOWN_AXIS: 51,
	TOWN_AXIS_KEEP: 52,
	TOWN_STRETCH: 53,
	TOWN_WALLED: 54,
	TOWN_DESERT: 55,
	METRO_PRESENT: 56,
	METRO_X: 57,
	METRO_Y: 58,
	LINE_JITTER: 59,
	DISTRICT_X: 60,
	DISTRICT_Y: 61,
	DISTRICT: 62,
	FRAME: 63,
} as const;

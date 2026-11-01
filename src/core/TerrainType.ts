export const TerrainType = {
	EMPTY: 0,
	WALL: 1,
	ROAD: 2,
	MOUNTAIN: 3,
	RIVER: 4,
	PLAIN: 5,
	HILL: 6,
	FOREST: 7,
	BRIDGE: 8,
	COAST: 9,
	VILLAGE: 10,
	SAND: 11
} as const;

export type Terrain = (typeof TerrainType)[keyof typeof TerrainType];

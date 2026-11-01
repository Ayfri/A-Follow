export const TerrainType = {
	EMPTY: 0,
	WALL: 1
} as const;

export type Terrain = (typeof TerrainType)[keyof typeof TerrainType];

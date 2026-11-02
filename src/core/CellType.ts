/** Terrain of a cell, stored as one byte. WALL keeps byte value 1, so every 0/1 byte written as "wall" keeps its meaning. */
export const CellType = {
	GROUND: 0,
	WALL: 1,
	STREET: 2,
	AVENUE: 3,
	HIGHWAY: 4,
	BRIDGE: 5,
	PLAZA: 6,
	PARK: 7,
	FIELD: 8,
	FOREST: 9,
	BUILDING: 10,
	WATER: 11,
} as const;
export type CellType = (typeof CellType)[keyof typeof CellType];

/** Bytes 12 to 15 are unused and blocked, so a stray byte never reads as passable. */
export const TYPE_COUNT = 16;

/**
 * Cost to enter a cell of each type, 0 = blocked. The start cell of a path never counts. Ground costs 4x the cheapest road, which bounds
 * how weak a Manhattan heuristic scaled by `MIN_COST` can get.
 */
export const COST = new Uint8Array(TYPE_COUNT);
COST[CellType.GROUND] = 4;
COST[CellType.STREET] = 2;
COST[CellType.AVENUE] = 1;
COST[CellType.HIGHWAY] = 1;
COST[CellType.BRIDGE] = 1;
COST[CellType.PLAZA] = 2;
COST[CellType.PARK] = 3;
COST[CellType.FIELD] = 5;
COST[CellType.FOREST] = 8;

/** 1 where the type blocks movement (cost 0), else 0. */
export const BLOCKED = COST.map((cost) => (cost === 0 ? 1 : 0));

export const MIN_COST = 1;
export const MAX_COST = 8;

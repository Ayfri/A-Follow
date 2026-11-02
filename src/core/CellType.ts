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
	SAND: 12,
	MARSH: 13,
	ROCK: 14,
	SNOW: 15,
	HILL: 16,
	MEADOW: 17,
	ORCHARD: 18,
	PINE: 19,
	RAMPART: 20,
} as const;
export type CellType = (typeof CellType)[keyof typeof CellType];

/**
 * Bytes 21 to 31 are unused and blocked, so a stray byte never reads as passable. No passable type may use id 31: `PathFinder` keeps one
 * bit per passable type in an int32 mask, and `1 << 31` is negative.
 */
export const TYPE_COUNT = 32;

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
COST[CellType.SAND] = 6;
COST[CellType.MARSH] = 12;
COST[CellType.SNOW] = 10;
COST[CellType.HILL] = 6;
COST[CellType.MEADOW] = 4;
COST[CellType.ORCHARD] = 5;
COST[CellType.PINE] = 7;

/** 1 where the type blocks movement (cost 0), else 0. */
export const BLOCKED = COST.map((cost) => (cost === 0 ? 1 : 0));

export const MIN_COST = 1;
/** The highest cost of the table. The weighted search's bucket ring is `2 * MAX_COST` rounded up to a power of two (32 up to MAX_COST 15), a bigger value grows it. */
export const MAX_COST = Math.max(...COST);

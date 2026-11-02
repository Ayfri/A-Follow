import { CityTerrain } from '../city/CityTerrain';

/** What a grid holds before any edit: nothing (all ground), or a city generated from a seed. */
export type World = { kind: 'empty' } | { kind: 'city'; seed: number };

/** Generated cell types as a pure function of the seed and the cell position, so any thread rebuilds the same bytes. */
export interface Terrain {
	/** Writes the `CellType` bytes of the `size` x `size` tile whose top-left cell is (x0, y0) into `out`, row-major. Any tile origin gives the same cell values. */
	fill(x0: number, y0: number, size: number, out: Uint8Array): void;
}

/** The terrain of a world, or null when the world generates nothing. */
export const terrainFor = (world: World): Terrain | null => (world.kind === 'city' ? new CityTerrain(world.seed) : null);

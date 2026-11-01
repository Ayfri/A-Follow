import { type Terrain, TerrainType } from '../core/TerrainType';
import { TerrainGenerator } from './TerrainGenerator';

/** Width of the beaches, as Manhattan distance from a river or lake cell. */
const SAND_WIDTH = 3;

/** Sand only replaces these terrains. */
const REPLACEABLE: ReadonlySet<Terrain> = new Set([
	TerrainType.PLAIN,
	TerrainType.HILL,
	TerrainType.FOREST,
	TerrainType.VILLAGE,
	TerrainType.COAST
]);

/**
 * Generates sand beaches around lakes and rivers (both are RIVER cells)
 */
export class SandGenerator extends TerrainGenerator {
	/** Writing sand while scanning is safe: sand never replaces or creates RIVER cells, so the scan isn't affected. */
	generateSandBeaches(): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				if (this.grid[y][x] !== TerrainType.RIVER) continue;

				for (let dx = -SAND_WIDTH; dx <= SAND_WIDTH; dx++) {
					for (let dy = -SAND_WIDTH; dy <= SAND_WIDTH; dy++) {
						if (Math.abs(dx) + Math.abs(dy) > SAND_WIDTH) continue;

						const nx = x + dx;
						const ny = y + dy;
						if (this.isInBounds(nx, ny) && REPLACEABLE.has(this.grid[ny][nx])) {
							this.grid[ny][nx] = TerrainType.SAND;
						}
					}
				}
			}
		}
	}
}

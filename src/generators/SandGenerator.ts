import { TerrainType } from '../grid';
import { TerrainGenerator } from './TerrainGenerator';
import type { Lake } from './LakeGenerator';

/**
 * Generates sand beaches around lakes and rivers with a smooth gradient
 */
export class SandGenerator extends TerrainGenerator {
	generateSandBeaches(lakes: Lake[]): void {
		const sandCells = new Set<string>();
		const SAND_WIDTH = 3; // Width of sand beaches

		// Add sand around all lakes with distance-based smoothing
		for (const lake of lakes) {
			this.addSandAroundLake(lake, sandCells);
		}

		// Add sand around all rivers with distance-based smoothing
		this.addSandAroundRivers(SAND_WIDTH, sandCells);

		// Apply all collected sand cells to the grid
		this.applySandToGrid(sandCells);
	}

	generate(): void {
		// Standalone method not used
	}

	private addSandAroundLake(lake: Lake, sandCells: Set<string>): void {
		// Instead of creating a circular ring, only add sand adjacent to lake cells
		const extendedRadius = Math.ceil(lake.radius) + 1;

		for (let dx = -extendedRadius; dx <= extendedRadius; dx++) {
			for (let dy = -extendedRadius; dy <= extendedRadius; dy++) {
				const x = lake.x + dx;
				const y = lake.y + dy;

				if (!this.isInBounds(x, y)) continue;

				// Only add sand if this cell is adjacent to a lake cell
				if (this.isAdjacentToLake(x, y)) {
					const key = `${x},${y}`;
					sandCells.add(key);
				}
			}
		}
	}

	private addSandAroundRivers(width: number, sandCells: Set<string>): void {
		// Scan entire grid for river cells
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				if (this.grid[y][x] === TerrainType.RIVER) {
					// Add sand around this river cell in all directions
					for (let dx = -width; dx <= width; dx++) {
						for (let dy = -width; dy <= width; dy++) {
							// Skip the river cell itself and immediate neighbors (distance 0)
							const dist = Math.abs(dx) + Math.abs(dy);
							if (dist === 0) continue;

							// Only add sand at distance 1 to width (no overlapping from lake sand)
							if (dist <= width) {
								const nx = x + dx;
								const ny = y + dy;

								if (!this.isInBounds(nx, ny)) continue;

								const key = `${nx},${ny}`;
								sandCells.add(key);
							}
						}
					}
				}
			}
		}
	}

	private applySandToGrid(sandCells: Set<string>): void {
		for (const key of sandCells) {
			const [xStr, yStr] = key.split(',');
			const x = parseInt(xStr);
			const y = parseInt(yStr);

			if (!this.isInBounds(x, y)) continue;

			const terrain = this.grid[y][x];

			// Only place sand on replaceable terrains
			if (
				terrain === TerrainType.PLAIN ||
				terrain === TerrainType.HILL ||
				terrain === TerrainType.FOREST ||
				terrain === TerrainType.VILLAGE ||
				terrain === TerrainType.COAST
			) {
				this.grid[y][x] = TerrainType.SAND;
			}
		}
	}

	private isAdjacentToLake(x: number, y: number): boolean {
		// Check all 8 adjacent cells to see if any is part of the lake
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				if (dx === 0 && dy === 0) continue; // Skip the cell itself

				const nx = x + dx;
				const ny = y + dy;

				if (!this.isInBounds(nx, ny)) continue;

				// Check if this adjacent cell is part of the lake (RIVER terrain type)
				if (this.grid[ny][nx] === TerrainType.RIVER) {
					return true;
				}
			}
		}
		return false;
	}
}

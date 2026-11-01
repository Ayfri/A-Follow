import { TerrainType } from '../core/TerrainType';
import type { Rng } from '../utils/Rng';

/**
 * Base class for terrain generation algorithms
 * Provides common utilities for all generators
 */
export abstract class TerrainGenerator {
	protected width: number;
	protected height: number;
	protected grid: number[][];
	protected rng: () => number;

	protected readonly ANGLE_OFFSETS_6 = [
		Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2,
		(3 * Math.PI) / 4, -(3 * Math.PI) / 4
	];

	protected readonly ANGLE_OFFSETS_4 = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];

	constructor(width: number, height: number, grid: number[][], rng?: Rng) {
		this.width = width;
		this.height = height;
		this.grid = grid;
		this.rng = rng ? () => rng.random() : Math.random;
	}

	// ========== UTILITY FUNCTIONS ==========

	/** Clamps coordinates to grid boundaries */
	protected clamp(x: number, y: number): { x: number; y: number } {
		return {
			x: Math.max(0, Math.min(this.width - 1, x)),
			y: Math.max(0, Math.min(this.height - 1, y))
		};
	}

	/** Checks if coordinates are within grid boundaries */
	protected isInBounds(x: number, y: number): boolean {
		return x >= 0 && x < this.width && y >= 0 && y < this.height;
	}

	/** Gets the terrain type at the given coordinates */
	protected getTerrainAt(x: number, y: number): number {
		const clamped = this.clamp(x, y);
		return this.grid[clamped.y][clamped.x];
	}

	/** Sets the terrain type at the given coordinates */
	protected setTerrainAt(x: number, y: number, terrain: number): void {
		if (this.isInBounds(x, y)) {
			this.grid[y][x] = terrain;
		}
	}

	/** Checks if the terrain at coordinates is blocked (mountain or river) */
	protected isBlocked(x: number, y: number): boolean {
		if (!this.isInBounds(x, y)) return true;
		const terrain = this.grid[y][x];
		return terrain === TerrainType.MOUNTAIN || terrain === TerrainType.RIVER;
	}

	/** Checks if the terrain at coordinates is a mountain */
	protected isMountain(x: number, y: number): boolean {
		return this.isInBounds(x, y) && this.grid[y][x] === TerrainType.MOUNTAIN;
	}

	/** Checks if the terrain at coordinates is a lake/river */
	protected isWater(x: number, y: number): boolean {
		return this.isInBounds(x, y) && this.grid[y][x] === TerrainType.RIVER;
	}

	/** Checks if the terrain at coordinates is plain */
	protected isPlain(x: number, y: number): boolean {
		return this.isInBounds(x, y) && this.grid[y][x] === TerrainType.PLAIN;
	}

	/** Checks if the terrain at coordinates is a road */
	protected isRoad(x: number, y: number): boolean {
		return this.isInBounds(x, y) && this.grid[y][x] === TerrainType.ROAD;
	}

	/** Checks if the terrain at coordinates is forest */
	protected isForest(x: number, y: number): boolean {
		return this.isInBounds(x, y) && this.grid[y][x] === TerrainType.FOREST;
	}

	/** Euclidean distance between two points */
	protected distance(x1: number, y1: number, x2: number, y2: number): number {
		const dx = x2 - x1;
		const dy = y2 - y1;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/** Squared euclidean distance — avoids sqrt, use when only comparing distances */
	protected distanceSq(x1: number, y1: number, x2: number, y2: number): number {
		const dx = x2 - x1;
		const dy = y2 - y1;
		return dx * dx + dy * dy;
	}

	/** Finds minimum squared distance from a point to any item in a collection */
	protected findMinDistanceSqTo(x: number, y: number, items: Array<{ x: number; y: number }>): number {
		let minSq = Infinity;
		for (const item of items) {
			const dx = item.x - x;
			const dy = item.y - y;
			const dSq = dx * dx + dy * dy;
			if (dSq < minSq) minSq = dSq;
		}
		return minSq;
	}

	/** Manhattan distance between two points */
	protected manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
		return Math.abs(x2 - x1) + Math.abs(y2 - y1);
	}

	/** Draws terrain in a circular area */
	protected drawCircularArea(
		centerX: number,
		centerY: number,
		radius: number,
		terrain: number,
		options: { respectMountains?: boolean; respectWater?: boolean; respectForests?: boolean } = {}
	): void {
		const radiusSq = radius * radius;
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dy = -radius; dy <= radius; dy++) {
				if (dx * dx + dy * dy <= radiusSq) {
					const x = centerX + dx;
					const y = centerY + dy;

					if (!this.isInBounds(x, y)) continue;
					if (options.respectMountains && this.isMountain(x, y)) continue;
					if (options.respectWater && this.isWater(x, y)) continue;
					if (options.respectForests && this.isForest(x, y)) continue;

					this.setTerrainAt(x, y, terrain);
				}
			}
		}
	}

	/** Draws terrain at a point with specified width (Manhattan distance) */
	protected drawTerrainWithWidth(
		x: number,
		y: number,
		terrain: number,
		width: number = 0,
		options: { respectMountains?: boolean; respectWater?: boolean } = {}
	): void {
		for (let dxi = -width; dxi <= width; dxi++) {
			for (let dyi = -width; dyi <= width; dyi++) {
				const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
				if (manhattanDist > width) continue;

				const nx = x + dxi;
				const ny = y + dyi;

				if (!this.isInBounds(nx, ny)) continue;
				if (options.respectMountains && this.isMountain(nx, ny)) continue;
				if (options.respectWater && this.isWater(nx, ny)) continue;

				this.setTerrainAt(nx, ny, terrain);
			}
		}
	}

	/** Finds minimum distance from a point to any item in a collection */
	protected findMinDistanceTo(x: number, y: number, items: Array<{ x: number; y: number }>): number {
		let minDist = Infinity;
		for (const item of items) {
			const dist = this.distance(x, y, item.x, item.y);
			minDist = Math.min(minDist, dist);
		}
		return minDist;
	}

	/** Counts terrain type in a square area */
	protected countTerrainInArea(
		x: number,
		y: number,
		radius: number,
		terrain: number,
		options: { circular?: boolean } = {}
	): number {
		const radiusSq = radius * radius;
		let count = 0;
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dy = -radius; dy <= radius; dy++) {
				if (options.circular && dx * dx + dy * dy > radiusSq) continue;

				const nx = x + dx;
				const ny = y + dy;
				if (this.isInBounds(nx, ny) && this.grid[ny][nx] === terrain) {
					count++;
				}
			}
		}
		return count;
	}

	/** Checks if there's enough space in a circular area (not blocked by mountains/water/forests) */
	protected hasEnoughSpace(x: number, y: number, radius: number): boolean {
		const radiusSq = radius * radius;
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dy = -radius; dy <= radius; dy++) {
				if (dx * dx + dy * dy > radiusSq) continue;

				const nx = x + dx;
				const ny = y + dy;
				if (this.isInBounds(nx, ny) && (this.isMountain(nx, ny) || this.isWater(nx, ny) || this.isForest(nx, ny))) {
					return false;
				}
			}
		}
		return true;
	}

	/** Generates random integer between min (inclusive) and max (exclusive) */
	protected randomRange(min: number, max: number): number {
		return min + Math.floor(this.rng() * (max - min));
	}

	abstract generate(): void;
}


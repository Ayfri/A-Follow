import { TerrainType } from '../grid';
import { TerrainGenerator } from './TerrainGenerator';

/**
 * Provides pathfinding and road drawing utilities using A* algorithm
 */
export class RoadUtilities extends TerrainGenerator {
	generate(): void {
		// Not used
	}

	/**
	 * Remove some forest tiles around a coordinate to simulate clearing when roads cut through.
	 * radius is Manhattan radius; chance is probability to clear each forest cell.
	 */
	protected deforestArea(cx: number, cy: number, radius: number = 2, chance: number = 0.5): void {
		for (let dx = -radius; dx <= radius; dx++) {
			for (let dy = -radius; dy <= radius; dy++) {
				const manhattan = Math.abs(dx) + Math.abs(dy);
				if (manhattan > radius) continue;

				const nx = cx + dx;
				const ny = cy + dy;
				if (!this.isInBounds(nx, ny)) continue;
				if (this.grid[ny][nx] === TerrainType.FOREST && Math.random() < chance) {
					this.setTerrainAt(nx, ny, TerrainType.PLAIN);
				}
			}
		}
	}

	protected findPathAvoidingMountains(
		x0: number,
		y0: number,
		x1: number,
		y1: number
	): Array<{ x: number; y: number }> | null {
		const W = this.width;
		const H = this.height;
		const total = W * H;
		const encode = (x: number, y: number) => y * W + x;

		// Typed arrays for gScore and closed set — O(1) access, no hashing
		const gScore = new Float32Array(total).fill(Infinity);
		const closed = new Uint8Array(total);
		// cameFrom stores parent encoded key (-1 = no parent)
		const cameFrom = new Int32Array(total).fill(-1);

		// Inline min-heap of [f, encodedKey] pairs
		const heap: Array<[number, number]> = [];

		const heapPush = (f: number, k: number): void => {
			heap.push([f, k]);
			let i = heap.length - 1;
			while (i > 0) {
				const p = (i - 1) >> 1;
				if (heap[p][0] <= heap[i][0]) break;
				const tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp;
				i = p;
			}
		};

		const heapPop = (): [number, number] => {
			const top = heap[0];
			const last = heap.pop()!;
			if (heap.length > 0) {
				heap[0] = last;
				let i = 0;
				while (true) {
					const l = 2 * i + 1;
					const r = l + 1;
					let s = i;
					if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
					if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
					if (s === i) break;
					const tmp = heap[s]; heap[s] = heap[i]; heap[i] = tmp;
					i = s;
				}
			}
			return top;
		};

		const startK = encode(x0, y0);
		const endK = encode(x1, y1);
		gScore[startK] = 0;
		heapPush(Math.abs(x0 - x1) + Math.abs(y0 - y1), startK);

		// Pre-allocated neighbor deltas [dx, dy, cost*10] (cost stored *10 to stay integer-friendly)
		const DDX = [1, -1, 0, 0, 1, 1, -1, -1];
		const DDY = [0, 0, 1, -1, 1, -1, 1, -1];
		const DCOST = [1, 1, 1, 1, 1.4, 1.4, 1.4, 1.4];

		let iterations = 0;
		const maxIterations = Math.min(total, 10000);

		while (heap.length > 0 && iterations < maxIterations) {
			iterations++;

			const [, currK] = heapPop();
			if (closed[currK]) continue;
			closed[currK] = 1;

			if (currK === endK) {
				// Reconstruct path following cameFrom chain
				const path: Array<{ x: number; y: number }> = [];
				let k = currK;
				while (k !== -1) {
					path.push({ x: k % W, y: (k / W) | 0 });
					const prev = cameFrom[k];
					if (prev === -1) break;
					k = prev;
				}
				path.reverse();
				return path;
			}

			const cx = currK % W;
			const cy = (currK / W) | 0;
			const cg = gScore[currK];

			for (let d = 0; d < 8; d++) {
				const nx = cx + DDX[d];
				const ny = cy + DDY[d];
				if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;

				const nk = encode(nx, ny);
				if (closed[nk]) continue;

				const terrain = this.grid[ny][nx];
				if (terrain === TerrainType.MOUNTAIN || terrain === TerrainType.RIVER) continue;

				const baseCost = terrain === TerrainType.ROAD ? 0.5 : 1;
				let penalty = 1;
				if (terrain === TerrainType.FOREST) {
					penalty = Math.random() < 0.12 ? 1 : 3;
				}

				const tentG = cg + DCOST[d] * baseCost * penalty;
				if (tentG < gScore[nk]) {
					gScore[nk] = tentG;
					cameFrom[nk] = currK;
					heapPush(tentG + Math.abs(nx - x1) + Math.abs(ny - y1), nk);
				}
			}
		}

		return null;
	}

	protected drawRoad(x0: number, y0: number, x1: number, y1: number, roadWidth: number = 1): void {
		// Use A* pathfinding to bypass mountains
		const path = this.findPathAvoidingMountains(x0, y0, x1, y1);

		if (!path) return; // No path found

		// Draw the path with curves (fill gaps between diagonal movements)
		for (let i = 0; i < path.length; i++) {
			const pos = path[i];

			// Draw road with specified width
			for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
				for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
					// Check Manhattan distance to ensure proper width (no diagonals for width)
					const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
					if (manhattanDist > roadWidth) continue;

					const nx = Math.max(0, Math.min(this.width - 1, pos.x + dxi));
					const ny = Math.max(0, Math.min(this.height - 1, pos.y + dyi));
					if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
						// preserve previous terrain to possibly trigger deforestation
						const prevTerrain = this.grid[ny][nx];
						this.setTerrainAt(nx, ny, TerrainType.ROAD);
						// If we cut through forest, clear a small area around the road (deforestation)
						if (prevTerrain === TerrainType.FOREST) {
							if (Math.random() < 0.75) {
								this.deforestArea(nx, ny, 2, 0.55);
							}
						}
					}
				}
			}

			// Fill diagonal gaps between consecutive path positions
			if (i > 0) {
				const prev = path[i - 1];
				const dx = pos.x - prev.x;
				const dy = pos.y - prev.y;

				// If diagonal movement, fill the corner
				if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
					// Fill the two corners to make it walkable
					const corner1 = { x: prev.x + dx, y: prev.y };
					const corner2 = { x: prev.x, y: prev.y + dy };

					// Draw at corner1
					for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
						for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
							const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
							if (manhattanDist > roadWidth) continue;
							const nx = Math.max(0, Math.min(this.width - 1, corner1.x + dxi));
							const ny = Math.max(0, Math.min(this.height - 1, corner1.y + dyi));
							if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
								const prevTerrain = this.grid[ny][nx];
								this.setTerrainAt(nx, ny, TerrainType.ROAD);
								if (prevTerrain === TerrainType.FOREST) {
									if (Math.random() < 0.75) this.deforestArea(nx, ny, 2, 0.55);
								}
							}
						}
					}

					// Draw at corner2
						for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
							for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
								const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
								if (manhattanDist > roadWidth) continue;
								const nx = Math.max(0, Math.min(this.width - 1, corner2.x + dxi));
								const ny = Math.max(0, Math.min(this.height - 1, corner2.y + dyi));
								if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
									const prevTerrain = this.grid[ny][nx];
									this.setTerrainAt(nx, ny, TerrainType.ROAD);
									if (prevTerrain === TerrainType.FOREST) {
										if (Math.random() < 0.75) this.deforestArea(nx, ny, 2, 0.55);
									}
								}
							}
						}
				}
			}
		}
	}

	protected drawSmallRoad(x0: number, y0: number, x1: number, y1: number, roadWidth: number): void {
		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;

		let x = x0;
		let y = y0;
		let prevX = x0;
		let prevY = y0;

		while (true) {
			// Small roads cannot cross mountains or lakes/rivers
			if (this.grid[y][x] === TerrainType.MOUNTAIN || this.grid[y][x] === TerrainType.RIVER) {
				break;
			}

			// Draw road with specified width
			for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
				for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
					// Check Manhattan distance to ensure proper width (no diagonals for width)
					const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
					if (manhattanDist > roadWidth) continue;

					const nx = Math.max(0, Math.min(this.width - 1, x + dxi));
					const ny = Math.max(0, Math.min(this.height - 1, y + dyi));
					// Don't overwrite mountains or rivers
					if (this.grid[ny][nx] !== TerrainType.MOUNTAIN && this.grid[ny][nx] !== TerrainType.RIVER) {
						const prevTerrain = this.grid[ny][nx];
						this.setTerrainAt(nx, ny, TerrainType.ROAD);
						if (prevTerrain === TerrainType.FOREST) {
							if (Math.random() < 0.6) this.deforestArea(nx, ny, 1, 0.5);
						}
					}
				}
			}

			// Fill diagonal gaps
			const moveX = x - prevX;
			const moveY = y - prevY;
			if (Math.abs(moveX) === 1 && Math.abs(moveY) === 1) {
				// Fill corner cells to allow player movement
				const corner1 = { x: prevX + moveX, y: prevY };
				const corner2 = { x: prevX, y: prevY + moveY };

				// Draw at corner1
				for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
					for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
						const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
						if (manhattanDist > roadWidth) continue;
						const nx = Math.max(0, Math.min(this.width - 1, corner1.x + dxi));
						const ny = Math.max(0, Math.min(this.height - 1, corner1.y + dyi));
						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN && this.grid[ny][nx] !== TerrainType.RIVER) {
							const prevTerrain = this.grid[ny][nx];
							this.setTerrainAt(nx, ny, TerrainType.ROAD);
							if (prevTerrain === TerrainType.FOREST) {
								if (Math.random() < 0.6) this.deforestArea(nx, ny, 1, 0.5);
							}
						}
					}
				}

				// Draw at corner2
				for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
					for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
						const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
						if (manhattanDist > roadWidth) continue;
						const nx = Math.max(0, Math.min(this.width - 1, corner2.x + dxi));
						const ny = Math.max(0, Math.min(this.height - 1, corner2.y + dyi));
						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN && this.grid[ny][nx] !== TerrainType.RIVER) {
							const prevTerrain = this.grid[ny][nx];
							this.setTerrainAt(nx, ny, TerrainType.ROAD);
							if (prevTerrain === TerrainType.FOREST) {
								if (Math.random() < 0.6) this.deforestArea(nx, ny, 1, 0.5);
							}
						}
					}
				}
			}

			if (x === x1 && y === y1) break;

			prevX = x;
			prevY = y;

			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x = Math.max(0, Math.min(this.width - 1, x + sx));
			}
			if (e2 < dx) {
				err += dx;
				y = Math.max(0, Math.min(this.height - 1, y + sy));
			}
		}
	}
}

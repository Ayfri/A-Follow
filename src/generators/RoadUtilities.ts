import type { Position } from '../core/Grid';
import { TerrainType } from '../core/TerrainType';
import { TerrainGenerator } from './TerrainGenerator';

/** How a road treats the terrain it crosses: whether rivers stop it, and how it clears the forest it cuts through. */
interface RoadStyle {
	blocksWater: boolean;
	/** Probability of clearing a forest area around each forest cell the road replaces. */
	clearChance: number;
	/** Manhattan radius of that cleared area. */
	clearRadius: number;
	/** Probability of clearing each forest cell in the area. */
	clearCellChance: number;
}

/** Neighbor deltas and step costs of the road search (diagonals cost 1.4), module constants so the search loop allocates nothing. */
const DDX = [1, -1, 0, 0, 1, 1, -1, -1];
const DDY = [0, 0, 1, -1, 1, -1, 1, -1];
const DCOST = [1, 1, 1, 1, 1.4, 1.4, 1.4, 1.4];

const MAX_ROAD_SEARCH_ITERATIONS = 10000;

const MAIN_ROAD: RoadStyle ={ blocksWater: false, clearChance: 0.75, clearRadius: 2, clearCellChance: 0.55 };
const SMALL_ROAD: RoadStyle = { blocksWater: true, clearChance: 0.6, clearRadius: 1, clearCellChance: 0.5 };

/**
 * Provides pathfinding and road drawing utilities using A* algorithm
 */
export class RoadUtilities extends TerrainGenerator {
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
				if (this.grid[ny][nx] === TerrainType.FOREST && this.rng() < chance) {
					this.setTerrainAt(nx, ny, TerrainType.PLAIN);
				}
			}
		}
	}

	protected findRoadPath(
		x0: number,
		y0: number,
		x1: number,
		y1: number
	): Position[] | null {
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

		let iterations = 0;
		const maxIterations = Math.min(total, MAX_ROAD_SEARCH_ITERATIONS);

		while (heap.length > 0 && iterations < maxIterations) {
			iterations++;

			const [, currK] = heapPop();
			if (closed[currK]) continue;
			closed[currK] = 1;

			if (currK === endK) {
				// Reconstruct path following cameFrom chain
				const path: Position[] = [];
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
					penalty = this.rng() < 0.12 ? 1 : 3;
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

	/** Stamps road cells within `width` (Manhattan) of (x, y), skipping the cells the style doesn't let a road cross. */
	private stampRoad(x: number, y: number, width: number, style: RoadStyle): void {
		for (let dxi = -width; dxi <= width; dxi++) {
			for (let dyi = -width; dyi <= width; dyi++) {
				if (Math.abs(dxi) + Math.abs(dyi) > width) continue;

				const nx = Math.max(0, Math.min(this.width - 1, x + dxi));
				const ny = Math.max(0, Math.min(this.height - 1, y + dyi));
				const prevTerrain = this.grid[ny][nx];
				if (prevTerrain === TerrainType.MOUNTAIN || (style.blocksWater && prevTerrain === TerrainType.RIVER)) continue;

				this.setTerrainAt(nx, ny, TerrainType.ROAD);
				if (prevTerrain === TerrainType.FOREST && this.rng() < style.clearChance) {
					this.deforestArea(nx, ny, style.clearRadius, style.clearCellChance);
				}
			}
		}
	}

	/** After a diagonal step, stamps the two corner cells so the road stays walkable without diagonal moves. */
	private stampCorners(prev: Position, cur: Position, width: number, style: RoadStyle): void {
		const dx = cur.x - prev.x;
		const dy = cur.y - prev.y;
		if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return;

		this.stampRoad(prev.x + dx, prev.y, width, style);
		this.stampRoad(prev.x, prev.y + dy, width, style);
	}

	protected drawRoad(x0: number, y0: number, x1: number, y1: number, roadWidth: number = 1): void {
		// Use A* pathfinding to bypass mountains
		const path = this.findRoadPath(x0, y0, x1, y1);

		if (!path) return; // No path found

		for (let i = 0; i < path.length; i++) {
			this.stampRoad(path[i].x, path[i].y, roadWidth, MAIN_ROAD);
			if (i > 0) this.stampCorners(path[i - 1], path[i], roadWidth, MAIN_ROAD);
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

			this.stampRoad(x, y, roadWidth, SMALL_ROAD);
			this.stampCorners({ x: prevX, y: prevY }, { x, y }, roadWidth, SMALL_ROAD);

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

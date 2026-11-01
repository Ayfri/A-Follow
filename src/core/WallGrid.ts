export interface Position {
	x: number;
	y: number;
}

/** Integer cell rectangle: [x, x + width) by [y, y + height). */
export interface CellRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Chunks are 128 x 128: the worst view (3 px cells, zoom 0.25, 4K) shows 14.7M cells, which is ~950 chunk draws per frame
 * against ~3700 with 64 x 64 chunks, and one chunk re-upload is 64 KB.
 */
export const CHUNK_BITS = 7;
export const CHUNK_SIZE = 1 << CHUNK_BITS;
/** With `>> CHUNK_BITS` (floors negatives) and `& CHUNK_MASK` (wraps them), any int32 cell maps to its chunk and its slot in it. */
const CHUNK_MASK = CHUNK_SIZE - 1;

/** Cells are int32, so chunk coordinates fit 25 signed bits. */
const COORD_BIAS = 2 ** 24;
const COORD_RANGE = 2 ** 25;

/** Neighbor order of the maze carving: up, right, down, left, two cells at a time. */
const MAZE_DX = [0, 2, 0, -2];
const MAZE_DY = [-2, 0, 2, 0];

export class Chunk {
	readonly cells = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
	walls = 0;
	/** Grid revision at the last change, so a recreated chunk is always newer than the one it replaces. */
	version = 0;
}

/**
 * Unbounded wall grid stored in sparse chunks (1 = wall); a chunk without walls is deleted.
 * Coordinates are int32 and not clamped: at the fastest arrow pan (~533 cells/s) reaching the limit takes ~46 days.
 */
export class WallGrid {
	private readonly chunks = new Map<number, Chunk>();
	private rev = 0;

	/** Bumped once per actual change. */
	get revision(): number {
		return this.rev;
	}

	/**
	 * Number key, exact below 2^50: bit operators are 32-bit, and a number key avoids a string allocation per lookup.
	 * Chunk coordinates are biased to be non-negative.
	 */
	static key(cx: number, cy: number): number {
		return (cx + COORD_BIAS) * COORD_RANGE + (cy + COORD_BIAS);
	}

	chunkAt(cx: number, cy: number): Chunk | undefined {
		return this.chunks.get(WallGrid.key(cx, cy));
	}

	isWall(x: number, y: number): boolean {
		const chunk = this.chunks.get(WallGrid.key(x >> CHUNK_BITS, y >> CHUNK_BITS));
		return chunk !== undefined && chunk.cells[((y & CHUNK_MASK) << CHUNK_BITS) | (x & CHUNK_MASK)] === 1;
	}

	setWall(x: number, y: number, wall: boolean): void {
		const key = WallGrid.key(x >> CHUNK_BITS, y >> CHUNK_BITS);
		const index = ((y & CHUNK_MASK) << CHUNK_BITS) | (x & CHUNK_MASK);
		let chunk = this.chunks.get(key);

		if (chunk === undefined) {
			if (!wall) return;
			chunk = new Chunk();
			this.chunks.set(key, chunk);
		} else if ((chunk.cells[index] === 1) === wall) {
			return;
		}

		chunk.cells[index] = wall ? 1 : 0;
		chunk.walls += wall ? 1 : -1;
		this.rev++;
		if (chunk.walls === 0) this.chunks.delete(key);
		else chunk.version = this.rev;
	}

	/** Writes `rect` row-major into `out[0..area)` (1 = wall); bytes past the area are untouched. */
	copyWalls(rect: CellRect, out: Uint8Array): void {
		out.fill(0, 0, rect.width * rect.height);
		this.forEachChunkIn(rect, (cx, cy, x0, y0, x1, y1) => {
			const chunk = this.chunkAt(cx, cy);
			if (chunk === undefined) return;
			for (let y = y0; y < y1; y++) {
				const from = ((y & CHUNK_MASK) << CHUNK_BITS) | (x0 & CHUNK_MASK);
				out.set(chunk.cells.subarray(from, from + x1 - x0), (y - rect.y) * rect.width + x0 - rect.x);
			}
		});
	}

	/** Replaces `rect` with a random depth-first maze whose odd local cells are open; a rect under 3 cells wide or tall becomes solid. */
	fillMaze(rect: CellRect): void {
		const { width: W, height: H } = rect;
		const cells = new Uint8Array(W * H).fill(1);

		if (W >= 3 && H >= 3) {
			/** Each odd cell is pushed once, so the stack never holds more than the number of odd cells. */
			const stack = new Int32Array(((W - 1) >> 1) * ((H - 1) >> 1));
			const candidates = new Uint8Array(4);
			let top = 0;
			cells[W + 1] = 0;
			stack[top++] = W + 1;

			while (top > 0) {
				const current = stack[top - 1];
				const x = current % W;
				const y = (current - x) / W;
				let count = 0;

				for (let d = 0; d < 4; d++) {
					const nx = x + MAZE_DX[d];
					const ny = y + MAZE_DY[d];
					if (nx > 0 && nx < W - 1 && ny > 0 && ny < H - 1 && cells[ny * W + nx] === 1) candidates[count++] = d;
				}

				if (count === 0) {
					top--;
					continue;
				}

				const d = candidates[Math.floor(Math.random() * count)];
				const next = (y + MAZE_DY[d]) * W + x + MAZE_DX[d];
				cells[(y + MAZE_DY[d] / 2) * W + x + MAZE_DX[d] / 2] = 0;
				cells[next] = 0;
				stack[top++] = next;
			}
		}

		this.writeRect(rect, cells);
	}

	fillRandom(rect: CellRect, probability: number): void {
		const cells = new Uint8Array(rect.width * rect.height);
		for (let i = 0; i < cells.length; i++) cells[i] = Math.random() < probability ? 1 : 0;
		this.writeRect(rect, cells);
	}

	clear(): void {
		this.chunks.clear();
		this.rev++;
	}

	/** Calls `visit` for every chunk touched by `rect` with the overlap [x0, x1) by [y0, y1) in cell coordinates. */
	private forEachChunkIn(
		rect: CellRect,
		visit: (cx: number, cy: number, x0: number, y0: number, x1: number, y1: number) => void
	): void {
		const lastX = (rect.x + rect.width - 1) >> CHUNK_BITS;
		const lastY = (rect.y + rect.height - 1) >> CHUNK_BITS;

		for (let cy = rect.y >> CHUNK_BITS; cy <= lastY; cy++) {
			const y0 = Math.max(rect.y, cy * CHUNK_SIZE);
			const y1 = Math.min(rect.y + rect.height, (cy + 1) * CHUNK_SIZE);
			for (let cx = rect.x >> CHUNK_BITS; cx <= lastX; cx++) {
				visit(cx, cy, Math.max(rect.x, cx * CHUNK_SIZE), y0, Math.min(rect.x + rect.width, (cx + 1) * CHUNK_SIZE), y1);
			}
		}
	}

	/** Overwrites `rect` with `cells` (row-major, 1 = wall); a missing chunk is only created when its part of the rect has a wall. */
	private writeRect(rect: CellRect, cells: Uint8Array): void {
		this.forEachChunkIn(rect, (cx, cy, x0, y0, x1, y1) => {
			const key = WallGrid.key(cx, cy);
			let chunk = this.chunks.get(key);

			if (chunk === undefined) {
				let hasWall = false;
				for (let y = y0; y < y1 && !hasWall; y++) {
					const row = (y - rect.y) * rect.width - rect.x;
					for (let x = x0; x < x1; x++) {
						if (cells[row + x] === 1) { hasWall = true; break; }
					}
				}
				if (!hasWall) return;
				chunk = new Chunk();
				this.chunks.set(key, chunk);
			}

			for (let y = y0; y < y1; y++) {
				const from = (y - rect.y) * rect.width + x0 - rect.x;
				chunk.cells.set(cells.subarray(from, from + x1 - x0), ((y & CHUNK_MASK) << CHUNK_BITS) | (x0 & CHUNK_MASK));
			}

			let walls = 0;
			for (let i = 0; i < chunk.cells.length; i++) walls += chunk.cells[i];
			chunk.walls = walls;
			if (walls === 0) this.chunks.delete(key);
			else chunk.version = this.rev + 1;
		});
		this.rev++;
	}
}

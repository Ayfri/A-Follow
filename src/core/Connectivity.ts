import { CHUNK_BITS, CHUNK_SIZE } from './WallGrid';
import type { CellRect, Chunk, Position, WallGrid } from './WallGrid';

/** Component of each cell of a chunk, 1-based, 0 on a wall. */
interface ChunkLabels {
	version: number;
	count: number;
	readonly labels: Uint16Array<ArrayBuffer>;
}

const CELLS = CHUNK_SIZE * CHUNK_SIZE;
const LAST = CHUNK_SIZE - 1;
const LAST_ROW = CELLS - CHUNK_SIZE;
const NEIGHBORS: readonly (readonly [dx: number, dy: number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * One-sided connectivity test for a search window: `mayReach` false proves that no path exists inside the window, true means a search is
 * worth running (it can still find nothing when the only route leaves the window through the part of an edge chunk that lies outside it).
 * It is exact on a window aligned to chunk borders.
 *
 * Each chunk gets its own component labels, and a union-find over the chunks overlapping the window joins the components that touch
 * across a chunk border. An absent chunk is one open component. Labels cover the whole chunk, even cells outside the window, so the
 * structure never splits what the window connects. The scope is the window and not the whole grid because a wall ring around absent
 * chunks would take an unbounded flood fill, and the search never leaves its window anyway.
 *
 * Labels are lazy and keyed on `Chunk.version`, so `WallGrid` needs no hooks: a chunk is relabeled when its version differs from the
 * labeled one, and the union-find is rebuilt when the grid revision or the chunk range changes (a rebuild costs in proportion to the
 * components, not the cells). It lives in the path worker only: the main thread would pay the relabel of every chunk of a fill in its frame.
 *
 * Measured in Node.js (V8), random 20% to 35% and mazes. A window of 2272 x 1297 (180 chunks with walls): the first query after a fill labels
 * every chunk in 40 to 63 ms (0.21 to 0.28 ms per chunk), the first one after one wall change takes ~1.3 ms (the union-find rebuild and one
 * relabel), a repeated one ~60 ns. At 4096 x 2048 (512 chunks) that is 106 to 156 ms and 3.4 to 4.2 ms. Labels take 32 KB per chunk that has
 * walls (16 MB at 4096 x 2048). A target walled in on a 2240 x 1265 grid is rejected in ~50 ms the first time and ~1.3 ms after a wall change,
 * against ~1.5 s for the search that scans the window.
 */
export class Connectivity {
	private static readonly OPEN: ChunkLabels = { version: 0, count: 1, labels: new Uint16Array(CELLS).fill(1) };

	/** Freed with the chunk. */
	private readonly chunkLabels = new WeakMap<Chunk, ChunkLabels>();
	/** Relabel scratch, indexed by provisional label (1-based, hence the + 1). */
	private readonly provisional = new Uint16Array(CELLS / 2 + 1);
	private readonly resolved = new Uint16Array(CELLS / 2 + 1);
	private grid: WallGrid | null = null;
	private revision = -1;
	private cx0 = 0;
	private cy0 = 0;
	private cols = 0;
	private rows = 0;
	/** Row-major over the chunk range. */
	private rangeLabels: ChunkLabels[] = [];
	/** First union-find node of each chunk of the range, node = first + label - 1. */
	private firstNode = new Int32Array(0);
	/** Grow-only. */
	private parent = new Int32Array(0);

	/** `goal` must be open unless it equals `start`; `start` may be a wall. Both are inside `window`. */
	mayReach(grid: WallGrid, window: CellRect, start: Position, goal: Position): boolean {
		if (start.x === goal.x && start.y === goal.y) return true;

		const cx0 = window.x >> CHUNK_BITS;
		const cy0 = window.y >> CHUNK_BITS;
		const cols = ((window.x + window.width - 1) >> CHUNK_BITS) - cx0 + 1;
		const rows = ((window.y + window.height - 1) >> CHUNK_BITS) - cy0 + 1;
		if (grid !== this.grid || grid.revision !== this.revision || cx0 !== this.cx0 || cy0 !== this.cy0 || cols !== this.cols || rows !== this.rows) {
			this.build(grid, cx0, cy0, cols, rows);
		}

		const goalNode = this.node(goal.x, goal.y);
		if (goalNode < 0) return true;
		const target = this.root(goalNode);
		const from = this.node(start.x, start.y);
		if (from >= 0) return this.root(from) === target;

		/** A start on a wall leaves through any open neighbor inside the window. */
		for (const [dx, dy] of NEIGHBORS) {
			const x = start.x + dx;
			const y = start.y + dy;
			if (x < window.x || x >= window.x + window.width || y < window.y || y >= window.y + window.height) continue;
			const next = this.node(x, y);
			if (next >= 0 && this.root(next) === target) return true;
		}
		return false;
	}

	private build(grid: WallGrid, cx0: number, cy0: number, cols: number, rows: number): void {
		this.grid = grid;
		this.revision = grid.revision;
		this.cx0 = cx0;
		this.cy0 = cy0;
		this.cols = cols;
		this.rows = rows;

		const chunks = cols * rows;
		if (this.firstNode.length < chunks) this.firstNode = new Int32Array(chunks);
		this.rangeLabels = new Array<ChunkLabels>(chunks);
		let total = 0;
		for (let i = 0; i < chunks; i++) {
			const chunk = grid.chunkAt(cx0 + (i % cols), cy0 + Math.floor(i / cols));
			const labels = chunk === undefined ? Connectivity.OPEN : this.labelsOf(chunk);
			this.rangeLabels[i] = labels;
			this.firstNode[i] = total;
			total += labels.count;
		}
		if (this.parent.length < total) this.parent = new Int32Array(total);
		for (let k = 0; k < total; k++) this.parent[k] = k;

		/** Consecutive rows of a border often hold the same pair of labels (an open chunk gives one pair for all 128), so a repeated pair is joined once. */
		for (let i = 0; i < chunks; i++) {
			if (i % cols !== cols - 1) {
				let lastA = 0;
				let lastB = 0;
				for (let y = 0; y < CHUNK_SIZE; y++) {
					const a = this.rangeLabels[i].labels[y * CHUNK_SIZE + LAST];
					const b = this.rangeLabels[i + 1].labels[y * CHUNK_SIZE];
					if (a === 0 || b === 0 || (a === lastA && b === lastB)) continue;
					lastA = a;
					lastB = b;
					this.union(this.firstNode[i] + a - 1, this.firstNode[i + 1] + b - 1);
				}
			}
			if (i + cols < chunks) {
				let lastA = 0;
				let lastB = 0;
				for (let x = 0; x < CHUNK_SIZE; x++) {
					const a = this.rangeLabels[i].labels[LAST_ROW + x];
					const b = this.rangeLabels[i + cols].labels[x];
					if (a === 0 || b === 0 || (a === lastA && b === lastB)) continue;
					lastA = a;
					lastB = b;
					this.union(this.firstNode[i] + a - 1, this.firstNode[i + cols] + b - 1);
				}
			}
		}
	}

	private labelsOf(chunk: Chunk): ChunkLabels {
		let entry = this.chunkLabels.get(chunk);
		if (entry === undefined) {
			entry = { version: -1, count: 0, labels: new Uint16Array(CELLS) };
			this.chunkLabels.set(chunk, entry);
		}
		if (entry.version !== chunk.version) {
			this.relabel(chunk.cells, entry);
			entry.version = chunk.version;
		}
		return entry;
	}

	/**
	 * Two raster passes: the first gives each cell the label of its left or upper open neighbor (a new label when it has none) and joins
	 * the two when they differ, the second replaces every label by its component number. A cell gets a new label only when its left and
	 * upper neighbors are walls, which two adjacent cells can't both do, so a chunk has at most 8192 labels (a checkerboard) and 16 bits are enough.
	 * A flood fill per component needs 0.5 to 0.7 ms per chunk in V8 (a first query of 120 to 200 ms on a 2272 x 1297 window), this takes 0.2 to 0.3.
	 */
	private relabel(cells: Uint8Array, into: ChunkLabels): void {
		const { labels } = into;
		const { provisional, resolved } = this;
		let count = 0;

		for (let i = 0; i < CELLS; i++) {
			if (cells[i] !== 0) {
				labels[i] = 0;
				continue;
			}
			const left = (i & LAST) === 0 ? 0 : labels[i - 1];
			const up = i < CHUNK_SIZE ? 0 : labels[i - CHUNK_SIZE];
			if (left === 0) {
				if (up === 0) provisional[++count] = count;
				labels[i] = up === 0 ? count : up;
				continue;
			}
			labels[i] = left;
			if (up === 0 || up === left) continue;

			let a = left;
			let b = up;
			while (provisional[a] !== a) a = provisional[a] = provisional[provisional[a]];
			while (provisional[b] !== b) b = provisional[b] = provisional[provisional[b]];
			if (a < b) provisional[b] = a;
			else if (b < a) provisional[a] = b;
		}

		let components = 0;
		for (let label = 1; label <= count; label++) resolved[label] = provisional[label] === label ? ++components : resolved[provisional[label]];
		for (let i = 0; i < CELLS; i++) labels[i] = resolved[labels[i]];
		into.count = components;
	}

	/** Union-find node of an open cell inside the range, -1 on a wall. */
	private node(x: number, y: number): number {
		const chunk = ((y >> CHUNK_BITS) - this.cy0) * this.cols + (x >> CHUNK_BITS) - this.cx0;
		const label = this.rangeLabels[chunk].labels[((y & LAST) << CHUNK_BITS) | (x & LAST)];
		return label === 0 ? -1 : this.firstNode[chunk] + label - 1;
	}

	private root(node: number): number {
		const parent = this.parent;
		while (parent[node] !== node) {
			parent[node] = parent[parent[node]];
			node = parent[node];
		}
		return node;
	}

	/** The smaller root wins, so the structure doesn't depend on the order of the unions. */
	private union(a: number, b: number): void {
		const rootA = this.root(a);
		const rootB = this.root(b);
		if (rootA < rootB) this.parent[rootB] = rootA;
		else if (rootB < rootA) this.parent[rootA] = rootB;
	}
}

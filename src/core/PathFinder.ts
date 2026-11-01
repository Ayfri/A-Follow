import type { CellRect, Position, WallGrid } from './WallGrid';

/** Neighbor order of the search: up, right, down, left. It decides which of several shortest paths is returned. */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Neighbor order of the nearest-open-cell search: +x, -x, +y, -y. */
const NEAREST_DX = [1, -1, 0, 0];
const NEAREST_DY = [0, 0, 1, -1];

interface Span {
	origin: number;
	size: number;
}

/**
 * A* on a bounded window of the infinite grid, on 4-neighbors with a Manhattan heuristic.
 * Open entries are ordered by F, then H, then insertion order, so equal-cost ties resolve the same way every run.
 * The typed buffers only grow and are reused across searches, so a search allocates nothing but its result.
 */
export class PathFinder {
	/** Cells searched around the visible rect, so paths can bend around walls just outside the screen. */
	static readonly WINDOW_MARGIN = 16;
	static readonly MAX_WINDOW_SIDE = 4096;
	/**
	 * Caps the cells of a window (2.9M at a 1680 x 925 screen with 3 px cells at 25% zoom). The window buffers take 10 bytes per cell
	 * (84 MB at the cap), and the open entries add 16 bytes each (more while their arrays double). A search that scans a 2.9M window
	 * (unreachable target) raised the process rss by ~155 MB, so a scan of the largest window can take ~450 MB.
	 */
	static readonly MAX_WINDOW_AREA = 1 << 23;
	/** Expanded nodes between two yields of `steps`: a slice takes ~9 ms (median) on a maze, which is how late a newer request is seen. */
	static readonly SLICE = 50_000;
	/**
	 * Margin of the small window `findNear` searches, and the expansions after which it gives up. A search that exhausts the budget
	 * takes ~1 ms (max 1.6), against ~2.9 ms at 8192, and 4096 still answers 390 of 400 targets 40 to 150 cells away on a random 20% grid.
	 */
	static readonly NEAR_MARGIN = 32;
	static readonly NEAR_BUDGET = 4096;
	/** A near window bigger than this is not searched: copying it would cost more than the attempt can save. */
	static readonly NEAR_AREA = 1 << 17;

	private walls = new Uint8Array(0);
	/** Best cost per cell, only meaningful where `state` is at least `base`. The nearest-open-cell search borrows it as its queue. */
	private g = new Int32Array(0);
	/**
	 * Per-cell search state: below `base` is untouched, `base` is reached, `base + 1` is closed. Each search raises `base` by 2
	 * instead of clearing the buffers, so a search on a 2048 x 2048 window costs in proportion to the cells it visits.
	 */
	private state = new Uint32Array(0);
	private base = 0;
	/** Direction used to enter each cell (0 up, 1 right, 2 down, 3 left), written whenever its cost improves. */
	private from = new Uint8Array(0);
	/** Open entries by insertion order, so an entry id is also its tie-break rank. */
	private entryF = new Int32Array(0);
	private entryH = new Int32Array(0);
	private entryCell = new Int32Array(0);
	private heap = new Int32Array(0);
	private entryCount = 0;
	private heapSize = 0;
	/** State of the running search that `run` resumes. */
	private searchWindow: CellRect = { x: 0, y: 0, width: 0, height: 0 };
	private startCell = 0;
	private goalCell = 0;
	private expanded = 0;

	/**
	 * Search window for a visible rect: the rect plus the margin, extended to hold both endpoints.
	 * A side longer than its cap becomes a capped segment centered between the endpoints and kept inside that union;
	 * endpoints a full cap apart on a side can't share a window. Above the area cap, the longer side shrinks to fit it.
	 */
	static window(view: CellRect, start: Position, target: Position): CellRect | null {
		let x = PathFinder.span(view.x, view.width, start.x, target.x, PathFinder.MAX_WINDOW_SIDE);
		let y = PathFinder.span(view.y, view.height, start.y, target.y, PathFinder.MAX_WINDOW_SIDE);
		if (x && y && x.size * y.size > PathFinder.MAX_WINDOW_AREA) {
			/** The cap stays even, which the centering in `span` needs. */
			if (x.size >= y.size) x = PathFinder.span(view.x, view.width, start.x, target.x, Math.floor(PathFinder.MAX_WINDOW_AREA / y.size) & ~1);
			else y = PathFinder.span(view.y, view.height, start.y, target.y, Math.floor(PathFinder.MAX_WINDOW_AREA / x.size) & ~1);
		}
		return x && y ? { x: x.origin, y: y.origin, width: x.size, height: y.size } : null;
	}

	/** (x, y) pairs of a path, the form that crosses the worker boundary and that the player walks. */
	static pack(path: readonly Position[]): Int32Array<ArrayBuffer> {
		const packed = new Int32Array(path.length * 2);
		for (let i = 0; i < path.length; i++) {
			packed[2 * i] = path[i].x;
			packed[2 * i + 1] = path[i].y;
		}
		return packed;
	}

	/** `cap` must be even. */
	private static span(viewOrigin: number, viewSize: number, a: number, b: number, cap: number): Span | null {
		const lo = Math.min(viewOrigin - PathFinder.WINDOW_MARGIN, a, b);
		const hi = Math.max(viewOrigin + viewSize + PathFinder.WINDOW_MARGIN, a + 1, b + 1);
		if (hi - lo <= cap) return { origin: lo, size: hi - lo };

		const min = Math.min(a, b);
		const max = Math.max(a, b);
		if (max - min >= cap) return null;
		/** Rounding the midpoint up keeps `max` inside when the endpoints are cap - 1 apart. */
		const centered = Math.ceil((min + max) / 2) - cap / 2;
		return { origin: Math.max(lo, Math.min(hi - cap, centered)), size: cap };
	}

	/**
	 * Shortest path from `start` to `target` inside `window`, both included, or null when there is none or `budget` expansions weren't enough.
	 * A wall target gives null, or with `snap` the nearest open cell in the window (BFS) becomes the goal.
	 * A start on a wall is allowed: the search leaves it like any cell.
	 */
	find(grid: WallGrid, start: Position, target: Position, window: CellRect, snap: boolean, budget = Infinity): Position[] | null {
		const search = this.steps(grid, start, target, window, snap, budget);
		while (true) {
			const step = search.next();
			if (step.done) return step.value;
		}
	}

	/**
	 * Exact answer for a target close to `start`, from a search on a small window on the calling thread:
	 * `[]` when the target is a wall and `snap` is off (no path), null when only the full search can tell.
	 * `window` is the full search window and holds both endpoints. A path of at most `NEAR_MARGIN` * 2 cells over the Manhattan distance
	 * can't be beaten by one leaving the small window, which has to go more than `NEAR_MARGIN` out and back.
	 */
	findNear(grid: WallGrid, start: Position, target: Position, window: CellRect, snap: boolean): Position[] | null {
		if (grid.isWall(target.x, target.y)) {
			if (snap) return null;
			return start.x === target.x && start.y === target.y ? [start] : [];
		}

		const margin = PathFinder.NEAR_MARGIN;
		const left = Math.max(window.x, Math.min(start.x, target.x) - margin);
		const top = Math.max(window.y, Math.min(start.y, target.y) - margin);
		const right = Math.min(window.x + window.width, Math.max(start.x, target.x) + 1 + margin);
		const bottom = Math.min(window.y + window.height, Math.max(start.y, target.y) + 1 + margin);
		if ((right - left) * (bottom - top) > PathFinder.NEAR_AREA) return null;

		const near = { x: left, y: top, width: right - left, height: bottom - top };
		const path = this.find(grid, start, target, near, false, PathFinder.NEAR_BUDGET);
		const distance = Math.abs(start.x - target.x) + Math.abs(start.y - target.y);
		return path !== null && path.length - 1 <= distance + 2 * margin ? path : null;
	}

	/**
	 * `find` as a generator that yields every `SLICE` expanded nodes, so a caller can run other work in between or drop the search.
	 * The grid is only read before the first yield: the search then runs on its own copy of the window.
	 */
	*steps(grid: WallGrid, start: Position, target: Position, window: CellRect, snap: boolean, budget = Infinity): Generator<void, Position[] | null, undefined> {
		if (!PathFinder.contains(window, start) || !PathFinder.contains(window, target)) return null;

		let goal = target;
		let loaded = false;
		if (grid.isWall(target.x, target.y)) {
			if (!snap) {
				if (start.x !== target.x || start.y !== target.y) return null;
			} else {
				this.load(grid, window);
				loaded = true;
				const nearest = this.nearestOpen(window, target);
				if (nearest === null) return null;
				goal = nearest;
			}
		}

		const straight = PathFinder.straight(grid, start, goal);
		if (straight !== null) return straight;

		if (!loaded) this.load(grid, window);
		this.begin(window, start, goal);
		while (true) {
			const result = this.run(budget);
			if (result !== undefined) return result;
			yield;
		}
	}

	private static contains(rect: CellRect, p: Position): boolean {
		return p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
	}

	/** Horizontal or vertical path without a wall, checked on the grid itself so no window copy is needed. */
	private static straight(grid: WallGrid, start: Position, goal: Position): Position[] | null {
		if (start.x !== goal.x && start.y !== goal.y) return null;

		const dx = Math.sign(goal.x - start.x);
		const dy = Math.sign(goal.y - start.y);
		const length = Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y);
		for (let i = 0; i <= length; i++) {
			if (grid.isWall(start.x + dx * i, start.y + dy * i)) return null;
		}
		return Array.from({ length: length + 1 }, (_, i) => ({ x: start.x + dx * i, y: start.y + dy * i }));
	}

	/** Copies the window's walls once per search, so the hot loop never touches the chunk map. */
	private load(grid: WallGrid, window: CellRect): void {
		const area = window.width * window.height;
		if (this.g.length < area) {
			this.walls = new Uint8Array(area);
			this.g = new Int32Array(area);
			this.state = new Uint32Array(area);
			this.from = new Uint8Array(area);
		}
		grid.copyWalls(window, this.walls);
	}

	/** Starts a search: everything stamped by an earlier one reads as untouched. */
	private nextBase(): number {
		if (this.base > 0xfffffff0) {
			this.state.fill(0);
			this.base = 0;
		}
		this.base += 2;
		return this.base;
	}

	/** Closest open cell to `origin` by BFS inside the window, the origin itself first. */
	private nearestOpen(window: CellRect, origin: Position): Position | null {
		const { x: ox, y: oy, width: W, height: H } = window;
		const { walls, state, g: queue } = this;
		const base = this.nextBase();

		const first = (origin.y - oy) * W + origin.x - ox;
		queue[0] = first;
		state[first] = base;
		let head = 0;
		let tail = 1;

		while (head < tail) {
			const cell = queue[head++];
			const x = cell % W;
			const y = (cell - x) / W;
			if (walls[cell] === 0) return { x: x + ox, y: y + oy };

			for (let d = 0; d < 4; d++) {
				const nx = x + NEAREST_DX[d];
				const ny = y + NEAREST_DY[d];
				if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
				const next = ny * W + nx;
				if (state[next] === base) continue;
				state[next] = base;
				queue[tail++] = next;
			}
		}
		return null;
	}

	/** Sets up the search state for `run`. */
	private begin(window: CellRect, start: Position, goal: Position): void {
		const { x: ox, y: oy, width: W } = window;
		this.searchWindow = window;
		this.nextBase();
		this.entryCount = 0;
		this.heapSize = 0;
		this.expanded = 0;

		this.startCell = (start.y - oy) * W + start.x - ox;
		this.goalCell = (goal.y - oy) * W + goal.x - ox;
		this.g[this.startCell] = 0;
		this.state[this.startCell] = this.base;
		const startH = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y);
		this.push(this.startCell, startH, startH);
	}

	/**
	 * Runs the search for up to `SLICE` more expansions: the path, null when it fails (no path, or `budget` expansions in total),
	 * or undefined when it isn't over. The state is in fields: with the loop inside the generator, it ran 1.5x (open window) to 2.8x (maze) slower in bun.
	 */
	private run(budget: number): Position[] | null | undefined {
		const window = this.searchWindow;
		const { width: W, height: H } = window;
		const { walls, g, state, from, base, startCell, goalCell } = this;
		const closed = base + 1;
		const goalX = goalCell % W;
		const goalY = (goalCell - goalX) / W;
		const sliceEnd = this.expanded + PathFinder.SLICE;
		let expanded = this.expanded;

		while (this.heapSize > 0) {
			const cell = this.entryCell[this.pop()];
			if (state[cell] === closed) continue;
			if (cell === goalCell) return this.rebuild(window, startCell, goalCell);
			if (++expanded > budget) return null;

			state[cell] = closed;
			const x = cell % W;
			const y = (cell - x) / W;
			const next = g[cell] + 1;

			for (let d = 0; d < 4; d++) {
				const nx = x + DX[d];
				const ny = y + DY[d];
				if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
				const n = ny * W + nx;
				const seen = state[n];
				if (seen === closed || walls[n] !== 0 || (seen === base && next >= g[n])) continue;

				g[n] = next;
				state[n] = base;
				from[n] = d;
				const h = Math.abs(nx - goalX) + Math.abs(ny - goalY);
				this.push(n, next + h, h);
			}

			if (expanded === sliceEnd) {
				this.expanded = expanded;
				return undefined;
			}
		}
		return null;
	}

	/**
	 * Walks back from the goal through the entry directions. A cell's direction comes from its last improvement, which is the entry
	 * that gets popped and expanded, so a stale entry never decides the path.
	 */
	private rebuild(window: CellRect, startCell: number, goalCell: number): Position[] {
		const { x: ox, y: oy, width: W } = window;
		const path: Position[] = [];
		let cell = goalCell;
		while (true) {
			const x = cell % W;
			path.push({ x: x + ox, y: (cell - x) / W + oy });
			if (cell === startCell) break;
			const d = this.from[cell];
			cell -= DY[d] * W + DX[d];
		}
		return path.reverse();
	}

	private less(a: number, b: number): boolean {
		const { entryF: f, entryH: h } = this;
		return f[a] !== f[b] ? f[a] < f[b] : h[a] !== h[b] ? h[a] < h[b] : a < b;
	}

	private push(cell: number, f: number, h: number): void {
		if (this.entryCount === this.entryF.length) this.growEntries();
		const id = this.entryCount++;
		this.entryF[id] = f;
		this.entryH[id] = h;
		this.entryCell[id] = cell;

		const heap = this.heap;
		let i = this.heapSize++;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (!this.less(id, heap[parent])) break;
			heap[i] = heap[parent];
			i = parent;
		}
		heap[i] = id;
	}

	/** Removes and returns the id of the smallest open entry. */
	private pop(): number {
		const heap = this.heap;
		const top = heap[0];
		const last = heap[--this.heapSize];
		const size = this.heapSize;

		let i = 0;
		while (true) {
			let child = 2 * i + 1;
			if (child >= size) break;
			if (child + 1 < size && this.less(heap[child + 1], heap[child])) child++;
			if (!this.less(heap[child], last)) break;
			heap[i] = heap[child];
			i = child;
		}
		heap[i] = last;
		return top;
	}

	private growEntries(): void {
		const size = Math.max(1024, this.entryF.length * 2);
		const grow = (old: Int32Array<ArrayBuffer>): Int32Array<ArrayBuffer> => {
			const bigger = new Int32Array(size);
			bigger.set(old);
			return bigger;
		};
		this.entryF = grow(this.entryF);
		this.entryH = grow(this.entryH);
		this.entryCell = grow(this.entryCell);
		this.heap = grow(this.heap);
	}
}

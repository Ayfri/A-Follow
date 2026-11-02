import type { Connectivity } from './Connectivity';
import { CHUNK_BITS, CHUNK_SIZE, type CellRect, type Position, type WallGrid } from './WallGrid';

export type SearchKind = 'astar' | 'bidirectional' | 'jps4';

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
 * Shortest paths on a bounded window of the infinite grid, on 4-neighbors: A* with a Manhattan heuristic on almost open windows,
 * JPS4 on most others, and a bidirectional breadth-first search on dense ones (`choose`). All return a shortest path, but not always the same one.
 * Ties resolve the same way every run: neighbors are taken up, right, down, left. A* orders open entries by F, then H, then insertion
 * order. The breadth-first search is FIFO, expands the smaller frontier first (forward when equal) and keeps the first discovery of a cell.
 * JPS4 (arXiv 2501.14816) is A* over jump points with a horizontal-first canonical ordering: a vertical run jumps to the next cell with a
 * forced neighbor (or the goal), a horizontal move is a single step, and the edge cost is the run length.
 * The typed buffers only grow and are reused across searches, so a search allocates nothing but its result.
 * Given a `Connectivity`, a target the start can't reach inside the window is rejected before the window is copied, not by scanning it.
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
	/**
	 * Expanded nodes between two yields of `steps` (scanned cells for JPS4), which is how late a newer request is seen. A slice takes, in
	 * node on 2240 x 1265, medians: A* ~7 ms on a maze and 15 to 18 ms on random grids, the bidirectional search 3 to 4 ms, JPS4 2 to 6 ms.
	 */
	static readonly SLICE = 50_000;
	/**
	 * Margin of the small window `findNear` searches, and the expansions after which it gives up. A search that exhausts the budget
	 * takes ~1 ms (max 1.6), against ~2.9 ms at 8192, and 4096 still answers 390 of 400 targets 40 to 150 cells away on a random 20% grid.
	 */
	static readonly NEAR_MARGIN = 32;
	static readonly NEAR_BUDGET = 4096;
	/** A near window bigger than this is not searched: copying it would cost more than the attempt can save. */
	static readonly NEAR_AREA = 1 << 17;
	/**
	 * Wall densities (see `density`) that pick the search of a query without a given kind: A* below `JPS_DENSITY`, JPS4 from there up to
	 * `BFS_DENSITY`, the bidirectional search from there. Full-window queries 200+ apart on random grids of 2240 x 1265 and 2048 x 2048,
	 * medians in node (V8), in ms, 12 queries per pass:
	 *  - open: A* 5 / JPS4 70 (it scans lines to the edge), 1 to 2%: a tie, 5%: 94 / 73 and 112 / 75, 10%: 118 / 86 and 584 / 363,
	 *    20%: 182 / 139 and 445 / 289, 30%: 352 / 242 and 554 / 395, 35%: bidirectional 489 / JPS4 383 and 514 / 370;
	 *  - 36%: bidirectional 473 / JPS4 397 (JPS4 faster) and 742 / 689, 37%: 545 / 584 (tie) and 487 / 401 (JPS4 faster),
	 *    38%: 571 / 673 (bidirectional faster) and 499 / 528 (tie), 39%: 512 / 689 and 470 / 576, 40%: 421 / 729 and 509 / 822;
	 *  - mazes: bidirectional 671 / JPS4 988 and 659 / 1047, and 2 to 2.1x faster than A*; at 40% it is 2.4 to 2.5x faster than A*.
	 * Bun gives the same bands. A* beats the bidirectional search up to ~30% (0.72 to 0.91x for bidirectional), a range JPS4 now beats too.
	 * The bounds sit halfway between the last density where one side wins and the first where the other does (0.03 between a tie at 0.02
	 * and a win at 0.05, 0.36 between JPS4 still winning at 0.346 and 0.370 and the bidirectional search winning at 0.365 and 0.390). A search
	 * from one end only never beat the bidirectional one (a tie on mazes) and is not kept. Pairs 20 to 200 apart show no difference between the
	 * three (a search costs ~2.5 ms, mostly the window copy), so the distance doesn't enter the choice. A wrong choice costs time, never a path.
	 */
	static readonly JPS_DENSITY = 0.03;
	static readonly BFS_DENSITY = 0.36;

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
	private kind: SearchKind = 'astar';
	/** Queues of the bidirectional search, both in `g`: the forward side, then the backward side counted from the end of the buffer. */
	private head = 0;
	private tail = 0;
	private levelEnd = 0;
	private backHead = 0;
	private backTail = 0;
	private backLevelEnd = 0;
	private forwardTurn = true;
	private readonly connectivity: Connectivity | null;

	constructor(connectivity: Connectivity | null = null) {
		this.connectivity = connectivity;
	}

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
	find(grid: WallGrid, start: Position, target: Position, window: CellRect, snap: boolean, budget = Infinity, kind?: SearchKind): Position[] | null {
		const search = this.steps(grid, start, target, window, snap, budget, kind);
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
		const path = this.find(grid, start, target, near, false, PathFinder.NEAR_BUDGET, 'astar');
		const distance = Math.abs(start.x - target.x) + Math.abs(start.y - target.y);
		return path !== null && path.length - 1 <= distance + 2 * margin ? path : null;
	}

	/**
	 * `find` as a generator that yields every `SLICE` expanded nodes, so a caller can run other work in between or drop the search.
	 * The grid is only read before the first yield: the search then runs on its own copy of the window.
	 * The connectivity check, when there is one, ends the generator before its first yield.
	 */
	*steps(grid: WallGrid, start: Position, target: Position, window: CellRect, snap: boolean, budget = Infinity, kind?: SearchKind): Generator<void, Position[] | null, undefined> {
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

		if (start.x === goal.x && start.y === goal.y) return [{ ...start }];
		const straight = PathFinder.straight(grid, start, goal);
		if (straight !== null) return straight;
		if (this.connectivity !== null && !this.connectivity.mayReach(grid, window, start, goal)) return null;

		if (!loaded) this.load(grid, window);
		this.begin(window, start, goal, kind ?? PathFinder.choose(grid, window));
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

	/** Walls over cells of the chunks that overlap the window: approximate at the edges, where a chunk reaches outside the window. */
	private static density(grid: WallGrid, window: CellRect): number {
		const firstX = window.x >> CHUNK_BITS;
		const firstY = window.y >> CHUNK_BITS;
		const lastX = (window.x + window.width - 1) >> CHUNK_BITS;
		const lastY = (window.y + window.height - 1) >> CHUNK_BITS;
		let walls = 0;
		for (let cy = firstY; cy <= lastY; cy++) {
			for (let cx = firstX; cx <= lastX; cx++) walls += grid.chunkAt(cx, cy)?.walls ?? 0;
		}
		return walls / ((lastX - firstX + 1) * (lastY - firstY + 1) * CHUNK_SIZE * CHUNK_SIZE);
	}

	private static choose(grid: WallGrid, window: CellRect): SearchKind {
		const density = PathFinder.density(grid, window);
		return density >= PathFinder.BFS_DENSITY ? 'bidirectional' : density >= PathFinder.JPS_DENSITY ? 'jps4' : 'astar';
	}

	/** Sets up the search state for `run`. */
	private begin(window: CellRect, start: Position, goal: Position, kind: SearchKind): void {
		const { x: ox, y: oy, width: W, height: H } = window;
		this.searchWindow = window;
		this.kind = kind;
		this.nextBase();
		this.entryCount = 0;
		this.heapSize = 0;
		this.expanded = 0;

		this.startCell = (start.y - oy) * W + start.x - ox;
		this.goalCell = (goal.y - oy) * W + goal.x - ox;
		this.state[this.startCell] = this.base;
		if (kind !== 'bidirectional') {
			this.g[this.startCell] = 0;
			this.from[this.startCell] = 4;
			const startH = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y);
			this.push(this.startCell, startH, startH);
			return;
		}

		this.g[0] = this.startCell;
		this.g[W * H - 1] = this.goalCell;
		this.state[this.goalCell] = this.base + 1;
		this.head = 0;
		this.tail = 1;
		this.levelEnd = 0;
		this.backHead = 0;
		this.backTail = 1;
		this.backLevelEnd = 0;
		this.forwardTurn = true;
	}

	private run(budget: number): Position[] | null | undefined {
		return this.kind === 'astar' ? this.runAStar(budget) : this.kind === 'jps4' ? this.runJps(budget) : this.runBidirectional(budget);
	}

	/** JPS4 (arXiv 2501.14816): horizontal-first canonical ordering, vertical runs jump to forced neighbors, horizontal moves are single steps. */
	private runJps(budget: number): Position[] | null | undefined {
		const window = this.searchWindow;
		const { width: W, height: H } = window;
		const { walls, g, state, from, base, startCell, goalCell } = this;
		const closed = base + 1;
		const goalX = goalCell % W;
		const goalY = (goalCell - goalX) / W;
		let scanned = 0;
		let expanded = this.expanded;

		while (this.heapSize > 0) {
			const cell = this.entryCell[this.pop()];
			if (state[cell] === closed) continue;
			if (cell === goalCell) return this.rebuildJps(window, startCell, goalCell);
			if (++expanded > budget) return null;

			state[cell] = closed;
			const x = cell % W;
			const y = (cell - x) / W;
			const arrival = from[cell];
			for (let d = 0; d < 4; d++) {
				let target = -1;
				let steps = 1;
				if ((d & 1) === 1) {
					const nx = x + DX[d];
					if (nx < 0 || nx >= W || walls[cell + DX[d]] !== 0) continue;
					/** A horizontal move after a vertical one is only taken when the wall behind forces it (the parent's row there is closed). */
					if (arrival === 4 || (arrival & 1) === 1 ? arrival === 4 || d === arrival : walls[cell + DX[d] - DY[arrival] * W] !== 0) target = cell + DX[d];
				} else if (arrival === 4 || (arrival & 1) === 1 || d === arrival) {
					const dy = DY[d];
					for (let jy = y + dy; jy >= 0 && jy < H; jy += dy, steps++) {
						const at = jy * W + x;
						if (walls[at] !== 0) break;
						if (at === goalCell || (x > 0 && walls[at - 1] === 0 && walls[at - 1 - dy * W] !== 0) || (x < W - 1 && walls[at + 1] === 0 && walls[at + 1 - dy * W] !== 0)) { target = at; break; }
					}
					scanned += steps;
				}
				if (target < 0) continue;
				const seen = state[target];
				const next = g[cell] + steps;
				if (seen === closed || (seen === base && next >= g[target])) continue;

				g[target] = next;
				state[target] = base;
				from[target] = d;
				const tx = target % W;
				const h = Math.abs(tx - goalX) + Math.abs((target - tx) / W - goalY);
				this.push(target, next + h, h);
			}

			if (scanned >= PathFinder.SLICE) {
				this.expanded = expanded;
				return undefined;
			}
		}
		return null;
	}

	/** Walks back from each jump point one cell at a time to the cell whose cost is its own minus the steps taken: its parent. */
	private rebuildJps(window: CellRect, startCell: number, goalCell: number): Position[] {
		const { x: ox, y: oy, width: W } = window;
		const { g, state, from, base } = this;
		const path: Position[] = [];
		const at = (cell: number): Position => {
			const x = cell % W;
			return { x: x + ox, y: (cell - x) / W + oy };
		};
		let cell = goalCell;
		let cost = g[cell];
		path.push(at(cell));
		while (cell !== startCell) {
			const back = DY[from[cell]] * W + DX[from[cell]];
			do {
				cell -= back;
				cost--;
				path.push(at(cell));
			} while (state[cell] < base || g[cell] !== cost);
		}
		return path.reverse();
	}

	/**
	 * Breadth-first search from both ends. The forward queue grows up from `g[0]`, the backward one down from `g[area - 1]`, and each cell
	 * is queued once overall, so they never meet in the buffer. A cell is marked `base` when the forward side reached it and `base + 1`
	 * for the backward side. Each turn expands one full level of the side with the smaller frontier (forward when equal). The first
	 * meeting is a shortest path: while a side expands a level the other frontier doesn't move, and a neighbor the other side reached must
	 * be on its frontier (an expanded cell would already have reached the current one), so every meeting of that level has length
	 * forward depth + 1 + backward depth. A frontier that runs out proves there is no path in the window. The backward side never enters a
	 * wall and the goal is open, so a start on a wall meets from the forward side. Alternating single cells instead of levels also gave
	 * shortest paths on 1.2M random queries on small grids: the grid is bipartite, so a meeting can't be longer than the shortest path by one, and the
	 * levels only make the argument independent of that.
	 */
	private runBidirectional(budget: number): Position[] | null | undefined {
		const window = this.searchWindow;
		const { width: W, height: H } = window;
		const { walls, g: queue, state, from, base } = this;
		const sliceEnd = this.expanded + PathFinder.SLICE;
		const last = W * H - 1;
		let { expanded, head, tail, levelEnd, backHead, backTail, backLevelEnd, forwardTurn } = this;

		while (true) {
			if (forwardTurn ? head === levelEnd : backHead === backLevelEnd) {
				if (head === tail || backHead === backTail) return null;
				forwardTurn = tail - head <= backTail - backHead;
				if (forwardTurn) levelEnd = tail;
				else backLevelEnd = backTail;
			}
			if (++expanded > budget) return null;

			const own = forwardTurn ? base : base + 1;
			const other = forwardTurn ? base + 1 : base;
			const cell = forwardTurn ? queue[head++] : queue[last - backHead++];
			const x = cell % W;
			const y = (cell - x) / W;
			for (let d = 0; d < 4; d++) {
				const nx = x + DX[d];
				const ny = y + DY[d];
				if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
				const n = ny * W + nx;
				if (walls[n] !== 0) continue;

				const seen = state[n];
				if (seen === other) return forwardTurn ? this.rebuildMeeting(cell, n) : this.rebuildMeeting(n, cell);
				if (seen === own) continue;

				state[n] = own;
				from[n] = d;
				if (forwardTurn) queue[tail++] = n;
				else queue[last - backTail++] = n;
			}

			if (expanded === sliceEnd) {
				this.expanded = expanded;
				this.head = head;
				this.tail = tail;
				this.levelEnd = levelEnd;
				this.backHead = backHead;
				this.backTail = backTail;
				this.backLevelEnd = backLevelEnd;
				this.forwardTurn = forwardTurn;
				return undefined;
			}
		}
	}

	/** Start to `forwardCell` through the forward entries, then `backwardCell` to the goal through the backward ones (both sides walk the same way). */
	private rebuildMeeting(forwardCell: number, backwardCell: number): Position[] {
		const { x: ox, y: oy, width: W } = this.searchWindow;
		const { from, startCell, goalCell } = this;
		const at = (cell: number): Position => {
			const x = cell % W;
			return { x: x + ox, y: (cell - x) / W + oy };
		};

		const path: Position[] = [];
		for (let cell = forwardCell; ; cell -= DY[from[cell]] * W + DX[from[cell]]) {
			path.push(at(cell));
			if (cell === startCell) break;
		}
		path.reverse();
		for (let cell = backwardCell; ; cell -= DY[from[cell]] * W + DX[from[cell]]) {
			path.push(at(cell));
			if (cell === goalCell) break;
		}
		return path;
	}

	/**
	 * Runs the search for up to `SLICE` more expansions: the path, null when it fails (no path, or `budget` expansions in total),
	 * or undefined when it isn't over. The state is in fields: with the loop inside the generator, it ran 1.5x (open window) to 2.8x (maze) slower in bun.
	 */
	private runAStar(budget: number): Position[] | null | undefined {
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

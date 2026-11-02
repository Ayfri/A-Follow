import { BLOCKED, CellType, COST, MAX_COST, TYPE_COUNT } from './CellType';
import type { Connectivity } from './Connectivity';
import { CHUNK_BITS, CHUNK_SIZE, type CellRect, type Position, type WallGrid } from './WallGrid';

export type SearchKind = 'astar' | 'bidirectional' | 'jps4' | 'weighted';

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

/** What `stats` reads off the chunks overlapping a window. */
interface WindowStats {
	/** Blocked cells over the cells of those chunks. */
	density: number;
	/** One bit per passable type that may appear in the window. */
	passable: number;
	/** Cheapest entry cost among those types: the heuristic scale and the cost of a straight path. */
	minCost: number;
}

/**
 * Shortest paths on a bounded window of the infinite grid, on 4-neighbors. A window with a single passable type costs the same per cell,
 * so the shortest path is the one with the fewest cells: A* with a Manhattan heuristic on almost open windows, JPS4 on most others, and a
 * bidirectional breadth-first search on dense ones (`choose`). A window with several passable types has a cost per cell (`COST`, paid to
 * enter a cell, the start is free) and gets a weighted A* over a bucket queue (Dial). All return a cheapest path, but not always the same one.
 * Ties resolve the same way every run: neighbors are taken up, right, down, left. A* orders open entries by F, then H, then insertion
 * order. The weighted search takes the entry pushed last among those with the smallest F (LIFO buckets). The breadth-first search is FIFO,
 * expands the smaller frontier first (forward when equal) and keeps the first discovery of a cell.
 * JPS4 (arXiv 2501.14816) is A* over jump points with a horizontal-first canonical ordering: a vertical run jumps to the next cell with a
 * forced neighbor (or the goal), a horizontal move is a single step, and the edge cost is the run length.
 * The typed buffers only grow and are reused across searches, so a search allocates nothing but its result.
 * Given a `Connectivity`, a target the start can't reach inside the window is rejected without a search: before the window is copied,
 * except with `snap` on a wall target, where the copy comes first because the nearest open cell is found on it.
 */
export class PathFinder {
	/** Cells searched around the visible rect, so paths can bend around walls just outside the screen. */
	static readonly WINDOW_MARGIN = 16;
	/**
	 * With an endpoint off the view, the window reaches the Manhattan distance between them divided by this around both, so a player far
	 * off a zoomed-in view isn't searched in a thin strip between it and the view, which a river or a row of buildings cuts. City seed 1,
	 * a 73 x 41 view 60 to 3000 cells from the player, 284 reachable targets: no room left 13.4% without a path and 60% on a costlier one,
	 * 4 gives 1.4% and 5.3% (median window 3.6M cells), 2 gives 0.7% and 2.1% (5M). The room only applies off the view, so a zoomed-out
	 * view with both endpoints on it keeps its window and its search time.
	 */
	static readonly ENDPOINT_ROOM = 2;
	static readonly MAX_WINDOW_SIDE = 4096;
	/**
	 * Caps the cells of a window (2.9M at a 1680 x 925 screen with 3 px cells at 25% zoom). The window buffers take 10 bytes per cell
	 * (84 MB at the cap), and the open entries add 16 bytes each (more while their arrays double). A search that scans a 2.9M window
	 * (unreachable target) raised the process rss by ~155 MB, so a scan of the largest window can take ~450 MB. The open entries of a
	 * weighted search take 8 bytes each (the cell and the next entry of its bucket), but it opens more of them.
	 */
	static readonly MAX_WINDOW_AREA = 1 << 23;
	/**
	 * Expanded nodes between two yields of `steps` (scanned cells for JPS4), which is how late a newer request is seen. A slice takes, in
	 * Node.js (V8) on 2240 x 1265, medians: A* ~7 ms on a maze and 15 to 18 ms on random grids, the bidirectional search 3 to 4 ms, JPS4 2 to 6 ms.
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
	 * In a generating world `findNear` generates the chunks its window misses on the calling thread (~0.8 ms each). A thin tall window under
	 * `NEAR_AREA` spans up to 34 chunks, so one needing more than this many is left to the worker, which generates off the main thread.
	 */
	static readonly NEAR_MAX_GENERATED = 16;
	/**
	 * Wall densities (see `stats`) that pick the search of a query without a given kind on a window with one passable type: A* below
	 * `JPS_DENSITY`, JPS4 from there up to `BFS_DENSITY`, the bidirectional search from there. A window with several passable types takes the
	 * weighted search whatever its density. Full-window queries 200+ apart on random grids of 2240 x 1265 and 2048 x 2048,
	 * medians in Node.js (V8), in ms, 12 queries per pass:
	 *  - open: A* 5 / JPS4 70 (it scans lines to the edge), 1 to 2%: a tie, 5%: 94 / 73 and 112 / 75, 10%: 118 / 86 and 584 / 363,
	 *    20%: 182 / 139 and 445 / 289, 30%: 352 / 242 and 554 / 395, 35%: bidirectional 489 / JPS4 383 and 514 / 370;
	 *  - 36%: bidirectional 473 / JPS4 397 (JPS4 faster) and 742 / 689, 37%: 545 / 584 (tie) and 487 / 401 (JPS4 faster),
	 *    38%: 571 / 673 (bidirectional faster) and 499 / 528 (tie), 39%: 512 / 689 and 470 / 576, 40%: 421 / 729 and 509 / 822;
	 *  - mazes: bidirectional 671 / JPS4 988 and 659 / 1047, and 2 to 2.1x faster than A*; at 40% it is 2.4 to 2.5x faster than A*.
	 * Bun gives the same bands. Between 5% and 30% A* is faster than the bidirectional search (0.72 to 0.91x for bidirectional) and JPS4
	 * is faster than both.
	 * The bounds sit halfway between the last density where one side wins and the first where the other does (0.03 between a tie at 0.02
	 * and a win at 0.05, 0.36 between JPS4 still winning at 0.346 and 0.370 and the bidirectional search winning at 0.365 and 0.390). A search
	 * from one end only never beat the bidirectional one (a tie on mazes) and is not kept. Pairs 20 to 200 apart show no difference between the
	 * three (a search costs ~2.5 ms, mostly the window copy), so the distance doesn't enter the choice. A wrong choice costs time, never a path.
	 */
	static readonly JPS_DENSITY = 0.03;
	static readonly BFS_DENSITY = 0.36;
	/**
	 * Ring size of the weighted search's bucket queue, the smallest power of two above `2 * MAX_COST`. The heuristic is consistent and its
	 * scale is at most `MAX_COST`, so every open entry has an F within `MAX_COST + scale` of the bucket being drained: the F values in
	 * the ring span less than its size, and no two of them share a slot (`MAX_COST + scale <= 24 < 32` today).
	 */
	private static readonly BUCKETS = 1 << (32 - Math.clz32(2 * MAX_COST));
	/** One bit per type that doesn't block: what an unknown chunk of a generating world may hold. */
	private static readonly ANY_PASSABLE = BLOCKED.reduce((bits, blocked, type) => (blocked === 0 ? bits | (1 << type) : bits), 0);

	/** Window cells: 0 = open and nonzero = blocked for the unit searches, the cost to enter (0 = blocked) for the weighted one (`costLayout`). */
	private cells = new Uint8Array(0);
	private costLayout = false;
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
	/** Weighted search: the open entries are LIFO lists per F modulo `BUCKETS`, `bucketHead` holds the first entry (-1 = empty) and `entryNext` the next one. */
	private entryNext = new Int32Array(0);
	private readonly bucketHead = new Int32Array(PathFinder.BUCKETS);
	private openCount = 0;
	/** F of the bucket being drained, which never decreases. */
	private fCurrent = 0;
	/** Heuristic scale: the cheapest cost in the window. */
	private hScale = 1;
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
	 * Search window for a visible rect: the rect plus the margin, extended to hold both endpoints, with room around them when one is off the rect.
	 * A side longer than its cap becomes a capped segment centered between the endpoints and kept inside that union;
	 * endpoints a full cap apart on a side can't share a window. Above the area cap, the room halves first, then the longer side shrinks to fit.
	 */
	static window(view: CellRect, start: Position, target: Position): CellRect | null {
		let room = PathFinder.contains(view, start) && PathFinder.contains(view, target)
			? 0
			: Math.max(PathFinder.WINDOW_MARGIN, Math.floor((Math.abs(start.x - target.x) + Math.abs(start.y - target.y)) / PathFinder.ENDPOINT_ROOM));
		let x: Span | null;
		let y: Span | null;
		while (true) {
			x = PathFinder.span(view.x, view.width, start.x, target.x, room, PathFinder.MAX_WINDOW_SIDE);
			y = PathFinder.span(view.y, view.height, start.y, target.y, room, PathFinder.MAX_WINDOW_SIDE);
			if (x === null || y === null || x.size * y.size <= PathFinder.MAX_WINDOW_AREA || room === 0) break;
			room >>= 1;
		}
		if (x && y && x.size * y.size > PathFinder.MAX_WINDOW_AREA) {
			/** The cap stays even, which the centering in `span` needs. */
			if (x.size >= y.size) x = PathFinder.span(view.x, view.width, start.x, target.x, room, Math.floor(PathFinder.MAX_WINDOW_AREA / y.size) & ~1);
			else y = PathFinder.span(view.y, view.height, start.y, target.y, room, Math.floor(PathFinder.MAX_WINDOW_AREA / x.size) & ~1);
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
	private static span(viewOrigin: number, viewSize: number, a: number, b: number, room: number, cap: number): Span | null {
		const lo = Math.min(viewOrigin - PathFinder.WINDOW_MARGIN, Math.min(a, b) - room);
		const hi = Math.max(viewOrigin + viewSize + PathFinder.WINDOW_MARGIN, Math.max(a, b) + 1 + room);
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
	 * `window` is the full search window and holds both endpoints. A path leaving the small window goes more than `NEAR_MARGIN` out and
	 * back, so it has more than the Manhattan distance + 2 * `NEAR_MARGIN` cells, each costing at least the cheapest cost of the full window.
	 * A path found inside that costs no more than that can't be beaten by one leaving the small window.
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
		if (grid.missingChunks(near) > PathFinder.NEAR_MAX_GENERATED) return null;
		grid.ensure(near);
		const passable = PathFinder.stats(grid, near).passable;
		const path = this.find(grid, start, target, near, false, PathFinder.NEAR_BUDGET, (passable & (passable - 1)) === 0 ? 'astar' : 'weighted');
		const distance = Math.abs(start.x - target.x) + Math.abs(start.y - target.y);
		return path !== null && PathFinder.pathCost(grid, path) <= PathFinder.stats(grid, window).minCost * (distance + 2 * margin) ? path : null;
	}

	/** Cost of a path: the cost to enter each cell after the first. */
	static pathCost(grid: WallGrid, path: readonly Position[]): number {
		let cost = 0;
		for (let i = 1; i < path.length; i++) cost += COST[grid.typeAt(path[i].x, path[i].y)];
		return cost;
	}

	/**
	 * `find` as a generator that yields every `SLICE` expanded nodes, so a caller can run other work in between or drop the search.
	 * The grid is only read before the first yield: the search then runs on its own copy of the window.
	 * The connectivity check, when there is one, ends the generator before its first yield.
	 * In a generating world the window is generated first, in one go: a caller with a big window ensures it beforehand in slices.
	 */
	*steps(grid: WallGrid, start: Position, target: Position, window: CellRect, snap: boolean, budget = Infinity, kind?: SearchKind): Generator<void, Position[] | null, undefined> {
		if (!PathFinder.contains(window, start) || !PathFinder.contains(window, target)) return null;
		grid.ensure(window);

		const wallTarget = grid.isWall(target.x, target.y);
		if (wallTarget && !snap && (start.x !== target.x || start.y !== target.y)) return null;

		const stats = PathFinder.stats(grid, window);
		const searchKind = kind ?? PathFinder.choose(grid, window, stats);
		let goal = target;
		let loaded = false;
		if (wallTarget && snap) {
			this.load(grid, window, searchKind, stats);
			loaded = true;
			const nearest = this.nearestOpen(window, target);
			if (nearest === null) return null;
			goal = nearest;
		}

		if (start.x === goal.x && start.y === goal.y) return [{ ...start }];
		const straight = PathFinder.straight(grid, start, goal, stats.minCost);
		if (straight !== null) return straight;
		if (this.connectivity !== null && !this.connectivity.mayReach(grid, window, start, goal)) return null;

		if (!loaded) this.load(grid, window, searchKind, stats);
		this.begin(window, start, goal, searchKind, stats.minCost);
		while (true) {
			const result = this.run(budget);
			if (result !== undefined) return result;
			yield;
		}
	}

	private static contains(rect: CellRect, p: Position): boolean {
		return p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
	}

	/**
	 * Horizontal or vertical path whose cells all cost `minCost`, checked on the grid itself so no window copy is needed. Every path has at
	 * least the Manhattan length in cells and each costs at least `minCost`, so it is a cheapest path (and the only one of its length).
	 */
	private static straight(grid: WallGrid, start: Position, goal: Position, minCost: number): Position[] | null {
		if (start.x !== goal.x && start.y !== goal.y) return null;

		const dx = Math.sign(goal.x - start.x);
		const dy = Math.sign(goal.y - start.y);
		const length = Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y);
		for (let i = 1; i <= length; i++) {
			if (COST[grid.typeAt(start.x + dx * i, start.y + dy * i)] !== minCost) return null;
		}
		return Array.from({ length: length + 1 }, (_, i) => ({ x: start.x + dx * i, y: start.y + dy * i }));
	}

	/**
	 * Copies the window once per search, so the hot loop never touches the chunk map: the cost of each cell for the weighted search, and for
	 * the others a blocked mask. The raw types are that mask when ground is the only passable type (nonzero is then blocked).
	 */
	private load(grid: WallGrid, window: CellRect, kind: SearchKind, stats: WindowStats): void {
		const area = window.width * window.height;
		if (this.g.length < area) {
			this.cells = new Uint8Array(area);
			this.g = new Int32Array(area);
			this.state = new Uint32Array(area);
			this.from = new Uint8Array(area);
		}
		this.costLayout = kind === 'weighted';
		const onlyGround = (stats.passable & ~(1 << CellType.GROUND)) === 0;
		grid.copyWalls(window, this.cells, this.costLayout ? COST : onlyGround ? null : BLOCKED);
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
		const { cells, costLayout, state, g: queue } = this;
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
			if ((cells[cell] !== 0) === costLayout) return { x: x + ox, y: y + oy };

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

	/**
	 * Sums what the chunks overlapping the window hold: approximate at the edges, where a chunk reaches outside the window. That makes
	 * `passable` a superset and `minCost` a lower bound of the window's own, which keeps a uniform test and the heuristic scale safe.
	 * A missing chunk is all ground in the Empty world, and unknown in a generating one, where it may hold every passable type.
	 */
	private static stats(grid: WallGrid, window: CellRect): WindowStats {
		const firstX = window.x >> CHUNK_BITS;
		const firstY = window.y >> CHUNK_BITS;
		const lastX = (window.x + window.width - 1) >> CHUNK_BITS;
		const lastY = (window.y + window.height - 1) >> CHUNK_BITS;
		let walls = 0;
		let passable = 0;
		for (let cy = firstY; cy <= lastY; cy++) {
			for (let cx = firstX; cx <= lastX; cx++) {
				const chunk = grid.chunkAt(cx, cy);
				if (chunk === undefined) {
					passable |= grid.generates ? PathFinder.ANY_PASSABLE : 1 << CellType.GROUND;
					continue;
				}
				walls += chunk.walls;
				for (let type = 0; type < TYPE_COUNT; type++) {
					if (chunk.counts[type] !== 0 && BLOCKED[type] === 0) passable |= 1 << type;
				}
			}
		}

		let minCost = MAX_COST;
		for (let type = 0; type < TYPE_COUNT; type++) {
			if ((passable >> type) & 1) minCost = Math.min(minCost, COST[type]);
		}
		return { density: walls / ((lastX - firstX + 1) * (lastY - firstY + 1) * CHUNK_SIZE * CHUNK_SIZE), passable, minCost };
	}

	private static choose(grid: WallGrid, window: CellRect, { density, passable } = PathFinder.stats(grid, window)): SearchKind {
		if ((passable & (passable - 1)) !== 0) return 'weighted';
		return density >= PathFinder.BFS_DENSITY ? 'bidirectional' : density >= PathFinder.JPS_DENSITY ? 'jps4' : 'astar';
	}

	/** Sets up the search state for `run`. `minCost` is the heuristic scale of the weighted search. */
	private begin(window: CellRect, start: Position, goal: Position, kind: SearchKind, minCost: number): void {
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
		if (kind === 'weighted') {
			this.g[this.startCell] = 0;
			this.from[this.startCell] = 4;
			this.hScale = minCost;
			this.bucketHead.fill(-1);
			this.openCount = 0;
			this.fCurrent = minCost * (Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y));
			this.pushBucket(this.startCell, this.fCurrent);
			return;
		}
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
		switch (this.kind) {
			case 'astar': return this.runAStar(budget);
			case 'jps4': return this.runJps(budget);
			case 'weighted': return this.runWeighted(budget);
			case 'bidirectional': return this.runBidirectional(budget);
		}
	}

	/** JPS4 (arXiv 2501.14816): horizontal-first canonical ordering, vertical runs jump to forced neighbors, horizontal moves are single steps. */
	private runJps(budget: number): Position[] | null | undefined {
		const window = this.searchWindow;
		const { width: W, height: H } = window;
		const { cells, g, state, from, base, startCell, goalCell } = this;
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
					if (nx < 0 || nx >= W || cells[cell + DX[d]] !== 0) continue;
					/** A horizontal move after a vertical one is only taken when the wall behind forces it (the parent's row there is closed). */
					if (arrival === 4 || (arrival & 1) === 1 ? arrival === 4 || d === arrival : cells[cell + DX[d] - DY[arrival] * W] !== 0) target = cell + DX[d];
				} else if (arrival === 4 || (arrival & 1) === 1 || d === arrival) {
					const dy = DY[d];
					for (let jy = y + dy; jy >= 0 && jy < H; jy += dy, steps++) {
						const at = jy * W + x;
						if (cells[at] !== 0) break;
						if (at === goalCell || (x > 0 && cells[at - 1] === 0 && cells[at - 1 - dy * W] !== 0) || (x < W - 1 && cells[at + 1] === 0 && cells[at + 1 - dy * W] !== 0)) { target = at; break; }
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
		const { cells, g: queue, state, from, base } = this;
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
				if (cells[n] !== 0) continue;

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
		const { cells, g, state, from, base, startCell, goalCell } = this;
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
				if (seen === closed || cells[n] !== 0 || (seen === base && next >= g[n])) continue;

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
	 * A* over a bucket queue (Dial) with costs from `cells` and the heuristic `hScale` x Manhattan distance, which is consistent: it drops
	 * by at most `hScale` per step and a step costs at least `hScale`. So F never decreases along the expansion order, an entry is pushed
	 * at F >= `fCurrent` (and at most `MAX_COST + hScale` past it, see `BUCKETS`), and a cell popped for the first time has its final cost.
	 * Entries are never removed: a cell reached again with a lower cost gets a new entry at a lower F, and the old one is skipped once
	 * the cell is closed. Within a bucket the last pushed entry goes first, which is deterministic and favors the deeper cell on equal F.
	 */
	private runWeighted(budget: number): Position[] | null | undefined {
		const window = this.searchWindow;
		const { width: W, height: H } = window;
		const { cells, g, state, from, base, startCell, goalCell, hScale, bucketHead } = this;
		const closed = base + 1;
		const goalX = goalCell % W;
		const goalY = (goalCell - goalX) / W;
		const sliceEnd = this.expanded + PathFinder.SLICE;
		let expanded = this.expanded;

		while (this.openCount > 0) {
			const slot = this.fCurrent & (PathFinder.BUCKETS - 1);
			const id = bucketHead[slot];
			if (id < 0) {
				this.fCurrent++;
				continue;
			}
			bucketHead[slot] = this.entryNext[id];
			this.openCount--;

			const cell = this.entryCell[id];
			if (state[cell] === closed) continue;
			if (cell === goalCell) return this.rebuild(window, startCell, goalCell);
			if (++expanded > budget) return null;

			state[cell] = closed;
			const x = cell % W;
			const y = (cell - x) / W;
			const cost = g[cell];

			for (let d = 0; d < 4; d++) {
				const nx = x + DX[d];
				const ny = y + DY[d];
				if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
				const n = ny * W + nx;
				const step = cells[n];
				const seen = state[n];
				const next = cost + step;
				if (seen === closed || step === 0 || (seen === base && next >= g[n])) continue;

				g[n] = next;
				state[n] = base;
				from[n] = d;
				this.pushBucket(n, next + hScale * (Math.abs(nx - goalX) + Math.abs(ny - goalY)));
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

	/** Opens an entry for `cell` at the head of the bucket of `f`. */
	private pushBucket(cell: number, f: number): void {
		if (this.entryCount === this.entryNext.length) {
			const size = Math.max(1024, this.entryNext.length * 2);
			this.entryCell = PathFinder.grown(this.entryCell, size);
			this.entryNext = PathFinder.grown(this.entryNext, size);
		}
		const id = this.entryCount++;
		const slot = f & (PathFinder.BUCKETS - 1);
		this.entryCell[id] = cell;
		this.entryNext[id] = this.bucketHead[slot];
		this.bucketHead[slot] = id;
		this.openCount++;
	}

	private growEntries(): void {
		const size = Math.max(1024, this.entryF.length * 2);
		this.entryF = PathFinder.grown(this.entryF, size);
		this.entryH = PathFinder.grown(this.entryH, size);
		this.entryCell = PathFinder.grown(this.entryCell, size);
		this.heap = PathFinder.grown(this.heap, size);
	}

	/** The array itself when it already holds `size` entries: the weighted search grows `entryCell` on its own, ahead of the A* arrays. */
	private static grown(old: Int32Array<ArrayBuffer>, size: number): Int32Array<ArrayBuffer> {
		if (old.length >= size) return old;
		const bigger = new Int32Array(size);
		bigger.set(old);
		return bigger;
	}
}

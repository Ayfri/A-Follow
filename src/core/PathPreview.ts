import type { Camera } from './Camera';
import { GridSync } from './GridSync';
import { PathFinder } from './PathFinder';
import type { FindRequest, FindResult, GenerateRequest, Generation, WorkerResponse } from './pathMessages';
import type { Player } from './Player';
import type { CellRect, Position, WallGrid } from './WallGrid';

/**
 * Path from the player to the target cell, recomputed only when the target cell, the walls or the snap option change.
 * A nearby target is answered on the spot by a small search; the others go to a worker that searches the whole window
 * and keeps only the newest request, while the player keeps walking its current path.
 * The same worker builds mazes and random grids (`generate`), so a fill never blocks the page: the cells come back and are written here.
 */
export class PathPreview {
	private readonly grid: WallGrid;
	private readonly finder = new PathFinder();
	private readonly worker = new Worker(new URL('./pathWorker.ts', import.meta.url), { type: 'module' });
	private readonly sync: GridSync;
	private target: Position | null = null;
	private revision = -1;
	private snap = false;
	private lastId = 0;
	/** Id of the only request whose result is still wanted, or null. */
	private pendingId: number | null = null;
	/** Result received since the last update, applied there so the player only changes inside a frame. */
	private arrived: FindResult | null = null;
	/** Where the pending request starts: the player's cell then, and its index on the path it was walking. */
	private requestStart: Position = { x: 0, y: 0 };
	private requestIndex = 0;
	/** The only fill whose result is still wanted, with the function that settles its promise. */
	private generation: { id: number; settle: () => void } | null = null;

	/** Takes over `grid.observer`: the worker's mirror of the walls is fed from it. */
	constructor(grid: WallGrid) {
		this.grid = grid;
		this.sync = new GridSync((message, transfer) => this.worker.postMessage(message, transfer));
		grid.observer = this.sync;
		this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			if (message.type === 'path') {
				this.arrived = message;
				return;
			}
			const pending = this.generation;
			if (pending === null || pending.id !== message.id) return;
			this.generation = null;
			this.grid.writeRect(message.rect, message.cells);
			pending.settle();
		});
	}

	/** Replaces `rect` with a generated maze or random grid: resolves once the worker's cells are written, or when `cancelGeneration` drops them. */
	generate(rect: CellRect, generation: Generation): Promise<void> {
		this.cancelGeneration();
		const { promise, resolve } = Promise.withResolvers<void>();
		const id = ++this.lastId;
		this.generation = { id, settle: resolve };
		const request: GenerateRequest = { type: 'generate', id, rect: { ...rect }, generation };
		this.worker.postMessage(request);
		return promise;
	}

	/** Drops the pending fill: its cells are ignored when they arrive. */
	cancelGeneration(): void {
		this.generation?.settle();
		this.generation = null;
	}

	/**
	 * `hovered` is the cell under the cursor, or null when the cursor is away: the last target is kept, so a maze, a clear or the
	 * snap option changed from the sidebar still recompute the path. With `snap`, a wall target is replaced by the nearest open cell.
	 */
	update(player: Player, hovered: Position | null, view: CellRect, snap: boolean): void {
		this.sync.flush();
		this.receive(player);

		const target = hovered ?? this.target;
		if (target === null) return;

		if (
			this.target !== null && this.target.x === target.x && this.target.y === target.y &&
			this.revision === this.grid.revision && this.snap === snap
		) return;

		this.target = target;
		this.revision = this.grid.revision;
		this.snap = snap;

		const start = player.getPosition();
		const window = PathFinder.window(view, start, target);
		const near = window && this.finder.findNear(this.grid, start, target, window, snap);
		if (window === null || near !== null) {
			this.pendingId = null;
			player.setPath(PathFinder.pack(near ?? []));
			return;
		}

		this.pendingId = ++this.lastId;
		this.requestStart = start;
		this.requestIndex = player.getPathIndex();
		const request: FindRequest = { type: 'find', id: this.pendingId, revision: this.revision, start, target, window, snap };
		this.worker.postMessage(request);
	}

	/**
	 * A result is dropped when a newer request was sent since. Otherwise it starts where the player was at the request, and the player
	 * has walked on its old path since (nothing else changes the player's path while a request is pending). It rejoins the new path at the
	 * last cell of that walk the path goes through, backtracking when it already left the new path: waiting for it to come back by
	 * itself never ends when the old path leads away from the new one.
	 */
	private receive(player: Player): void {
		const result = this.arrived;
		if (result === null) return;
		this.arrived = null;
		if (result.id !== this.pendingId) return;
		this.pendingId = null;

		const { path } = result;
		if (path === null) {
			player.setPath(new Int32Array(0));
			return;
		}

		const { x: startX, y: startY } = this.requestStart;
		const walkedAfterStart = player.getPath().subarray(2 * (this.requestIndex + 1), 2 * (player.getPathIndex() + 1));
		const count = 1 + (walkedAfterStart.length >> 1);
		const walked = new Int32Array(2 * count);
		walked[0] = startX;
		walked[1] = startY;
		walked.set(walkedAfterStart, 2);

		/** The walk is a connected route from its first cell, so its cells lie within `count` of it and get an exact integer key. */
		const side = 2 * count + 1;
		const walkedIndex = new Map<number, number>();
		for (let i = 0; i < count; i++) walkedIndex.set((walked[2 * i] - startX + count) * side + walked[2 * i + 1] - startY + count, i);

		let rejoin = 0;
		let pathIndex = 0;
		for (let i = 0; i < path.length; i += 2) {
			const dx = path[i] - startX + count;
			const dy = path[i + 1] - startY + count;
			if (dx < 0 || dx >= side || dy < 0 || dy >= side) continue;
			const index = walkedIndex.get(dx * side + dy);
			if (index !== undefined && index >= rejoin) {
				rejoin = index;
				pathIndex = i >> 1;
			}
		}

		const back = count - rejoin;
		const joined = new Int32Array(2 * back + path.length - 2 * (pathIndex + 1));
		for (let i = 0; i < back; i++) {
			joined[2 * i] = walked[2 * (count - 1 - i)];
			joined[2 * i + 1] = walked[2 * (count - 1 - i) + 1];
		}
		joined.set(path.subarray(2 * (pathIndex + 1)), 2 * back);
		player.setPath(joined);
	}

	/** Draws the cells still ahead of the player, skipping the ones off screen. */
	draw(ctx: CanvasRenderingContext2D, camera: Camera, player: Player, color: string): void {
		const path = player.getPath();
		const first = player.getPathIndex() + 1;
		const count = path.length >> 1;
		if (first >= count) return;

		const view = camera.visibleRect();
		const { scale, offsetX, offsetY } = camera;
		let lastLeft = Number.NaN;
		let lastTop = Number.NaN;
		/** Rect not yet drawn: a cell that continues it in a straight line extends it instead of adding a rect (a 270k-cell maze path: 120k rects instead of 203k). */
		let rx = 0;
		let ry = 0;
		let rw = 0;
		let rh = 0;

		ctx.save();
		ctx.fillStyle = color;
		ctx.beginPath();
		for (let i = first; i < count; i++) {
			const x = path[2 * i];
			const y = path[2 * i + 1];
			if (x < view.x || x >= view.x + view.width || y < view.y || y >= view.y + view.height) continue;

			/** Edges are rounded like the walls. Zoomed out, consecutive cells on the same pixel add nothing, so they are skipped. */
			const left = Math.round((x - offsetX) * scale);
			const top = Math.round((y - offsetY) * scale);
			if (left === lastLeft && top === lastTop) continue;
			lastLeft = left;
			lastTop = top;
			const width = Math.max(Math.round((x + 1 - offsetX) * scale) - left, 1);
			const height = Math.max(Math.round((y + 1 - offsetY) * scale) - top, 1);
			if (rw > 0) {
				if (top === ry && height === rh && left === rx + rw) { rw += width; continue; }
				if (left === rx && width === rw && top === ry + rh) { rh += height; continue; }
				ctx.rect(rx, ry, rw, rh);
			}
			rx = left;
			ry = top;
			rw = width;
			rh = height;
		}
		if (rw > 0) ctx.rect(rx, ry, rw, rh);
		ctx.fill();
		ctx.restore();
	}
}

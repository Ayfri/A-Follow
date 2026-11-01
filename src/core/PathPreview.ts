import type { Camera } from './Camera';
import { PathFinder } from './PathFinder';
import type { Player } from './Player';
import type { CellRect, Position, WallGrid } from './WallGrid';

/** Path from the player to the target cell, recomputed only when the target cell, the walls or the snap option change. */
export class PathPreview {
	private readonly finder = new PathFinder();
	private target: Position | null = null;
	private revision = -1;
	private snap = false;

	/**
	 * `hovered` is the cell under the cursor, or null when the cursor is away: the last target is kept, so a maze, a clear or the
	 * snap option changed from the sidebar still recompute the path. With `snap`, a wall target is replaced by the nearest open cell.
	 */
	update(grid: WallGrid, player: Player, hovered: Position | null, view: CellRect, snap: boolean): void {
		const target = hovered ?? this.target;
		if (target === null) return;

		if (
			this.target !== null && this.target.x === target.x && this.target.y === target.y &&
			this.revision === grid.revision && this.snap === snap
		) return;

		this.target = target;
		this.revision = grid.revision;
		this.snap = snap;

		const start = player.getPosition();
		const window = PathFinder.window(view, start, target);
		player.setPath((window && this.finder.find(grid, start, target, window, snap)) ?? []);
	}

	/** Draws the cells still ahead of the player, skipping the ones off screen. */
	draw(ctx: CanvasRenderingContext2D, camera: Camera, player: Player, color: string): void {
		const path = player.getPath();
		const first = player.getPathIndex() + 1;
		if (first >= path.length) return;

		const view = camera.visibleRect();
		const { scale, offsetX, offsetY } = camera;
		let lastLeft = Number.NaN;
		let lastTop = Number.NaN;

		ctx.save();
		ctx.fillStyle = color;
		ctx.beginPath();
		for (let i = first; i < path.length; i++) {
			const { x, y } = path[i];
			if (x < view.x || x >= view.x + view.width || y < view.y || y >= view.y + view.height) continue;

			/** Edges are rounded like the walls. Zoomed out, consecutive cells on the same pixel add nothing, so they are skipped. */
			const left = Math.round((x - offsetX) * scale);
			const top = Math.round((y - offsetY) * scale);
			if (left === lastLeft && top === lastTop) continue;
			lastLeft = left;
			lastTop = top;
			const width = Math.max(Math.round((x + 1 - offsetX) * scale) - left, 1);
			const height = Math.max(Math.round((y + 1 - offsetY) * scale) - top, 1);
			ctx.rect(left, top, width, height);
		}
		ctx.fill();
		ctx.restore();
	}
}

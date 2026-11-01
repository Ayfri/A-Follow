import type p5 from 'p5';
import { aStar } from './aStar';
import type { Grid, Position } from './Grid';
import type { Player } from './Player';

/** Path from the player to the mouse cell, recomputed only when the target or the grid changes. */
export class PathPreview {
	private path: Position[] = [];
	private lastSuccessfulPath: Position[] = [];
	private lastValidTarget: Position = { x: -1, y: -1 };
	private lastTarget: Position = { x: -1, y: -1 };
	private dirty = true;

	invalidate(): void {
		this.dirty = true;
	}

	/** With `snap`, an untraversable target is replaced by the nearest traversable cell. */
	update(grid: Grid, player: Player, target: Position, snap: boolean): void {
		if (!this.dirty && target.x === this.lastTarget.x && target.y === this.lastTarget.y) return;

		let goal = target;
		if (snap && !grid.isCellTraversable(target.x, target.y)) {
			goal = grid.findNearest(target.x, target.y, (cx, cy) => grid.isCellTraversable(cx, cy)) ?? target;
		}

		const newPath = aStar(player.getPosition(), goal, grid);

		if (newPath === null) {
			if (this.lastValidTarget.x === goal.x && this.lastValidTarget.y === goal.y && this.lastSuccessfulPath.length > 0) {
				this.path = this.lastSuccessfulPath;
			} else {
				this.path = [];
				player.setPath([]);
			}
		} else {
			this.path = newPath;
			player.setPath(newPath);
			this.lastSuccessfulPath = [...newPath];
			this.lastValidTarget = { ...goal };
		}

		this.lastTarget = { ...target };
		this.dirty = false;
	}

	draw(p: p5, grid: Grid, color: string, playerPos: Position): void {
		if (this.path.length === 0) return;

		p.fill(color);
		p.noStroke();
		const start = this.path.findIndex((cell) => cell.x === playerPos.x && cell.y === playerPos.y) + 1;
		const cs = grid.getCellSize();
		for (let i = start; i < this.path.length; i++) {
			const px = grid.getPixelFromCell(this.path[i].x, this.path[i].y);
			p.rect(px.x, px.y, cs, cs);
		}
	}
}

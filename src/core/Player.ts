import type p5 from 'p5';
import type { Camera } from './Camera';
import { CellType, COST } from './CellType';
import type { Position, WallGrid } from './WallGrid';

export class Player {
	private x = 0;
	private y = 0;
	private speed: number;
	private lastMoveTime = 0;
	/** (x, y) pairs: a path of 250k cells would cost ~50 ms to turn into objects. */
	private path: Int32Array = new Int32Array(0);
	private currentPathIndex = 0;

	constructor(speed: number) {
		this.speed = speed;
	}

	getPosition(): Position { return { x: this.x, y: this.y }; }

	getPath(): Int32Array { return this.path; }

	getPathIndex(): number { return this.currentPathIndex; }

	setPath(newPath: Int32Array): void {
		this.path = newPath;
		this.currentPathIndex = 0;
	}

	/** Moves the player to a cell and drops its path. */
	place(x: number, y: number): void {
		this.x = x;
		this.y = y;
		this.setPath(new Int32Array(0));
	}

	/** Keeps the first `count` cells of the path (more than the player's index, which stays valid). */
	truncate(count: number): void {
		this.path = this.path.subarray(0, 2 * count);
	}

	/**
	 * Entering a cell takes `1000 * COST[type] / (COST[GROUND] * speed)` ms, so the speed is in cells per second on open ground and a
	 * highway is 4x faster. Time not spent on a step carries over to the next frame.
	 */
	update(p: p5, grid: WallGrid): void {
		const last = (this.path.length >> 1) - 1;
		if (last >= 0 && this.currentPathIndex < last) {
			const now = p.millis();
			let elapsed = now - this.lastMoveTime;
			let index = this.currentPathIndex;
			const msPerCost = 1000 / (COST[CellType.GROUND] * this.speed);

			while (index < last) {
				/** A wall drawn on the path after the search (cost 0) is walked at the cheapest pace until the path is cut. */
				const interval = Math.max(1, COST[grid.typeAt(this.path[2 * index + 2], this.path[2 * index + 3])]) * msPerCost;
				if (elapsed < interval) break;
				elapsed -= interval;
				index++;
			}

			if (index !== this.currentPathIndex) {
				this.currentPathIndex = index;
				this.x = this.path[2 * index];
				this.y = this.path[2 * index + 1];
				this.lastMoveTime = now - elapsed;
			}
		} else {
			this.lastMoveTime = p.millis();
		}
	}

	draw(p: p5, camera: Camera, playerColor: string): void {
		const { scale, offsetX, offsetY } = camera;
		/** Centered on the cell's pixel rect, rounded like the walls, so the player never sits off the grid at fractional zoom. */
		const centerX = (Math.round((this.x - offsetX) * scale) + Math.round((this.x + 1 - offsetX) * scale)) / 2;
		const centerY = (Math.round((this.y - offsetY) * scale) + Math.round((this.y + 1 - offsetY) * scale)) / 2;
		const size = Math.max(scale, 4);

		p.fill(playerColor);
		p.noStroke();
		p.ellipse(centerX, centerY, size, size);
	}

	setSpeed(speed: number): void { this.speed = speed; }
	getSpeed(): number { return this.speed; }
}

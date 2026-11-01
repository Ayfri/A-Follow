import type p5 from 'p5';
import type { Camera } from './Camera';
import type { Position } from './WallGrid';

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

	update(p: p5): void {
		const last = (this.path.length >> 1) - 1;
		if (last >= 0 && this.currentPathIndex < last) {
			const now = p.millis();
			const elapsed = now - this.lastMoveTime;
			const moveInterval = 1000 / this.speed;
			const steps = Math.floor(elapsed / moveInterval);

			if (steps > 0) {
				this.currentPathIndex = Math.min(this.currentPathIndex + steps, last);
				this.x = this.path[2 * this.currentPathIndex];
				this.y = this.path[2 * this.currentPathIndex + 1];
				this.lastMoveTime = now - (elapsed % moveInterval);
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

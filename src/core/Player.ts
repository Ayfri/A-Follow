import type p5 from 'p5';
import type { Camera } from './Camera';
import type { Position } from './WallGrid';

export class Player {
	private x = 0;
	private y = 0;
	private speed: number;
	private lastMoveTime = 0;
	private path: readonly Position[] = [];
	private currentPathIndex = 0;

	constructor(speed = 8) {
		this.speed = speed;
	}

	getPosition(): Position { return { x: this.x, y: this.y }; }

	getPath(): readonly Position[] { return this.path; }

	getPathIndex(): number { return this.currentPathIndex; }

	setPath(newPath: readonly Position[]): void {
		this.path = newPath;
		this.currentPathIndex = 0;
	}

	update(p: p5): void {
		if (this.path.length > 0 && this.currentPathIndex < this.path.length - 1) {
			const now = p.millis();
			const elapsed = now - this.lastMoveTime;
			const moveInterval = 1000 / this.speed;
			const steps = Math.floor(elapsed / moveInterval);

			if (steps > 0) {
				this.currentPathIndex = Math.min(this.currentPathIndex + steps, this.path.length - 1);
				this.x = this.path[this.currentPathIndex].x;
				this.y = this.path[this.currentPathIndex].y;
				this.lastMoveTime = now - (elapsed % moveInterval);
			}
		} else {
			this.lastMoveTime = p.millis();
		}
	}

	draw(p: p5, camera: Camera, playerColor: string): void {
		const center = camera.cellToScreen(this.x + 0.5, this.y + 0.5);
		const size = Math.max(camera.scale, 4);

		p.fill(playerColor);
		p.noStroke();
		p.ellipse(center.x, center.y, size, size);
	}

	setSpeed(speed: number): void { this.speed = speed; }
	getSpeed(): number { return this.speed; }
}

import type p5 from 'p5';
import type { Grid, Position } from './Grid';

export class Player {
	private x = 0;
	private y = 0;
	private speed: number;
	private lastMoveTime = 0;
	private path: Position[] = [];
	private currentPathIndex = 0;

	constructor(speed = 8) {
		this.speed = speed;
	}

	init(grid: Grid): void {
		this.x = Math.floor(grid.width  / 2);
		this.y = Math.floor(grid.height / 2);
		this.lastMoveTime = 0;
		this.path = [];
		this.currentPathIndex = 0;
	}

	getPosition(): Position { return { x: this.x, y: this.y }; }

	setPosition(x: number, y: number): void {
		this.x = x;
		this.y = y;
		this.path = [];
		this.currentPathIndex = 0;
	}

	setPath(newPath: Position[]): void {
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

	draw(p: p5, grid: Grid, playerColor: string): void {
		const center = grid.getCenterPixelFromCell(this.x, this.y);
		const size = grid.getCellSize();

		p.fill(playerColor);
		p.noStroke();
		p.ellipse(center.x, center.y, size, size);
	}

	setSpeed(speed: number): void { this.speed = speed; }
	getSpeed(): number { return this.speed; }
}

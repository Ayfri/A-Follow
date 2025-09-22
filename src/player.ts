import type { Position } from './path';
import type { Grid } from './grid';
import type p5 from 'p5';

export class Player {
	private x: number = 0; // in cells
	private y: number = 0; // in cells
	private speed: number = 5; // cells per second
	private lastMoveTime: number = 0;
	private path: Position[] = [];

	constructor(speed: number = 5) {
		this.speed = speed;
	}

	init(grid: Grid): void {
		this.x = Math.floor(grid.width / 2);
		this.y = Math.floor(grid.height / 2);
		this.lastMoveTime = 0;
		this.path = [];
	}

	getPosition(): Position {
		return { x: this.x, y: this.y };
	}

	setPath(newPath: Position[]): void {
		this.path = newPath;
	}

	update(p: p5): void {
		// Move along path
		if (this.path.length > 1) {
			const now = p.millis();
			const timeSinceLastMove = now - this.lastMoveTime;
			const moveInterval = 1000 / this.speed; // milliseconds per cell

			if (timeSinceLastMove >= moveInterval) {
				// Move to next cell in path
				this.x = this.path[1].x;
				this.y = this.path[1].y;
				this.lastMoveTime = now;
			}
		} else {
			this.lastMoveTime = p.millis();
		}
	}

	draw(p: p5, grid: Grid, playerColor?: string): void {
		p.fill(playerColor || '#ffffff');
		p.noStroke();
		const centerPos = grid.getCenterPixelFromCell(this.x, this.y);
		const cellSize = grid.getCellSize();
		p.ellipse(centerPos.x, centerPos.y, cellSize, cellSize);
	}

	setSpeed(speed: number): void {
		this.speed = speed;
	}

	getSpeed(): number {
		return this.speed;
	}
}
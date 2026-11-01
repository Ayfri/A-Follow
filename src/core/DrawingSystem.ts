import type p5 from 'p5';
import type { Grid, Position } from './Grid';
import { type Terrain, TerrainType } from './TerrainType';

export class DrawingSystem {
	private prevMouseXCell = -1;
	private prevMouseYCell = -1;
	private startMouseXCell = -1;
	private startMouseYCell = -1;
	private lockedAxis: 'horizontal' | 'vertical' | null = null;
	private isDragging = false;
	private grid: Grid;
	private hasChangedGrid = false;

	constructor(grid: Grid) {
		this.grid = grid;
	}

	hasGridChanged(): boolean { return this.hasChangedGrid; }
	resetGridChanged(): void  { this.hasChangedGrid = false; }

	private drawLine(x0: number, y0: number, x1: number, y1: number, value: Terrain): void {
		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;
		let x = x0, y = y0;

		while (true) {
			this.grid.setCell(x, y, value);
			if (x === x1 && y === y1) break;
			const e2 = 2 * err;
			if (e2 > -dy) { err -= dy; x += sx; }
			if (e2 <  dx) { err += dx; y += sy; }
		}
	}

	private constrainStraight(
		startX: number, startY: number, curX: number, curY: number
	): Position {
		if (this.lockedAxis === 'horizontal') return { x: curX, y: startY };
		if (this.lockedAxis === 'vertical')   return { x: startX, y: curY };

		const ddx = Math.abs(curX - startX);
		const ddy = Math.abs(curY - startY);
		if (ddx > 0 || ddy > 0) {
			if (ddx >= ddy) { this.lockedAxis = 'horizontal'; return { x: curX, y: startY }; }
			else            { this.lockedAxis = 'vertical';   return { x: startX, y: curY }; }
		}
		return { x: curX, y: curY };
	}

	private getCell(p: p5): Position {
		return this.grid.getCellFromPixel(p.mouseX, p.mouseY);
	}

	handleMousePressed(p: p5): void {
		const cell = this.getCell(p);
		this.isDragging = true;
		this.prevMouseXCell = cell.x;
		this.prevMouseYCell = cell.y;
		this.startMouseXCell = cell.x;
		this.startMouseYCell = cell.y;
		this.lockedAxis = null;

		const val = this.paintValue(p);
		if (val === null) return;
		this.grid.setCell(cell.x, cell.y, val);
		this.hasChangedGrid = true;
	}

	/** Left paints, right erases, other buttons (middle, back, forward) paint nothing. */
	private paintValue(p: p5): Terrain | null {
		if (p.mouseButton.left) return TerrainType.WALL;
		if (p.mouseButton.right) return TerrainType.EMPTY;
		return null;
	}

	handleMouseDragged(p: p5, shiftPressed = false): void {
		let cell = this.getCell(p);

		if (shiftPressed && this.startMouseXCell !== -1) {
			cell = this.constrainStraight(this.startMouseXCell, this.startMouseYCell, cell.x, cell.y);
		} else {
			this.lockedAxis = null;
		}

		const val = this.paintValue(p);
		if (val !== null && this.isDragging && this.prevMouseXCell !== -1 &&
			(this.prevMouseXCell !== cell.x || this.prevMouseYCell !== cell.y)) {
			this.drawLine(this.prevMouseXCell, this.prevMouseYCell, cell.x, cell.y, val);
			this.hasChangedGrid = true;
		}

		this.prevMouseXCell = cell.x;
		this.prevMouseYCell = cell.y;
	}

	handleMouseReleased(): void {
		this.isDragging = false;
		this.prevMouseXCell = this.prevMouseYCell = -1;
		this.startMouseXCell = this.startMouseYCell = -1;
		this.lockedAxis = null;
	}
}

import type p5 from 'p5';
import type { Grid } from './grid';

export class DrawingSystem {
	private prevMouseXCell = -1;
	private prevMouseYCell = -1;
	private isDragging = false;
	private grid: Grid;

	constructor(grid: Grid) {
		this.grid = grid;
	}

	// Function to draw a line between two cells using Bresenham's algorithm
	private drawLineBetweenCells(x0: number, y0: number, x1: number, y1: number, cellValue: number): void {
		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;
		
		let x = x0;
		let y = y0;
		
		const drawnCells = new Set<string>();
		
		while (true) {
			const cellKey = `${x},${y}`;
			if (!drawnCells.has(cellKey)) {
				this.grid.setCell(x, y, cellValue);
				drawnCells.add(cellKey);
			}
			
			if (x === x1 && y === y1) break;
			
			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x += sx;
			}
			if (e2 < dx) {
				err += dx;
				y += sy;
			}
		}
	}

	handleMousePressed(p: p5): void {
		const cell = this.grid.getCellFromPixel(p.mouseX, p.mouseY);
		
		this.isDragging = true;
		this.prevMouseXCell = cell.x;
		this.prevMouseYCell = cell.y;
		
		// Draw the initial cell
		if (p.mouseButton.left) {
			this.grid.setCell(cell.x, cell.y, 1); // Draw wall
		} else if (p.mouseButton.right) {
			this.grid.setCell(cell.x, cell.y, 0); // Erase wall
		}
	}

	handleMouseDragged(p: p5): void {
		const cell = this.grid.getCellFromPixel(p.mouseX, p.mouseY);
		
		// Only draw if we have a valid previous position and current position is different
		if (this.isDragging && 
			this.prevMouseXCell !== -1 && 
			this.prevMouseYCell !== -1 && 
			(this.prevMouseXCell !== cell.x || this.prevMouseYCell !== cell.y)) {
			
			if (p.mouseButton.left) {
				this.drawLineBetweenCells(this.prevMouseXCell, this.prevMouseYCell, cell.x, cell.y, 1); // Draw wall
			} else if (p.mouseButton.right) {
				this.drawLineBetweenCells(this.prevMouseXCell, this.prevMouseYCell, cell.x, cell.y, 0); // Erase wall
			}
		}
		
		// Update previous position for next drag
		this.prevMouseXCell = cell.x;
		this.prevMouseYCell = cell.y;
	}

	handleMouseReleased(): void {
		this.isDragging = false;
		this.prevMouseXCell = -1;
		this.prevMouseYCell = -1;
	}

	isDrawing(): boolean {
		return this.isDragging;
	}
}
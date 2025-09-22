import type p5 from 'p5';
import type { Grid } from './grid';

export class DrawingSystem {
	private prevMouseXCell = -1;
	private prevMouseYCell = -1;
	private startMouseXCell = -1;
	private startMouseYCell = -1;
	private lockedAxis: 'horizontal' | 'vertical' | null = null;
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

	// Function to constrain coordinates to straight lines when shift is pressed
	private constrainToStraightLine(startX: number, startY: number, currentX: number, currentY: number): { x: number; y: number } {
		// If axis is already locked, use it
		if (this.lockedAxis === 'horizontal') {
			return { x: currentX, y: startY };
		} else if (this.lockedAxis === 'vertical') {
			return { x: startX, y: currentY };
		}
		
		// If no axis is locked yet, determine and lock the axis based on initial movement
		const deltaX = Math.abs(currentX - startX);
		const deltaY = Math.abs(currentY - startY);
		
		// Only lock axis if there's some movement (avoid locking on tiny movements)
		if (deltaX > 0 || deltaY > 0) {
			if (deltaX > deltaY) {
				// Lock to horizontal line
				this.lockedAxis = 'horizontal';
				return { x: currentX, y: startY };
			} else {
				// Lock to vertical line
				this.lockedAxis = 'vertical';
				return { x: startX, y: currentY };
			}
		}
		
		// No movement yet, return current position
		return { x: currentX, y: currentY };
	}

	handleMousePressed(p: p5): void {
		const cell = this.grid.getCellFromPixel(p.mouseX, p.mouseY);
		
		this.isDragging = true;
		this.prevMouseXCell = cell.x;
		this.prevMouseYCell = cell.y;
		this.startMouseXCell = cell.x;
		this.startMouseYCell = cell.y;
		this.lockedAxis = null;

		// Draw the initial cell
		if (p.mouseButton.left) {
			this.grid.setCell(cell.x, cell.y, 1); // Draw wall
		} else if (p.mouseButton.right) {
			this.grid.setCell(cell.x, cell.y, 0); // Erase wall
		}
	}

	handleMouseDragged(p: p5, isShiftPressed: boolean = false): void {
		let cell = this.grid.getCellFromPixel(p.mouseX, p.mouseY);
		
		// If shift is pressed, constrain to straight line from start position
		if (isShiftPressed && this.startMouseXCell !== -1 && this.startMouseYCell !== -1) {
			const constrainedPos = this.constrainToStraightLine(
				this.startMouseXCell, 
				this.startMouseYCell, 
				cell.x, 
				cell.y
			);
			cell = constrainedPos;
		} else {
			// If shift is not pressed, reset the locked axis to allow free drawing
			this.lockedAxis = null;
		}
		
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
		this.startMouseXCell = -1;
		this.startMouseYCell = -1;
		this.lockedAxis = null;
	}

	isDrawing(): boolean {
		return this.isDragging;
	}
}
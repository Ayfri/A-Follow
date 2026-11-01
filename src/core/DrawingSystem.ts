import type { Position, WallGrid } from './WallGrid';

interface Stroke {
	start: Position;
	prev: Position;
	wall: boolean;
	axis: 'horizontal' | 'vertical' | null;
}

export class DrawingSystem {
	private stroke: Stroke | null = null;
	private readonly grid: WallGrid;

	constructor(grid: WallGrid) {
		this.grid = grid;
	}

	begin(cell: Position, wall: boolean): void {
		this.stroke = { start: cell, prev: cell, wall, axis: null };
		this.grid.setWall(cell.x, cell.y, wall);
	}

	/** `straight` locks the stroke to the axis it first moves along, measured from where it began. */
	drag(cell: Position, straight: boolean): void {
		const stroke = this.stroke;
		if (stroke === null) return;

		let target = cell;
		if (straight) target = this.constrain(stroke, cell);
		else stroke.axis = null;

		if (stroke.prev.x !== target.x || stroke.prev.y !== target.y) {
			this.drawLine(stroke.prev, target, stroke.wall);
		}
		stroke.prev = target;
	}

	end(): void {
		this.stroke = null;
	}

	private drawLine(from: Position, to: Position, wall: boolean): void {
		const dx = Math.abs(to.x - from.x);
		const dy = Math.abs(to.y - from.y);
		const sx = from.x < to.x ? 1 : -1;
		const sy = from.y < to.y ? 1 : -1;
		let err = dx - dy;
		let x = from.x, y = from.y;

		while (true) {
			this.grid.setWall(x, y, wall);
			if (x === to.x && y === to.y) break;
			const e2 = 2 * err;
			if (e2 > -dy) { err -= dy; x += sx; }
			if (e2 <  dx) { err += dx; y += sy; }
		}
	}

	private constrain(stroke: Stroke, cell: Position): Position {
		const { start } = stroke;
		if (stroke.axis === 'horizontal') return { x: cell.x, y: start.y };
		if (stroke.axis === 'vertical')   return { x: start.x, y: cell.y };

		const ddx = Math.abs(cell.x - start.x);
		const ddy = Math.abs(cell.y - start.y);
		if (ddx > 0 || ddy > 0) {
			if (ddx >= ddy) { stroke.axis = 'horizontal'; return { x: cell.x, y: start.y }; }
			stroke.axis = 'vertical';
			return { x: start.x, y: cell.y };
		}
		return cell;
	}
}

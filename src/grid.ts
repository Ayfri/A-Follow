import type p5 from 'p5';

export class Grid {
	private grid: number[][] = [];
	private cellSize: number;
	public width: number = 0; // in cells
	public height: number = 0; // in cells
	private isDirty: boolean = true;
	private activeCells: { x: number; y: number }[] = [];
	// Offscreen layer to batch draw active cells efficiently
	private cellsLayer?: p5.Graphics;
	private layerDirty: boolean = true;
	private cachedActiveColor?: string;
	private cachedLayerSize?: { w: number; h: number };

	constructor(cellSize: number = 20) {
		this.cellSize = cellSize;
	}

	init(canvasWidth: number, canvasHeight: number): void {
		this.width = Math.floor(canvasWidth / this.cellSize);
		this.height = Math.floor(canvasHeight / this.cellSize);
		
		this.grid = [];
		for (let y = 0; y < this.height; y++) {
			this.grid[y] = [];
			for (let x = 0; x < this.width; x++) {
				this.grid[y][x] = 0;
			}
		}
		this.markDirty();
	}

	getCell(x: number, y: number): number {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 1; // Out of bounds = wall
		return this.grid[y][x];
	}

	setCell(x: number, y: number, value: number): void {
		if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
			if (this.grid[y][x] !== value) {
				this.grid[y][x] = value;
				this.markDirty();
			}
		}
	}

	private markDirty(): void {
		this.isDirty = true;      // activeCells list needs recompute
		this.layerDirty = true;   // offscreen layer needs redraw
	}

	private updateActiveCells(): void {
		if (!this.isDirty) return;
		
		this.activeCells = [];
		for (let x = 0; x < this.width; x++) {
			for (let y = 0; y < this.height; y++) {
				if (this.getCell(x, y) === 1) {
					this.activeCells.push({ x, y });
				}
			}
		}
		this.isDirty = false;
	}

	getCellFromPixel(pixelX: number, pixelY: number): { x: number; y: number } {
		return {
			x: Math.floor(pixelX / this.cellSize),
			y: Math.floor(pixelY / this.cellSize)
		};
	}

	getPixelFromCell(cellX: number, cellY: number): { x: number; y: number } {
		return {
			x: cellX * this.cellSize,
			y: cellY * this.cellSize
		};
	}

	getCenterPixelFromCell(cellX: number, cellY: number): { x: number; y: number } {
		return {
			x: cellX * this.cellSize + this.cellSize / 2,
			y: cellY * this.cellSize + this.cellSize / 2
		};
	}

	getVisibleCells(canvasWidth: number, canvasHeight: number): { minX: number; maxX: number; minY: number; maxY: number } {
		return {
			minX: Math.max(0, 0),
			maxX: Math.min(this.width - 1, Math.ceil(canvasWidth / this.cellSize)),
			minY: Math.max(0, 0),
			maxY: Math.min(this.height - 1, Math.ceil(canvasHeight / this.cellSize))
		};
	}

	drawActiveCells(p: p5, activeCellColor?: string): void {
		this.updateActiveCells();

		const color = activeCellColor || '#0000ff';

		// Ensure offscreen layer exists and matches canvas size
		const needNewLayer = !this.cellsLayer ||
			!this.cachedLayerSize ||
			this.cachedLayerSize.w !== p.width ||
			this.cachedLayerSize.h !== p.height;

		if (needNewLayer) {
			this.cellsLayer = p.createGraphics(p.width, p.height);
			this.cachedLayerSize = { w: p.width, h: p.height };
			this.layerDirty = true; // force redraw on new layer
		}

		// Redraw offscreen layer only when necessary (grid changed, color changed, or layer recreated)
		if (this.layerDirty || this.cachedActiveColor !== color) {
			const g = this.cellsLayer!;
			// Clear layer
			// Use Canvas2D API to batch rects into a single fill for performance
			const ctx = (g as any).drawingContext as CanvasRenderingContext2D;
			ctx.clearRect(0, 0, g.width, g.height);
			ctx.fillStyle = color;
			ctx.beginPath();

			const visible = this.getVisibleCells(p.width, p.height);
			const size = this.cellSize;

			for (const cell of this.activeCells) {
				if (
					cell.x >= visible.minX && cell.x <= visible.maxX &&
					cell.y >= visible.minY && cell.y <= visible.maxY
				) {
					ctx.rect(cell.x * size, cell.y * size, size, size);
				}
			}

			ctx.fill();

			this.cachedActiveColor = color;
			this.layerDirty = false;
		}

		// Draw the pre-rendered layer in a single call
		p.image(this.cellsLayer!, 0, 0);
	}

	drawGrid(p: p5, gridColor?: string): void {
		const visible = this.getVisibleCells(p.width, p.height);
		
		p.noFill();
		p.stroke(gridColor || '#323232');
		
		// Draw vertical lines
		for (let x = visible.minX; x <= visible.maxX; x++) {
			const pixelX = x * this.cellSize;
			p.line(pixelX, visible.minY * this.cellSize, pixelX, (visible.maxY + 1) * this.cellSize);
		}
		
		// Draw horizontal lines
		for (let y = visible.minY; y <= visible.maxY; y++) {
			const pixelY = y * this.cellSize;
			p.line(visible.minX * this.cellSize, pixelY, (visible.maxX + 1) * this.cellSize, pixelY);
		}
	}

	draw(p: p5, activeCellColor?: string, gridColor?: string): void {
		this.drawActiveCells(p, activeCellColor);
		this.drawGrid(p, gridColor);
	}

	// Get raw grid data for pathfinding
	getRawData(): number[][] {
		return this.grid;
	}

	getCellSize(): number {
		return this.cellSize;
	}

	setCellSize(size: number): void {
		this.cellSize = size;
		this.markDirty(); // geometry changed, require redraw
	}

	generateRandomMaze(): void {
		// Initialize all cells as walls
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				this.grid[y][x] = 1;
			}
		}

		// Recursive backtracking algorithm
		const stack: { x: number; y: number }[] = [];
		const startX = 1;
		const startY = 1;

		// Start from a random position (must be odd to create proper corridors)
		const startPos = {
			x: startX % 2 === 0 ? startX + 1 : startX,
			y: startY % 2 === 0 ? startY + 1 : startY
		};

		this.grid[startPos.y][startPos.x] = 0; // Mark as path
		stack.push(startPos);

		while (stack.length > 0) {
			const current = stack[stack.length - 1];
			const neighbors = this.getUnvisitedNeighbors(current.x, current.y);

			if (neighbors.length > 0) {
				// Choose random neighbor
				const randomIndex = Math.floor(Math.random() * neighbors.length);
				const chosen = neighbors[randomIndex];

				// Remove wall between current and chosen
				const wallX = current.x + (chosen.x - current.x) / 2;
				const wallY = current.y + (chosen.y - current.y) / 2;
				this.grid[wallY][wallX] = 0;
				this.grid[chosen.y][chosen.x] = 0;

				stack.push(chosen);
			} else {
				stack.pop();
			}
		}
		this.markDirty();
	}

	generateRandomGrid(probability: number = 0.2): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				this.grid[y][x] = Math.random() < probability ? 1 : 0;
			}
		}
		this.markDirty();
	}

	private getUnvisitedNeighbors(x: number, y: number): { x: number; y: number }[] {
		const neighbors: { x: number; y: number }[] = [];
		const directions = [
			{ dx: 0, dy: -2 }, // Up
			{ dx: 2, dy: 0 },  // Right
			{ dx: 0, dy: 2 },  // Down
			{ dx: -2, dy: 0 }  // Left
		];

		for (const dir of directions) {
			const newX = x + dir.dx;
			const newY = y + dir.dy;

			if (newX > 0 && newX < this.width - 1 && newY > 0 && newY < this.height - 1) {
				if (this.grid[newY][newX] === 1) {
					neighbors.push({ x: newX, y: newY });
				}
			}
		}

		return neighbors;
	}
}
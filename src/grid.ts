import type p5 from 'p5';

export class Grid {
	private grid: number[][] = [];
	private cellSize: number;
	public width: number = 0; // in cells
	public height: number = 0; // in cells

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
	}

	getCell(x: number, y: number): number {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 1; // Out of bounds = wall
		return this.grid[y][x];
	}

	setCell(x: number, y: number, value: number): void {
		if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
			this.grid[y][x] = value;
		}
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

	draw(p: p5, activeCellColor?: string, gridColor?: string): void {
		// Draw grid borders
		p.noFill();
		p.stroke(gridColor || '#323232');
		for (let x = 0; x < this.width; x++) {
			for (let y = 0; y < this.height; y++) {
				p.rect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
			}
		}

		// Draw active cells (walls)
		p.fill(activeCellColor || '#0000ff');
		p.noStroke();
		for (let x = 0; x < this.width; x++) {
			for (let y = 0; y < this.height; y++) {
				if (this.getCell(x, y) === 1) {
					p.rect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
				}
			}
		}
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
	}
}
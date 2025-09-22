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

	drawActiveCells(p: p5, activeCellColor?: string): void {
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

	drawGrid(p: p5, gridColor?: string): void {
		// Draw grid borders
		p.noFill();
		p.stroke(gridColor || '#323232');
		for (let x = 0; x < this.width; x++) {
			for (let y = 0; y < this.height; y++) {
				p.rect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
			}
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
	}

	generateRandomGrid(probability: number = 0.2): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				this.grid[y][x] = Math.random() < probability ? 1 : 0;
			}
		}
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
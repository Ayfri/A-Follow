import { aStar, type Position } from './path';
import './style.css';
import p5 from 'p5';

let gridSize = 20; // in pixels
let gridWidth = 0; // in cells
let gridHeight = 0; // in cells
let grid: number[][] = []; // 2D array for simplicity

let xPosition = 0; // in cells
let yPosition = 0; // in cells
let selectedPath: Position[] = [];

let mouseXCell = -1;
let mouseYCell = -1;

function getCell(x: number, y: number): number {
	if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return 1; // Out of bounds = wall
	return grid[y][x];
}

function setCell(x: number, y: number, value: number): void {
	if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
		grid[y][x] = value;
	}
}

function initGrid(): void {
	grid = [];
	for (let y = 0; y < gridHeight; y++) {
		grid[y] = [];
		for (let x = 0; x < gridWidth; x++) {
			grid[y][x] = 0;
		}
	}
}

const sketch = (p: p5) => {
	p.setup = async () => {
		p.createCanvas(p.windowWidth, p.windowHeight);
		p.frameRate(60);

		gridWidth = Math.floor(p.width / gridSize);
		gridHeight = Math.floor(p.height / gridSize);

		initGrid();
		xPosition = Math.floor(gridWidth / 2);
		yPosition = Math.floor(gridHeight / 2);

		document.addEventListener('contextmenu', event => event.preventDefault());
	};

	p.draw = async () => {
		p.background(0);
		
		// Draw grid borders
		p.noFill();
		p.stroke(50);
		for (let x = 0; x < gridWidth; x++) {
			for (let y = 0; y < gridHeight; y++) {
				p.rect(x * gridSize, y * gridSize, gridSize, gridSize);
			}
		}

		// Draw moving ellipse
		p.fill(255);
		p.noStroke();
		p.ellipse(xPosition * gridSize + gridSize / 2, yPosition * gridSize + gridSize / 2, gridSize, gridSize);
		
		// Highlight selected path
		p.fill(0, 255, 0, 150);
		for (const pos of selectedPath) {
			p.rect(pos.x * gridSize, pos.y * gridSize, gridSize, gridSize);
		}

		// Highlight active cells
		p.fill(0, 0, 255, 150);
		for (let x = 0; x < gridWidth; x++) {
			for (let y = 0; y < gridHeight; y++) {
				if (getCell(x, y) === 1) {
					p.rect(x * gridSize, y * gridSize, gridSize, gridSize);
				}
			}
		}

		// Recalculate path every frame
		const newSelectedPath = aStar(
			{ x: xPosition, y: yPosition },
			{ x: mouseXCell, y: mouseYCell },
			grid,
			gridWidth,
			gridHeight
		);

		if (newSelectedPath === null) {
			selectedPath = [];
		} else {
			selectedPath = newSelectedPath;
		}
	};
	p.mouseMoved = () => {
		mouseXCell = Math.floor(p.mouseX / gridSize);
		mouseYCell = Math.floor(p.mouseY / gridSize);
	};
	
	p.mousePressed = () => {
		const cellX = Math.floor(p.mouseX / gridSize);
		const cellY = Math.floor(p.mouseY / gridSize);
		const currentState = getCell(cellX, cellY);
		setCell(cellX, cellY, currentState === 0 ? 1 : 0);
	};
	
	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
		gridWidth = Math.floor(p.width / gridSize);
		gridHeight = Math.floor(p.height / gridSize);
		initGrid();
		xPosition = Math.floor(gridWidth / 2);
		yPosition = Math.floor(gridHeight / 2);
	};
};

new p5(sketch);

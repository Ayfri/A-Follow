import { aStar, type Position } from './path';
import './style.css';
import p5 from 'p5';

type GridCell = {
	x: number;
	y: number;
	state: number; // 0 for inactive, 1 for active
};
let gridSize = 20; // in pixels
let gridWidth = 0; // in cells
let gridHeight = 0; // in cells
let grid: GridCell[] = []; // array to hold grid cell positions


let xPosition = 0; // in cells
let yPosition = 0; // in cells
let selectedPath: Position[] = [];


let mouseXCell = -1;
let mouseYCell = -1;

const sketch = (p: p5) => {
	p.setup = async () => {
		p.createCanvas(p.windowWidth, p.windowHeight);
		p.frameRate(60);

		gridWidth = Math.floor(p.width / gridSize);
		gridHeight = Math.floor(p.height / gridSize);

		for (let x = 0; x < p.width; x += gridSize) {
			for (let y = 0; y < p.height; y += gridSize) {
				grid.push({ x: x, y: y, state: 0 }); // Initialize all cells as inactive
			}
		}
		xPosition = Math.floor(gridWidth / 2);
		yPosition = Math.floor(gridHeight / 2);
	};

	p.draw = async () => {
		p.background(0);
		
		// Draw grid borders
		p.noFill();
		p.stroke(50);
		for (let i = 0; i < grid.length; i++) {
			p.rect(grid[i].x, grid[i].y, gridSize, gridSize);
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
		for (let i = 0; i < grid.length; i++) {
			if (grid[i].state === 1) {
				p.rect(grid[i].x, grid[i].y, gridSize, gridSize);
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
	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);

		gridWidth = Math.floor(p.width / gridSize);
		gridHeight = Math.floor(p.height / gridSize);
		grid = [];
		for (let x = 0; x < p.width; x += gridSize) {
			for (let y = 0; y < p.height; y += gridSize) {
				grid.push({ x: x, y: y, state: 0 }); // Initialize all cells as inactive
			}
		}
		xPosition = Math.floor(gridWidth / 2);
		yPosition = Math.floor(gridHeight / 2);
	};
};

new p5(sketch);

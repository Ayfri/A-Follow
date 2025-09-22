import { aStar, type Position } from './path';
import { Grid } from './grid';
import { Player } from './player';
import { Overlay } from './overlay';
import { Theme } from './Theme';
import './style.css';
import p5 from 'p5';

const grid = new Grid(20);
const player = new Player(5);
const theme = new Theme();

let selectedPath: Position[] = [];
let overlay: Overlay;

let mouseXCell = -1;
let mouseYCell = -1;

const sketch = (p: p5) => {
	p.setup = async () => {
		p.createCanvas(p.windowWidth, p.windowHeight);
		p.frameRate(60);

		grid.init(p.width, p.height);
		player.init(grid);

		// Create UI overlay
		overlay = new Overlay(p, player, grid, theme);
		overlay.init();

		document.addEventListener('contextmenu', event => event.preventDefault());
	};

	p.draw = async () => {
		const currentTheme = theme.getTheme();
		p.background(currentTheme.background);
		
		// Draw grid
		grid.draw(p, currentTheme.activeCell, currentTheme.grid);

		// Draw player
		player.draw(p, grid, currentTheme.player);
		
		// Highlight selected path
		p.fill(currentTheme.path);
		for (const pos of selectedPath) {
			const pixelPos = grid.getPixelFromCell(pos.x, pos.y);
			const cellSize = grid.getCellSize();
			p.rect(pixelPos.x, pixelPos.y, cellSize, cellSize);
		}

		// Recalculate path every frame
		const newSelectedPath = aStar(
			player.getPosition(),
			{ x: mouseXCell, y: mouseYCell },
			grid.getRawData(),
			grid.width,
			grid.height
		);

		if (newSelectedPath === null) {
			selectedPath = [];
			player.setPath([]);
		} else {
			selectedPath = newSelectedPath;
			player.setPath(newSelectedPath);
		}

		// Update player movement
		player.update(p);
	};
	p.mouseMoved = () => {
		const cell = grid.getCellFromPixel(p.mouseX, p.mouseY);
		mouseXCell = cell.x;
		mouseYCell = cell.y;
	};
	
	p.mouseDragged = () => {
		const cell = grid.getCellFromPixel(p.mouseX, p.mouseY);
		mouseXCell = cell.x;
		mouseYCell = cell.y;
		
		if (p.mouseButton.left) {
			grid.setCell(cell.x, cell.y, 1); // Draw wall
		} else if (p.mouseButton.right) {
			grid.setCell(cell.x, cell.y, 0); // Erase wall
		}
	};
	
	p.mousePressed = () => {
		const cell = grid.getCellFromPixel(p.mouseX, p.mouseY);
		
		if (p.mouseButton.left) {
			grid.setCell(cell.x, cell.y, 1); // Draw wall
		} else if (p.mouseButton.right) {
			grid.setCell(cell.x, cell.y, 0); // Erase wall
		}
	};
	
	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
		grid.init(p.width, p.height);
		player.init(grid);
	};
};

new p5(sketch);

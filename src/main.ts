import { aStar, type Position } from './path';
import { Grid } from './grid';
import { Player } from './player';
import { Overlay } from './overlay';
import { Theme } from './Theme';
import { DrawingSystem } from './draw';
import './style.css';
import p5 from 'p5';

const grid = new Grid(20);
const player = new Player(5);
const theme = new Theme();
const drawingSystem = new DrawingSystem(grid);

let selectedPath: Position[] = [];
let overlay: Overlay;

let mouseXCell = -1;
let mouseYCell = -1;
let lastMouseXCell = -1;
let lastMouseYCell = -1;
let needsPathRecalculation = true;
let lastSuccessfulPath: Position[] = [];
let lastValidTarget = { x: -1, y: -1 };

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
		
		// Draw active cells (walls) first
		grid.drawActiveCells(p, currentTheme.activeCell);
		
		// Check if grid has changed
		if (drawingSystem.hasGridChanged()) {
			needsPathRecalculation = true;
			drawingSystem.resetGridChanged();
		}
		
		// Only recalculate path if target (mouse) changed or grid changed
		const playerPos = player.getPosition();
		const mousePositionChanged = mouseXCell !== lastMouseXCell || mouseYCell !== lastMouseYCell;
		
		if (needsPathRecalculation || mousePositionChanged) {
			
			const newSelectedPath = aStar(
				playerPos,
				{ x: mouseXCell, y: mouseYCell },
				grid.getRawData(),
				grid.width,
				grid.height
			);

			if (newSelectedPath === null) {
				// If no path found but we had a valid path before to the same target, keep it
				if (lastValidTarget.x === mouseXCell && lastValidTarget.y === mouseYCell && lastSuccessfulPath.length > 0) {
					// Keep the last successful path
					selectedPath = lastSuccessfulPath;
				} else {
					selectedPath = [];
					player.setPath([]);
				}
			} else {
				selectedPath = newSelectedPath;
				player.setPath(newSelectedPath);
				// Store this successful path and target
				lastSuccessfulPath = [...newSelectedPath];
				lastValidTarget = { x: mouseXCell, y: mouseYCell };
			}

			// Update tracking variables
			lastMouseXCell = mouseXCell;
			lastMouseYCell = mouseYCell;
			needsPathRecalculation = false;
		}
		
		// Highlight selected path (show remaining path from player's current position)
		if (selectedPath.length > 0) {
			p.fill(currentTheme.path);
			p.noStroke();
			const playerPos = player.getPosition();
			
			// Find player's current position in the path and show the rest
			let startIndex = 0;
			for (let i = 0; i < selectedPath.length; i++) {
				if (selectedPath[i].x === playerPos.x && selectedPath[i].y === playerPos.y) {
					startIndex = i + 1; // Start from next position
					break;
				}
			}
			
			// Draw the remaining path
			for (let i = startIndex; i < selectedPath.length; i++) {
				const pos = selectedPath[i];
				const pixelPos = grid.getPixelFromCell(pos.x, pos.y);
				const cellSize = grid.getCellSize();
				p.rect(pixelPos.x, pixelPos.y, cellSize, cellSize);
			}
		}

		// Draw grid lines
		grid.drawGrid(p, currentTheme.grid);

		// Draw player last (on top of everything)
		player.draw(p, grid, currentTheme.player);

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
		
		// Check if shift key is pressed
		const isShiftPressed = p.keyIsDown(p.SHIFT);
		drawingSystem.handleMouseDragged(p, isShiftPressed);
	};
	
	p.mousePressed = () => {
		const cell = grid.getCellFromPixel(p.mouseX, p.mouseY);
		mouseXCell = cell.x;
		mouseYCell = cell.y;
		
		drawingSystem.handleMousePressed(p);
	};
	
	p.mouseReleased = () => {
		drawingSystem.handleMouseReleased();
	};
	
	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
		grid.init(p.width, p.height);
		player.init(grid);
		needsPathRecalculation = true;
	};
};

new p5(sketch);

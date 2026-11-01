import p5 from 'p5';
import { DrawingSystem } from './core/DrawingSystem';
import { Grid, type Position } from './core/Grid';
import { PathPreview } from './core/PathPreview';
import { Player } from './core/Player';
import { type ColorTheme, DEFAULT_THEME } from './core/Theme';
import { Sidebar } from './ui/Sidebar';
import './style.css';

const grid = new Grid(20);
const player = new Player(5);
const theme: ColorTheme = { ...DEFAULT_THEME };
const drawingSystem = new DrawingSystem(grid);
const pathPreview = new PathPreview();

let mouseCell: Position = { x: -1, y: -1 };

const sketch = (p: p5) => {
	let sidebar: Sidebar;

	const trackMouseCell = (): void => {
		mouseCell = grid.getCellFromPixel(p.mouseX, p.mouseY);
	};

	p.setup = () => {
		const canvas = p.createCanvas(p.windowWidth, p.windowHeight).elt;
		canvas.addEventListener('contextmenu', event => event.preventDefault());
		p.frameRate(60);

		grid.init(p.width, p.height);
		player.init(grid);

		sidebar = new Sidebar(p, player, grid, theme);
		sidebar.init();
	};

	p.draw = () => {
		p.background(theme.background);

		// ── Draw world ───────────────────────────────────────────────────────
		grid.drawActiveCells(p, theme.activeCell);

		// ── Pathfinding preview ──────────────────────────────────────────────
		pathPreview.update(grid, player, mouseCell, sidebar.snapToNearest);
		pathPreview.draw(p, grid, theme.path, player.getPosition());

		// ── Grid lines ───────────────────────────────────────────────────────
		if (sidebar.showGridColor) {
			grid.drawGrid(p, theme.grid);
		}

		// ── Player ───────────────────────────────────────────────────────────
		player.draw(p, grid, theme.player);

		// ── Player movement ──────────────────────────────────────────────────
		player.update(p);
	};

	p.mouseMoved = trackMouseCell;

	p.mouseDragged = () => {
		trackMouseCell();

		const isShiftPressed = p.keyIsDown(p.SHIFT);
		drawingSystem.handleMouseDragged(p, isShiftPressed);
	};

	p.mousePressed = () => {
		trackMouseCell();

		drawingSystem.handleMousePressed(p);
	};

	p.mouseReleased = () => {
		drawingSystem.handleMouseReleased();

		if (drawingSystem.hasGridChanged()) {
			pathPreview.invalidate();
			drawingSystem.resetGridChanged();
		}
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);

		grid.init(p.width, p.height);
		player.init(grid);

		pathPreview.invalidate();
	};
};

new p5(sketch);

import p5 from 'p5';
import { Camera } from './core/Camera';
import { DrawingSystem } from './core/DrawingSystem';
import { Grid, type Position } from './core/Grid';
import { PathPreview } from './core/PathPreview';
import { Player } from './core/Player';
import { TerrainType } from './core/TerrainType';
import { type ColorTheme, DEFAULT_THEME } from './core/Theme';
import type { WorldGenOptions } from './generators/WorldMapGenerator';
import { Sidebar } from './ui/Sidebar';
import { wheelZoomFactor } from './utils/wheelZoomFactor';
import './style.css';

const grid = new Grid(20);
const player = new Player(5);
const theme: ColorTheme = { ...DEFAULT_THEME };
const camera = new Camera();
const drawingSystem = new DrawingSystem(grid, camera);
const pathPreview = new PathPreview();

let mouseCell: Position = { x: -1, y: -1 };

// Middle-mouse / space+drag pan state: mouse position and camera offset when the drag started
let pan: { x: number; y: number; offX: number; offY: number } | null = null;

const PAN_SPEED = 400; // world px / sec

const sketch = (p: p5) => {
	let sidebar: Sidebar;

	const snapPlayerToRoad = (): void => {
		const pos = player.getPosition();
		const road = grid.findNearest(pos.x, pos.y, (cx, cy) => grid.getCell(cx, cy) === TerrainType.ROAD);
		if (!road) return;

		player.setPosition(road.x, road.y);
		const worldCenter = grid.getCenterPixelFromCell(road.x, road.y);
		camera.resetTo(worldCenter.x, worldCenter.y);
	};

	const trackMouseCell = (): void => {
		if (!grid.isWorldMapMode()) mouseCell = grid.getCellFromPixel(p.mouseX, p.mouseY);
	};

	const generateMap = (seed: number, enable: WorldGenOptions['enable'], multiplier: number): void => {
		const usedSeed = grid.generateWorldMap({ seed, enable }, multiplier, p.width, p.height);

		camera.setWorldSize(grid.width * grid.getCellSize(), grid.height * grid.getCellSize());
		camera.setScreenSize(p.width, p.height);

		snapPlayerToRoad();

		sidebar.updateSeedDisplay(usedSeed);
		pathPreview.invalidate();
	};

	const toggleMapMode = (enabled: boolean): void => {
		grid.setWorldMapMode(enabled);

		if (enabled) snapPlayerToRoad();

		pathPreview.invalidate();
	};

	p.setup = () => {
		p.createCanvas(p.windowWidth, p.windowHeight);
		p.frameRate(60);

		grid.init(p.width, p.height);
		player.init(grid);

		camera.setScreenSize(p.width, p.height);
		camera.setWorldSize(p.width, p.height); // normal mode = 1:1

		sidebar = new Sidebar(p, player, grid, camera, theme, generateMap, toggleMapMode);
		sidebar.init();

		document.addEventListener('contextmenu', event => event.preventDefault());
	};

	p.draw = () => {
		p.background(theme.background);

		const inMapMode = grid.isWorldMapMode();
		const dt = p.deltaTime / 1000; // seconds

		// ── Smooth zoom and arrow-key camera pan (map mode only) ─────────────
		if (inMapMode) {
			if (camera.update(dt)) sidebar.updateZoomDisplay(camera.zoom);

			const speed = PAN_SPEED / camera.zoom;
			let dx = 0;
			let dy = 0;
			if (p.keyIsDown(p.LEFT_ARROW))  dx -= speed * dt;
			if (p.keyIsDown(p.RIGHT_ARROW)) dx += speed * dt;
			if (p.keyIsDown(p.UP_ARROW))    dy -= speed * dt;
			if (p.keyIsDown(p.DOWN_ARROW))  dy += speed * dt;
			if (dx !== 0 || dy !== 0) camera.pan(dx, dy);
		}

		// ── Draw world ───────────────────────────────────────────────────────
		grid.drawActiveCells(p, theme.activeCell, camera);

		// ── Pathfinding preview (normal mode only) ───────────────────────────
		if (!inMapMode) {
			pathPreview.update(grid, player, mouseCell, sidebar.snapToNearest);
			pathPreview.draw(p, grid, theme.path, player.getPosition());
		}

		// ── Grid lines ───────────────────────────────────────────────────────
		if (sidebar.showGridColor) {
			grid.drawGrid(p, theme.grid, camera);
		}

		// ── Player ───────────────────────────────────────────────────────────
		player.draw(p, grid, theme.player, camera);

		// ── Player movement ──────────────────────────────────────────────────
		player.update(p);
	};

	p.mouseMoved = trackMouseCell;

	p.mouseDragged = () => {
		if (pan && grid.isWorldMapMode()) {
			camera.moveTo(
				pan.offX + (pan.x - p.mouseX) / camera.zoom,
				pan.offY + (pan.y - p.mouseY) / camera.zoom
			);
			return;
		}

		trackMouseCell();

		const isShiftPressed = p.keyIsDown(p.SHIFT);
		drawingSystem.handleMouseDragged(p, isShiftPressed);
	};

	p.mousePressed = () => {
		// Middle mouse or space+left → pan
		if (p.mouseButton.center || (p.mouseButton.left && p.keyIsDown('Space'))) {
			if (grid.isWorldMapMode()) {
				pan = { x: p.mouseX, y: p.mouseY, offX: camera.offsetX, offY: camera.offsetY };
				return;
			}
		}

		trackMouseCell();

		drawingSystem.handleMousePressed(p);
	};

	p.mouseReleased = () => {
		pan = null;
		drawingSystem.handleMouseReleased();

		if (drawingSystem.hasGridChanged()) {
			pathPreview.invalidate();
			drawingSystem.resetGridChanged();
		}
	};

	p.mouseWheel = (event: WheelEvent) => {
		if (!grid.isWorldMapMode()) return;

		camera.smoothZoomAt(wheelZoomFactor(event, p.height), p.mouseX, p.mouseY);
		return false;
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
		camera.setScreenSize(p.width, p.height);

		if (!grid.isWorldMapMode()) {
			grid.init(p.width, p.height);
			player.init(grid);
			camera.setWorldSize(p.width, p.height);
		}

		pathPreview.invalidate();
	};
};

new p5(sketch);

import p5 from 'p5';
import { aStar } from './core/aStar';
import { Camera } from './core/Camera';
import { DrawingSystem } from './core/DrawingSystem';
import { Grid, type Position } from './core/Grid';
import { Player } from './core/Player';
import { Theme } from './core/Theme';
import type { WorldGenOptions } from './generators/WorldMapGenerator';
import { Sidebar } from './ui/Sidebar';
import './style.css';

const grid = new Grid(20);
const player = new Player(5);
const theme = new Theme();
const camera = new Camera();
const drawingSystem = new DrawingSystem(grid);

let selectedPath: Position[] = [];
let sidebar: Sidebar;

let mouseXCell = -1;
let mouseYCell = -1;
let lastMouseXCell = -1;
let lastMouseYCell = -1;
let needsPathRecalculation = true;
let lastSuccessfulPath: Position[] = [];
let lastValidTarget = { x: -1, y: -1 };

// Middle-mouse / space+drag pan state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartOffX = 0;
let panStartOffY = 0;

const PAN_SPEED = 400; // world px / sec

function generateMap(seed: number, enable: WorldGenOptions['enable'], multiplier: number): void {
	const usedSeed = grid.generateWorldMap(
		{ seed, enable, multiplier },
		sketch_p.width,
		sketch_p.height
	);

	camera.setWorldSize(grid.width * grid.getCellSize(), grid.height * grid.getCellSize());
	camera.setScreenSize(sketch_p.width, sketch_p.height);

	const playerPos = player.getPosition();
	const nearestRoad = grid.findNearestRoad(playerPos.x, playerPos.y);
	if (nearestRoad) {
		player.setPosition(nearestRoad.x, nearestRoad.y);
		const worldCenter = grid.getCenterPixelFromCell(nearestRoad.x, nearestRoad.y);
		camera.resetTo(worldCenter.x, worldCenter.y);
	}

	sidebar.updateSeedDisplay(usedSeed);
	needsPathRecalculation = true;
}

function toggleMapMode(enabled: boolean): void {
	grid.setWorldMapMode(enabled);
	drawingSystem.setCamera(enabled ? camera : null);

	if (enabled) {
		const playerPos = player.getPosition();
		const nearestRoad = grid.findNearestRoad(playerPos.x, playerPos.y);
		if (nearestRoad) {
			player.setPosition(nearestRoad.x, nearestRoad.y);
			const worldCenter = grid.getCenterPixelFromCell(nearestRoad.x, nearestRoad.y);
			camera.resetTo(worldCenter.x, worldCenter.y);
		}
	}

	needsPathRecalculation = true;
}

// Keep a reference for use in generateMap before setup completes
let sketch_p: p5;

function findNearestTraversableTile(x: number, y: number): Position | null {
	const W = grid.width;
	const encodeKey = (cx: number, cy: number) => cy * W + cx;
	const queue: Array<{ x: number; y: number }> = [{ x, y }];
	const visited = new Set<number>();
	visited.add(encodeKey(x, y));

	const dxs = [1, -1, 0, 0];
	const dys = [0, 0, 1, -1];

	while (queue.length > 0) {
		const current = queue.shift()!;

		if (grid.isCellTraversable(current.x, current.y)) {
			return { x: current.x, y: current.y };
		}

		for (let d = 0; d < 4; d++) {
			const nx = current.x + dxs[d];
			const ny = current.y + dys[d];
			if (nx >= 0 && nx < W && ny >= 0 && ny < grid.height) {
				const k = encodeKey(nx, ny);
				if (!visited.has(k)) {
					visited.add(k);
					queue.push({ x: nx, y: ny });
				}
			}
		}
	}

	return null;
}

const sketch = (p: p5) => {
	sketch_p = p;

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
		const currentTheme = theme.getTheme();
		p.background(currentTheme.background);

		const inMapMode = grid.isWorldMapMode();
		const dt = p.deltaTime / 1000; // seconds

		// ── Arrow-key camera pan (map mode only) ─────────────────────────────
		if (inMapMode) {
			const speed = PAN_SPEED / camera.zoom;
			let dx = 0;
			let dy = 0;
			if (p.keyIsDown(p.LEFT_ARROW))  dx -= speed * dt;
			if (p.keyIsDown(p.RIGHT_ARROW)) dx += speed * dt;
			if (p.keyIsDown(p.UP_ARROW))    dy -= speed * dt;
			if (p.keyIsDown(p.DOWN_ARROW))  dy += speed * dt;
			if (dx !== 0 || dy !== 0) {
				camera.pan(dx, dy);
				sidebar.updateZoomDisplay(camera.zoom);
			}
		}

		// ── Draw world ───────────────────────────────────────────────────────
		grid.drawActiveCells(p, currentTheme.activeCell, inMapMode ? camera : undefined);

		// ── Pathfinding preview (normal mode only) ───────────────────────────
		if (!inMapMode) {
			const playerPos = player.getPosition();
			const mousePositionChanged = mouseXCell !== lastMouseXCell || mouseYCell !== lastMouseYCell;

			if (needsPathRecalculation || mousePositionChanged) {
				let targetX = mouseXCell;
				let targetY = mouseYCell;

				if (sidebar.snapToNearest &&!grid.isCellTraversable(mouseXCell, mouseYCell)) {
					const nearest = findNearestTraversableTile(mouseXCell, mouseYCell);
					if (nearest) { targetX = nearest.x; targetY = nearest.y; }
				}

				const newPath = aStar(playerPos, { x: targetX, y: targetY }, grid);

				if (newPath === null) {
					if (lastValidTarget.x === targetX && lastValidTarget.y === targetY && lastSuccessfulPath.length > 0) {
						selectedPath = lastSuccessfulPath;
					} else {
						selectedPath = [];
						player.setPath([]);
					}
				} else {
					selectedPath = newPath;
					player.setPath(newPath);
					lastSuccessfulPath = [...newPath];
					lastValidTarget = { x: targetX, y: targetY };
				}

				lastMouseXCell = mouseXCell;
				lastMouseYCell = mouseYCell;
				needsPathRecalculation = false;
			}

			if (selectedPath.length > 0) {
				p.fill(currentTheme.path);
				p.noStroke();
				const pPos = player.getPosition();
				let startIndex = 0;
				for (let i = 0; i < selectedPath.length; i++) {
					if (selectedPath[i].x === pPos.x && selectedPath[i].y === pPos.y) {
						startIndex = i + 1;
						break;
					}
				}
				for (let i = startIndex; i < selectedPath.length; i++) {
					const pos = selectedPath[i];
					const px = grid.getPixelFromCell(pos.x, pos.y);
					const cs = grid.getCellSize();
					p.rect(px.x, px.y, cs, cs);
				}
			}
		}

		// ── Grid lines ───────────────────────────────────────────────────────
		if (sidebar.showGridColor) {
			grid.drawGrid(p, currentTheme.grid, inMapMode ? camera : undefined);
		}

		// ── Player ───────────────────────────────────────────────────────────
		player.draw(p, grid, currentTheme.player, inMapMode ? camera : undefined);

		// ── Player movement ──────────────────────────────────────────────────
		player.update(p);
	};

	p.mouseMoved = () => {
		if (!grid.isWorldMapMode()) {
			const cell = grid.getCellFromPixel(p.mouseX, p.mouseY);
			mouseXCell = cell.x;
			mouseYCell = cell.y;
		}
	};

	p.mouseDragged = () => {
		if (isPanning && grid.isWorldMapMode()) {
			const dx = (panStartX - p.mouseX) / camera.zoom;
			const dy = (panStartY - p.mouseY) / camera.zoom;
			camera.offsetX = panStartOffX + dx;
			camera.offsetY = panStartOffY + dy;
			// Re-clamp via a 0-length pan
			camera.pan(0, 0);
			sidebar.updateZoomDisplay(camera.zoom);
			return;
		}

		if (!grid.isWorldMapMode()) {
			const cell = grid.getCellFromPixel(p.mouseX, p.mouseY);
			mouseXCell = cell.x;
			mouseYCell = cell.y;
		}

		const isShiftPressed = p.keyIsDown(p.SHIFT);
		drawingSystem.handleMouseDragged(p, isShiftPressed);
	};

	p.mousePressed = () => {
		// Middle mouse or space+left → pan
		if (p.mouseButton.center || (p.mouseButton.left && p.keyIsDown('Space'))) {
			if (grid.isWorldMapMode()) {
				isPanning = true;
				panStartX = p.mouseX;
				panStartY = p.mouseY;
				panStartOffX = camera.offsetX;
				panStartOffY = camera.offsetY;
				return;
			}
		}

		if (!grid.isWorldMapMode()) {
			const cell = grid.getCellFromPixel(p.mouseX, p.mouseY);
			mouseXCell = cell.x;
			mouseYCell = cell.y;
		}

		drawingSystem.handleMousePressed(p);
	};

	p.mouseReleased = () => {
		isPanning = false;
		drawingSystem.handleMouseReleased();

		if (drawingSystem.hasGridChanged()) {
			needsPathRecalculation = true;
			drawingSystem.resetGridChanged();
		}
	};

	p.mouseWheel = (event: WheelEvent) => {
		if (grid.isWorldMapMode()) {
			const factor = event.deltaY > 0 ? 0.9 : 1.1;
			camera.setZoom(camera.zoom * factor, p.mouseX, p.mouseY);
			sidebar.updateZoomDisplay(camera.zoom);
		}
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
		camera.setScreenSize(p.width, p.height);

		if (!grid.isWorldMapMode()) {
			grid.init(p.width, p.height);
			player.init(grid);
			camera.setWorldSize(p.width, p.height);
		}

		needsPathRecalculation = true;
	};
};

new p5(sketch);

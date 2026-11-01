import p5 from 'p5';
import { Camera } from './core/Camera';
import { DrawingSystem } from './core/DrawingSystem';
import { GridRenderer } from './core/GridRenderer';
import { PathPreview } from './core/PathPreview';
import { Player } from './core/Player';
import { type ColorTheme, DEFAULT_THEME } from './core/Theme';
import { WallGrid } from './core/WallGrid';
import { Sidebar } from './ui/Sidebar';
import { wheelZoomFactor } from './utils/wheelZoomFactor';
import './ui/ui.css';
import './style.css';

const grid = new WallGrid();
const camera = new Camera(20);
const renderer = new GridRenderer(grid);
const drawing = new DrawingSystem(grid);
const player = new Player(5);
const theme: ColorTheme = { ...DEFAULT_THEME };
const pathPreview = new PathPreview();

/** Cell under the cursor when a pan started, kept under the cursor while dragging. */
let pan: { cellX: number; cellY: number } | null = null;
/** False until the first pointer move over the canvas (p5 reports the mouse at (0, 0) before that) and while the pointer is off it. */
let hovering = false;

/** Screen pixels per second, so arrow panning feels the same at every zoom and cell size. */
const PAN_SPEED = 400;

const sketch = (p: p5) => {
	let sidebar: Sidebar;
	let canvas: HTMLCanvasElement;
	let cursor = '';

	p.setup = () => {
		canvas = p.createCanvas(p.windowWidth, p.windowHeight).elt;
		canvas.addEventListener('contextmenu', event => event.preventDefault());
		/**
		 * p5 also updates mouseX and mouseY on pointerup, which the sidebar lets through (pointer.js:1382-1389), so after a click on a
		 * control the position sits under the panel. Hovering ends when the pointer leaves the canvas and resumes with the next move over it.
		 */
		canvas.addEventListener('pointerleave', () => { hovering = false; });

		camera.setScreenSize(p.width, p.height);
		camera.centerOn(0, 0);

		/** After the camera has a screen size: the cell size field calls `camera.setCellSize` while restoring its saved value. */
		sidebar = new Sidebar({ grid, camera, player, theme });
		document.body.append(sidebar.element);
	};

	p.draw = () => {
		/** A tab hidden for a while returns a huge deltaTime, which would turn a held arrow key into one giant pan step. */
		const dt = Math.min(p.deltaTime, 100) / 1000;
		camera.update(dt);
		sidebar.sync();

		const step = PAN_SPEED * dt / camera.scale;
		let dx = 0;
		let dy = 0;
		if (p.keyIsDown(p.LEFT_ARROW))  dx -= step;
		if (p.keyIsDown(p.RIGHT_ARROW)) dx += step;
		if (p.keyIsDown(p.UP_ARROW))    dy -= step;
		if (p.keyIsDown(p.DOWN_ARROW))  dy += step;
		if (dx !== 0 || dy !== 0) camera.pan(dx, dy);

		p.background(theme.background);
		const ctx = p.drawingContext as CanvasRenderingContext2D;
		renderer.drawWalls(ctx, camera, theme.wall);

		if (hovering) {
			pathPreview.update(grid, player, camera.cellAt(p.mouseX, p.mouseY), camera.visibleRect(), sidebar.snapToNearest);
		}
		pathPreview.draw(ctx, camera, player, theme.path);

		if (sidebar.showGrid) renderer.drawLines(ctx, camera, theme.grid);

		player.draw(p, camera, theme.player);
		player.update(p);

		const wanted = pan ? 'grabbing' : sidebar.build && !p.keyIsDown('Space') ? 'crosshair' : 'grab';
		if (wanted !== cursor) {
			canvas.style.cursor = wanted;
			cursor = wanted;
		}
	};

	p.mouseMoved = () => {
		hovering = true;
	};

	p.mousePressed = () => {
		hovering = true;

		const { left, right, center } = p.mouseButton;
		if (center || (left && (p.keyIsDown('Space') || !sidebar.build))) {
			const cell = camera.screenToCell(p.mouseX, p.mouseY);
			pan = { cellX: cell.x, cellY: cell.y };
		} else if (sidebar.build && (left || right)) {
			drawing.begin(camera.cellAt(p.mouseX, p.mouseY), left);
		}
	};

	p.keyPressed = (event?: KeyboardEvent) => {
		if (event && !event.repeat && event.key.toLowerCase() === 'b' && !event.ctrlKey && !event.metaKey && !event.altKey) {
			sidebar.toggleBuild();
		}
	};

	p.mouseDragged = () => {
		if (pan) camera.moveTo(pan.cellX - p.mouseX / camera.scale, pan.cellY - p.mouseY / camera.scale);
		else drawing.drag(camera.cellAt(p.mouseX, p.mouseY), p.keyIsDown(p.SHIFT));
	};

	p.mouseReleased = () => {
		pan = null;
		drawing.end();
	};

	p.mouseWheel = (event?: WheelEvent) => {
		if (event) camera.smoothZoomAt(wheelZoomFactor(event, p.height), p.mouseX, p.mouseY);
		return false;
	};

	p.windowResized = () => {
		p.resizeCanvas(p.windowWidth, p.windowHeight);
		camera.setScreenSize(p.width, p.height);
	};
};

new p5(sketch);

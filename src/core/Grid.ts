import type p5 from 'p5';
import { WorldMapGenerator, type WorldGenOptions } from '../generators/WorldMapGenerator';
import { Rng } from '../utils/Rng';
import type { Camera } from './Camera';
import { type Terrain, TerrainType } from './TerrainType';

/** Represents a 2D grid position */
export interface Position {
	x: number;
	y: number;
}

export interface WorldMapColors {
	road: string;
	mountain: string;
	river: string;
	plain: string;
	hill: string;
	forest: string;
	bridge: string;
	coast: string;
	village: string;
	sand: string;
}

/** Offscreen p5 layer redrawn only when stale: marked dirty, drawn with another color or alpha, or the canvas size changed. */
class CachedLayer {
	dirty = true;
	color?: string;
	alpha = 1;
	private graphics?: p5.Graphics;
	private width = 0;
	private height = 0;

	/** Returns the layer, recreating it (and marking it dirty) when the canvas size changed. */
	get(p: p5): p5.Graphics {
		if (!this.graphics || this.width !== p.width || this.height !== p.height) {
			this.graphics?.remove();
			this.graphics = p.createGraphics(p.width, p.height);
			this.width = p.width;
			this.height = p.height;
			this.dirty = true;
		}
		return this.graphics;
	}

	isStale(color: string, alpha = 1): boolean {
		return this.dirty || this.color !== color || this.alpha !== alpha;
	}

	markDrawn(color: string, alpha = 1): void {
		this.color = color;
		this.alpha = alpha;
		this.dirty = false;
	}
}

/** Neighbor order of the nearest-cell search: +x, -x, +y, -y. */
const NEIGHBOR_DX = [1, -1, 0, 0];
const NEIGHBOR_DY = [0, 0, 1, -1];

export class Grid {
	/**
	 * Grid lines fade with the on-screen cell size: at 10 px and up a 1 px line covers at most a tenth of the cell;
	 * at 4 px lines (anti-aliased to ~2 px at fractional zoom) would cover half of every cell and hide it.
	 */
	private static readonly GRID_FADE_FULL_PX = 10;
	private static readonly GRID_FADE_HIDDEN_PX = 4;

	// ── Active grid (points to either normalGrid or worldGrid) ──────────────
	private grid: Terrain[][] = [];
	public width = 0;
	public height = 0;

	// ── Normal mode (canvas-sized) ──────────────────────────────────────────
	private normalGrid: Terrain[][] = [];
	private normalWidth = 0;
	private normalHeight = 0;

	// ── World map mode (multiplier-sized) ──────────────────────────────────
	private worldGrid: Terrain[][] = [];
	private worldWidth = 0;
	private worldHeight = 0;
	/** One pixel per cell: a path of millions of rects draws nothing in Chrome, and this keeps the canvas at cells x 4 bytes. */
	private worldCanvas?: HTMLCanvasElement;
	private worldImage?: ImageData;
	private worldPixels?: Uint32Array;
	/** Inclusive bounds in cells of the pixels written since the last upload; empty while min > max. */
	private worldDirtyMinX = Infinity;
	private worldDirtyMinY = Infinity;
	private worldDirtyMaxX = -1;
	private worldDirtyMaxY = -1;

	private worldMapMode = false;
	private worldMapColors: WorldMapColors = {
		road:     '#8B7355',
		mountain: '#4A4A4A',
		river:    '#4A90E2',
		plain:    '#90C695',
		hill:     '#A8D08D',
		forest:   '#6B8F6E',
		bridge:   '#DAA520',
		coast:    '#F4A460',
		village:  '#D2B48C',
		sand:     '#F5E6D3'
	};
	private worldColorLUT = this.buildColorLUT();

	// ── Normal mode rendering layers ────────────────────────────────────────
	private cellSize: number;
	private isDirty = true;
	private activeCellsFlat: Int16Array = new Int16Array(0);
	private activeCellCount = 0;
	private readonly cellsLayer = new CachedLayer();
	private readonly gridLayer = new CachedLayer();

	constructor(cellSize = 20) {
		this.cellSize = cellSize;
	}

	// ── Init ──────────────────────────────────────────────────────────────────

	init(canvasWidth: number, canvasHeight: number): void {
		this.normalWidth  = Math.floor(canvasWidth  / this.cellSize);
		this.normalHeight = Math.floor(canvasHeight / this.cellSize);

		this.normalGrid = Array.from({ length: this.normalHeight }, () =>
			new Array<Terrain>(this.normalWidth).fill(TerrainType.EMPTY)
		);

		if (!this.worldMapMode) {
			this.grid   = this.normalGrid;
			this.width  = this.normalWidth;
			this.height = this.normalHeight;
		}

		this.gridLayer.dirty = true;
		this.markCellsDirty();
	}

	// ── World map mode toggle ─────────────────────────────────────────────────

	setWorldMapMode(enabled: boolean): void {
		this.worldMapMode = enabled;

		if (enabled && this.worldWidth > 0) {
			this.grid   = this.worldGrid;
			this.width  = this.worldWidth;
			this.height = this.worldHeight;
		} else if (!enabled) {
			this.grid   = this.normalGrid;
			this.width  = this.normalWidth;
			this.height = this.normalHeight;
		}

		this.markCellsDirty();
	}

	isWorldMapMode(): boolean {
		return this.worldMapMode;
	}

	// ── Colors ────────────────────────────────────────────────────────────────

	setWorldMapColors(colors: Partial<WorldMapColors>): void {
		this.worldMapColors = { ...this.worldMapColors, ...colors };
		this.worldColorLUT = this.buildColorLUT();
		this.recolorWorld();
	}

	getWorldMapColors(): WorldMapColors {
		return { ...this.worldMapColors };
	}

	// ── Cell access ───────────────────────────────────────────────────────────

	getCell(x: number, y: number): Terrain {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return TerrainType.WALL;
		return this.grid[y][x];
	}

	setCell(x: number, y: number, value: Terrain): void {
		if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
			if (this.grid[y][x] !== value) {
				this.grid[y][x] = value;
				if (this.worldMapMode) {
					if (this.worldPixels) {
						this.worldPixels[y * this.worldWidth + x] = this.worldColorLUT[value];
						this.worldDirtyMinX = Math.min(this.worldDirtyMinX, x);
						this.worldDirtyMinY = Math.min(this.worldDirtyMinY, y);
						this.worldDirtyMaxX = Math.max(this.worldDirtyMaxX, x);
						this.worldDirtyMaxY = Math.max(this.worldDirtyMaxY, y);
					}
				} else {
					this.markCellsDirty();
				}
			}
		}
	}

	isCellTraversable(x: number, y: number): boolean {
		const cell = this.getCell(x, y);
		if (this.worldMapMode) {
			return cell === TerrainType.ROAD || cell === TerrainType.EMPTY;
		}
		return cell !== TerrainType.WALL && cell !== TerrainType.MOUNTAIN && cell !== TerrainType.RIVER;
	}

	// ── Coordinate helpers ────────────────────────────────────────────────────

	getCellFromPixel(pixelX: number, pixelY: number): Position {
		return {
			x: Math.floor(pixelX / this.cellSize),
			y: Math.floor(pixelY / this.cellSize)
		};
	}

	getCellFromScreen(screenX: number, screenY: number, cam?: Camera): Position {
		if (cam && this.worldMapMode) {
			const world = cam.screenToWorld(screenX, screenY);
			return {
				x: Math.floor(world.x / this.cellSize),
				y: Math.floor(world.y / this.cellSize)
			};
		}
		return this.getCellFromPixel(screenX, screenY);
	}

	getPixelFromCell(cellX: number, cellY: number): Position {
		return { x: cellX * this.cellSize, y: cellY * this.cellSize };
	}

	getCenterPixelFromCell(cellX: number, cellY: number): Position {
		return {
			x: cellX * this.cellSize + this.cellSize / 2,
			y: cellY * this.cellSize + this.cellSize / 2
		};
	}

	getCellSize(): number { return this.cellSize; }

	setCellSize(size: number): void {
		this.cellSize = size;
		this.gridLayer.dirty = true;
		this.markCellsDirty();
	}

	// ── Generation ────────────────────────────────────────────────────────────

	generateRandomMaze(): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) this.grid[y][x] = TerrainType.WALL;
		}

		const stack: Position[] = [];
		const startPos = { x: 1, y: 1 };
		this.grid[startPos.y][startPos.x] = TerrainType.EMPTY;
		stack.push(startPos);

		while (stack.length > 0) {
			const current = stack[stack.length - 1];
			const neighbors = this.getUnvisitedNeighbors(current.x, current.y);
			if (neighbors.length > 0) {
				const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
				this.grid[(current.y + chosen.y) / 2][(current.x + chosen.x) / 2] = TerrainType.EMPTY;
				this.grid[chosen.y][chosen.x] = TerrainType.EMPTY;
				stack.push(chosen);
			} else {
				stack.pop();
			}
		}
		this.markCellsDirty();
	}

	generateRandomGrid(probability = 0.2): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				this.grid[y][x] = Math.random() < probability ? TerrainType.WALL : TerrainType.EMPTY;
			}
		}
		this.markCellsDirty();
	}

	/**
	 * Generate a world map.
	 * Returns the seed that was actually used (so the UI can display it).
	 */
	generateWorldMap(options: WorldGenOptions, multiplier: number, canvasWidth: number, canvasHeight: number): number {
		const seed = options.seed !== 0 ? options.seed : Rng.randomSeed();

		const baseW = Math.floor(canvasWidth / this.cellSize);
		const baseH = Math.floor(canvasHeight / this.cellSize);

		this.worldWidth  = Math.max(1, Math.floor(baseW * multiplier));
		this.worldHeight = Math.max(1, Math.floor(baseH * multiplier));
		this.worldMapMode = true;

		const generator = new WorldMapGenerator(this.worldWidth, this.worldHeight);
		this.worldGrid = generator.generate({ ...options, seed });
		this.grid   = this.worldGrid;
		this.width  = this.worldWidth;
		this.height = this.worldHeight;

		this.recolorWorld();
		return seed;
	}

	/**
	 * Breadth-first search for the closest cell (4-neighborhood) satisfying `match`, starting at (x, y).
	 * An out-of-bounds start is tested like any cell but only its in-bounds neighbors are explored.
	 */
	findNearest(x: number, y: number, match: (cx: number, cy: number) => boolean): Position | null {
		const { width: W, height: H } = this;
		const visited = new Uint8Array(W * H);
		// Every in-bounds cell is queued at most once, plus the possibly out-of-bounds start.
		const queueX = new Int32Array(W * H + 1);
		const queueY = new Int32Array(W * H + 1);
		let head = 0;
		let tail = 0;

		queueX[tail] = x;
		queueY[tail++] = y;
		if (x >= 0 && x < W && y >= 0 && y < H) visited[y * W + x] = 1;

		while (head < tail) {
			const cx = queueX[head];
			const cy = queueY[head++];
			if (match(cx, cy)) return { x: cx, y: cy };

			for (let d = 0; d < 4; d++) {
				const nx = cx + NEIGHBOR_DX[d];
				const ny = cy + NEIGHBOR_DY[d];
				if (nx < 0 || nx >= W || ny < 0 || ny >= H || visited[ny * W + nx]) continue;
				visited[ny * W + nx] = 1;
				queueX[tail] = nx;
				queueY[tail++] = ny;
			}
		}
		return null;
	}

	// ── Rendering ─────────────────────────────────────────────────────────────

	drawActiveCells(p: p5, color: string, cam: Camera): void {
		if (this.worldMapMode) {
			this.drawWorldMap(p, cam);
			return;
		}

		this.updateActiveCells();

		const layer = this.cellsLayer.get(p);

		if (this.cellsLayer.isStale(color)) {
			const ctx = layer.drawingContext as CanvasRenderingContext2D;
			ctx.clearRect(0, 0, layer.width, layer.height);
			ctx.fillStyle = color;
			ctx.beginPath();

			const size = this.cellSize;
			const flat = this.activeCellsFlat;

			for (let i = 0; i < this.activeCellCount * 2; i += 2) {
				ctx.rect(flat[i] * size, flat[i + 1] * size, size, size);
			}
			ctx.fill();
			this.cellsLayer.markDrawn(color);
		}

		p.image(layer, 0, 0);
	}

	drawGrid(p: p5, color: string, cam: Camera): void {
		if (this.worldMapMode) {
			// Direct draw — grid lines shift with camera, no offscreen caching needed
			const ctx = p.drawingContext as CanvasRenderingContext2D;
			const zoom = cam.zoom;
			const cs = this.cellSize;
			const alpha = Grid.gridAlpha(cs * zoom);
			if (alpha === 0) return;

			const startCX = Math.floor(cam.offsetX / cs);
			const startCY = Math.floor(cam.offsetY / cs);
			const endCX   = Math.min(this.width,  Math.ceil((cam.offsetX + p.width  / zoom) / cs) + 1);
			const endCY   = Math.min(this.height, Math.ceil((cam.offsetY + p.height / zoom) / cs) + 1);

			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = color;
			ctx.lineWidth = 1;
			ctx.beginPath();
			for (let x = startCX; x <= endCX; x++) {
				const sx = (x * cs - cam.offsetX) * zoom;
				ctx.moveTo(sx, 0);
				ctx.lineTo(sx, p.height);
			}
			for (let y = startCY; y <= endCY; y++) {
				const sy = (y * cs - cam.offsetY) * zoom;
				ctx.moveTo(0, sy);
				ctx.lineTo(p.width, sy);
			}
			ctx.stroke();
			ctx.restore();
			return;
		}

		// Normal mode — cached offscreen layer
		const alpha = Grid.gridAlpha(this.cellSize);
		if (alpha === 0) return;

		const layer = this.gridLayer.get(p);

		if (this.gridLayer.isStale(color, alpha)) {
			const ctx = layer.drawingContext as CanvasRenderingContext2D;
			ctx.clearRect(0, 0, layer.width, layer.height);
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = color;
			ctx.lineWidth = 1;
			ctx.beginPath();

			const s = this.cellSize;
			for (let x = 0; x <= this.width; x++)  { const px = x * s; ctx.moveTo(px, 0); ctx.lineTo(px, this.height * s); }
			for (let y = 0; y <= this.height; y++) { const py = y * s; ctx.moveTo(0, py); ctx.lineTo(this.width * s, py); }
			ctx.stroke();

			this.gridLayer.markDrawn(color, alpha);
		}

		p.image(layer, 0, 0);
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private static gridAlpha(cellPx: number): number {
		const t = (cellPx - Grid.GRID_FADE_HIDDEN_PX) / (Grid.GRID_FADE_FULL_PX - Grid.GRID_FADE_HIDDEN_PX);
		return Math.max(0, Math.min(1, t));
	}

	private markCellsDirty(): void {
		this.isDirty = true;
		this.cellsLayer.dirty = true;
	}

	private updateActiveCells(): void {
		if (!this.isDirty) return;
		let count = 0;
		for (let y = 0; y < this.height; y++) {
			const row = this.grid[y];
			for (let x = 0; x < this.width; x++) if (row[x] === TerrainType.WALL) count++;
		}
		if (this.activeCellsFlat.length < count * 2) {
			this.activeCellsFlat = new Int16Array(count * 2);
		}
		let idx = 0;
		for (let y = 0; y < this.height; y++) {
			const row = this.grid[y];
			for (let x = 0; x < this.width; x++) {
				if (row[x] === TerrainType.WALL) { this.activeCellsFlat[idx++] = x; this.activeCellsFlat[idx++] = y; }
			}
		}
		this.activeCellCount = count;
		this.isDirty = false;
	}

	private getUnvisitedNeighbors(x: number, y: number): Position[] {
		const neighbors: Position[] = [];
		for (const { dx, dy } of [{ dx:0,dy:-2 },{ dx:2,dy:0 },{ dx:0,dy:2 },{ dx:-2,dy:0 }]) {
			const nx = x + dx, ny = y + dy;
			if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1 && this.grid[ny][nx] === TerrainType.WALL) {
				neighbors.push({ x: nx, y: ny });
			}
		}
		return neighbors;
	}

	/** Rewrites every world pixel from the grid and the color LUT, allocating the canvas and its pixel view when the world size changed. */
	private recolorWorld(): void {
		if (this.worldWidth === 0) return;

		if (!this.worldCanvas || this.worldCanvas.width !== this.worldWidth || this.worldCanvas.height !== this.worldHeight) {
			this.worldCanvas = document.createElement('canvas');
			this.worldCanvas.width = this.worldWidth;
			this.worldCanvas.height = this.worldHeight;
			this.worldImage = new ImageData(this.worldWidth, this.worldHeight);
			this.worldPixels = new Uint32Array(this.worldImage.data.buffer);
		}

		const pixels = this.worldPixels!;
		const lut = this.worldColorLUT;
		let i = 0;
		for (let y = 0; y < this.worldHeight; y++) {
			const row = this.worldGrid[y];
			for (let x = 0; x < this.worldWidth; x++) pixels[i++] = lut[row[x]];
		}
		this.worldDirtyMinX = 0;
		this.worldDirtyMinY = 0;
		this.worldDirtyMaxX = this.worldWidth - 1;
		this.worldDirtyMaxY = this.worldHeight - 1;
	}

	/** Indexed by Terrain. EMPTY and WALL stay 0 (transparent). */
	private buildColorLUT(): Uint32Array {
		const c = this.worldMapColors;
		return Uint32Array.of(
			0, 0,
			Grid.packColor(c.road), Grid.packColor(c.mountain), Grid.packColor(c.river), Grid.packColor(c.plain),
			Grid.packColor(c.hill), Grid.packColor(c.forest), Grid.packColor(c.bridge), Grid.packColor(c.coast),
			Grid.packColor(c.village), Grid.packColor(c.sand)
		);
	}

	/** Packs `#rrggbb` (what color inputs always give) as an opaque pixel: ImageData bytes are R, G, B, A, read little-endian as 0xAABBGGRR. */
	private static packColor(hex: string): number {
		const rgb = Number.parseInt(hex.slice(1), 16);
		return (0xff << 24 | (rgb & 0xff) << 16 | (rgb >> 8 & 0xff) << 8 | rgb >> 16) >>> 0;
	}

	private drawWorldMap(p: p5, cam: Camera): void {
		if (!this.worldCanvas || !this.worldImage) return;

		if (this.worldDirtyMinX <= this.worldDirtyMaxX) {
			const { worldDirtyMinX: x, worldDirtyMinY: y } = this;
			this.worldCanvas.getContext('2d')!.putImageData(
				this.worldImage, 0, 0, x, y, this.worldDirtyMaxX - x + 1, this.worldDirtyMaxY - y + 1
			);
			this.worldDirtyMinX = this.worldDirtyMinY = Infinity;
			this.worldDirtyMaxX = this.worldDirtyMaxY = -1;
		}

		const ctx = p.drawingContext as CanvasRenderingContext2D;
		const cs = this.cellSize;
		const viewCells = 1 / (cam.zoom * cs);
		ctx.save();
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(
			this.worldCanvas,
			cam.offsetX / cs, cam.offsetY / cs, p.width * viewCells, p.height * viewCells,
			0, 0, p.width, p.height
		);
		ctx.restore();
	}
}

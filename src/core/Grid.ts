import type p5 from 'p5';
import { WorldMapGenerator, type WorldGenOptions } from '../generators/WorldMapGenerator';
import { Rng } from '../utils/Rng';
import type { Camera } from './Camera';
import { TerrainType } from './TerrainType';

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
	hill?: string;
	forest?: string;
	bridge?: string;
	coast?: string;
	village?: string;
	sand?: string;
}

export class Grid {
	// ── Active grid (points to either normalGrid or worldGrid) ──────────────
	private grid: number[][] = [];
	public width = 0;
	public height = 0;

	// ── Normal mode (canvas-sized) ──────────────────────────────────────────
	private normalGrid: number[][] = [];
	private normalWidth = 0;
	private normalHeight = 0;

	// ── World map mode (multiplier-sized) ──────────────────────────────────
	private worldGrid: number[][] = [];
	private worldWidth = 0;
	private worldHeight = 0;
	private worldOffscreenCanvas?: HTMLCanvasElement;
	private worldOffscreenDirty = false;

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

	// ── Normal mode rendering layers ────────────────────────────────────────
	private cellSize: number;
	private isDirty = true;
	private activeCellsFlat: Int16Array = new Int16Array(0);
	private activeCellCount = 0;
	private cellsLayer?: p5.Graphics;
	private layerDirty = true;
	private cachedActiveColor?: string;
	private cachedLayerSize?: { w: number; h: number };
	private gridLayer?: p5.Graphics;
	private gridLayerDirty = true;
	private cachedGridColor?: string;
	private cachedGridLayerSize?: { w: number; h: number };

	constructor(cellSize = 20) {
		this.cellSize = cellSize;
	}

	// ── Init ──────────────────────────────────────────────────────────────────

	init(canvasWidth: number, canvasHeight: number): void {
		this.normalWidth  = Math.floor(canvasWidth  / this.cellSize);
		this.normalHeight = Math.floor(canvasHeight / this.cellSize);

		this.normalGrid = Array.from({ length: this.normalHeight }, () =>
			new Array<number>(this.normalWidth).fill(0)
		);

		if (!this.worldMapMode) {
			this.grid   = this.normalGrid;
			this.width  = this.normalWidth;
			this.height = this.normalHeight;
		}

		this.gridLayerDirty = true;
		this.layerDirty = true;
		this.isDirty = true;
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

		this.isDirty = true;
		this.layerDirty = true;
	}

	isWorldMapMode(): boolean {
		return this.worldMapMode;
	}

	// ── Colors ────────────────────────────────────────────────────────────────

	setWorldMapColors(colors: Partial<WorldMapColors>): void {
		this.worldMapColors = { ...this.worldMapColors, ...colors };
		this.worldOffscreenDirty = true;
	}

	getWorldMapColors(): WorldMapColors {
		return { ...this.worldMapColors };
	}

	// ── Cell access ───────────────────────────────────────────────────────────

	getCell(x: number, y: number): number {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 1;
		return this.grid[y][x];
	}

	setCell(x: number, y: number, value: number): void {
		if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
			if (this.grid[y][x] !== value) {
				this.grid[y][x] = value;
				if (this.worldMapMode) {
					this.worldOffscreenDirty = true;
				} else {
					this.isDirty = true;
					this.layerDirty = true;
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

	getCellFromPixel(pixelX: number, pixelY: number): { x: number; y: number } {
		return {
			x: Math.floor(pixelX / this.cellSize),
			y: Math.floor(pixelY / this.cellSize)
		};
	}

	getCellFromScreen(screenX: number, screenY: number, cam?: Camera): { x: number; y: number } {
		if (cam && this.worldMapMode) {
			const world = cam.screenToWorld(screenX, screenY);
			return {
				x: Math.floor(world.x / this.cellSize),
				y: Math.floor(world.y / this.cellSize)
			};
		}
		return this.getCellFromPixel(screenX, screenY);
	}

	getPixelFromCell(cellX: number, cellY: number): { x: number; y: number } {
		return { x: cellX * this.cellSize, y: cellY * this.cellSize };
	}

	getCenterPixelFromCell(cellX: number, cellY: number): { x: number; y: number } {
		return {
			x: cellX * this.cellSize + this.cellSize / 2,
			y: cellY * this.cellSize + this.cellSize / 2
		};
	}

	getCellSize(): number { return this.cellSize; }

	setCellSize(size: number): void {
		this.cellSize = size;
		this.gridLayerDirty = true;
		this.isDirty = true;
		this.layerDirty = true;
	}

	getRawData(): number[][] { return this.grid; }

	// ── Generation ────────────────────────────────────────────────────────────

	generateRandomMaze(): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) this.grid[y][x] = 1;
		}

		const stack: { x: number; y: number }[] = [];
		const startPos = { x: 1, y: 1 };
		this.grid[startPos.y][startPos.x] = 0;
		stack.push(startPos);

		while (stack.length > 0) {
			const current = stack[stack.length - 1];
			const neighbors = this.getUnvisitedNeighbors(current.x, current.y);
			if (neighbors.length > 0) {
				const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
				this.grid[(current.y + chosen.y) / 2][(current.x + chosen.x) / 2] = 0;
				this.grid[chosen.y][chosen.x] = 0;
				stack.push(chosen);
			} else {
				stack.pop();
			}
		}
		this.isDirty = true;
		this.layerDirty = true;
	}

	generateRandomGrid(probability = 0.2): void {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				this.grid[y][x] = Math.random() < probability ? 1 : 0;
			}
		}
		this.isDirty = true;
		this.layerDirty = true;
	}

	/**
	 * Generate a world map.
	 * Returns the seed that was actually used (so the UI can display it).
	 */
	generateWorldMap(
		options: Partial<WorldGenOptions> & { multiplier?: number } = {},
		canvasWidth?: number,
		canvasHeight?: number
	): number {
		const seed = (options.seed !== undefined && options.seed !== 0)
			? options.seed
			: Rng.randomSeed();

		const multiplier = options.multiplier ?? 3;
		const baseW = canvasWidth  !== undefined ? Math.floor(canvasWidth  / this.cellSize) : this.normalWidth;
		const baseH = canvasHeight !== undefined ? Math.floor(canvasHeight / this.cellSize) : this.normalHeight;

		this.worldWidth  = Math.max(1, Math.floor(baseW * multiplier));
		this.worldHeight = Math.max(1, Math.floor(baseH * multiplier));
		this.worldMapMode = true;

		const fullOptions: WorldGenOptions = {
			seed,
			enable: {
				mountains:  true,
				hills:      true,
				lakes:      true,
				rivers:     true,
				forests:    true,
				cities:     true,
				villages:   true,
				bridges:    true,
				coastlines: true,
				sand:       true,
				...(options.enable ?? {}),
			},
		};

		const generator = new WorldMapGenerator(this.worldWidth, this.worldHeight);
		this.worldGrid = generator.generate(fullOptions);
		this.grid   = this.worldGrid;
		this.width  = this.worldWidth;
		this.height = this.worldHeight;

		this.buildWorldCanvas();
		return seed;
	}

	findNearestRoad(x: number, y: number): { x: number; y: number } | null {
		const W = this.width;
		const visited = new Set<number>();
		const queue: { x: number; y: number }[] = [{ x, y }];
		visited.add(y * W + x);

		while (queue.length > 0) {
			const cur = queue.shift()!;
			if (this.grid[cur.y]?.[cur.x] === TerrainType.ROAD) return { x: cur.x, y: cur.y };

			for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
				const nx = cur.x + dx;
				const ny = cur.y + dy;
				if (nx >= 0 && nx < W && ny >= 0 && ny < this.height) {
					const k = ny * W + nx;
					if (!visited.has(k)) { visited.add(k); queue.push({ x: nx, y: ny }); }
				}
			}
		}
		return null;
	}

	// ── Rendering ─────────────────────────────────────────────────────────────

	drawActiveCells(p: p5, activeCellColor?: string, cam?: Camera): void {
		if (this.worldMapMode) {
			this.drawWorldMap(p, cam);
			return;
		}

		this.updateActiveCells();
		const color = activeCellColor || '#0000ff';

		const needNewLayer = !this.cellsLayer ||
			!this.cachedLayerSize ||
			this.cachedLayerSize.w !== p.width ||
			this.cachedLayerSize.h !== p.height;

		if (needNewLayer) {
			this.cellsLayer?.remove();
			this.cellsLayer = p.createGraphics(p.width, p.height);
			this.cachedLayerSize = { w: p.width, h: p.height };
			this.layerDirty = true;
		}

		if (this.layerDirty || this.cachedActiveColor !== color) {
			const ctx = (this.cellsLayer as any).drawingContext as CanvasRenderingContext2D;
			ctx.clearRect(0, 0, this.cellsLayer!.width, this.cellsLayer!.height);
			ctx.fillStyle = color;
			ctx.beginPath();

			const maxX = Math.min(this.width  - 1, Math.ceil(p.width  / this.cellSize));
			const maxY = Math.min(this.height - 1, Math.ceil(p.height / this.cellSize));
			const size = this.cellSize;
			const flat = this.activeCellsFlat;

			for (let i = 0; i < this.activeCellCount * 2; i += 2) {
				const cx = flat[i];
				const cy = flat[i + 1];
				if (cx <= maxX && cy <= maxY) ctx.rect(cx * size, cy * size, size, size);
			}
			ctx.fill();
			this.cachedActiveColor = color;
			this.layerDirty = false;
		}

		p.image(this.cellsLayer!, 0, 0);
	}

	drawGrid(p: p5, gridColor?: string, cam?: Camera): void {
		const color = gridColor || '#323232';

		if (this.worldMapMode && cam) {
			// Direct draw — grid lines shift with camera, no offscreen caching needed
			const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
			const zoom = cam.zoom;
			const cs = this.cellSize;

			const startCX = Math.floor(cam.offsetX / cs);
			const startCY = Math.floor(cam.offsetY / cs);
			const endCX   = Math.min(this.width,  Math.ceil((cam.offsetX + p.width  / zoom) / cs) + 1);
			const endCY   = Math.min(this.height, Math.ceil((cam.offsetY + p.height / zoom) / cs) + 1);

			ctx.save();
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
		const needNewLayer = !this.gridLayer ||
			!this.cachedGridLayerSize ||
			this.cachedGridLayerSize.w !== p.width ||
			this.cachedGridLayerSize.h !== p.height;

		if (needNewLayer) {
			this.gridLayer?.remove();
			this.gridLayer = p.createGraphics(p.width, p.height);
			this.cachedGridLayerSize = { w: p.width, h: p.height };
			this.gridLayerDirty = true;
		}

		if (this.gridLayerDirty || this.cachedGridColor !== color) {
			const ctx = (this.gridLayer as any).drawingContext as CanvasRenderingContext2D;
			ctx.clearRect(0, 0, this.gridLayer!.width, this.gridLayer!.height);
			ctx.strokeStyle = color;
			ctx.lineWidth = 1;
			ctx.beginPath();

			const s = this.cellSize;
			for (let x = 0; x <= this.width; x++)  { const px = x * s; ctx.moveTo(px, 0); ctx.lineTo(px, this.height * s); }
			for (let y = 0; y <= this.height; y++) { const py = y * s; ctx.moveTo(0, py); ctx.lineTo(this.width * s, py); }
			ctx.stroke();

			this.cachedGridColor = color;
			this.gridLayerDirty = false;
		}

		p.image(this.gridLayer!, 0, 0);
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private updateActiveCells(): void {
		if (!this.isDirty) return;
		let count = 0;
		for (let y = 0; y < this.height; y++) {
			const row = this.grid[y];
			for (let x = 0; x < this.width; x++) if (row[x] === 1) count++;
		}
		if (this.activeCellsFlat.length < count * 2) {
			this.activeCellsFlat = new Int16Array(count * 2);
		}
		let idx = 0;
		for (let y = 0; y < this.height; y++) {
			const row = this.grid[y];
			for (let x = 0; x < this.width; x++) {
				if (row[x] === 1) { this.activeCellsFlat[idx++] = x; this.activeCellsFlat[idx++] = y; }
			}
		}
		this.activeCellCount = count;
		this.isDirty = false;
	}

	private getUnvisitedNeighbors(x: number, y: number): { x: number; y: number }[] {
		const neighbors: { x: number; y: number }[] = [];
		for (const { dx, dy } of [{ dx:0,dy:-2 },{ dx:2,dy:0 },{ dx:0,dy:2 },{ dx:-2,dy:0 }]) {
			const nx = x + dx, ny = y + dy;
			if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1 && this.grid[ny][nx] === 1) {
				neighbors.push({ x: nx, y: ny });
			}
		}
		return neighbors;
	}

	private buildWorldCanvas(): void {
		const pxW = this.worldWidth  * this.cellSize;
		const pxH = this.worldHeight * this.cellSize;

		if (!this.worldOffscreenCanvas ||
			this.worldOffscreenCanvas.width  !== pxW ||
			this.worldOffscreenCanvas.height !== pxH) {
			this.worldOffscreenCanvas = document.createElement('canvas');
			this.worldOffscreenCanvas.width  = pxW;
			this.worldOffscreenCanvas.height = pxH;
		}

		const ctx = this.worldOffscreenCanvas.getContext('2d')!;
		ctx.clearRect(0, 0, pxW, pxH);

		const colors = this.buildColorLUT();
		const cs = this.cellSize;

		for (let t = 2; t < colors.length; t++) {
			const color = colors[t];
			if (!color) continue;
			ctx.fillStyle = color;
			ctx.beginPath();
			for (let y = 0; y < this.worldHeight; y++) {
				const row = this.worldGrid[y];
				for (let x = 0; x < this.worldWidth; x++) {
					if (row[x] === t) ctx.rect(x * cs, y * cs, cs, cs);
				}
			}
			ctx.fill();
		}

		this.worldOffscreenDirty = false;
	}

	private buildColorLUT(): string[] {
		return [
			'', // EMPTY
			'', // WALL
			this.worldMapColors.road,
			this.worldMapColors.mountain,
			this.worldMapColors.river,
			this.worldMapColors.plain,
			this.worldMapColors.hill     ?? '#A8D08D',
			this.worldMapColors.forest   ?? '#6B8F6E',
			this.worldMapColors.bridge   ?? '#DAA520',
			this.worldMapColors.coast    ?? '#F4A460',
			this.worldMapColors.village  ?? '#D2B48C',
			this.worldMapColors.sand     ?? '#F5E6D3',
		];
	}

	private drawWorldMap(p: p5, cam?: Camera): void {
		if (this.worldOffscreenDirty) this.buildWorldCanvas();
		if (!this.worldOffscreenCanvas || this.worldWidth === 0) return;

		const ctx = (p as any).drawingContext as CanvasRenderingContext2D;

		if (cam) {
			const srcX = cam.offsetX;
			const srcY = cam.offsetY;
			const srcW = p.width  / cam.zoom;
			const srcH = p.height / cam.zoom;
			ctx.drawImage(
				this.worldOffscreenCanvas,
				srcX, srcY, srcW, srcH,
				0, 0, p.width, p.height
			);
		} else {
			ctx.drawImage(this.worldOffscreenCanvas, 0, 0, p.width, p.height);
		}
	}
}

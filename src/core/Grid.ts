import type p5 from 'p5';
import { type Terrain, TerrainType } from './TerrainType';

/** Represents a 2D grid position */
export interface Position {
	x: number;
	y: number;
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

	private grid: Terrain[][] = [];
	public width = 0;
	public height = 0;

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
		this.width  = Math.floor(canvasWidth  / this.cellSize);
		this.height = Math.floor(canvasHeight / this.cellSize);

		this.grid = Array.from({ length: this.height }, () =>
			new Array<Terrain>(this.width).fill(TerrainType.EMPTY)
		);

		this.gridLayer.dirty = true;
		this.markCellsDirty();
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
				this.markCellsDirty();
			}
		}
	}

	isCellTraversable(x: number, y: number): boolean {
		return this.getCell(x, y) !== TerrainType.WALL;
	}

	// ── Coordinate helpers ────────────────────────────────────────────────────

	getCellFromPixel(pixelX: number, pixelY: number): Position {
		return {
			x: Math.floor(pixelX / this.cellSize),
			y: Math.floor(pixelY / this.cellSize)
		};
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

	drawActiveCells(p: p5, color: string): void {
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

	drawGrid(p: p5, color: string): void {
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
}

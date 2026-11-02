import type { Camera } from './Camera';
import { CellType, TYPE_COUNT } from './CellType';
import { CHUNK_BITS, CHUNK_SIZE, type Chunk, WallGrid } from './WallGrid';

/** A chunk rendered to its own canvas, one pixel per cell, valid while `version` matches the chunk's. */
interface CachedChunk {
	canvas: OffscreenCanvas;
	context: OffscreenCanvasRenderingContext2D;
	version: number;
	/** The chunk the picture was packed from: a different object at the same coordinates is a different chunk. */
	chunk: Chunk | null;
	cx: number;
	cy: number;
}

/** Draws walls from per-chunk canvases that are repacked only when their chunk changes, and the grid lines on top. */
export class GridRenderer {
	/**
	 * Grid lines fade with the on-screen cell size: at 10 px and up a 1 px line covers at most a tenth of the cell;
	 * at 4 px lines (anti-aliased to ~2 px at fractional zoom) would cover half of every cell and hide it.
	 */
	private static readonly GRID_FADE_FULL_PX = 10;
	private static readonly GRID_FADE_HIDDEN_PX = 4;
	/**
	 * Time a frame may spend repacking stale chunks, and at least one is repacked per frame so the picture always converges. A fill that
	 * made ~130 chunks stale (1456 x 822 window, 3 px cells, zoom 25%) repacked them all in one frame of 59 to 98 ms in the browser, about
	 * 0.5 ms per chunk, of which the cell loop is 0.04 ms in V8 (0.10 to 0.12 ms with a branch per cell, hence a color table indexed by cell
	 * type: one load per cell, no branch) and the rest is `putImageData` and the canvas upload. A stale chunk keeps drawing its old picture
	 * until its turn, and a chunk that is new draws empty: a fill appears over a few frames, and a color change shows both colors until every chunk is repacked.
	 */
	private static readonly REPACK_BUDGET_MS = 4;

	private readonly grid: WallGrid;
	private readonly cache = new Map<number, CachedChunk>();
	private readonly image = new ImageData(CHUNK_SIZE, CHUNK_SIZE);
	private readonly pixels = new Uint32Array(this.image.data.buffer);
	/** Packed pixel of each cell type, 0 (transparent) for the types without a color. */
	private readonly palette = new Uint32Array(TYPE_COUNT);
	private color = '';

	constructor(grid: WallGrid) {
		this.grid = grid;
	}

	drawWalls(ctx: CanvasRenderingContext2D, camera: Camera, color: string): void {
		if (color !== this.color) {
			this.color = color;
			this.palette[CellType.WALL] = GridRenderer.packColor(color);
			/** Entries are marked stale instead of dropped: dragging a color picker fires many changes and would recreate every canvas each time. */
			for (const entry of this.cache.values()) entry.version = -1;
		}

		const view = camera.visibleRect();
		const firstX = view.x >> CHUNK_BITS;
		const lastX = (view.x + view.width - 1) >> CHUNK_BITS;
		const firstY = view.y >> CHUNK_BITS;
		const lastY = (view.y + view.height - 1) >> CHUNK_BITS;
		const { scale, offsetX, offsetY } = camera;
		const deadline = performance.now() + GridRenderer.REPACK_BUDGET_MS;
		let repacked = false;

		ctx.save();
		ctx.imageSmoothingEnabled = false;
		for (let cy = firstY; cy <= lastY; cy++) {
			/** Both edges are rounded on their own, so neighbor chunks share an edge exactly and leave no seam. */
			const top = Math.round((cy * CHUNK_SIZE - offsetY) * scale);
			const bottom = Math.round(((cy + 1) * CHUNK_SIZE - offsetY) * scale);
			for (let cx = firstX; cx <= lastX; cx++) {
				const chunk = this.grid.chunkAt(cx, cy);
				const key = WallGrid.key(cx, cy);
				if (chunk === undefined) {
					this.cache.delete(key);
					continue;
				}

				let entry = this.cache.get(key);
				if (entry === undefined) {
					entry = GridRenderer.createEntry(cx, cy);
					this.cache.set(key, entry);
				}
				/** A chunk recreated at the same coordinates (a Clear, then a redraw) must not show the picture of the one it replaced. */
				if (entry.chunk !== chunk) {
					entry.context.clearRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
					entry.chunk = chunk;
					entry.version = -1;
				}
				if (entry.version !== chunk.version && (!repacked || performance.now() < deadline)) {
					const { pixels, palette } = this;
					for (let i = 0; i < pixels.length; i++) pixels[i] = palette[chunk.cells[i]];
					entry.context.putImageData(this.image, 0, 0);
					entry.version = chunk.version;
					repacked = true;
				}

				const left = Math.round((cx * CHUNK_SIZE - offsetX) * scale);
				const right = Math.round(((cx + 1) * CHUNK_SIZE - offsetX) * scale);
				ctx.drawImage(entry.canvas, left, top, right - left, bottom - top);
			}
		}
		ctx.restore();

		const visibleChunks = (lastX - firstX + 1) * (lastY - firstY + 1);
		if (this.cache.size > visibleChunks * 2 + 64) {
			for (const [key, entry] of this.cache) {
				if (entry.cx < firstX || entry.cx > lastX || entry.cy < firstY || entry.cy > lastY) this.cache.delete(key);
			}
		}
	}

	drawLines(ctx: CanvasRenderingContext2D, camera: Camera, color: string): void {
		const { scale, offsetX, offsetY } = camera;
		const alpha = GridRenderer.gridAlpha(scale);
		if (alpha === 0) return;

		const view = camera.visibleRect();
		const top = (view.y - offsetY) * scale;
		const bottom = (view.y + view.height - offsetY) * scale;
		const left = (view.x - offsetX) * scale;
		const right = (view.x + view.width - offsetX) * scale;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = color;
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let x = view.x; x <= view.x + view.width; x++) {
			const sx = Math.round((x - offsetX) * scale) + 0.5;
			ctx.moveTo(sx, top);
			ctx.lineTo(sx, bottom);
		}
		for (let y = view.y; y <= view.y + view.height; y++) {
			const sy = Math.round((y - offsetY) * scale) + 0.5;
			ctx.moveTo(left, sy);
			ctx.lineTo(right, sy);
		}
		ctx.stroke();
		ctx.restore();
	}

	private static createEntry(cx: number, cy: number): CachedChunk {
		const canvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE);
		const context = canvas.getContext('2d');
		if (context === null) throw new Error('2D context unavailable on OffscreenCanvas');
		return { canvas, context, version: -1, chunk: null, cx, cy };
	}

	private static gridAlpha(cellPx: number): number {
		const t = (cellPx - GridRenderer.GRID_FADE_HIDDEN_PX) / (GridRenderer.GRID_FADE_FULL_PX - GridRenderer.GRID_FADE_HIDDEN_PX);
		return Math.max(0, Math.min(1, t));
	}

	/** Packs `#rrggbb` (what color inputs always give) as an opaque pixel: ImageData bytes are R, G, B, A, read little-endian as 0xAABBGGRR. */
	private static packColor(hex: string): number {
		const rgb = Number.parseInt(hex.slice(1), 16);
		return (0xff << 24 | (rgb & 0xff) << 16 | (rgb >> 8 & 0xff) << 8 | rgb >> 16) >>> 0;
	}
}

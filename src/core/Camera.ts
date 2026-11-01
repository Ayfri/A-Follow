import type { CellRect, Position } from './WallGrid';

/** Screen point kept fixed during a zoom animation, with the fractional cell that was under it when the zoom started. */
interface ZoomAnchor {
	screenX: number;
	screenY: number;
	cellX: number;
	cellY: number;
}

/** View of the infinite grid: the offset is the fractional cell at the screen's top-left, `scale` is screen pixels per cell. */
export class Camera {
	offsetX = 0;
	offsetY = 0;
	zoom = 1.0;
	targetZoom = 1.0;
	private size: number;
	private screenW = 0;
	private screenH = 0;
	private anchor: ZoomAnchor | null = null;

	static readonly MIN_ZOOM = 0.25;
	static readonly MAX_ZOOM = 4;
	/** Exponential easing rate in 1/s: 95% of a zoom step is done after about 150 ms (e^-3). */
	private static readonly ZOOM_EASE = 20;
	/** Below this gap the zoom snaps to its target so the animation ends. */
	private static readonly ZOOM_SNAP = 1e-4;

	constructor(cellSize: number) {
		this.size = cellSize;
	}

	get cellSize(): number {
		return this.size;
	}

	get scale(): number {
		return this.size * this.zoom;
	}

	setScreenSize(w: number, h: number): void {
		this.screenW = w;
		this.screenH = h;
	}

	/**
	 * Advances the zoom animation by `dt` seconds (frame-rate independent) and returns whether the camera moved.
	 * The offset is recomputed from the anchor each step, so the anchored cell stays under its screen point exactly.
	 */
	update(dt: number): boolean {
		if (this.zoom === this.targetZoom) return false;

		const diff = this.targetZoom - this.zoom;
		this.zoom = Math.abs(diff) < Camera.ZOOM_SNAP
			? this.targetZoom
			: this.zoom + diff * (1 - Math.exp(-Camera.ZOOM_EASE * dt));

		if (this.anchor) {
			this.offsetX = this.anchor.cellX - this.anchor.screenX / this.scale;
			this.offsetY = this.anchor.cellY - this.anchor.screenY / this.scale;
		}

		if (this.zoom === this.targetZoom) this.anchor = null;
		return true;
	}

	/** Fractional cell coordinates under a screen point. */
	screenToCell(sx: number, sy: number): Position {
		return {
			x: sx / this.scale + this.offsetX,
			y: sy / this.scale + this.offsetY,
		};
	}

	/** Screen position of a fractional cell coordinate. */
	cellToScreen(cx: number, cy: number): Position {
		return {
			x: (cx - this.offsetX) * this.scale,
			y: (cy - this.offsetY) * this.scale,
		};
	}

	cellAt(sx: number, sy: number): Position {
		const cell = this.screenToCell(sx, sy);
		return { x: Math.floor(cell.x), y: Math.floor(cell.y) };
	}

	/** Smallest integer cell rectangle covering the screen. */
	visibleRect(): CellRect {
		const x = Math.floor(this.offsetX);
		const y = Math.floor(this.offsetY);
		return {
			x,
			y,
			width: Math.ceil(this.offsetX + this.screenW / this.scale) - x,
			height: Math.ceil(this.offsetY + this.screenH / this.scale) - y,
		};
	}

	/** A pan during a zoom animation moves the anchor with it, so the zoom keeps going around the same screen point. */
	moveTo(offsetX: number, offsetY: number): void {
		this.offsetX = offsetX;
		this.offsetY = offsetY;
		this.reanchor();
	}

	/** Pans by `dx`, `dy` cells. */
	pan(dx: number, dy: number): void {
		this.moveTo(this.offsetX + dx, this.offsetY + dy);
	}

	/**
	 * Smooth wheel zoom: multiplies the target zoom and anchors the cell under (screenX, screenY).
	 * Several ticks stack on the target, each one re-anchoring at the current cursor. Only `update()` moves the camera.
	 */
	smoothZoomAt(factor: number, screenX: number, screenY: number): void {
		this.targetZoom = Math.max(Camera.MIN_ZOOM, Math.min(Camera.MAX_ZOOM, this.targetZoom * factor));
		this.anchor = this.targetZoom === this.zoom ? null : {
			screenX,
			screenY,
			cellX: this.offsetX + screenX / this.scale,
			cellY: this.offsetY + screenY / this.scale,
		};
	}

	/** Immediate zoom, around the given screen point or the screen center. Cancels a running animation. */
	setZoom(newZoom: number, anchorSx = this.screenW / 2, anchorSy = this.screenH / 2): void {
		const anchorCell = this.screenToCell(anchorSx, anchorSy);
		this.zoom = Math.max(Camera.MIN_ZOOM, Math.min(Camera.MAX_ZOOM, newZoom));
		this.targetZoom = this.zoom;
		this.anchor = null;
		this.offsetX = anchorCell.x - anchorSx / this.scale;
		this.offsetY = anchorCell.y - anchorSy / this.scale;
	}

	/** Changes the cell size around the given screen point or the screen center. A running zoom animation continues. */
	setCellSize(size: number, anchorSx = this.screenW / 2, anchorSy = this.screenH / 2): void {
		const anchorCell = this.screenToCell(anchorSx, anchorSy);
		this.size = size;
		this.offsetX = anchorCell.x - anchorSx / this.scale;
		this.offsetY = anchorCell.y - anchorSy / this.scale;
		this.reanchor();
	}

	/** Puts the center of a cell at the screen center, at zoom 1. Cancels a running animation. */
	centerOn(cellX: number, cellY: number): void {
		this.zoom = 1.0;
		this.targetZoom = 1.0;
		this.anchor = null;
		this.offsetX = cellX + 0.5 - this.screenW / 2 / this.scale;
		this.offsetY = cellY + 0.5 - this.screenH / 2 / this.scale;
	}

	private reanchor(): void {
		if (!this.anchor) return;
		this.anchor.cellX = this.offsetX + this.anchor.screenX / this.scale;
		this.anchor.cellY = this.offsetY + this.anchor.screenY / this.scale;
	}
}

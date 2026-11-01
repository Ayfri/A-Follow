import type { Position } from './Grid';

/** Screen point kept fixed during a zoom animation, with the world point that was under it when the zoom started. */
interface ZoomAnchor {
	screenX: number;
	screenY: number;
	worldX: number;
	worldY: number;
}

export class Camera {
	offsetX = 0;
	offsetY = 0;
	zoom = 1.0;
	targetZoom = 1.0;
	private worldPxW = 1;
	private worldPxH = 1;
	private screenW = 0;
	private screenH = 0;
	private anchor: ZoomAnchor | null = null;

	static readonly MIN_ZOOM = 0.25;
	static readonly MAX_ZOOM = 4;
	/** Exponential easing rate in 1/s: 95% of a zoom step is done after about 150 ms (e^-3). */
	private static readonly ZOOM_EASE = 20;
	/** Below this gap the zoom snaps to its target so the animation ends. */
	private static readonly ZOOM_SNAP = 1e-4;

	setWorldSize(pxW: number, pxH: number): void {
		this.worldPxW = Math.max(1, pxW);
		this.worldPxH = Math.max(1, pxH);
		this.clampOffset();
	}

	setScreenSize(w: number, h: number): void {
		this.screenW = w;
		this.screenH = h;
		this.clampOffset();
	}

	/**
	 * Advances the zoom animation by `dt` seconds (frame-rate independent) and returns whether the camera moved.
	 * The offset is recomputed from the anchor each step, so the anchored world point stays under its screen point
	 * exactly, except where clamping at the world edges forces the view to move.
	 */
	update(dt: number): boolean {
		if (this.zoom === this.targetZoom) return false;

		const diff = this.targetZoom - this.zoom;
		this.zoom = Math.abs(diff) < Camera.ZOOM_SNAP
			? this.targetZoom
			: this.zoom + diff * (1 - Math.exp(-Camera.ZOOM_EASE * dt));

		if (this.anchor) {
			this.offsetX = this.anchor.worldX - this.anchor.screenX / this.zoom;
			this.offsetY = this.anchor.worldY - this.anchor.screenY / this.zoom;
		}
		this.clampOffset();

		if (this.zoom === this.targetZoom) this.anchor = null;
		return true;
	}

	screenToWorld(sx: number, sy: number): Position {
		return {
			x: sx / this.zoom + this.offsetX,
			y: sy / this.zoom + this.offsetY,
		};
	}

	worldToScreen(wx: number, wy: number): Position {
		return {
			x: (wx - this.offsetX) * this.zoom,
			y: (wy - this.offsetY) * this.zoom,
		};
	}

	/** A pan during a zoom animation moves the anchor with it, so the zoom keeps going around the same screen point. */
	moveTo(offsetX: number, offsetY: number): void {
		this.offsetX = offsetX;
		this.offsetY = offsetY;
		this.clampOffset();
		this.reanchor();
	}

	pan(dx: number, dy: number): void {
		this.moveTo(this.offsetX + dx, this.offsetY + dy);
	}

	/**
	 * Smooth wheel zoom: multiplies the target zoom and anchors the world point under (screenX, screenY).
	 * Several ticks stack on the target, each one re-anchoring at the current cursor. Only `update()` moves the camera.
	 */
	smoothZoomAt(factor: number, screenX: number, screenY: number): void {
		this.targetZoom = Math.max(Camera.MIN_ZOOM, Math.min(Camera.MAX_ZOOM, this.targetZoom * factor));
		this.anchor = this.targetZoom === this.zoom ? null : {
			screenX,
			screenY,
			worldX: this.offsetX + screenX / this.zoom,
			worldY: this.offsetY + screenY / this.zoom,
		};
	}

	/** Immediate zoom (for slider) */
	setZoom(newZoom: number, anchorSx: number, anchorSy: number): void {
		const worldAnchorX = anchorSx / this.zoom + this.offsetX;
		const worldAnchorY = anchorSy / this.zoom + this.offsetY;
		this.zoom = Math.max(Camera.MIN_ZOOM, Math.min(Camera.MAX_ZOOM, newZoom));
		this.targetZoom = this.zoom;
		this.anchor = null;
		this.offsetX = worldAnchorX - anchorSx / this.zoom;
		this.offsetY = worldAnchorY - anchorSy / this.zoom;
		this.clampOffset();
	}

	/** Center camera on a world-pixel point and reset zoom */
	resetTo(worldPxX: number, worldPxY: number): void {
		this.zoom = 1.0;
		this.targetZoom = 1.0;
		this.anchor = null;
		this.offsetX = worldPxX - this.screenW / 2;
		this.offsetY = worldPxY - this.screenH / 2;
		this.clampOffset();
	}

	/** Clamping at a world edge moves the view away from the anchored point: the anchor follows what is now under the cursor. */
	private clampOffset(): void {
		const maxX = this.worldPxW - this.screenW / this.zoom;
		const maxY = this.worldPxH - this.screenH / this.zoom;
		const x = Math.max(0, Math.min(maxX > 0 ? maxX : 0, this.offsetX));
		const y = Math.max(0, Math.min(maxY > 0 ? maxY : 0, this.offsetY));
		if (x === this.offsetX && y === this.offsetY) return;

		this.offsetX = x;
		this.offsetY = y;
		this.reanchor();
	}

	private reanchor(): void {
		if (!this.anchor) return;
		this.anchor.worldX = this.offsetX + this.anchor.screenX / this.zoom;
		this.anchor.worldY = this.offsetY + this.anchor.screenY / this.zoom;
	}
}

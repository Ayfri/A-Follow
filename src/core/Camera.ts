export class Camera {
	offsetX = 0;
	offsetY = 0;
	zoom = 1.0;
	targetZoom = 1.0;
	private worldPxW = 1;
	private worldPxH = 1;
	private screenW = 0;
	private screenH = 0;

	private static readonly ZOOM_LERP = 14; // higher = snappier

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

	/** Call once per frame with delta-time in seconds */
	update(dt: number): void {
		const diff = this.targetZoom - this.zoom;
		if (Math.abs(diff) > 0.0005) {
			this.zoom += diff * Math.min(1, Camera.ZOOM_LERP * dt);
			this.clampOffset();
		} else {
			this.zoom = this.targetZoom;
		}
	}

	screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return {
			x: sx / this.zoom + this.offsetX,
			y: sy / this.zoom + this.offsetY,
		};
	}

	worldToScreen(wx: number, wy: number): { x: number; y: number } {
		return {
			x: (wx - this.offsetX) * this.zoom,
			y: (wy - this.offsetY) * this.zoom,
		};
	}

	pan(dx: number, dy: number): void {
		this.offsetX += dx;
		this.offsetY += dy;
		this.clampOffset();
	}

	/** Smooth zoom: sets targetZoom and anchors around a screen point */
	smoothZoomAt(factor: number, anchorSx: number, anchorSy: number): void {
		// Anchor in world coords at current zoom — we'll re-anchor once per keyframe
		const worldAnchorX = anchorSx / this.zoom + this.offsetX;
		const worldAnchorY = anchorSy / this.zoom + this.offsetY;

		this.targetZoom = Math.max(0.25, Math.min(4.0, this.targetZoom * factor));

		// Instantly re-anchor so panning doesn't drift while lerping
		const newZoom = this.targetZoom;
		this.offsetX = worldAnchorX - anchorSx / newZoom;
		this.offsetY = worldAnchorY - anchorSy / newZoom;
		this.clampOffset();
		// zoom will lerp toward targetZoom via update()
	}

	/** Immediate zoom (for slider) */
	setZoom(newZoom: number, anchorSx: number, anchorSy: number): void {
		const worldAnchorX = anchorSx / this.zoom + this.offsetX;
		const worldAnchorY = anchorSy / this.zoom + this.offsetY;
		this.zoom = Math.max(0.25, Math.min(4.0, newZoom));
		this.targetZoom = this.zoom;
		this.offsetX = worldAnchorX - anchorSx / this.zoom;
		this.offsetY = worldAnchorY - anchorSy / this.zoom;
		this.clampOffset();
	}

	/** Center camera on a world-pixel point and reset zoom */
	resetTo(worldPxX: number, worldPxY: number): void {
		this.zoom = 1.0;
		this.targetZoom = 1.0;
		this.offsetX = worldPxX - this.screenW / 2;
		this.offsetY = worldPxY - this.screenH / 2;
		this.clampOffset();
	}

	private clampOffset(): void {
		const maxX = this.worldPxW - this.screenW / this.zoom;
		const maxY = this.worldPxH - this.screenH / this.zoom;
		this.offsetX = Math.max(0, Math.min(maxX > 0 ? maxX : 0, this.offsetX));
		this.offsetY = Math.max(0, Math.min(maxY > 0 ? maxY : 0, this.offsetY));
	}
}

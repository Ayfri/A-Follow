/** A standard 100 px mouse wheel notch zooms by exactly 1.1, so many small trackpad deltas add up to the same zoom. */
const ZOOM_PER_PIXEL = Math.log(1.1) / 100;
/** One huge wheel event can't jump straight to the zoom limits. */
const MAX_WHEEL_PIXELS = 300;
const LINE_HEIGHT_PX = 16;
/** `WheelEvent.deltaMode` values: 0 is pixels, 1 is lines, 2 is pages. */
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** Zoom factor of one wheel event: above 1 when scrolling up (zoom in), below 1 when scrolling down. */
export function wheelZoomFactor(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, pageHeightPx: number): number {
	const unit = event.deltaMode === DOM_DELTA_LINE ? LINE_HEIGHT_PX : event.deltaMode === DOM_DELTA_PAGE ? pageHeightPx : 1;
	const pixels = Math.max(-MAX_WHEEL_PIXELS, Math.min(MAX_WHEEL_PIXELS, event.deltaY * unit));
	return Math.exp(-pixels * ZOOM_PER_PIXEL);
}

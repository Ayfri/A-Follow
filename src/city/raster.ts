/**
 * Calls `paint(i)` with the index in a `size` x `size` tile at (tileX, tileY) of every cell of the line from (x0, y0) to (x1, y1), `width`
 * cells wide across its minor axis. Both end cells are painted and the cells are 4-connected.
 *
 * Every cell is a closed-form function of its position along the major axis, so a tile that sees only a piece of the line paints exactly
 * the cells the same piece has in a bigger tile: roads cross chunk borders without a seam.
 */
export const rasterize = (
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	width: number,
	tileX: number,
	tileY: number,
	size: number,
	paint: (i: number) => void
): void => {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const wide = Math.abs(dx) >= Math.abs(dy);
	const major = wide ? Math.abs(dx) : Math.abs(dy);
	const minor = wide ? Math.abs(dy) : Math.abs(dx);
	const majorStart = wide ? x0 : y0;
	const minorStart = wide ? y0 : x0;
	const majorSign = (wide ? dx : dy) < 0 ? -1 : 1;
	const minorSign = (wide ? dy : dx) < 0 ? -1 : 1;
	const tileMajor = wide ? tileX : tileY;
	const tileMinor = wide ? tileY : tileX;
	const spread = -Math.floor((width - 1) / 2);

	/** Index along the line of the first cell inside the tile on the major axis. */
	const first = majorSign > 0 ? tileMajor - majorStart : majorStart - (tileMajor + size - 1);
	/** One step back, so a corner cell that belongs to a step starting outside the tile is painted. */
	const from = Math.max(0, first - 1);
	const to = Math.min(major, first + size - 1);

	const stamp = (atMajor: number, atMinor: number): void => {
		const u = atMajor - tileMajor;
		if (u < 0 || u >= size) return;
		for (let w = 0; w < width; w++) {
			const v = atMinor + spread + w - tileMinor;
			if (v >= 0 && v < size) paint(wide ? v * size + u : u * size + v);
		}
	};
	/** Rounds to the nearest cell, halves up. Integers only, so no float rounding decides a cell. */
	const offset = (i: number): number => (major === 0 ? 0 : Math.floor((2 * i * minor + major) / (2 * major)));

	for (let i = from; i <= to; i++) {
		const at = offset(i);
		stamp(majorStart + majorSign * i, minorStart + minorSign * at);
		/**
		 * A width of 1 steps diagonally where the minor axis moves, so the cell next to it on the old minor is added. A wider line already
		 * shares a row between two columns, since the minor axis moves by at most 1 per step.
		 */
		if (width === 1 && i < major && offset(i + 1) !== at) stamp(majorStart + majorSign * (i + 1), minorStart + minorSign * at);
	}
};

import { hash, Salt } from './hash';

/**
 * How a district lays its streets out: a straight grid, a grid bent by a smooth warp, rings and spokes around the center. Only GRID is
 * evaluated for now, the other two are reserved so a frame can switch to them without a new type.
 */
export const FrameKind = { GRID: 0, WARP: 1, RADIAL: 2 } as const;
export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

/**
 * The coordinates of one district. A cell at (x, y) has `a = dx * c + dy * s` and `b = -dx * s + dy * c`, with (dx, dy) measured from the
 * origin: the streets are the lines of constant `a` (family A) and of constant `b` (family B), the blocks are the rectangles between them.
 */
export interface Frame {
	kind: FrameKind;
	ox: number;
	oy: number;
	/** Unit vector of the A axis. */
	c: number;
	s: number;
	/** `(|c| + |s|) / 2`: how far a cell reaches along an axis from its center, 0.5 for an axis-aligned frame and 0.707 at 45 degrees. */
	half: number;
	/** Whether the axes run along x and y: the cells are exactly the units of the frame. */
	aligned: boolean;
	blockA: number;
	blockB: number;
	phaseA: number;
	phaseB: number;
	/** A line moves up to this many units off its place on the regular grid: lines stay in order and the grid does not look ruled. */
	jitterA: number;
	jitterB: number;
	/** Every `avenueEvery`th line is an avenue, `avenueWidth` times as thick as a street. */
	avenueEvery: number;
	avenueWidth: number;
	/** Uint32 hash that names the frame in the hashes of its lines and blocks. */
	key: number;
}

export const Line = { NONE: 0, STREET: 1, AVENUE: 2 } as const;

/** Position on its axis of the line number `k` of family A (`family` 0) or B (1). */
export const linePosition = (frame: Frame, family: 0 | 1, k: number): number => {
	const block = family === 0 ? frame.blockA : frame.blockB;
	const jitter = family === 0 ? frame.jitterA : frame.jitterB;
	return (family === 0 ? frame.phaseA : frame.phaseB) + k * block + (hash(frame.key, k, family, Salt.LINE_JITTER) % (2 * jitter + 1)) - jitter;
};

/** World x and y of the point (a, b) of the frame; the block centers use it, the warp is ignored. */
export const frameX = (frame: Frame, a: number, b: number): number => frame.ox + a * frame.c - b * frame.s;
export const frameY = (frame: Frame, a: number, b: number): number => frame.oy + a * frame.s + b * frame.c;

/**
 * The lines of one family over the range of a tile: the line numbers `first ..`, where a line of width `w` holds the cells with
 * `-w * half <= a - L < w * half`. The cell is a closed square and the line is continuous, so every cell it touches shares an edge with the
 * next one it touches: the cells are 4-connected, a staircase at an angle and a single row on an axis. An axis-aligned street (`w = 1`,
 * `half = 0.5`) holds exactly the one cell where `a === L`.
 */
class Family {
	first = 0;
	/** Position `L` of each line, the end of its band `L - w * half` (where the block before it ends), and the start of the block after it, `L + w * half`. */
	lines = new Float64Array(0);
	ends = new Float64Array(0);
	starts = new Float64Array(0);
	avenue = new Uint8Array(0);

	build(frame: Frame, family: 0 | 1, low: number, high: number): void {
		const block = family === 0 ? frame.blockA : frame.blockB;
		const phase = family === 0 ? frame.phaseA : frame.phaseB;
		/** The margin of 2 lines on each side covers the jitter, which is under an eighth of a block. */
		this.first = Math.floor((low - phase) / block) - 2;
		const count = Math.floor((high - phase) / block) + 2 - this.first + 1;
		this.lines = new Float64Array(count);
		this.ends = new Float64Array(count);
		this.starts = new Float64Array(count);
		this.avenue = new Uint8Array(count);
		for (let i = 0; i < count; i++) {
			const k = this.first + i;
			const thick = (k % frame.avenueEvery === 0 ? frame.avenueWidth : 1) * frame.half;
			this.lines[i] = linePosition(frame, family, k);
			this.ends[i] = this.lines[i] - thick;
			this.starts[i] = this.lines[i] + thick;
			this.avenue[i] = k % frame.avenueEvery === 0 ? 1 : 0;
		}
	}

	/** Index in the tables of the last line at or before `p`: the estimate is within one line of the answer. */
	indexAt(frame: Frame, family: 0 | 1, p: number): number {
		const { lines } = this;
		let i = Math.floor((p - (family === 0 ? frame.phaseA : frame.phaseB)) / (family === 0 ? frame.blockA : frame.blockB)) - this.first;
		while (lines[i + 1] <= p) i++;
		while (lines[i] > p) i--;
		return i;
	}

	/** The `Line` the position `p` is on among the lines `i` and `i + 1`, which hold it when it is under the start of line `i`'s band or past the end of line `i + 1`'s. */
	lineAt(p: number, i: number): number {
		let line: number = Line.NONE;
		if (p < this.starts[i]) line = this.avenue[i] === 1 ? Line.AVENUE : Line.STREET;
		if (p >= this.ends[i + 1]) line = Math.max(line, this.avenue[i + 1] === 1 ? Line.AVENUE : Line.STREET);
		return line;
	}
}

/**
 * A frame over one tile: the position of every line the tile can touch is computed once on the first `locate`, so a cell finds its lines
 * with no hash. `locate` sets the fields below for a cell of the tile. A cell inside the block of the last cell that was in one only
 * compares its `a` and `b` with the limits of that block, which is most of them.
 */
export class FrameView {
	readonly frame: Frame;
	/** Whether the cell is on a line (`Line`): the avenue wins over the street where they cross. */
	line: number = Line.NONE;
	/** Numbers of the lines that bound the block of the cell: its low side, `ka` for family A and `kb` for B. Set when `line` is NONE. */
	ka = 0;
	kb = 0;
	/** Position of the cell in its block, in units of the frame: `0 <= u < width` and `0 <= v < height`. */
	u = 0;
	v = 0;
	width = 0;
	height = 0;
	/** The `a` and `b` of the corner of the block with the lowest coordinates: block-local (u, v) is at (originA + u, originB + v). */
	originA = 0;
	originB = 0;
	private readonly tileX: number;
	private readonly tileY: number;
	private readonly tileSize: number;
	private ready = false;
	private readonly familyA = new Family();
	private readonly familyB = new Family();
	/** Limits of the block of the last cell that was not on a line, NaN before it: no `a` or `b` passes the comparison with NaN. */
	private endA = Number.NaN;
	private endB = Number.NaN;

	constructor(frame: Frame, x0: number, y0: number, size: number) {
		this.frame = frame;
		this.tileX = x0;
		this.tileY = y0;
		this.tileSize = size;
	}

	/** The range of `a` and `b` over the tile comes from its four corners. */
	private build(): void {
		const { frame, tileX, tileY, tileSize } = this;
		const lowX = tileX - frame.ox;
		const highX = tileX + tileSize - 1 - frame.ox;
		const lowY = tileY - frame.oy;
		const highY = tileY + tileSize - 1 - frame.oy;
		let aLow = Infinity;
		let aHigh = -Infinity;
		let bLow = Infinity;
		let bHigh = -Infinity;
		for (const dx of [lowX, highX]) {
			for (const dy of [lowY, highY]) {
				const a = dx * frame.c + dy * frame.s;
				const b = dy * frame.c - dx * frame.s;
				aLow = Math.min(aLow, a);
				aHigh = Math.max(aHigh, a);
				bLow = Math.min(bLow, b);
				bHigh = Math.max(bHigh, b);
			}
		}
		this.familyA.build(frame, 0, aLow, aHigh);
		this.familyB.build(frame, 1, bLow, bHigh);
		this.ready = true;
	}

	/** Sets the fields for the cell (x, y), which must lie in the tile of the view. */
	locate(x: number, y: number): void {
		const { frame } = this;
		const dx = x - frame.ox;
		const dy = y - frame.oy;
		const a = dx * frame.c + dy * frame.s;
		const b = dy * frame.c - dx * frame.s;
		if (a >= this.originA && a < this.endA && b >= this.originB && b < this.endB) {
			this.line = Line.NONE;
			this.u = a - this.originA;
			this.v = b - this.originB;
			return;
		}

		if (!this.ready) this.build();
		const { familyA, familyB } = this;
		const i = familyA.indexAt(frame, 0, a);
		const j = familyB.indexAt(frame, 1, b);
		const line = Math.max(familyA.lineAt(a, i), familyB.lineAt(b, j));
		this.line = line;
		if (line !== Line.NONE) return;

		this.ka = i + familyA.first;
		this.kb = j + familyB.first;
		this.originA = familyA.starts[i];
		this.originB = familyB.starts[j];
		this.endA = familyA.ends[i + 1];
		this.endB = familyB.ends[j + 1];
		this.width = this.endA - this.originA;
		this.height = this.endB - this.originB;
		this.u = a - this.originA;
		this.v = b - this.originB;
	}
}

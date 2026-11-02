import type { CellRect, Position } from './WallGrid';

/** Wall mutations in the order they happened, replayed on the worker's mirror grid. */
export type GridMessage =
	/** (x, y, wall) triples. */
	| { type: 'cells'; data: Int32Array<ArrayBuffer> }
	| { type: 'rect'; rect: CellRect; cells: Uint8Array<ArrayBuffer> }
	| { type: 'clear' };

export interface FindRequest {
	type: 'find';
	id: number;
	/** Main thread revision at the time of the request, to detect a mirror that drifted. */
	revision: number;
	start: Position;
	target: Position;
	window: CellRect;
	snap: boolean;
}

export type Generation = { kind: 'maze' } | { kind: 'random'; probability: number };

export interface GenerateRequest {
	type: 'generate';
	id: number;
	rect: CellRect;
	generation: Generation;
}

/** Stops the running search at its next slice: the main thread answered the request itself. */
export interface CancelRequest {
	type: 'cancel';
}

export type WorkerRequest = GridMessage | FindRequest | GenerateRequest | CancelRequest;

/**
 * `path` holds (x, y) pairs and is null when there is no path. A typed array is transferred for free, where cloning a Position[]
 * costs ~2.7 ms for 3k cells and ~25 ms for 30k (V8, both sides), and the player walks the pairs as they are: turning 250k cells
 * into objects took ~42 ms (max 65) on the main thread in V8.
 */
export interface FindResult {
	type: 'path';
	id: number;
	path: Int32Array<ArrayBuffer> | null;
}

/** Applied by the main thread with writeRect; the mirror gets it back through GridSync like any fill, so revisions stay in order. */
export interface GenerateResult {
	type: 'generated';
	id: number;
	rect: CellRect;
	cells: Uint8Array<ArrayBuffer>;
}

/** A generation that threw: its id is answered so the caller doesn't wait for cells that never come. A failed search is answered with `path: null`. */
export interface GenerateFailure {
	type: 'failed';
	id: number;
}

export type WorkerResponse = FindResult | GenerateResult | GenerateFailure;

import { Connectivity } from './Connectivity';
import { GridSync } from './GridSync';
import { PathFinder } from './PathFinder';
import type { FindRequest, FindResult, GenerateFailure, GenerateRequest, GenerateResult, WorkerRequest } from './pathMessages';
import { type Position, WallGrid } from './WallGrid';

/**
 * The DOM lib types `self` as a Window, and the worker lib can't be loaded next to it: this is the part of the worker scope used here.
 * This module and its imports never touch the DOM or p5: they have to load in a worker.
 */
interface WorkerScope {
	postMessage(message: FindResult | GenerateResult | GenerateFailure, options: StructuredSerializeOptions): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
}
declare const self: WorkerScope;

const grid = new WallGrid();
const finder = new PathFinder(new Connectivity());
const ping = new MessageChannel();
/** Only the newest request is kept: an older one that hasn't started is dropped, and one that has started is abandoned at its next slice. */
let latest: FindRequest | null = null;
/** Set by a cancel: the running search stops at its next slice and its result isn't sent. */
let cancelled = false;
let running = false;
/** Generation time between two looks at the message queue. */
const GENERATE_SLICE_MS = 8;

/** A ping on a MessageChannel runs after the messages already received (a timer would wait at least 4 ms once nested), so a newer request is seen. */
const yieldToMessages = (): Promise<void> => new Promise((resolve) => {
	ping.port1.onmessage = () => resolve();
	ping.port2.postMessage(null);
});

const reply = (id: number, path: Position[] | null): void => {
	const packed = path && PathFinder.pack(path);
	self.postMessage({ type: 'path', id, path: packed }, { transfer: packed ? [packed.buffer] : [] });
};

/** The cells go to the main thread, which writes them: the mirror receives them back like any fill, so its revisions stay in order. */
const generate = ({ id, rect, generation }: GenerateRequest): void => {
	try {
		const cells = generation.kind === 'maze' ? WallGrid.mazeCells(rect.width, rect.height) : WallGrid.randomCells(rect.width, rect.height, generation.probability);
		self.postMessage({ type: 'generated', id, rect, cells }, { transfer: [cells.buffer] });
	} catch (error) {
		console.error(error);
		self.postMessage({ type: 'failed', id }, { transfer: [] });
	}
};

/** A search that throws is answered with no path, so the main thread doesn't wait for it. */
const search = async (request: FindRequest): Promise<void> => {
	try {
		/**
		 * In the City world the window (up to 512 chunks, ~240 ms of generation) is generated here in slices, so a newer request or a cancel is seen
		 * between them. Chunks generated for a request that gets dropped stay cached, and the next request over the same area reuses them.
		 */
		grid.evict(request.window, WallGrid.MAX_CACHED_CHUNKS);
		for (const _ of grid.ensureSlices(request.window, GENERATE_SLICE_MS)) {
			await yieldToMessages();
			if (latest !== null || cancelled) return;
		}
		const steps = finder.steps(grid, request.start, request.target, request.window, request.snap);
		let step = steps.next();
		while (!step.done) {
			await yieldToMessages();
			if (latest !== null || cancelled) return;
			step = steps.next();
		}
		reply(request.id, step.value);
	} catch (error) {
		console.error(error);
		if (latest === null && !cancelled) reply(request.id, null);
	}
};

const run = async (): Promise<void> => {
	running = true;
	try {
		for (let request = latest; request !== null; request = latest) {
			latest = null;
			cancelled = false;
			await search(request);
		}
	} finally {
		running = false;
	}
};

self.addEventListener('message', (event) => {
	const message = event.data;
	if (message.type === 'cancel') {
		latest = null;
		cancelled = true;
		return;
	}
	if (message.type === 'generate') {
		generate(message);
		return;
	}
	if (message.type !== 'find') {
		GridSync.apply(grid, message);
		return;
	}

	/** Every earlier mutation is applied and no later one is yet, so the revisions must be equal. */
	if (grid.revision !== message.revision) console.error('The path worker grid drifted from the main thread grid.');
	latest = message;
	if (!running) void run();
});

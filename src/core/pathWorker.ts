import { Connectivity } from './Connectivity';
import { GridSync } from './GridSync';
import { PathFinder } from './PathFinder';
import type { FindRequest, FindResult, GenerateRequest, GenerateResult, WorkerRequest } from './pathMessages';
import { type Position, WallGrid } from './WallGrid';

/** This module and its imports never touch the DOM or p5: they have to load in a worker. */
const grid = new WallGrid();
const finder = new PathFinder(new Connectivity());
const ping = new MessageChannel();
/** Only the newest request is kept: an older one that hasn't started is dropped, and one that has started is abandoned at its next slice. */
let latest: FindRequest | null = null;
let running = false;

/** A ping on a MessageChannel runs after the messages already received (a timer would wait at least 4 ms once nested), so a newer request is seen. */
const yieldToMessages = (): Promise<void> => new Promise((resolve) => {
	ping.port1.onmessage = () => resolve();
	ping.port2.postMessage(null);
});

const reply = (id: number, path: Position[] | null): void => {
	const packed = path && PathFinder.pack(path);
	self.postMessage({ type: 'path', id, path: packed } satisfies FindResult, { transfer: packed ? [packed.buffer] : [] });
};

/** The cells go to the main thread, which writes them: the mirror receives them back like any fill, so its revisions stay in order. */
const generate = ({ id, rect, generation }: GenerateRequest): void => {
	const cells = generation.kind === 'maze' ? WallGrid.mazeCells(rect.width, rect.height) : WallGrid.randomCells(rect.width, rect.height, generation.probability);
	self.postMessage({ type: 'generated', id, rect, cells } satisfies GenerateResult, { transfer: [cells.buffer] });
};

const run = async (): Promise<void> => {
	running = true;
	try {
		for (let request = latest; request !== null; request = latest) {
			latest = null;

			const search = finder.steps(grid, request.start, request.target, request.window, request.snap);
			let step = search.next();
			while (!step.done) {
				await yieldToMessages();
				if (latest !== null) break;
				step = search.next();
			}
			if (step.done && latest === null) reply(request.id, step.value);
		}
	} finally {
		running = false;
	}
};

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
	const message = event.data;
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

import type { GridMessage } from './pathMessages';
import type { CellRect, WallGrid, WallObserver } from './WallGrid';

/** Collects the mutations of a grid and sends them to a worker once per `flush`, with consecutive single cells batched into one message. */
export class GridSync implements WallObserver {
	private readonly queue: GridMessage[] = [];
	private readonly post: (message: GridMessage, transfer: Transferable[]) => void;
	private cells = new Int32Array(768);
	private count = 0;

	constructor(post: (message: GridMessage, transfer: Transferable[]) => void) {
		this.post = post;
	}

	/** Replays a message on the mirror grid, which must have no observer. */
	static apply(grid: WallGrid, message: GridMessage): void {
		switch (message.type) {
			case 'cells':
				for (let i = 0; i < message.data.length; i += 3) grid.setWall(message.data[i], message.data[i + 1], message.data[i + 2] === 1);
				break;
			case 'rect':
				grid.writeRect(message.rect, message.cells);
				break;
			case 'clear':
				grid.clear();
				break;
		}
	}

	cell(x: number, y: number, wall: boolean): void {
		if (this.count === this.cells.length) {
			const bigger = new Int32Array(this.cells.length * 2);
			bigger.set(this.cells);
			this.cells = bigger;
		}
		this.cells[this.count++] = x;
		this.cells[this.count++] = y;
		this.cells[this.count++] = wall ? 1 : 0;
	}

	rect(rect: CellRect, cells: Uint8Array<ArrayBuffer>): void {
		this.seal();
		this.queue.push({ type: 'rect', rect: { ...rect }, cells });
	}

	cleared(): void {
		this.seal();
		this.queue.push({ type: 'clear' });
	}

	/** Posts the pending messages in order, transferring their buffers. */
	flush(): void {
		this.seal();
		for (const message of this.queue) {
			this.post(message, message.type === 'cells' ? [message.data.buffer] : message.type === 'rect' ? [message.cells.buffer] : []);
		}
		this.queue.length = 0;
	}

	/** Closes the current batch of single cells, so a later rect or clear stays behind them. */
	private seal(): void {
		if (this.count === 0) return;
		this.queue.push({ type: 'cells', data: this.cells.slice(0, this.count) });
		this.count = 0;
	}
}

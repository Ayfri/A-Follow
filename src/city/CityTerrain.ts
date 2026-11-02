import { CellType } from '../core/CellType';
import type { Terrain } from '../core/World';
import { Countryside } from './Countryside';
import { Towns } from './Towns';
import { Water } from './Water';

/** The generated city of a seed: countryside, then water, then the ground of the towns. Each layer paints over the previous ones. */
export class CityTerrain implements Terrain {
	private readonly countryside: Countryside;
	readonly water: Water;
	readonly towns: Towns;
	private mask = new Uint8Array(0);

	constructor(seed: number) {
		this.countryside = new Countryside(seed);
		this.water = new Water(seed);
		this.towns = new Towns(seed, this.water);
	}

	fill(x0: number, y0: number, size: number, out: Uint8Array): void {
		const cells = size * size;
		this.countryside.fill(x0, y0, size, out);
		if (this.mask.length < cells) this.mask = new Uint8Array(cells);
		const { mask } = this;
		if (this.water.fill(x0, y0, size, mask) > 0) {
			for (let i = 0; i < cells; i++) if (mask[i] !== 0) out[i] = CellType.WATER;
		}
		this.towns.clearGround(x0, y0, size, out);
	}
}

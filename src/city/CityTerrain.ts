import { CellType } from '../core/CellType';
import type { Terrain } from '../core/World';
import { Countryside } from './Countryside';
import { Roads } from './Roads';
import { Streets } from './Streets';
import { Towns } from './Towns';
import { Water } from './Water';

/**
 * The generated city of a seed: countryside, then water, then the ground of the towns, their streets and the roads between towns.
 * Each layer paints over the previous ones, and roads over water become bridges.
 */
export class CityTerrain implements Terrain {
	private readonly countryside: Countryside;
	readonly water: Water;
	readonly towns: Towns;
	readonly streets: Streets;
	readonly roads: Roads;
	private mask = new Uint8Array(0);

	constructor(seed: number) {
		this.countryside = new Countryside(seed);
		this.water = new Water(seed);
		this.towns = new Towns(seed, this.water);
		this.streets = new Streets(this.towns, this.water);
		this.roads = new Roads(this.towns, this.water);
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
		this.streets.paint(x0, y0, size, out, mask);
		this.roads.paint(x0, y0, size, out, mask);
	}
}

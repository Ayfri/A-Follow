import { CellType } from '../core/CellType';
import type { Terrain } from '../core/World';
import { Blocks } from './Blocks';
import { Countryside } from './Countryside';
import { Relief } from './Relief';
import { Ribbons } from './Ribbons';
import { Roads } from './Roads';
import { Streets } from './Streets';
import { Towns } from './Towns';
import { Water } from './Water';

/**
 * The generated city of a seed: countryside, then water (the sea, the rivers and the lakes of the relief), then the ground of the towns with their blocks, their streets, the roads between
 * towns and the houses along the country roads. Each layer paints over the previous ones, and roads over water become bridges. The
 * blocks come before the streets, which cut them, and the ribbon houses come last, so they only take cells nothing else uses.
 */
export class CityTerrain implements Terrain {
	private readonly countryside: Countryside;
	readonly relief: Relief;
	readonly water: Water;
	readonly towns: Towns;
	readonly streets: Streets;
	readonly blocks: Blocks;
	readonly roads: Roads;
	readonly ribbons: Ribbons;
	private mask = new Uint8Array(0);

	constructor(seed: number) {
		this.relief = new Relief(seed);
		this.countryside = new Countryside(seed);
		this.water = new Water(seed, this.relief);
		this.towns = new Towns(seed, this.water);
		this.streets = new Streets(this.towns);
		this.blocks = new Blocks(this.towns, this.streets);
		this.roads = new Roads(this.towns, this.water);
		this.ribbons = new Ribbons(this.roads, this.towns);
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
		this.blocks.paint(x0, y0, size, out);
		this.streets.paint(x0, y0, size, out, mask);
		this.roads.paint(x0, y0, size, out, mask);
		this.ribbons.paint(x0, y0, size, out);
	}
}

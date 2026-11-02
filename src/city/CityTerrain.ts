import { CellType } from '../core/CellType';
import type { Terrain } from '../core/World';
import { Countryside } from './Countryside';
import { Fabric } from './Fabric';
import { Relief } from './Relief';
import { Ribbons } from './Ribbons';
import { Roads } from './Roads';
import { Towns } from './Towns';
import { Water } from './Water';

/**
 * The generated city of a seed: the biomes of the countryside, then water (the sea, the rivers and the lakes of the relief), then the
 * fabric of the towns (their ground, districts, streets, blocks and buildings), the roads between towns and the houses along the country
 * roads. Each layer paints over the previous ones, roads over water become bridges and roads over rock are mountain passes. The fabric
 * comes before the roads, which cut it, and the ribbon houses come last, so they only take cells nothing else uses.
 *
 * The mask of a tile says what is under each cell for the layers that paint after the water: 0 dry, 1 river, 2 sea or lake, 3 rock.
 */
export class CityTerrain implements Terrain {
	private readonly countryside: Countryside;
	readonly relief: Relief;
	readonly water: Water;
	readonly towns: Towns;
	readonly fabric: Fabric;
	readonly roads: Roads;
	readonly ribbons: Ribbons;
	private mask = new Uint8Array(0);

	constructor(seed: number) {
		this.relief = new Relief(seed);
		this.countryside = new Countryside(seed, this.relief);
		this.water = new Water(seed, this.relief);
		this.towns = new Towns(seed, this.water, this.relief);
		this.fabric = new Fabric(this.towns);
		this.roads = new Roads(this.towns, this.water, this.relief);
		this.ribbons = new Ribbons(this.roads, this.towns);
	}

	fill(x0: number, y0: number, size: number, out: Uint8Array): void {
		const cells = size * size;
		const rocky = this.countryside.fill(x0, y0, size, out);
		if (this.mask.length < cells) this.mask = new Uint8Array(cells);
		const { mask } = this;
		if (this.water.fill(x0, y0, size, mask) > 0) {
			for (let i = 0; i < cells; i++) if (mask[i] !== 0) out[i] = CellType.WATER;
		}
		/** Rock only stands above `MOUNTAIN_LEVEL`, where there is no river or lake, so it never overwrites a wet cell. */
		if (rocky) for (let i = 0; i < cells; i++) if (out[i] === CellType.ROCK) mask[i] = 3;
		this.fabric.paint(x0, y0, size, out, mask);
		this.roads.paint(x0, y0, size, out, mask);
		this.ribbons.paint(x0, y0, size, out);
	}
}

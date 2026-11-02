import type { Terrain } from '../core/World';
import { Countryside } from './Countryside';

/** The generated city of a seed. Today only the countryside; each layer that follows paints over the previous ones. */
export class CityTerrain implements Terrain {
	private readonly countryside: Countryside;

	constructor(seed: number) {
		this.countryside = new Countryside(seed);
	}

	fill(x0: number, y0: number, size: number, out: Uint8Array): void {
		this.countryside.fill(x0, y0, size, out);
	}
}

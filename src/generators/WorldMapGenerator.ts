import { type Terrain, TerrainType } from '../core/TerrainType';
import { Rng } from '../utils/Rng';
import { CityAndRoadGenerator } from './CityAndRoadGenerator';
import { ForestGenerator } from './ForestGenerator';
import { HillGenerator } from './HillGenerator';
import { LakeGenerator } from './LakeGenerator';
import { MountainGenerator } from './MountainGenerator';
import { RiverGenerator } from './RiverGenerator';
import { SandGenerator } from './SandGenerator';

export interface WorldGenOptions {
	seed: number;
	enable: {
		mountains:  boolean;
		hills:      boolean;
		lakes:      boolean;
		rivers:     boolean;
		forests:    boolean;
		cities:     boolean;
		villages:   boolean;
		bridges:    boolean;
		coastlines: boolean;
		sand:       boolean;
	};
}

export type WorldLayer = keyof WorldGenOptions['enable'];

export const DEFAULT_LAYERS: WorldGenOptions['enable'] = {
	mountains:  true,
	hills:      true,
	lakes:      true,
	rivers:     true,
	forests:    true,
	cities:     true,
	villages:   true,
	bridges:    true,
	coastlines: true,
	sand:       true,
};

export class WorldMapGenerator {
	private width: number;
	private height: number;
	private grid: Terrain[][];

	constructor(width: number, height: number) {
		this.width  = width;
		this.height = height;
		this.grid   = [];
	}

	generate(options: WorldGenOptions): Terrain[][] {
		const rng = new Rng(options.seed);

		this.grid = Array.from({ length: this.height }, () =>
			Array.from({ length: this.width }, () => TerrainType.PLAIN)
		);

		if (options.enable.mountains) new MountainGenerator(this.width, this.height, this.grid, rng).generate();
		if (options.enable.hills)     new HillGenerator    (this.width, this.height, this.grid, rng).generate();

		const lakes = options.enable.lakes
			? new LakeGenerator(this.width, this.height, this.grid, rng).generate()
			: [];

		if (options.enable.rivers)  new RiverGenerator (this.width, this.height, this.grid, rng).generateRivers(lakes);
		if (options.enable.forests) new ForestGenerator(this.width, this.height, this.grid, rng).generateForests(lakes);

		const cityGen = new CityAndRoadGenerator(this.width, this.height, this.grid, rng);
		const cities  = options.enable.cities ? cityGen.generateCities() : [];

		if (options.enable.cities)   { cityGen.generateRoadsConnectingCities(cities); cityGen.generateRandomRoadBranches(cities); }
		if (options.enable.villages) cityGen.generateVillages(cities);
		if (options.enable.bridges)  cityGen.generateBridges();
		if (options.enable.coastlines) cityGen.generateCoastlines();
		if (options.enable.sand)     new SandGenerator(this.width, this.height, this.grid, rng).generateSandBeaches();

		return this.grid;
	}
}

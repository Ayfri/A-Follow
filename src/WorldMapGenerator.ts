import { TerrainType } from './grid';
import { MountainGenerator } from './generators/MountainGenerator';
import { HillGenerator } from './generators/HillGenerator';
import { LakeGenerator } from './generators/LakeGenerator';
import { RiverGenerator } from './generators/RiverGenerator';
import { ForestGenerator } from './generators/ForestGenerator';
import { CityAndRoadGenerator } from './generators/CityAndRoadGenerator';
import { SandGenerator } from './generators/SandGenerator';

/**
 * Main world map generator that orchestrates all terrain generation
 * Delegates specific generation tasks to specialized generator classes
 */
export class WorldMapGenerator {
	private width: number;
	private height: number;
	private grid: number[][];

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.grid = [];
	}

	/**
	 * Generates a complete world map with all terrain types
	 * Returns a 2D grid where each cell contains a TerrainType value
	 */
	generate(): number[][] {
		// Fill everything with plains initially
		this.grid = Array.from({ length: this.height }, () =>
			Array.from({ length: this.width }, () => TerrainType.PLAIN)
		);

		// Generate mountain chains (blockers)
		const mountainGen = new MountainGenerator(this.width, this.height, this.grid);
		mountainGen.generate();

		// Generate hills for more terrain variety
		const hillGen = new HillGenerator(this.width, this.height, this.grid);
		hillGen.generate();

		// Generate lakes first (natural obstacles for roads to navigate around)
		const lakeGen = new LakeGenerator(this.width, this.height, this.grid);
		const lakes = lakeGen.generate();

		// Generate rivers (blockers, but can have bridges)
		const riverGen = new RiverGenerator(this.width, this.height, this.grid);
		riverGen.generateRivers(lakes);

		// Generate forests for more visual interest
		const forestGen = new ForestGenerator(this.width, this.height, this.grid);
		forestGen.generateForests(lakes);

		// Generate cities (road hubs)
		const cityGen = new CityAndRoadGenerator(this.width, this.height, this.grid);
		const cities = cityGen.generateCities();

		// Generate main roads connecting cities
		cityGen.generateRoadsConnectingCities(cities);

		// Add many more road branches
		cityGen.generateRandomRoadBranches(cities);

		// Generate villages between cities
		cityGen.generateVillages(cities);

		// Add bridges over rivers
		cityGen.generateBridges();

		// Generate coastlines (if near edges)
		cityGen.generateCoastlines();

		// Generate sand beaches around lakes and rivers
		const sandGen = new SandGenerator(this.width, this.height, this.grid);
		sandGen.generateSandBeaches(lakes);

		return this.grid;
	}
}

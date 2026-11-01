import type { Position } from '../core/Grid';
import { TerrainType } from '../core/TerrainType';
import { RoadUtilities } from './RoadUtilities';

const ANGLE_OFFSETS_4 = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];

/**
 * Generates cities, roads, and settlements
 */
export class CityAndRoadGenerator extends RoadUtilities {
	generateCities(): Position[] {
		const cityCount = this.randomRange(5, 13);
		const cities: Position[] = [];
		const minDistBetweenCities = 60;

		for (let c = 0; c < cityCount; c++) {
			// Find valid city position
			const cityPos = this.findValidCityPosition(cities, minDistBetweenCities);
			if (!cityPos) {
				continue;
			}

			const x = cityPos.x;
			const y = cityPos.y;
			const citySize = this.randomRange(6, 16);

			// Verify enough space
			if (!this.hasEnoughSpace(x, y, citySize)) {
				continue;
			}

			cities.push({ x, y });
			this.drawCity(x, y, citySize);
		}

		return cities;
	}

	generateRoadsConnectingCities(cities: Position[]): void {
		for (let i = 0; i < cities.length; i++) {
			const city = cities[i];
			const connectionCount = this.randomRange(2, 4);
			const sortedCities = this.getSortedCitiesByDistance(city, cities, i);

			for (let j = 0; j < Math.min(connectionCount, sortedCities.length); j++) {
				const target = sortedCities[j];
				this.drawRoad(city.x, city.y, target.x, target.y, 0);
			}
		}
	}

	generateRandomRoadBranches(cities: Position[]): void {
		const branchCount = this.randomRange(20, 50);

		for (let b = 0; b < branchCount; b++) {
			const branchStart = this.findRandomRoadStartPoint(cities);
			if (!branchStart) continue;

			this.drawRoadBranch(branchStart.x, branchStart.y);
		}
	}

	generateVillages(cities: Position[]): void {
		const villageCount = this.randomRange(15, 35);
		const minDistFromCity = 40;
		const minDistBetweenVillages = 30;
		const villages: Position[] = [];

		for (let v = 0; v < villageCount; v++) {
			for (let attempts = 0; attempts < 100; attempts++) {
				const x = this.randomRange(0, this.width);
				const y = this.randomRange(0, this.height);

				if (this.isMountain(x, y) || this.isWater(x, y) || this.isForest(x, y)) continue;

				if (this.findMinDistanceSqTo(x, y, cities) < minDistFromCity * minDistFromCity) continue;
				if (this.findMinDistanceSqTo(x, y, villages) < minDistBetweenVillages * minDistBetweenVillages) continue;

				const villageSize = this.randomRange(3, 8);
				this.drawCircularArea(x, y, villageSize, TerrainType.VILLAGE, {
					respectMountains: true,
					respectWater: true,
					respectForests: true
				});

				villages.push({ x, y });
				break;
			}
		}
	}

	generateBridges(): void {
		// Find river segments and add bridges to make them more navigable
		const bridgeAttempts = this.randomRange(20, 50);

		for (let b = 0; b < bridgeAttempts; b++) {
			const x = this.randomRange(0, this.width);
			const y = this.randomRange(0, this.height);

			if (!this.isWater(x, y)) continue;

			// Check if nearby there's a road trying to cross
			if (this.countTerrainInArea(x, y, 3, TerrainType.ROAD) > 0) {
				this.drawTerrainWithWidth(x, y, TerrainType.BRIDGE, 1);
			}
		}
	}

	generateCoastlines(): void {
		// Add coastlines near the edges of the map
		const coastWidth = this.randomRange(2, 5);
		const coast = (x: number, y: number): void => {
			if (this.isPlain(x, y)) this.setTerrainAt(x, y, TerrainType.COAST);
		};

		for (let x = 0; x < this.width; x++) {
			for (let d = 0; d < coastWidth; d++) {
				coast(x, d);
				coast(x, this.height - 1 - d);
			}
		}

		for (let y = 0; y < this.height; y++) {
			for (let d = 0; d < coastWidth; d++) {
				coast(d, y);
				coast(this.width - 1 - d, y);
			}
		}
	}

	// ========== PRIVATE HELPER METHODS ==========

	/** Finds a valid position for a city, checking distance to other cities */
	private findValidCityPosition(cities: Position[], minDist: number): Position | null {
		const minDistSq = minDist * minDist;
		for (let attempts = 0; attempts < 150; attempts++) {
			const x = this.randomRange(0, this.width);
			const y = this.randomRange(0, this.height);

			if (this.isMountain(x, y) || this.isWater(x, y) || this.isForest(x, y)) continue;

			if (this.findMinDistanceSqTo(x, y, cities) >= minDistSq) {
				return { x, y };
			}
		}
		return null;
	}

	/** Draws a city with roads grid pattern and plaza */
	private drawCity(x: number, y: number, citySize: number): void {
		const blockSize = this.randomRange(2, 6);

		for (let dx = -citySize; dx <= citySize; dx++) {
			for (let dy = -citySize; dy <= citySize; dy++) {
				const dist = Math.sqrt(dx * dx + dy * dy);
				const distVariation = (this.rng() - 0.5) * 4;
				if (dist + distVariation > citySize) continue;

				const nx = x + dx;
				const ny = y + dy;

				if (!this.isInBounds(nx, ny) || this.isMountain(nx, ny) || this.isWater(nx, ny) || this.isForest(nx, ny)) continue;

				// Create grid pattern
				const isRoadX = Math.abs(dx) % blockSize === 0;
				const isRoadY = Math.abs(dy) % blockSize === 0;
				let isRoad = isRoadX || isRoadY;

				// Add randomness for organic feel
				if (isRoad && this.rng() < 0.15) {
					isRoad = false;
				}

				if (isRoad) {
					this.setTerrainAt(nx, ny, TerrainType.ROAD);
				}
			}
		}

		// Add central plaza
		const plazaRadius = this.randomRange(2, 5);
		this.drawCircularArea(x, y, plazaRadius, TerrainType.ROAD, { respectMountains: true, respectWater: true, respectForests: true });
	}

	/** Returns cities sorted by distance from a given point, excluding the city at excludeIndex */
	private getSortedCitiesByDistance(
		from: Position,
		cities: Position[],
		excludeIndex: number
	): Position[] {
		return cities
			.filter((_, idx) => idx !== excludeIndex)
			.sort((a, b) => this.distanceSq(from.x, from.y, a.x, a.y) - this.distanceSq(from.x, from.y, b.x, b.y));
	}

	/** Finds a valid road cell far from cities for branch starting point */
	private findRandomRoadStartPoint(cities: Position[]): Position | null {
		for (let attempts = 0; attempts < 150; attempts++) {
			const x = this.randomRange(0, this.width);
			const y = this.randomRange(0, this.height);

			if (!this.isRoad(x, y)) continue;

			if (this.findMinDistanceSqTo(x, y, cities) < 20 * 20) continue;

			// Check road density
			const nearbyRoadCount = this.countTerrainInArea(x, y, 10, TerrainType.ROAD);
			if (nearbyRoadCount >= 30) continue;

			return { x, y };
		}
		return null;
	}

	/** Draws a road branch from starting point */
	private drawRoadBranch(startX: number, startY: number): void {
		const branchLength = this.randomRange(25, 125);
		const angle = this.rng() * Math.PI * 2;
		const angleVariation = 0.6;

		let currentAngle = angle;
		let x = startX;
		let y = startY;
		let consecutiveEmpty = 0;

		for (let i = 0; i < branchLength; i++) {
			// Calculate next position
			let nextX = x + Math.floor(Math.cos(currentAngle) * 2);
			let nextY = y + Math.floor(Math.sin(currentAngle) * 2);
			const clamped = this.clamp(nextX, nextY);
			nextX = clamped.x;
			nextY = clamped.y;

			// Handle obstacles
			if (this.isBlocked(nextX, nextY)) {
				if (!this.tryBypassObstacle(x, y, currentAngle, (angle) => (currentAngle = angle))) {
					break;
				}
				consecutiveEmpty = 0;
			} else {
				// Bias towards exploring empty terrain
				if (this.isPlain(nextX, nextY)) {
					consecutiveEmpty++;
					const variation = consecutiveEmpty > 5 ? angleVariation * 0.5 : angleVariation;
					currentAngle += (this.rng() - 0.5) * variation;
				} else {
					consecutiveEmpty = 0;
					currentAngle += (this.rng() - 0.5) * angleVariation;
				}
			}

			this.drawSmallRoad(x, y, nextX, nextY, 0);
			x = nextX;
			y = nextY;
		}
	}

	/** Tries to bypass an obstacle by testing alternate angles */
	private tryBypassObstacle(
		x: number,
		y: number,
		currentAngle: number,
		onAngleChange: (angle: number) => void
	): boolean {
		for (const offset of ANGLE_OFFSETS_4) {
			const testAngle = currentAngle + offset;
			let testX = x + Math.floor(Math.cos(testAngle) * 2);
			let testY = y + Math.floor(Math.sin(testAngle) * 2);
			const clamped = this.clamp(testX, testY);
			testX = clamped.x;
			testY = clamped.y;

			if (!this.isBlocked(testX, testY)) {
				onAngleChange(testAngle);
				return true;
			}
		}
		return false;
	}
}


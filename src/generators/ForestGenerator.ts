import { TerrainType } from '../core/TerrainType';
import type { Lake } from './LakeGenerator';
import { TerrainGenerator } from './TerrainGenerator';

/**
 * Generates forests for visual interest
 */
export class ForestGenerator extends TerrainGenerator {
	generate(): void {
		// Implementation handled by generateForests method
	}

	generateForests(lakes: Lake[]): void {
		// Create larger, more random forest clusters with organic shapes like lakes
		const forestCount = this.randomRange(10, 25); // More forests but smaller

		for (let f = 0; f < forestCount; f++) {
			let x = Math.floor(this.rng() * this.width);
			let y = Math.floor(this.rng() * this.height);

			// Try to find a position not on mountain, water, or too close to lakes
			let attempts = 0;
			while ((this.grid[y][x] === TerrainType.MOUNTAIN || this.isWater(x, y)) && attempts < 50) {
				x = Math.floor(this.rng() * this.width);
				y = Math.floor(this.rng() * this.height);
				attempts++;
			}

			if (attempts >= 50) continue;

			const minDistToLake = this.findMinDistanceTo(x, y, lakes);
			// Keep forests further from lakes when clusters are larger
			if (minDistToLake < 20) continue;

			// Large but not excessive radii for forests (25-60 instead of 50-120)
			const forestRadius = 25 + Math.floor(this.rng() * 35);
			// Moderate density for more natural look
			const forestDensity = this.rng() * 0.3 + 0.6; // ~60-90% density

			// Use organic shape generation like lakes but with controlled randomness
			const radiusX = forestRadius * (0.7 + this.rng() * 0.6); // Less variation
			const radiusY = forestRadius * (0.7 + this.rng() * 0.6);
			const rotation = this.rng() * Math.PI * 2;

			// Create convex forest shapes using ellipse + moderate perturbation
			const shapeType = Math.floor(this.rng() * 3); // Fewer shape variations

			for (let dx = -forestRadius; dx <= forestRadius; dx++) {
				for (let dy = -forestRadius; dy <= forestRadius; dy++) {
					// Rotate the point for organic shapes
					const cosRot = Math.cos(rotation);
					const sinRot = Math.sin(rotation);
					const rotatedX = dx * cosRot - dy * sinRot;
					const rotatedY = dx * sinRot + dy * cosRot;

					let isForestPart = false;

					if (shapeType === 0) {
						// Smooth ellipse with moderate perturbation
						const ellipseDistance = Math.sqrt((rotatedX / radiusX) ** 2 + (rotatedY / radiusY) ** 2);
						const moderateNoise = Math.sin(Math.atan2(rotatedY, rotatedX) * 4) * 0.12 + this.rng() * 0.08;
						isForestPart = ellipseDistance + moderateNoise <= 1.1;
					} else if (shapeType === 1) {
						// Elongated bean shape
						const angle = Math.atan2(rotatedY, rotatedX);
						const radiusModifier = 1 + Math.sin(angle * 2) * 0.15;
						const ellipseDistance = Math.sqrt(
							(rotatedX / (radiusX * radiusModifier)) ** 2 + (rotatedY / radiusY) ** 2
						);
						const moderateNoise = this.rng() * 0.1;
						isForestPart = ellipseDistance + moderateNoise <= 1.1;
					} else {
						// Amoeba-like with controlled randomness
						const angle = Math.atan2(rotatedY, rotatedX);
						const radiusModifier =
							1 + Math.sin(angle) * 0.12 + Math.cos(angle * 2) * 0.08;
						const ellipseDistance = Math.sqrt(
							(rotatedX / (radiusX * radiusModifier)) ** 2 + (rotatedY / (radiusY * radiusModifier)) ** 2
						);
						const moderateNoise = this.rng() * 0.12;
						isForestPart = ellipseDistance + moderateNoise <= 1.15;
					}

					if (isForestPart) {
						const nx = Math.max(0, Math.min(this.width - 1, x + dx));
						const ny = Math.max(0, Math.min(this.height - 1, y + dy));

						// Don't overwrite mountains or water
						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN && !this.isWater(nx, ny)) {
							// Random forest density with some gaps for realism
							if (this.rng() < forestDensity) {
								this.setTerrainAt(nx, ny, TerrainType.FOREST);
							}
						}
					}
				}
			}
		}
	}
}


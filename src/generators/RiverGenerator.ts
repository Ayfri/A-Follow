import { TerrainType } from '../core/TerrainType';
import type { Lake } from './LakeGenerator';
import { TerrainGenerator } from './TerrainGenerator';

/**
 * Generates rivers flowing from edges toward lakes
 */
export class RiverGenerator extends TerrainGenerator {
	generateRivers(lakes: Lake[]): void {
		const riverCount = this.randomRange(4, 8);

		for (let r = 0; r < riverCount; r++) {
			let x = this.rng() < 0.5 ? 0 : this.width - 1;
			let y = this.randomRange(0, this.height);

			const riverLength = this.randomRange(80, 230);
			const riverWidth = this.randomRange(1, 3);
			let currentAngle = (this.rng() - 0.5) * Math.PI;

			const targetLake = lakes.length > 0 && this.rng() < 0.6 ? lakes[this.randomRange(0, lakes.length)] : null;

			for (let i = 0; i < riverLength; i++) {
				// Draw river at current position
				this.drawTerrainWithWidth(x, y, TerrainType.RIVER, riverWidth);

				// Check if reached target lake
				if (targetLake) {
					const distToLake = this.distance(x, y, targetLake.x, targetLake.y);
					if (distToLake < targetLake.radius + 5) break;
				}

				// Try to move in the current direction
				let nextX = x + Math.floor(Math.cos(currentAngle) * 2);
				let nextY = y + Math.floor(Math.sin(currentAngle) * 2);
				const clamped = this.clamp(nextX, nextY);
				nextX = clamped.x;
				nextY = clamped.y;

				// If blocked by mountain, try to find alternative direction
				if (this.isMountain(nextX, nextY)) {
					let foundPath = false;
					for (const offset of this.ANGLE_OFFSETS_6) {
						const testAngle = currentAngle + offset;
						let testX = x + Math.floor(Math.cos(testAngle) * 2);
						let testY = y + Math.floor(Math.sin(testAngle) * 2);
						const testClamped = this.clamp(testX, testY);
						testX = testClamped.x;
						testY = testClamped.y;

						if (!this.isMountain(testX, testY)) {
							nextX = testX;
							nextY = testY;
							currentAngle = testAngle;
							foundPath = true;
							break;
						}
					}
					if (!foundPath) break;
				} else {
					// Add natural variation
					currentAngle += (this.rng() - 0.5) * 0.4;

					// If targeting a lake, adjust direction towards it
					if (targetLake) {
						const angleToLake = Math.atan2(targetLake.y - y, targetLake.x - x);
						currentAngle += (angleToLake - currentAngle) * 0.1;
					}
				}

				x = nextX;
				y = nextY;

				if (x <= 0 || x >= this.width - 1 || y <= 0 || y >= this.height - 1) break;
			}
		}
	}
}


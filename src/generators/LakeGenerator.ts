import { TerrainType } from '../core/TerrainType';
import { TerrainGenerator } from './TerrainGenerator';

export interface Lake {
	x: number;
	y: number;
	radius: number;
}

/**
 * Generates lakes with natural convex shapes
 */
export class LakeGenerator extends TerrainGenerator {
	generate(): Lake[] {
		const lakeCount = 3 + Math.floor(this.rng() * 5);
		const lakes: Lake[] = [];

		for (let l = 0; l < lakeCount; l++) {
			let x = Math.floor(this.rng() * this.width);
			let y = Math.floor(this.rng() * this.height);

			let attempts = 0;
			while (this.grid[y][x] === TerrainType.MOUNTAIN && attempts < 50) {
				x = Math.floor(this.rng() * this.width);
				y = Math.floor(this.rng() * this.height);
				attempts++;
			}

			if (attempts >= 50) continue;

			const lakeRadius = 4 + Math.floor(this.rng() * 22);
			const radiusX = lakeRadius * (0.6 + this.rng() * 0.7);
			const radiusY = lakeRadius * (0.6 + this.rng() * 0.7);
			const rotation = this.rng() * Math.PI;

			lakes.push({ x, y, radius: Math.max(radiusX, radiusY) });

			const shapeType = Math.floor(this.rng() * 3);
			const cosRot = Math.cos(rotation);
			const sinRot = Math.sin(rotation);

			for (let dx = -lakeRadius; dx <= lakeRadius; dx++) {
				for (let dy = -lakeRadius; dy <= lakeRadius; dy++) {
					const rotatedX = dx * cosRot - dy * sinRot;
					const rotatedY = dx * sinRot + dy * cosRot;

					let isLakePart = false;

					if (shapeType === 0) {
						const ellipseDistance = Math.sqrt((rotatedX / radiusX) ** 2 + (rotatedY / radiusY) ** 2);
						const gentleNoise = Math.sin(Math.atan2(rotatedY, rotatedX) * 4) * 0.08;
						isLakePart = ellipseDistance + gentleNoise <= 1.0;
					} else if (shapeType === 1) {
						const angle = Math.atan2(rotatedY, rotatedX);
						const radiusModifier = 1 + Math.sin(angle * 2) * 0.15;
						const ellipseDistance = Math.sqrt(
							(rotatedX / (radiusX * radiusModifier)) ** 2 + (rotatedY / radiusY) ** 2
						);
						const gentleNoise = this.rng() * 0.05;
						isLakePart = ellipseDistance + gentleNoise <= 1.0;
					} else {
						const angle = Math.atan2(rotatedY, rotatedX);
						const radiusModifier =
							1 + Math.sin(angle) * 0.12 + Math.cos(angle * 2) * 0.08;
						const ellipseDistance = Math.sqrt(
							(rotatedX / (radiusX * radiusModifier)) ** 2 + (rotatedY / (radiusY * radiusModifier)) ** 2
						);
						const gentleNoise = this.rng() * 0.04;
						isLakePart = ellipseDistance + gentleNoise <= 1.0;
					}

					if (isLakePart) {
						const nx = Math.max(0, Math.min(this.width - 1, x + dx));
						const ny = Math.max(0, Math.min(this.height - 1, y + dy));

						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
							this.grid[ny][nx] = TerrainType.RIVER;
						}
					}
				}
			}
		}

		return lakes;
	}
}


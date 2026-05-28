import { TerrainType } from '../grid';
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
		const lakeCount = 3 + Math.floor(Math.random() * 5); // More lakes (3-7)
		const lakes: Lake[] = [];

		for (let l = 0; l < lakeCount; l++) {
			let x = Math.floor(Math.random() * this.width);
			let y = Math.floor(Math.random() * this.height);

			// Try to find a position not on mountains
			let attempts = 0;
			while (this.grid[y][x] === TerrainType.MOUNTAIN && attempts < 50) {
				x = Math.floor(Math.random() * this.width);
				y = Math.floor(Math.random() * this.height);
				attempts++;
			}

			if (attempts >= 50) continue;

			// More varied lake sizes (4-25 instead of 6-20)
			const lakeRadius = 4 + Math.floor(Math.random() * 22);
			const radiusX = lakeRadius * (0.6 + Math.random() * 0.7); // Ellipse X radius
			const radiusY = lakeRadius * (0.6 + Math.random() * 0.7); // Ellipse Y radius
			const rotation = Math.random() * Math.PI;

			lakes.push({ x, y, radius: Math.max(radiusX, radiusY) });

			// Create convex lake shapes using ellipse + gentle perturbation
			const shapeType = Math.floor(Math.random() * 3); // 3 different convex shape types

			for (let dx = -lakeRadius; dx <= lakeRadius; dx++) {
				for (let dy = -lakeRadius; dy <= lakeRadius; dy++) {
					// Rotate the point
					const cosRot = Math.cos(rotation);
					const sinRot = Math.sin(rotation);
					const rotatedX = dx * cosRot - dy * sinRot;
					const rotatedY = dx * sinRot + dy * cosRot;

					let isLakePart = false;

					if (shapeType === 0) {
						// Smooth ellipse with very subtle variation
						const ellipseDistance = Math.sqrt((rotatedX / radiusX) ** 2 + (rotatedY / radiusY) ** 2);
						// Very gentle perturbation to keep convex shape
						const gentleNoise = Math.sin(Math.atan2(rotatedY, rotatedX) * 4) * 0.08;
						isLakePart = ellipseDistance + gentleNoise <= 1.0;
					} else if (shapeType === 1) {
						// Elongated bean shape (convex)
						const angle = Math.atan2(rotatedY, rotatedX);
						// Gentle elongation at poles
						const radiusModifier = 1 + Math.sin(angle * 2) * 0.15;
						const ellipseDistance = Math.sqrt(
							(rotatedX / (radiusX * radiusModifier)) ** 2 + (rotatedY / radiusY) ** 2
						);
						const gentleNoise = Math.random() * 0.05;
						isLakePart = ellipseDistance + gentleNoise <= 1.0;
					} else {
						// Amoeba-like but still convex
						const angle = Math.atan2(rotatedY, rotatedX);
						// Smooth bulges and indentations that maintain convexity
						const radiusModifier =
							1 + Math.sin(angle) * 0.12 + Math.cos(angle * 2) * 0.08;
						const ellipseDistance = Math.sqrt(
							(rotatedX / (radiusX * radiusModifier)) ** 2 + (rotatedY / (radiusY * radiusModifier)) ** 2
						);
						const gentleNoise = Math.random() * 0.04;
						isLakePart = ellipseDistance + gentleNoise <= 1.0;
					}

					if (isLakePart) {
						const nx = Math.max(0, Math.min(this.width - 1, x + dx));
						const ny = Math.max(0, Math.min(this.height - 1, y + dy));

						// Don't overwrite mountains
						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
							this.grid[ny][nx] = TerrainType.RIVER; // Lakes use RIVER terrain type
						}
					}
				}
			}
		}

		return lakes;
	}
}

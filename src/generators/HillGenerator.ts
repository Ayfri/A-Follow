import { TerrainType } from '../core/Grid';
import { TerrainGenerator } from './TerrainGenerator';

/**
 * Generates hills for terrain variety
 */
export class HillGenerator extends TerrainGenerator {
	generate(): void {
		const hillCount = this.randomRange(15, 40);

		for (let h = 0; h < hillCount; h++) {
			const x = this.randomRange(0, this.width);
			const y = this.randomRange(0, this.height);

			// Skip if on mountain or water
			if (this.isMountain(x, y) || this.isWater(x, y)) continue;

			const hillRadius = this.randomRange(3, 12);

			for (let dx = -hillRadius; dx <= hillRadius; dx++) {
				for (let dy = -hillRadius; dy <= hillRadius; dy++) {
					const dist = Math.sqrt(dx * dx + dy * dy);
					if (dist > hillRadius) continue;

					const nx = x + dx;
					const ny = y + dy;

					if (!this.isInBounds(nx, ny)) continue;
					if (this.isMountain(nx, ny) || this.isWater(nx, ny)) continue;
					if (this.isRoad(nx, ny)) continue;

					// Soft transition for hills
					if (dist <= hillRadius * 0.7) {
						this.setTerrainAt(nx, ny, TerrainType.HILL);
					}
				}
			}
		}
	}
}


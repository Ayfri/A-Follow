import { TerrainType } from '../grid';
import { TerrainGenerator } from './TerrainGenerator';

/**
 * Generates mountain chains
 */
export class MountainGenerator extends TerrainGenerator {
	generate(): void {
		const chainCount = this.randomRange(2, 4);

		for (let c = 0; c < chainCount; c++) {
			let x = this.randomRange(0, this.width);
			let y = this.randomRange(0, this.height);

			const chainLength = this.randomRange(60, 160);
			const maxChainWidth = this.randomRange(3, 6);
			const mainAngle = Math.random() * Math.PI * 2;

			for (let i = 0; i < chainLength; i++) {
				const progressRatio = i / chainLength;
				const widthMultiplier = this.calculateWidthMultiplier(progressRatio);
				const chainWidth = Math.max(1, Math.floor(maxChainWidth * widthMultiplier));

				this.drawCircularArea(x, y, chainWidth, TerrainType.MOUNTAIN);

				const angle = mainAngle + (Math.random() - 0.5) * 0.5;
				const clamped = this.clamp(x + Math.floor(Math.cos(angle) * 2), y + Math.floor(Math.sin(angle) * 2));
				x = clamped.x;
				y = clamped.y;
			}
		}
	}

	/** Calculates width multiplier for mountain chain progression */
	private calculateWidthMultiplier(progressRatio: number): number {
		if (progressRatio < 0.3) {
			return progressRatio / 0.3; // Growing phase
		} else if (progressRatio > 0.7) {
			return (1 - progressRatio) / 0.3; // Shrinking phase
		} else {
			return 0.8 + Math.random() * 0.4; // Middle section
		}
	}
}

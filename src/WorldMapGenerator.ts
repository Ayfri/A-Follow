import { TerrainType } from './grid';

export class WorldMapGenerator {
	private width: number;
	private height: number;
	private grid: number[][];

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.grid = [];
	}

	generate(): number[][] {
		// Fill everything with plains initially
		this.grid = Array.from({ length: this.height }, () =>
			Array.from({ length: this.width }, () => TerrainType.PLAIN)
		);

		// Generate mountain chains (blockers)
		this.generateMountainChains();

		// Generate rivers (blockers, but can have bridges)
		this.generateRivers();

		// Generate cities (road hubs)
		const cities = this.generateCities();

		// Generate main roads connecting cities
		this.generateRoadsConnectingCities(cities);

		// Add many more road branches
		this.generateRandomRoadBranches(cities);

		return this.grid;
	}

	private generateMountainChains(): void {
		const chainCount = 2 + Math.floor(Math.random() * 2);

		for (let c = 0; c < chainCount; c++) {
			let x = Math.floor(Math.random() * this.width);
			let y = Math.floor(Math.random() * this.height);

			const chainLength = 60 + Math.floor(Math.random() * 100);
			const maxChainWidth = 3 + Math.floor(Math.random() * 3); // Maximum width at center
			const mainAngle = Math.random() * Math.PI * 2;

			for (let i = 0; i < chainLength; i++) {
				// Variable width: thicker in the middle, thinner at edges
				// Create a fissure-like pattern
				const progressRatio = i / chainLength;
				let widthMultiplier;
				if (progressRatio < 0.3) {
					// Growing phase
					widthMultiplier = progressRatio / 0.3;
				} else if (progressRatio > 0.7) {
					// Shrinking phase
					widthMultiplier = (1 - progressRatio) / 0.3;
				} else {
					// Middle section - full width with some variation
					widthMultiplier = 0.8 + Math.random() * 0.4;
				}
				
				const chainWidth = Math.max(1, Math.floor(maxChainWidth * widthMultiplier));

				for (let dx = -chainWidth; dx <= chainWidth; dx++) {
					for (let dy = -chainWidth; dy <= chainWidth; dy++) {
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist <= chainWidth) {
							const nx = Math.max(0, Math.min(this.width - 1, x + dx));
							const ny = Math.max(0, Math.min(this.height - 1, y + dy));
							this.grid[ny][nx] = TerrainType.MOUNTAIN;
						}
					}
				}

				const angle = mainAngle + (Math.random() - 0.5) * 0.5;
				x = Math.max(0, Math.min(this.width - 1, x + Math.floor(Math.cos(angle) * 2)));
				y = Math.max(0, Math.min(this.height - 1, y + Math.floor(Math.sin(angle) * 2)));
			}
		}
	}

	private generateRivers(): void {
		const riverCount = 2 + Math.floor(Math.random() * 2);

		for (let r = 0; r < riverCount; r++) {
			let x = Math.random() < 0.5 ? 0 : this.width - 1;
			let y = Math.floor(Math.random() * this.height);

			const riverLength = 80 + Math.floor(Math.random() * 150);
			const riverWidth = 1 + Math.floor(Math.random() * 2);
			let currentAngle = (Math.random() - 0.5) * Math.PI;

			for (let i = 0; i < riverLength; i++) {
				// Draw river at current position
				for (let dx = -riverWidth; dx <= riverWidth; dx++) {
					for (let dy = -riverWidth; dy <= riverWidth; dy++) {
						const nx = Math.max(0, Math.min(this.width - 1, x + dx));
						const ny = Math.max(0, Math.min(this.height - 1, y + dy));
						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
							this.grid[ny][nx] = TerrainType.RIVER;
						}
					}
				}

				// Try to move in the current direction
				let nextX = Math.max(0, Math.min(this.width - 1, x + Math.floor(Math.cos(currentAngle) * 2)));
				let nextY = Math.max(0, Math.min(this.height - 1, y + Math.floor(Math.sin(currentAngle) * 2)));

				// If blocked by mountain, try to find alternative direction
				if (this.grid[nextY][nextX] === TerrainType.MOUNTAIN) {
					let foundPath = false;
					// Try different angles to bypass the mountain
					const angleOffsets = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, -(3 * Math.PI) / 4];
					
					for (const offset of angleOffsets) {
						const testAngle = currentAngle + offset;
						const testX = Math.max(0, Math.min(this.width - 1, x + Math.floor(Math.cos(testAngle) * 2)));
						const testY = Math.max(0, Math.min(this.height - 1, y + Math.floor(Math.sin(testAngle) * 2)));
						
						if (this.grid[testY][testX] !== TerrainType.MOUNTAIN) {
							nextX = testX;
							nextY = testY;
							currentAngle = testAngle;
							foundPath = true;
							break;
						}
					}
					
					if (!foundPath) break; // Completely blocked, stop river
				} else {
					// Add some natural variation
					currentAngle += (Math.random() - 0.5) * 0.4;
				}

				x = nextX;
				y = nextY;

				if (x <= 0 || x >= this.width - 1 || y <= 0 || y >= this.height - 1) {
					break;
				}
			}
		}
	}

	private generateCities(): Array<{ x: number; y: number }> {
		const cityCount = 8 + Math.floor(Math.random() * 12);
		const cities: Array<{ x: number; y: number }> = [];

		for (let c = 0; c < cityCount; c++) {
			let x = Math.floor(Math.random() * this.width);
			let y = Math.floor(Math.random() * this.height);

			let attempts = 0;
			// Cities cannot be placed on mountains
			while (
				this.grid[y][x] === TerrainType.MOUNTAIN &&
				attempts < 100
			) {
				x = Math.floor(Math.random() * this.width);
				y = Math.floor(Math.random() * this.height);
				attempts++;
			}

			if (attempts < 100) {
				// Verify that the city area is not in mountains
				const citySize = 6 + Math.floor(Math.random() * 10);
				let hasEnoughSpace = true;
				
				for (let dx = -citySize; dx <= citySize && hasEnoughSpace; dx++) {
					for (let dy = -citySize; dy <= citySize && hasEnoughSpace; dy++) {
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist > citySize) continue;
						
						const nx = Math.max(0, Math.min(this.width - 1, x + dx));
						const ny = Math.max(0, Math.min(this.height - 1, y + dy));
						
						// Check if too many mountains in city area
						if (this.grid[ny][nx] === TerrainType.MOUNTAIN) {
							hasEnoughSpace = false;
						}
					}
				}
				
				if (!hasEnoughSpace) continue;

				cities.push({ x, y });

				// Create city as a grid of roads (urban layout)
				const blockSize = 3 + Math.floor(Math.random() * 3); // Block size between roads (more spacing)
				
				// Create a grid pattern with some randomness
				for (let dx = -citySize; dx <= citySize; dx++) {
					for (let dy = -citySize; dy <= citySize; dy++) {
						const dist = Math.sqrt(dx * dx + dy * dy);
						// Add some randomness to make cities less circular
						const distVariation = (Math.random() - 0.5) * 3;
						if (dist + distVariation > citySize) continue; // Keep cities roughly circular but irregular

						const nx = Math.max(0, Math.min(this.width - 1, x + dx));
						const ny = Math.max(0, Math.min(this.height - 1, y + dy));

						// Don't overwrite mountains
						if (this.grid[ny][nx] === TerrainType.MOUNTAIN) continue;

						// Create grid pattern: roads every blockSize cells
						const isRoadX = Math.abs(dx) % blockSize === 0;
						const isRoadY = Math.abs(dy) % blockSize === 0;

						if (isRoadX || isRoadY) {
							this.grid[ny][nx] = TerrainType.ROAD;
						}
					}
				}

				// Add a central plaza (filled circle of roads)
				const plazaRadius = 2 + Math.floor(Math.random() * 2);
				for (let dx = -plazaRadius; dx <= plazaRadius; dx++) {
					for (let dy = -plazaRadius; dy <= plazaRadius; dy++) {
						const dist = Math.sqrt(dx * dx + dy * dy);
						if (dist <= plazaRadius) {
							const nx = Math.max(0, Math.min(this.width - 1, x + dx));
							const ny = Math.max(0, Math.min(this.height - 1, y + dy));
							if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
								this.grid[ny][nx] = TerrainType.ROAD;
							}
						}
					}
				}
			}
		}

		return cities;
	}

	private generateRoadsConnectingCities(cities: Array<{ x: number; y: number }>): void {
		for (let i = 0; i < cities.length; i++) {
			const city = cities[i];

			// Connect to 2-4 nearest cities
			const connectionCount = 2 + Math.floor(Math.random() * 3);
			const sortedCities = cities
				.filter((_, idx) => idx !== i)
				.sort((a, b) => {
					const distA = Math.sqrt((a.x - city.x) ** 2 + (a.y - city.y) ** 2);
					const distB = Math.sqrt((b.x - city.x) ** 2 + (b.y - city.y) ** 2);
					return distA - distB;
				});

			for (let j = 0; j < Math.min(connectionCount, sortedCities.length); j++) {
				const target = sortedCities[j];
				this.drawRoad(city.x, city.y, target.x, target.y, 1); // Main roads are width 1 (thinner)
			}
		}
	}

	private generateRandomRoadBranches(_cities: Array<{ x: number; y: number }>): void {
		// Augmenter le nombre de branches de routes
		const branchCount = 30 + Math.floor(Math.random() * 40);

		for (let b = 0; b < branchCount; b++) {
			// Find a random road cell
			let x = Math.floor(Math.random() * this.width);
			let y = Math.floor(Math.random() * this.height);

			let attempts = 0;
			while (this.grid[y][x] !== TerrainType.ROAD && attempts < 50) {
				x = Math.floor(Math.random() * this.width);
				y = Math.floor(Math.random() * this.height);
				attempts++;
			}

			if (attempts < 50) {
				const branchLength = 15 + Math.floor(Math.random() * 50);
				const angle = Math.random() * Math.PI * 2;
				const angleVariation = 0.3;
				// Small roads are width 0 (single cell wide)
				const roadWidth = 0;

				let currentAngle = angle;
				let currentX = x;
				let currentY = y;

				for (let i = 0; i < branchLength; i++) {
					// Try to move in the current direction
					let nextX = Math.max(
						0,
						Math.min(this.width - 1, Math.floor(currentX + Math.cos(currentAngle) * 2))
					);
					let nextY = Math.max(
						0,
						Math.min(this.height - 1, Math.floor(currentY + Math.sin(currentAngle) * 2))
					);

					// If blocked by mountain, try to bypass it
					if (this.grid[nextY][nextX] === TerrainType.MOUNTAIN) {
						let foundPath = false;
						// Try different angles to bypass the mountain
						const angleOffsets = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
						
						for (const offset of angleOffsets) {
							const testAngle = currentAngle + offset;
							const testX = Math.max(
								0,
								Math.min(this.width - 1, Math.floor(currentX + Math.cos(testAngle) * 2))
							);
							const testY = Math.max(
								0,
								Math.min(this.height - 1, Math.floor(currentY + Math.sin(testAngle) * 2))
							);
							
							if (this.grid[testY][testX] !== TerrainType.MOUNTAIN) {
								nextX = testX;
								nextY = testY;
								currentAngle = testAngle;
								foundPath = true;
								break;
							}
						}
						
						if (!foundPath) break; // Completely blocked, stop road
					} else {
						// Add some variation to make roads more organic
						currentAngle += (Math.random() - 0.5) * angleVariation;
					}

					// Draw small road segment
					this.drawSmallRoad(currentX, currentY, nextX, nextY, roadWidth);

					currentX = nextX;
					currentY = nextY;
				}
			}
		}
	}

	private drawRoad(x0: number, y0: number, x1: number, y1: number, roadWidth: number = 1): void {
		// Use A* pathfinding to bypass mountains
		const path = this.findPathAvoidingMountains(x0, y0, x1, y1);
		
		if (!path) return; // No path found
		
		// Draw the path with curves (fill gaps between diagonal movements)
		for (let i = 0; i < path.length; i++) {
			const pos = path[i];
			
			// Draw road with specified width
			for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
				for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
					// Check Manhattan distance to ensure proper width (no diagonals for width)
					const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
					if (manhattanDist > roadWidth) continue;

					const nx = Math.max(0, Math.min(this.width - 1, pos.x + dxi));
					const ny = Math.max(0, Math.min(this.height - 1, pos.y + dyi));
					if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
						this.grid[ny][nx] = TerrainType.ROAD;
					}
				}
			}
			
			// Fill diagonal gaps between consecutive path positions
			if (i > 0) {
				const prev = path[i - 1];
				const dx = pos.x - prev.x;
				const dy = pos.y - prev.y;
				
				// If diagonal movement, fill the corner
				if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
					// Fill the two corners to make it walkable
					const corner1 = { x: prev.x + dx, y: prev.y };
					const corner2 = { x: prev.x, y: prev.y + dy };
					
					// Draw at corner1
					for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
						for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
							const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
							if (manhattanDist > roadWidth) continue;
							const nx = Math.max(0, Math.min(this.width - 1, corner1.x + dxi));
							const ny = Math.max(0, Math.min(this.height - 1, corner1.y + dyi));
							if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
								this.grid[ny][nx] = TerrainType.ROAD;
							}
						}
					}
					
					// Draw at corner2
					for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
						for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
							const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
							if (manhattanDist > roadWidth) continue;
							const nx = Math.max(0, Math.min(this.width - 1, corner2.x + dxi));
							const ny = Math.max(0, Math.min(this.height - 1, corner2.y + dyi));
							if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
								this.grid[ny][nx] = TerrainType.ROAD;
							}
						}
					}
				}
			}
		}
	}

	private findPathAvoidingMountains(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> | null {
		// Simple A* implementation with optimizations
		const openSet = new Map<string, { x: number; y: number; f: number }>();
		const closedSet = new Set<string>();
		const cameFrom = new Map<string, { x: number; y: number }>();
		const gScore = new Map<string, number>();
		
		const key = (x: number, y: number) => `${x},${y}`;
		const heuristic = (x: number, y: number) => Math.abs(x - x1) + Math.abs(y - y1);
		
		const startKey = key(x0, y0);
		const startH = heuristic(x0, y0);
		openSet.set(startKey, { x: x0, y: y0, f: startH });
		gScore.set(startKey, 0);
		
		// Limit iterations for performance
		let iterations = 0;
		const maxIterations = Math.min(this.width * this.height, 5000);
		
		while (openSet.size > 0 && iterations < maxIterations) {
			iterations++;
			
			// Find node with lowest fScore (optimized)
			let current = '';
			let currentPos = { x: 0, y: 0 };
			let lowestF = Infinity;
			for (const [nodeKey, nodeData] of openSet) {
				if (nodeData.f < lowestF) {
					lowestF = nodeData.f;
					current = nodeKey;
					currentPos = nodeData;
				}
			}
			
			const cx = currentPos.x;
			const cy = currentPos.y;
			
			if (cx === x1 && cy === y1) {
				// Reconstruct path
				const path: Array<{ x: number; y: number }> = [];
				let curr = current;
				while (curr) {
					const [x, y] = curr.split(',').map(Number);
					path.unshift({ x, y });
					const prev = cameFrom.get(curr);
					if (!prev) break;
					curr = key(prev.x, prev.y);
				}
				return path;
			}
			
			openSet.delete(current);
			closedSet.add(current);
			
			// Check neighbors (4 directions only for performance)
			const neighbors = [
				{ x: cx + 1, y: cy },
				{ x: cx - 1, y: cy },
				{ x: cx, y: cy + 1 },
				{ x: cx, y: cy - 1 }
			];
			
			for (const neighbor of neighbors) {
				if (neighbor.x < 0 || neighbor.x >= this.width || neighbor.y < 0 || neighbor.y >= this.height) continue;
				
				const neighborKey = key(neighbor.x, neighbor.y);
				if (closedSet.has(neighborKey)) continue;
				
				// Mountains have very high cost but not impossible
				const isMountain = this.grid[neighbor.y][neighbor.x] === TerrainType.MOUNTAIN;
				const tentativeGScore = (gScore.get(current) || 0) + (isMountain ? 1000 : 1);
				
				const existingG = gScore.get(neighborKey);
				if (existingG !== undefined && tentativeGScore >= existingG) {
					continue;
				}
				
				cameFrom.set(neighborKey, { x: cx, y: cy });
				gScore.set(neighborKey, tentativeGScore);
				const h = heuristic(neighbor.x, neighbor.y);
				const f = tentativeGScore + h;
				openSet.set(neighborKey, { x: neighbor.x, y: neighbor.y, f });
			}
		}
		
		// If we hit max iterations or can't find path, return straight line
		if (iterations >= maxIterations) {
			console.warn('Pathfinding hit iteration limit, using straight line');
			return this.straightLinePath(x0, y0, x1, y1);
		}
		
		return null; // No path found
	}
	
	private straightLinePath(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
		const path: Array<{ x: number; y: number }> = [];
		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;
		
		let x = x0;
		let y = y0;
		
		while (true) {
			path.push({ x, y });
			if (x === x1 && y === y1) break;
			
			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x += sx;
			}
			if (e2 < dx) {
				err += dx;
				y += sy;
			}
		}
		
		return path;
	}

	private drawSmallRoad(x0: number, y0: number, x1: number, y1: number, roadWidth: number): void {
		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;

		let x = x0;
		let y = y0;
		let prevX = x0;
		let prevY = y0;

		while (true) {
			// Small roads cannot cross mountains
			if (this.grid[y][x] === TerrainType.MOUNTAIN) {
				break;
			}

			// Draw road with specified width
			for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
				for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
					// Check Manhattan distance to ensure proper width (no diagonals for width)
					const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
					if (manhattanDist > roadWidth) continue;

					const nx = Math.max(0, Math.min(this.width - 1, x + dxi));
					const ny = Math.max(0, Math.min(this.height - 1, y + dyi));
					// Don't overwrite mountains
					if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
						this.grid[ny][nx] = TerrainType.ROAD;
					}
				}
			}
			
			// Fill diagonal gaps
			const moveX = x - prevX;
			const moveY = y - prevY;
			if (Math.abs(moveX) === 1 && Math.abs(moveY) === 1) {
				// Fill corner cells to allow player movement
				const corner1 = { x: prevX + moveX, y: prevY };
				const corner2 = { x: prevX, y: prevY + moveY };
				
				// Draw at corner1
				for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
					for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
						const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
						if (manhattanDist > roadWidth) continue;
						const nx = Math.max(0, Math.min(this.width - 1, corner1.x + dxi));
						const ny = Math.max(0, Math.min(this.height - 1, corner1.y + dyi));
						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
							this.grid[ny][nx] = TerrainType.ROAD;
						}
					}
				}
				
				// Draw at corner2
				for (let dxi = -roadWidth; dxi <= roadWidth; dxi++) {
					for (let dyi = -roadWidth; dyi <= roadWidth; dyi++) {
						const manhattanDist = Math.abs(dxi) + Math.abs(dyi);
						if (manhattanDist > roadWidth) continue;
						const nx = Math.max(0, Math.min(this.width - 1, corner2.x + dxi));
						const ny = Math.max(0, Math.min(this.height - 1, corner2.y + dyi));
						if (this.grid[ny][nx] !== TerrainType.MOUNTAIN) {
							this.grid[ny][nx] = TerrainType.ROAD;
						}
					}
				}
			}

			if (x === x1 && y === y1) break;

			prevX = x;
			prevY = y;

			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x = Math.max(0, Math.min(this.width - 1, x + sx));
			}
			if (e2 < dx) {
				err += dx;
				y = Math.max(0, Math.min(this.height - 1, y + sy));
			}
		}
	}
}

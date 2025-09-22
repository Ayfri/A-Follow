// A* Pathfinding Algorithm

/** Represents a 2D grid position */
export interface Position {
    x: number;
    y: number;
}

/** Node used in A* pathfinding algorithm */
interface Node {
    position: Position;
    gCost: number;
    hCost: number;
    fCost: number;
    parent: Node | null;
}

/** Calculates Manhattan distance between two positions, i.e. the number of grid cells between them in a straight line */
function manhattanDistance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Gets accessible neighboring positions (4-directional) */
function getNeighbors(pos: Position, gridWidth: number, gridHeight: number): Position[] {
    const neighbors: Position[] = [];
    const directions = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 }
    ];

    for (const dir of directions) {
        const newPos = { x: pos.x + dir.x, y: pos.y + dir.y };
        if (newPos.x >= 0 && newPos.x < gridWidth &&
            newPos.y >= 0 && newPos.y < gridHeight) {
            neighbors.push(newPos);
        }
    }

    return neighbors;
}

/** Checks if a position is walkable (not an obstacle) */
function isWalkable(pos: Position, grid: number[][], gridWidth: number): boolean {
    if (pos.x < 0 || pos.x >= gridWidth || pos.y < 0 || pos.y >= grid.length) return false;
    return grid[pos.y][pos.x] === 0;
}

/** Reconstructs the path from end node to start */
function reconstructPath(endNode: Node): Position[] {
    const path: Position[] = [];
    let current: Node | null = endNode;
    while (current) {
        path.push(current.position);
        current = current.parent;
    }
    return path.reverse();
}

/**
 * Finds the shortest path using A* algorithm.
 * How it works:
 * 1. Start from the initial position and explore neighboring cells.
 * 2. Calculate costs (g: distance from start, h: estimated distance to end, f: total estimated cost) for each cell and keep track of the best path.
 * 3. Continue exploring until the target position is reached or no more cells to explore.
 * 4. Reconstruct the path from end to start if found.
 * @param start Starting position
 * @param end Target position
 * @param grid Grid array with cell states
 * @param gridWidth Width of the grid in cells
 * @param gridHeight Height of the grid in cells
 * @returns Array of positions forming the path, or null if no path found
 */
export function aStar(
    start: Position,
    end: Position,
    grid: number[][],
    gridWidth: number,
    gridHeight: number
): Position[] | null {
    const openList: Node[] = []; // Nodes to be evaluated
    const closedSet = new Set<string>(); // Nodes already evaluated

    // Initialize with start node
    const startNode: Node = {
        position: start,
        gCost: 0, // Distance from start
        hCost: manhattanDistance(start, end), // Estimated distance to end
        fCost: manhattanDistance(start, end), // Total estimated cost
        parent: null
    };

    openList.push(startNode);

    // Main A* loop: continue until no more nodes to evaluate
    while (openList.length > 0) {
        // Find node with lowest total cost (f = g + h)
        let currentIndex = 0;
        for (let i = 1; i < openList.length; i++) {
            if (openList[i].fCost < openList[currentIndex].fCost) {
                currentIndex = i;
            }
        }

        const current = openList[currentIndex];

        // Goal reached - reconstruct path
        if (current.position.x === end.x && current.position.y === end.y) {
            return reconstructPath(current);
        }

        // Move current node from open to closed (mark as evaluated)
        openList.splice(currentIndex, 1);
        closedSet.add(`${current.position.x},${current.position.y}`);

        // Explore neighboring cells
        const neighbors = getNeighbors(current.position, gridWidth, gridHeight);
        for (const neighborPos of neighbors) {
            const key = `${neighborPos.x},${neighborPos.y}`;

            // Skip if already evaluated or blocked
            if (closedSet.has(key) || !isWalkable(neighborPos, grid, gridWidth)) {
                continue;
            }

            // Calculate cost to reach this neighbor through current path
            const tentativeGCost = current.gCost + 1;

            // Check if neighbor is already in open list
            const existingNode = openList.find(node =>
                node.position.x === neighborPos.x && node.position.y === neighborPos.y
            );

            if (!existingNode) {
                // Add new node to open list with calculated costs
                const neighborNode: Node = {
                    position: neighborPos,
                    gCost: tentativeGCost,
                    hCost: manhattanDistance(neighborPos, end),
                    fCost: tentativeGCost + manhattanDistance(neighborPos, end),
                    parent: current
                };
                openList.push(neighborNode);
            } else if (tentativeGCost < existingNode.gCost) {
                // Found better path to existing node - update it
                existingNode.gCost = tentativeGCost;
                existingNode.fCost = tentativeGCost + existingNode.hCost;
                existingNode.parent = current;
            }
        }
    }

    // No path found
    return null;
}
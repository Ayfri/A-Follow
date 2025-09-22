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
    // Deterministic tie-breaker (insertion order)
    order?: number;
}

/** Priority Queue implementation for A* algorithm */
class PriorityQueue {
    private items: Node[] = [];

    enqueue(node: Node): void {
        this.items.push(node);
        this.bubbleUp(this.items.length - 1);
    }

    dequeue(): Node | undefined {
        if (this.items.length === 0) return undefined;
        if (this.items.length === 1) return this.items.pop();

        const min = this.items[0];
        this.items[0] = this.items.pop()!;
        this.bubbleDown(0);
        return min;
    }

    isEmpty(): boolean {
        return this.items.length === 0;
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (!this.isLess(this.items[index], this.items[parentIndex])) break;
            this.swap(index, parentIndex);
            index = parentIndex;
        }
    }

    private bubbleDown(index: number): void {
        while (true) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;

            if (leftChild < this.items.length && this.isLess(this.items[leftChild], this.items[smallest])) {
                smallest = leftChild;
            }

            if (rightChild < this.items.length && this.isLess(this.items[rightChild], this.items[smallest])) {
                smallest = rightChild;
            }

            if (smallest === index) break;
            this.swap(index, smallest);
            index = smallest;
        }
    }

    private swap(i: number, j: number): void {
        [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    }

    // Compare nodes with deterministic tie-breaking: fCost, then hCost, then order
    private isLess(a: Node, b: Node): boolean {
        if (a.fCost !== b.fCost) return a.fCost < b.fCost;
        if (a.hCost !== b.hCost) return a.hCost < b.hCost;
        const ao = a.order ?? 0;
        const bo = b.order ?? 0;
        return ao < bo;
    }
}

/** Calculates Manhattan distance between two positions, i.e. the number of grid cells between them in a straight line */
function manhattanDistance(a: Position, b: Position): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Using plain Manhattan distance as heuristic for stability

/** Check if a straight horizontal or vertical path is possible */
function canGoStraightHV(start: Position, end: Position, grid: number[][], gridWidth: number): boolean {
    // Check if it's a horizontal or vertical line
    if (start.x !== end.x && start.y !== end.y) {
        return false; // Not a straight horizontal or vertical line
    }
    
    if (start.x === end.x) {
        // Vertical line
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        for (let y = minY; y <= maxY; y++) {
            if (!isWalkable({x: start.x, y}, grid, gridWidth)) {
                return false;
            }
        }
    } else {
        // Horizontal line
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        for (let x = minX; x <= maxX; x++) {
            if (!isWalkable({x, y: start.y}, grid, gridWidth)) {
                return false;
            }
        }
    }
    
    return true;
}

/** Generate straight horizontal or vertical path */
function generateStraightHVPath(start: Position, end: Position): Position[] {
    const path: Position[] = [];
    
    if (start.x === end.x) {
        // Vertical line
        const direction = start.y < end.y ? 1 : -1;
        for (let y = start.y; direction > 0 ? y <= end.y : y >= end.y; y += direction) {
            path.push({x: start.x, y});
        }
    } else {
        // Horizontal line
        const direction = start.x < end.x ? 1 : -1;
        for (let x = start.x; direction > 0 ? x <= end.x : x >= end.x; x += direction) {
            path.push({x, y: start.y});
        }
    }
    
    return path;
}

// getNeighbors removed: we inline neighbor iteration in aStar to avoid allocations

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
 * Finds the shortest path using A* algorithm with straight line optimization.
 * How it works:
 * 1. First check if a straight line path is possible
 * 2. If not, use optimized A* with enhanced heuristic that favors straight lines
 * 3. Use priority queue for efficient node selection
 * 4. Calculate costs with tie-breaking that prefers straight paths
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
    // Quick check: if straight horizontal/vertical line is possible, use it
    if (canGoStraightHV(start, end, grid, gridWidth)) {
        return generateStraightHVPath(start, end);
    }

    // Performance-oriented data structures
    const openList = new PriorityQueue();
    // Closed set as a typed array (0 = not closed, 1 = closed)
    const closed = new Uint8Array(gridWidth * gridHeight);
    // gScores as a typed array initialized to +Infinity
    const gScores = new Float32Array(gridWidth * gridHeight);
    gScores.fill(Number.POSITIVE_INFINITY);

    // Helper to convert (x,y) -> linear index
    const idx = (x: number, y: number) => y * gridWidth + x;
    let orderCounter = 0; // for deterministic tie-breaking

    // Initialize with start node
    const startNode: Node = {
        position: start,
        gCost: 0,
        hCost: manhattanDistance(start, end),
        fCost: manhattanDistance(start, end),
        parent: null,
        order: orderCounter++
    };

    openList.enqueue(startNode);
    gScores[idx(start.x, start.y)] = 0;

    // Main A* loop
    while (!openList.isEmpty()) {
        const current = openList.dequeue()!;
        const cx = current.position.x;
        const cy = current.position.y;
        const currentIndex = idx(cx, cy);

        // Goal reached
        if (cx === end.x && cy === end.y) {
            return reconstructPath(current);
        }

        // Mark current as closed
        closed[currentIndex] = 1;

        // Explore neighboring cells (inline to avoid allocations)
        // Directions: up, right, down, left
        const dirsX = [0, 1, 0, -1];
        const dirsY = [-1, 0, 1, 0];

        for (let i = 0; i < 4; i++) {
            const nx = cx + dirsX[i];
            const ny = cy + dirsY[i];

            // Bounds check
            if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
            const nIndex = idx(nx, ny);

            // Closed or not walkable
            if (closed[nIndex] !== 0 || grid[ny][nx] !== 0) continue;

            const tentativeGCost = current.gCost + 1;
            const existingG = gScores[nIndex];
            if (tentativeGCost < existingG) {
                gScores[nIndex] = tentativeGCost;

                const hCost = Math.abs(nx - end.x) + Math.abs(ny - end.y);
                const neighborNode: Node = {
                    position: { x: nx, y: ny },
                    gCost: tentativeGCost,
                    hCost,
                    fCost: tentativeGCost + hCost,
                    parent: current,
                    order: orderCounter++
                };
                openList.enqueue(neighborNode);
            }
        }
    }

    return null;
}
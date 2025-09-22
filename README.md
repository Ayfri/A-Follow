# AFollow

AFollow is an interactive web application demonstrating the A* pathfinding algorithm using p5.js. Watch as a player navigates through a grid-based environment, finding optimal paths around obstacles in real-time.

## Features

- **Real-time A* Pathfinding**: Interactive visualization of the A* algorithm with live path calculation
- **Dynamic Player Movement**: Player automatically follows the calculated path at adjustable speeds
- **Interactive Grid Editing**: 
  - Left-click and drag to draw walls/obstacles
  - Right-click and drag to erase walls
  - Hold Shift while dragging for straight lines
- **Customizable Controls**:
  - Adjust player movement speed
  - Change grid cell size
  - Customize colors for all visual elements (background, walls, path, grid, player)
- **Procedural Generation**:
  - Generate random mazes using recursive backtracking
  - Create random obstacle grids with adjustable density
- **Persistent Settings**: All preferences are automatically saved to localStorage
- **Responsive Design**: Adapts to different screen sizes
- **Collapsible UI**: Minimize controls to focus on the visualization

## Technologies

- **p5.js**: Creative coding library for interactive graphics and animations
- **A* Algorithm**: Efficient pathfinding with Manhattan distance heuristic
- **TypeScript**: Type-safe JavaScript for better development experience
- **Vite**: Fast build tool and development server
- **HTML5 Canvas**: Hardware-accelerated graphics rendering

## How It Works

The application uses the A* pathfinding algorithm to find the shortest path from the player's current position to the mouse cursor position. The algorithm:

1. Maintains an open list of nodes to evaluate and a closed list of evaluated nodes
2. Calculates costs: g-cost (distance from start), h-cost (estimated distance to end), f-cost (total)
3. Explores neighboring cells in 4 directions (up, down, left, right)
4. Reconstructs the optimal path once the target is reached

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- pnpm package manager

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Ayfri/A-Follow.git
   cd A-Follow
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run the development server:
   ```bash
   pnpm run dev
   ```

4. Open your browser to `http://localhost:5173` to see the A* pathfinding experiment.

## Usage

### Basic Interaction
- **Move the mouse** to set the target position for pathfinding
- **Left-click and drag** on the grid to create walls/obstacles
- **Right-click and drag** to remove walls
- **Hold Shift** while dragging to draw straight lines

### UI Controls
- **Speed Slider**: Adjust how fast the player moves along the path
- **Grid Size Slider**: Change the size of grid cells
- **Color Pickers**: Customize the appearance of different elements
- **Generate Random Maze**: Create a perfect maze using recursive backtracking
- **Generate Random Grid**: Fill the grid with random obstacles based on probability
- **Random Grid Probability**: Adjust the density of random obstacles

### Keyboard Shortcuts
- **Shift + Drag**: Draw straight lines when creating walls

## Build

To build for production:
```bash
pnpm run build
```

## Preview

To preview the production build:
```bash
pnpm run preview
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. Areas for improvement include:

- Additional pathfinding algorithms (Dijkstra, BFS, etc.)
- More maze generation algorithms
- Performance optimizations
- Mobile touch support
- Export/import grid configurations

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

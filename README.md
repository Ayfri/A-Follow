# AFollow

AFollow is an interactive A* pathfinding sandbox built with p5.js. You draw walls on an infinite grid, move the mouse, and a player walks the shortest path to the cell under the cursor, around everything you built.

Live demo: [afollow.ayfri.com](https://afollow.ayfri.com/)

## Features

- **Infinite grid**: pan in any direction, there are no world bounds. Walls are stored in sparse 128 x 128 chunks, and a chunk without walls takes no memory.
- **Chunk-cached rendering**: each chunk is drawn to its own canvas and repacked only when its walls change, so a frame costs one image draw per visible chunk.
- **Build mode**: toggle it with `B`. With build mode off, a left drag pans instead of drawing.
- **A* in a bounded window**: the search covers the visible area plus a margin, with a node budget, so a walled-in target never freezes the page.
- **Smooth zoom**: the wheel zooms from 25% to 400% around the cursor with an eased animation.
- **Maze and random grid generators** that fill the visible area.
- **Themes and settings** saved in localStorage, with a collapsible sidebar.

## Controls

| Input | Action |
| --- | --- |
| `B` | Toggle build mode |
| Left drag | Draw walls (build mode on) or pan (build mode off) |
| Right drag | Erase walls (build mode on) |
| `Shift` + drag | Draw or erase a straight line |
| Middle drag | Pan |
| `Space` + left drag | Pan |
| Arrow keys | Pan |
| Mouse wheel | Zoom around the cursor |

Move the mouse over the canvas to set the target: the path is drawn from the player to the cell under the cursor.

## Settings

Every setting below is saved in localStorage, except the zoom, which starts at 100%.

| Section | Setting | Range or default |
| --- | --- | --- |
| Mode | Build | On |
| Player | Speed | 1 to 5000 cells/s on a log scale, default 5 cells/s |
| Grid | Cell Size | 3 to 60 px, default 20 px |
| Grid | Show grid lines | On. Lines fade out as cells shrink below 10 px and disappear at 4 px. |
| Grid | Snap to nearest tile | Off. A wall target is replaced by the nearest open cell. |
| Maze | Generate Maze | Replaces the visible area with a random maze |
| Maze | Wall Probability | 5% to 60% in steps of 2.5%, default 20% |
| Maze | Random Grid | Replaces the visible area with random walls at that probability |
| Maze | Clear | Removes every wall of the grid |
| Camera | Zoom | 25% to 400%, follows the wheel |
| Camera | Reset view | Centers the camera on the player at zoom 100% |
| Theme | Background, Wall, Path, Grid Lines, Player | One color picker each |

Generate Maze and Random Grid act on the visible area, including the part under the sidebar. Walls outside it stay as they are. Clear acts on the whole grid.

## How it works

### Chunks

The grid is a map from chunk coordinates to a 128 x 128 `Uint8Array` (1 is a wall). Cells are int32 and a chunk key packs both chunk coordinates into one number, so lookups allocate nothing. A chunk that loses its last wall is deleted. Each chunk carries a version stamp taken from the grid revision at its last change, and the renderer repacks a chunk's canvas only when the stamps differ.

### Window and budget

The path search runs on a window made of the visible area grown by 16 cells on every side, extended to contain the player and the target. A window side is capped at 2048 cells, and a player and a target that are 2048 or more cells apart on one axis have no path. The walls of the window are copied once into a flat buffer, so the search loop never touches the chunk map. A search stops after 2^18 expanded nodes and returns no path, which bounds the cost of a target that is walled in far away to about 110 ms on the largest window.

### A*

The search moves on 4 neighbors with a Manhattan heuristic. The open set is a binary heap ordered by total cost, then by heuristic cost, then by insertion order, so equal-cost paths resolve the same way on every run. When the player and the target share a row or a column with no wall between them, the straight path is returned without copying the window. With snap on, a wall target is replaced by the nearest open cell found with a breadth-first search inside the window. The path is only recomputed when the target cell, the walls or the snap option change.

## Getting started

Requires [Bun](https://bun.com) 1.4 or higher.

```bash
git clone https://github.com/Ayfri/A-Follow.git
cd A-Follow
bun install
bun run dev
```

Then open `http://localhost:5173`.

Other scripts:

```bash
bun run build    # type-check with tsc, then build to dist/
bun run preview  # serve the production build
```

## Tech

- [p5.js](https://p5js.org) 2 for the canvas, input and animation loop
- [TypeScript](https://www.typescriptlang.org) 7
- [Vite](https://vite.dev) 8
- [Bun](https://bun.com) as runtime and package manager
- [Lucide](https://lucide.dev) for the icons

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

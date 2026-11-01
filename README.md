# AFollow

AFollow is an interactive A* pathfinding sandbox built with p5.js. You draw walls on an infinite grid, move the mouse, and a player walks the shortest path to the cell under the cursor, around everything you built.

Live demo: [afollow.ayfri.com](https://afollow.ayfri.com/)

## Features

- **Infinite grid**: pan in any direction, there are no world bounds. Walls are stored in sparse 128 x 128 chunks, and a chunk without walls takes no memory.
- **Chunk-cached rendering**: each chunk is drawn to its own canvas and repacked only when its walls change, so a frame costs one image draw per visible chunk.
- **Build mode**: toggle it with `B`. With build mode off, a left drag pans instead of drawing.
- **A* in a bounded window**: the search covers the visible area plus a margin and runs in a worker, so a long path never freezes the page, and a target that is walled in is rejected without searching.
- **Smooth zoom**: the wheel zooms from 25% to 400% around the cursor with an eased animation.
- **Maze and random grid generators** that fill the visible area, built in the path worker.
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
| Player | Speed | 1 to 5000 cells/s on a log scale, default step 8 (about 4.6 cells/s) |
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

Generate Maze and Random Grid act on the visible area, including the part under the sidebar. Walls outside it stay as they are. The path worker builds the cells, so the page stays responsive on a large view: both buttons are disabled until the fill is written, and Clear cancels a fill that is still pending. Clear acts on the whole grid.

## How it works

### Chunks

The grid is a map from chunk coordinates to a 128 x 128 `Uint8Array` (1 is a wall). Cells are int32 and a chunk key packs both chunk coordinates into one number, so lookups allocate nothing. A chunk that loses its last wall is deleted. Each chunk carries a version stamp taken from the grid revision at its last change, and the renderer repacks a chunk's canvas only when the stamps differ.

### Window and budget

The path search runs on a window made of the visible area grown by 16 cells on every side, extended to contain the player and the target. A window side is capped at 4096 cells and its area at 2^23 cells (above that the longer side shrinks to fit). A player and a target too far apart to share a window have no path. The walls of the window are copied once into a flat buffer, so the search loop never touches the chunk map.

The search has no node budget on the full window, so it always gives the exact answer, and it runs off the main thread:

- **Small attempt on the main thread**: a target near the player is answered on the spot by a search on a small window (32 cells around the two points) that stops after 4096 expanded nodes. Its path is kept only when no path leaving that small window can be shorter. Otherwise the target goes to the worker.
- **Path worker**: it searches the whole window on its own copy of the walls, which receives every wall change from the main thread in order. Only the newest request is kept: an older one that has not started is dropped, and one that has started is abandoned at its next slice. A search runs in slices of 50,000 expanded nodes (about 9 ms), so a newer request is seen quickly. The player keeps walking its old path until the result arrives, then joins the new one.

### Connectivity check

Before it searches, the worker checks that the target can be reached at all. Each chunk is labeled by its connected regions of open cells (computed when the chunk is first needed and again when its version changes), and a union-find joins the regions that touch across chunk borders. A chunk that does not exist is one open region. When the player and the target are in different regions, there is no path inside the window and the answer is "no path" without searching.

The check only proves that there is no path. Labels cover whole chunks, including the cells of an edge chunk that lie outside the window, so it can say "connected" when the only route runs through those cells: the search then runs and finds nothing. It never rejects a reachable target, and on a window aligned to chunk borders it is exact. A target walled in on a 2240 x 1265 grid is rejected in about 50 ms the first time and about 1 ms after a wall change, where scanning the window took about 1.5 s.

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

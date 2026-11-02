# AFollow

AFollow is an interactive A* pathfinding sandbox built with p5.js. You draw walls on an infinite, procedurally generated city, move the mouse, and a player walks the cheapest path to the cell under the cursor, around everything you built. Roads are fast, fields and forests are slow, buildings and water block.

Live demo: [afollow.ayfri.com](https://afollow.ayfri.com/)

## Features

- **Infinite city**: pan in any direction, there are no world bounds. Rivers, lakes, towns with street grids, highways, bridges, parks, plazas, buildings, fields and forests are generated from a seed, chunk by chunk, as you look at them. An empty world without terrain is one toggle away.
- **Terrain costs**: every cell type has a cost to enter it. The player walks 4 times faster on a highway than on open ground and the path search minimizes the total cost, not the number of cells.
- **Weighted and unit-cost searches**: a bucket-queue A* handles mixed costs, and A*, JPS4 or a bidirectional search handle windows with a single passable type. All run in a worker, so a long path never freezes the page, and a target that is walled in is rejected without searching.
- **Your walls on top**: left drag draws walls over any cell, right drag erases your own walls and brings back the generated terrain.
- **Chunk-cached rendering**: each chunk is drawn to its own canvas and repacked only when its cells change, so a frame costs one image draw per visible chunk.
- **Build mode**: toggle it with `B`. With build mode off, a left drag pans instead of drawing.
- **Smooth zoom**: the wheel zooms from 25% to 400% around the cursor with an eased animation.
- **Maze and random grid generators** that fill the visible area, built in the path worker.
- **Themes and settings** saved in localStorage, with a collapsible sidebar.

## Controls

| Input | Action |
| --- | --- |
| `B` | Toggle build mode |
| Left drag | Draw walls (build mode on) or pan (build mode off) |
| Right drag | Erase your walls (build mode on) |
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
| Player | Speed | 1 to 5000 cells/s on a log scale, default step 8 (about 4.6 cells/s). It is the speed on open ground: other cells scale with their cost. |
| Grid | Cell Size | 3 to 60 px, default 20 px |
| Grid | Show grid lines | On. Lines fade out as cells shrink below 10 px and disappear at 4 px. |
| Grid | Snap to nearest tile | Off. A wall target is replaced by the nearest open cell. |
| World | City | On. Off gives the empty world, where every cell is ground. |
| World | Seed | 0 to 4294967295, default 1. The same seed gives the same city. |
| World | New seed | Picks a random seed |
| Maze | Generate Maze | Replaces the visible area with a random maze |
| Maze | Wall Probability | 5% to 60% in steps of 2.5%, default 20% |
| Maze | Random Grid | Replaces the visible area with random walls at that probability |
| Maze | Clear | Removes every wall you drew, and the city returns where a maze or a random grid replaced it |
| Camera | Zoom | 25% to 400%, follows the wheel |
| Camera | Reset view | Centers the camera on the player at zoom 100% |
| Theme | Ground (background), Wall, Path, Grid Lines, Player | One color picker each |
| Theme | Street, Avenue, Highway, Bridge, Plaza, Park, Field, Forest, Building, Water | One color picker each |

Switching between the city and the empty world, or changing the seed while the city is on, drops every edit, cancels the pending search and moves the player to the nearest passable cell. With the city off, the seed field changes nothing and your walls stay. The app opens in the city of the saved seed.

Generate Maze and Random Grid act on the visible area, including the part under the sidebar. In the city they flatten it: the area becomes ground and walls, so buildings, roads and water there disappear until Clear. Cells outside the area stay as they are. The path worker builds the cells, so the page stays responsive on a large view: both buttons are disabled until the fill is written, and Clear cancels a fill that is still pending. Clear acts on the whole grid.

## How it works

### Cell types and costs

A cell is one byte holding a type. A wall is one blocked type among several. Entering a cell costs its type's cost (the start cell is free), and a cost of 0 blocks it.

| Type | Cost | Blocked |
| --- | --- | --- |
| Ground | 4 | no |
| Wall (yours) | 0 | yes |
| Street | 2 | no |
| Avenue | 1 | no |
| Highway | 1 | no |
| Bridge | 1 | no |
| Plaza | 2 | no |
| Park | 3 | no |
| Field | 5 | no |
| Forest | 8 | no |
| Building | 0 | yes |
| Water | 0 | yes |

Ground costs 4 times the cheapest road, which bounds how misleading the search heuristic can be. Highways and avenues share the cost and differ in width and color.

The player takes `1000 * cost / (4 * speed)` ms to enter a cell, so the speed setting is in cells per second on open ground and a highway is walked 4 times faster. In the empty world every cell is ground and the stepping is `1000 / speed` ms per cell.

### Chunks, base and edits

The grid is a map from chunk coordinates to a 128 x 128 `Uint8Array` of cell types. A chunk key packs both chunk coordinates into one number, so lookups allocate nothing. Each chunk carries a histogram of its types, a count of blocked cells and a version stamp taken from the grid revision at its last change. The renderer repacks a chunk's canvas only when the stamps differ. A frame spends at most about 4 ms repacking (and always repacks at least one chunk), so after a fill or a color change the whole view settles over a few frames instead of in one long one.

The generated city is the base. Your edits are tracked per chunk: the first edit marks the chunk as edited, and from then on it is kept. Reading a cell is always one array index, with no second lookup for the edits. Erasing restores the generated type of the cell (the base of an edited chunk is computed on the first erase). Generated buildings and water can't be erased, only covered by your walls. In the empty world a chunk with only ground is deleted.

### Lazy generation and eviction

The terrain is a pure function of the seed and the cell position, so a chunk is generated when it is first read and an unedited chunk can be dropped and rebuilt with the same bytes. Generation takes about 0.7 to 0.9 ms per chunk on average (p95 about 1.3 to 1.8 ms). It never changes the grid revision and notifies nobody, since the content is the same on every thread.

- **Renderer**: it generates the visible chunks that are still missing, within 4 ms per frame (and at least one per frame). A chunk not generated yet shows the ground color for a frame or two.
- **Cache bound**: unedited chunks are capped at 2048 (32 MB of cells). Above that, the oldest ones outside the view are evicted down to 1024, so the scan does not run every frame. Edited chunks are never evicted, so memory grows only with your edits. The path worker also keeps connectivity labels for the chunks it checked, 32 KB per chunk (freed with the chunk), so its bound is about 32 MB of cells plus up to 64 MB of labels.

### Generation layers

Each layer is a pure function of the seed, painted over the previous ones, and a tile of any size and origin gets the same cells as a part of a bigger tile.

1. **Countryside**: forests from value noise, and farmland zones cut into hedged field parcels with the odd farmstead.
2. **Water**: rivers (contour lines of a warped noise, so they never end) and lakes.
3. **Towns**: one per 512 x 512 region with probability 0.6, as villages, towns or cities of growing radius, with an irregular outline. Their ground replaces fields and forests.
4. **Fabric**: a town of tier 1 and up is cut into Voronoi districts (170 to 260 cells wide) whose boundaries are avenues. Each district has its own jittered street grid, turned off the axis of the town by up to 25 degrees, with an avenue every 4th line (every 6th in organic towns, 5th in sprawl). A street is the set of cells a straight line touches, so a turned street is a 4-connected staircase. The blocks between the streets are split into lots with buildings, parks and plazas, by zone (downtown, inner, suburbs, and a bigger-lot center for a metropolis), with a gap of at least 2 cells between buildings on a turned grid. The town center is a plaza.
5. **Roads**: highways between towns, country roads for the small ones, with bridges where they cross water. The largest connected component holds 96 to 99.6% of the road cells.
6. **Ribbon houses**: houses along the country roads near the towns they link.

### Window and budget

The path search runs on a window made of the visible area grown by 16 cells on every side, extended to contain the player and the target. When one of them is off screen (the player after a zoom in, for example), the window also reaches half their Manhattan distance around both, so the search isn't squeezed into a thin strip that a river or a row of buildings cuts. A window side is capped at 4096 cells and its area at 2^23 cells (above that the room around the endpoints halves first, then the longer side shrinks to fit). A player and a target too far apart to share a window have no path. The cells of the window are copied once into a flat buffer, so the search loop never touches the chunk map.

The search has no node budget on the full window, so it always gives the exact answer, and it runs off the main thread:

- **Small attempt on the main thread**: a target near the player is answered on the spot by a search on a small window (32 cells around the two points) that stops after 4096 expanded nodes. Its path is kept only when no path leaving that small window can cost less, using the cheapest cost in the full window. Otherwise the target goes to the worker, which is also where it goes in the city when the small window would make the main thread generate more than 16 chunks. In the city, roads make the cheapest cost 1, so fewer targets are answered here and more go to the worker.
- **Path worker**: it searches the whole window on its own copy of the edits. It never receives generated cells: the main thread sends the world (kind and seed) once per world change, and the worker generates its own chunks from the seed. Only your edits are sent, in order. Before a search it evicts unedited chunks outside the window beyond the cache bound, then generates the missing chunks of the window in slices of 8 ms, so a newer request is seen between slices. Generating the largest window (8.4M cells, 512 chunks) takes about 0.4 s. Only the newest request is kept: an older one that has not started is dropped, and one that has started is abandoned at its next slice. A search runs in slices of 50,000 expanded nodes (50,000 scanned cells for JPS4). When the main thread answers a request itself, it tells the worker to drop the running search. The player keeps walking its old path until the result arrives, then joins the new one. Walls drawn or generated meanwhile cut the old path right before the first blocked cell ahead, so the player stops there instead of walking through it, and a result that was computed before an edit is cut the same way. The cut reads the chunks along the path and generates the missing ones, so buildings and water that Clear brings back across the path stop the player too.

### Connectivity check

Before it searches, the worker checks that the target can be reached at all. Each chunk is labeled by its connected regions of passable cells (computed when the chunk is first needed and again when its version changes, which includes a chunk regenerated after eviction), and a union-find joins the regions that touch across chunk borders. In the empty world a chunk that does not exist is one open region; in the city the whole window is generated before the check. When the player and the target are in different regions, there is no path inside the window and the answer is "no path" without searching.

The check only proves that there is no path. Labels cover whole chunks, including the cells of an edge chunk that lie outside the window, so it can say "connected" when the only route runs through those cells: the search then runs and finds nothing. It never rejects a reachable target, and on a window aligned to chunk borders it is exact. A target walled in on a 2240 x 1265 grid is rejected in about 50 ms the first time and about 1 ms after a wall change, against about 1.5 s for scanning the window with A*. With snap on, a wall target needs the nearest open cell first, so the window is copied before the check.

### Unit searches and the weighted search

The search moves on 4 neighbors and always returns a cheapest path. A window whose chunks can only hold one passable type uses the unit-cost searches, where the cheapest path is the shortest one. That is every window of the empty world, including a maze or a random grid, and ground next to water. In the city, a maze or a random grid over the view does not qualify by itself: the window reaches past the filled area, its edge chunks hold generated terrain and the type count is per whole chunk, so it uses the unit searches only when every chunk of the window holds a single passable type. Any window that can hold two passable types, like roads next to ground, uses the weighted search.

**Unit searches** pick one of three from the wall density of the window's chunks:

- **A*** below 3% walls, where it is hard to beat (an open window takes about 5 ms with A* and 70 ms with JPS4). Its heuristic is Manhattan distance and its open set is a binary heap ordered by total cost, then by heuristic cost, then by insertion order.
- **JPS4** from 3% to 36%: jump point search for 4-connected grids ([arXiv 2501.14816](https://arxiv.org/abs/2501.14816)). It prunes symmetric paths with a horizontal-first ordering and jumps along vertical runs to the next cell with a forced neighbor, so the open set stays small. On random grids of 5% to 35% walls it is 1.3 to 1.6 times faster than A* or the bidirectional search, whichever is faster there.
- **Bidirectional breadth-first search** from 36% walls and on mazes, about 2 to 2.5 times faster than A* there (a 2240 x 1265 maze took about 100 ms with A* and 40 to 60 ms with it). It expands one full level of the side with the smaller frontier each turn, and a side that runs out of cells proves there is no path.

A window of one passable type other than ground (a flattened area next to streets only, for example) is copied through the blocked table, so the unit searches still apply.

**Weighted search**: A* over a bucket queue (Dial) on the integer costs. The heuristic is the cheapest cost of the window times the Manhattan distance, which is consistent, so the queue needs only 32 buckets in a ring and an entry costs 8 bytes. Equal-cost entries come out last in, first out, so a run is deterministic. Its result matches a reference Dijkstra on random mixed grids, in cost and in reachability.

Far searches in large mixed-cost city windows are the slow case: they take up to about 0.7 s in the worker, because ground costs 4 times the cheapest road and the heuristic only knows the cheapest cost. Unit-cost searches run at the timings given above. The slices keep the page responsive meanwhile, and a newer request abandons the running search at its next slice.

Equal-cost paths resolve the same way on every run (neighbors are taken up, right, down, left), but the searches can return different cheapest paths. When the player and the target share a row or a column and every cell between them costs the cheapest cost of the window, the straight path is returned without copying the window. With snap on, a wall target is replaced by the nearest open cell found with a breadth-first search inside the window. The path is only recomputed when the target cell, the edits or the snap option change.

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

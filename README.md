# AFollow

AFollow is an interactive A* pathfinding sandbox built with p5.js. You draw walls on an infinite, procedurally generated city, move the mouse, and a player walks the cheapest path to the cell under the cursor, around everything you built. Roads are fast, fields, forests, marsh, hills and snow are slow, buildings, water, rock and ramparts block.

Live demo: [afollow.ayfri.com](https://afollow.ayfri.com/)

## Features

- **Infinite city**: pan in any direction, there are no world bounds. Everything below is generated from a seed, chunk by chunk, as you look at them. An empty world without terrain is one toggle away.
- **Biomes**: an elevation, a moisture and a temperature field decide the ground. Lowlands hold broadleaf and pine forests, meadows, and farmland cut into hedged parcels (fields with the odd farmstead, meadows, vineyard rows). Deserts are sand with scrub, marsh sits low and wet, hills and mountains carry pine, snow and rock.
- **Sea and coasts**: the sea covers about 14% of the world away from the origin, with a beach of sand along the shore. The origin is land on every seed, so the player never starts at sea. Rivers widen as they run downhill from the foot of the mountains to the coast, and lakes only sit below the hills.
- **Mountains**: rock is blocked, in blobs that leave the passable part of a mountain connected (the largest open area holds 99.69% or more of its cells in the measured windows, and rock is 14% to 23% of the mountain area). Hills and snow around it are passable but costly, and a road cuts a pass through rock when no detour avoids it.
- **Six kinds of town**: planned (rotated grids), organic (bent streets, a walled old town), radial (rings, spokes and a ring road), linear (stretched along a main street, often along a river), harbor (quays and piers) and sprawl (long curved blocks with cul-de-sacs). Villages, towns and cities grow in size, with streets, avenues, parks, plazas, lots and buildings.
- **Metropolis**: a fourth tier, 600 to 950 cells in radius, on its own lattice of 4096 cells. It has a big-lot center, motorways to its neighbors and a ring road.
- **Roads**: highways between towns, country roads where a village is one end, bridges over rivers and straits, detours around lakes and mountains.
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
| Theme | Street, Avenue, Highway, Bridge, Plaza, Park, Field, Forest, Building, Water, Sand, Marsh, Rock, Snow, Hill, Meadow, Orchard, Pine Forest, Rampart | One color picker each, 19 in the "Terrain Colors" section |

Switching between the city and the empty world, or changing the seed while the city is on, drops every edit, cancels the pending search and moves the player to the nearest passable cell within 256 cells of where it stood. The sea can be wider than that, so when no passable cell is in range the player is placed on the nearest passable cell within 256 cells of the origin, which is land on every seed. The camera doesn't follow. With the city off, the seed field changes nothing and your walls stay. The app opens in the city of the saved seed.

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
| Sand | 6 | no |
| Marsh | 12 | no |
| Rock | 0 | yes |
| Snow | 10 | no |
| Hill | 6 | no |
| Meadow | 4 | no |
| Orchard | 5 | no |
| Pine forest | 7 | no |
| Rampart | 0 | yes |

That is 21 types. The ids 21 to 31 are unused and blocked, so a stray byte never reads as passable, and no passable type may use id 31 (the path search keeps one bit per passable type in an int32 mask). Ground costs 4 times the cheapest road and marsh, the dearest cell, 12 times: that cap (`MAX_COST`) bounds how misleading the search heuristic can be and the size of the weighted search's bucket ring. Highways and avenues share the cost and differ in width and color.

The player takes `1000 * cost / (4 * speed)` ms to enter a cell, so the speed setting is in cells per second on open ground, a highway is walked 4 times faster and a marsh cell takes 3 times as long as ground. In the empty world every cell is ground and the stepping is `1000 / speed` ms per cell.

### Chunks, base and edits

The grid is a map from chunk coordinates to a 128 x 128 `Uint8Array` of cell types. A chunk key packs both chunk coordinates into one number, so lookups allocate nothing. Each chunk carries a histogram of its types, a count of blocked cells and a version stamp taken from the grid revision at its last change. The renderer repacks a chunk's canvas only when the stamps differ. A frame spends at most about 4 ms repacking (and always repacks at least one chunk), so after a fill or a color change the whole view settles over a few frames instead of in one long one.

The generated city is the base. Your edits are tracked per chunk: the first edit marks the chunk as edited, and from then on it is kept. Reading a cell is always one array index, with no second lookup for the edits. Erasing restores the generated type of the cell (the base of an edited chunk is computed on the first erase). Generated buildings and water can't be erased, only covered by your walls. In the empty world a chunk with only ground is deleted.

### Lazy generation and eviction

The terrain is a pure function of the seed and the cell position, so a chunk is generated when it is first read and an unedited chunk can be dropped and rebuilt with the same bytes. Generation takes about 1.3 to 1.4 ms per chunk on average (3 runs of 3072 chunks of seed 1 in Bun 1.4.4: median 0.60 to 0.64 ms, p95 5.2 to 5.5 ms). A chunk away from the towns costs 0.53 ms on average (median 0.49, p95 1.13) and one with a town in reach 2.10 ms (median 1.36, p95 5.74, max 16.4), both warm, so the cost is in the tail. It never changes the grid revision and notifies nobody, since the content is the same on every thread.

Cost of each layer alone and of the whole terrain on seed 1, in ms per chunk (12 runs of 256 chunks after a warm-up run, the same chunks for every row):

| Layer | Mean | Median | p95 | Min | Max |
| --- | --- | --- | --- | --- | --- |
| Relief (three lattices and the elevation, shared by the layers below) | 0.130 | 0.126 | 0.180 | 0.086 | 0.724 |
| Biomes (with the relief they prepare) | 0.400 | 0.378 | 0.864 | 0.040 | 2.411 |
| Water (with the relief it prepares) | 0.132 | 0.084 | 0.398 | 0.040 | 0.843 |
| Towns (search and outline noise, shared by the layers below) | 0.045 | 0.003 | 0.133 | 0.001 | 0.790 |
| Fabric | 0.849 | 0.003 | 5.216 | under 0.001 | 10.853 |
| Roads | 0.205 | 0.002 | 0.175 | 0.001 | 32.212 |
| Ribbon houses | 0.200 | 0.002 | 0.127 | 0.001 | 32.305 |
| Whole terrain | 1.376 | 0.643 | 5.201 | 0.059 | 32.768 |

The rows don't add up to the whole: roads and ribbon houses each pay for the road scan of their own instance, which the whole terrain pays once. Linking the towns around a chunk is the 30 ms maximum: the first chunk a fresh terrain generates pays about 23 ms for it (median of 12 terrains), and the chunks next to it about 0.01 ms, up to 10 ms when their scan reaches new regions.

- **Renderer**: it generates the visible chunks that are still missing, within 4 ms per frame (and at least one per frame). A chunk not generated yet shows the ground color until its turn: a first view of 130 chunks fills over about 45 frames.
- **Cache bound**: unedited chunks are capped at 2048 (32 MB of cells). Above that, the oldest ones outside the view are evicted down to 1024, so the scan does not run every frame. Edited chunks are never evicted, so memory grows only with your edits. The path worker also keeps connectivity labels for the chunks it checked, 32 KB per chunk (freed with the chunk), so its bound is about 32 MB of cells plus up to 64 MB of labels.

### Generation layers

Each layer is a pure function of the seed, and a tile of any size and origin gets the same cells as a part of a bigger tile. The relief only feeds the others, the biomes, water, fabric, roads and houses paint over the previous ones.

1. **Relief**: elevation, moisture and temperature, three smooth value-noise fields sampled on coarse lattices and interpolated. The elevation sums four octaves (periods of 6000, 1800, 450 and 110 cells) and has a floor around the origin that falls from just above the marsh band to the sea level over 800 cells, so no cell within 600 cells of the origin is sea. Moisture has periods of 2600 and 700 cells, the base temperature 5200 and 1300, and the temperature drops by 0.6 per unit of elevation above 0.5, so mountains are cold. The levels are quantiles of the elevation far from the origin: sea below 0.35 (14.4% of the cells), beach up to 0.358, marsh band up to 0.40, hills from 0.6 (19.2% of the cells are hills or higher), mountains from 0.65 (10.2%) and snow from 0.71 at a temperature of 0.5 (3.7%, lower where it is colder).
2. **Biomes**: the first rule that matches wins. Sand on the beach and in deserts (warmer than 0.6 and drier than 0.36, with scrub patches of bare ground). Marsh below 0.40 where the moisture is above 0.64, in patches of about 36 cells. On mountains, rock where a noise (periods of 80 and 28 cells) passes a level that falls with the height but never under a floor, which caps the rock at 14% to 23% of the mountain area in the measured windows and keeps the rest connected, then snow, pine or hill. On hills, pine, meadow or hill. In the lowlands, forest where a noise (periods of 320 and 96 cells) passes 0.64, pine below a temperature of 0.42 and broadleaf above it, and farmland where a noise of period 900 passes 0.45. Farmland is cut into parcels of 36 x 24 cells in a brick layout, hedged: 50% fields (6% of them with a 5 x 4 farmstead), 12% meadows, 10% orchards with vineyard rows (where the temperature is above 0.45, else fields) and 28% bare ground. Elsewhere, meadow where a noise (period 220) passes 0.7, else ground.
3. **Water**: the sea is the land under the sea level. Rivers are contour lines of a warped noise, so they never end, and only run below 0.65: they are 4 cells wide at the foot of the mountains and widen to 10 at the coast. Lakes (a noise of period 640 above 0.9) only sit below the hills. Sea and lakes are wide water, which a street or an avenue never crosses, while a river is crossed by bridges. Only a road crosses a strait of up to 36 cells, and the piers of a harbor go out over it.
4. **Towns**: one per 512 x 512 region with probability 0.6, so a cell only needs the towns of the regions around it. A town is a village (55%, radius 48 to 96 cells), a town (30%, 120 to 200) or a city (15%, 220 to 360). Above them, a lattice of 4096 cells puts a metropolis (radius 600 to 950) in 30% of its squares, in the middle half of the square: it replaces the town of its region and no other town has its center within 1.1 radii of it. A center is never on water or above 0.625 (the middle of the hills and the mountains), and 60% of the towns in a desert are dropped (a metropolis is never in one), so the ones that stay are oases. The outline is two octaves of noise (periods of 128 and 48 cells) that give the border lobes and bays. A town gets a base street direction, a hashed angle (a planned town keeps the x axis exactly 35% of the time), and a kind. A harbor is a town with water at 0.6 radii (40 to 400 cells) in 1 to 9 of 12 directions, 75% of the time, and its streets run along the shore. Any other town of a city's size or smaller with a river within 30 or 60 cells is linear 40% of the time, stretched along the river into an ellipse 2.2 to 3 times longer than wide. The others roll by tier: a village is organic (40%), linear (25%) or sprawl (35%), a town planned (30%), organic (30%), radial (15%) or sprawl (25%), a city planned (40%), radial (30%) or organic (30%), a metropolis planned (55%) or radial (45%). A town is walled when it is organic of tier 1 and up, or planned or radial of tier 2 and up at one in two.
5. **Fabric**: the streets and what stands between them, for every cell a town owns (where towns overlap, the one the cell is deepest in).
   - **Districts**: a village is one district, a town of tier 1 and up is cut into Voronoi districts (170, 210 and 260 cells wide for tiers 1, 2 and 3) whose boundaries are avenues. A linear town is one district whatever its tier.
   - **Streets**: each district has its own jittered street grid, with an avenue every 4th line (every 6th in organic towns, 5th in sprawl). A planned district is turned off the axis of the town by up to 25 degrees (30% keep it exactly), with blocks of 18 to 29 cells by 0.6 to 1.6 times that. A street is the set of cells a straight line touches, so a turned street is a 4-connected staircase. In a metropolis, a district whose seed is deep downtown (level above 0.75) has blocks of 28 to 36 cells on both sides. A district of a planned or organic town of tier 1 and up turns into sprawl on the outskirts, 40% of the time for planned and 50% for organic. Organic districts (blocks of 10 to 16 cells) and sprawl districts (blocks of 28 to 40 by 12 to 18 cells) have any axis and bend their lines with smooth noise, 9 cells over a period of 56 for organic and 24 cells over 140 for sprawl, so their streets are curves.
   - **Dropped streets**: outside downtown (a village has no downtown, so it drops everywhere), a share of the street segments between two crossings is left out (12% in planned towns, 18% organic, 28% sprawl, up to 50% more toward the border of the town, none in a linear town), and a sprawl keeps 45% of a dropped segment as a cul-de-sac.
   - **Blocks and lots**: the blocks between the streets are a park or a plaza (parks have 12% trees) or are split into lots with buildings, by zone: downtown (level above 0.55, lots up to 16 cells, built to the street), inner (above 0.3, up to 11, a 1 cell yard), suburbs (up to 9, a 2 cell yard, 15% of the lots empty and more toward the border) and, in the center of a metropolis, big lots of up to 22 cells. A gap of at least 2 cells separates the buildings on a turned grid and 3 on a bent one, so the yards between them stay 4-connected. The town center is a plaza, a disc of 8 cells plus 4 per tier.
   - **Radial**: a radial town (tier 1 and up) is one disc of rings and spokes inside 0.65 radii around its center: rings 26 to 36 cells apart (every 4th and the one that bounds the disc are avenues), 8 spokes that double with the ring index (16 from the 2nd ring, 32 from the 4th, up to 128 from the 16th, so a new spoke starts on a ring and the old ones stay), the 8 main spokes as avenues, a plaza of 0.6 ring spacings at the hub, and lots cut in block coordinates measured at the inner ring, so spokes that spread apart only widen the gaps. Outside the disc the districts are grids whose axis points at the center.
   - **Ring road**: a radial city or metropolis, and every metropolis, has a ring road, a highway 3 streets thick on the circle at 0.72 radii. It is painted over everything the fabric paints (a bridge over a river, a pass over rock, cut at the sea and at lakes), and the streets and the highways that reach it join it. A country road never cuts it.
   - **Linear**: a linear town has one district with a spine, the avenue 3 streets thick along its axis through the center, cross streets 14 to 22 cells apart and long streets 40 to 60 cells apart.
   - **Harbor**: the districts of a harbor are grids within 10 degrees of the shore. The dry cells of the beach (`e < BEACH_TOP`) or of the lake shore that no street holds are a quay, plaza with no lots, and every 40 cells a pier 2 cells wide goes out over the water across the shore (the axis of a harbor runs along it), as bridge cells over shallow water (sea depth under 0.02, lake depth under 0.03), 14 to 30 cells long by a roll per pier. A pier only exists where the walk from it toward the center of the town, inside the town, reaches dry ground, so none is cut off from the land.
   - **Walls**: a walled town has an organic old town inside a rampart at 0.3 radii (at least 40 cells, 0.18 radii for a metropolis) that wanders by 8% with noise. The rampart is a band of blocked cells thick enough that no 4-connected walk crosses it, four gates (6 cells wide) open it on the axis of the town and across it, an avenue runs through each gate from the center to 40 cells past the wall, and a road that reaches the wall cuts it and makes its own gate (a gate on wide water or rock gets no avenue, so a town on a peninsula or in a valley stays open to the roads). The rampart is skipped on water, so a river leaves the wall open only where a bridge crosses it.
6. **Roads**: every town links to the first town within 5 regions east of it and to the first within 5 regions south of it, so the roads are a mesh of the region grid (a metropolis keeps about 2 regions around it empty, which is why a link reaches that far). A link between two towns of tier 1 and up is a highway 3 cells wide (a motorway 4 wide when a metropolis is an end), any other is a country road 2 cells wide, and 10% of the country roads are left out. A road is a curve of straight legs of 64 cells: a quadratic bent sideways by a hashed share of the distance, up to 12%. When it would run on water for more than 36 cells or over more than 96 cells of mountain, it tries detours of 10, 20 and 30% of the distance to either side (the middle moves at most 300 cells). The first one that keeps both limits wins, else the one with the least mountain, which is a pass: the road paints over the rock. When every detour keeps more than 36 cells of water, the pair has no road, so a lake or a strait wider than that is not bridged, and an island more than about 36 cells off the coast has no road to the mainland. A road over a river or a short stretch of water is a bridge, a highway wins at a crossing with a country road, and a road cuts a rampart where it meets one. The largest connected component holds 94.5% to 97.6% of the road cells (3 seeds over 8192 x 8192 cells), and 239 of the 243 town centers are in it.
7. **Ribbon houses**: houses along the country roads near the towns they link, one plot of 8 road cells at a time with up to one house on each side, thinning out within 0.6 radii past the border of the town. A house covers ground, field, forest, meadow, hill, pine, orchard and sand, never marsh, rock, snow, water or a road.

### Window and budget

The path search runs on a window made of the visible area grown by 16 cells on every side, extended to contain the player and the target. When one of them is off screen (the player after a zoom in, for example), the window also reaches half their Manhattan distance around both, so the search isn't squeezed into a thin strip that a river or a row of buildings cuts. A window side is capped at 4096 cells and its area at 2^23 cells (above that the room around the endpoints halves first, then the longer side shrinks to fit). A player and a target too far apart to share a window have no path. The cells of the window are copied once into a flat buffer, so the search loop never touches the chunk map.

The search has no node budget on the full window, so it always gives the exact answer, and it runs off the main thread:

- **Small attempt on the main thread**: a target near the player is answered on the spot by a search on a small window (32 cells around the two points) that stops after 4096 expanded nodes. Its path is kept only when no path leaving that small window can cost less, using the cheapest cost in the full window. Otherwise the target goes to the worker, which is also where it goes in the city when the small window would make the main thread generate more than 16 chunks. In the city, roads make the cheapest cost 1, so fewer targets are answered here and more go to the worker.
- **Path worker**: it searches the whole window on its own copy of the edits. It never receives generated cells: the main thread sends the world (kind and seed) once per world change, and the worker generates its own chunks from the seed. Only your edits are sent, in order. Before a search it evicts unedited chunks outside the window beyond the cache bound, then generates the missing chunks of the window in slices of 8 ms, so a newer request is seen between slices. Generating the largest window (8.4M cells, 512 chunks) takes about 0.7 s (median of 13 seeds, p90 0.84 s, from 0.43 to 0.93 s: a window of open country is quick and one full of towns is not). A slice ends after the chunk that passes its 8 ms, and the longest stretch without a check measured on that window is 14 to 35 ms, median 25 ms, which is the first slice: it holds the first chunk of a fresh terrain, with the road links (about 23 ms). Only the newest request is kept: an older one that has not started is dropped, and one that has started is abandoned at its next slice. A search runs in slices of 50,000 expanded nodes (50,000 scanned cells for JPS4). When the main thread answers a request itself, it tells the worker to drop the running search. The player keeps walking its old path until the result arrives, then joins the new one. Walls drawn or generated meanwhile cut the old path right before the first blocked cell ahead, so the player stops there instead of walking through it, and a result that was computed before an edit is cut the same way. The cut reads the chunks along the path and generates the missing ones, so buildings and water that Clear brings back across the path stop the player too.

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

**Weighted search**: A* over a bucket queue (Dial) on the integer costs. The heuristic is the cheapest cost of the window times the Manhattan distance, which is consistent, so the queue needs only a ring of 32 buckets and an entry costs 8 bytes: an entry is pushed at most `MAX_COST` plus the heuristic scale past the bucket being drained, which is 12 + 12 = 24 at most, under 32. Equal-cost entries come out last in, first out, so a run is deterministic. Its result matches a reference Dijkstra on random mixed grids, in cost and in reachability.

Far searches in large mixed-cost city windows are the slow case, because ground costs 4 times the cheapest road (and marsh 12 times) while the heuristic only knows the cheapest cost. Seed 1, windows centered on three metropolises (Bun 1.4.4, a pass is 12 searches 200 or more cells apart, 2 warm-up passes then 12 timed ones, the unit search is the one the chooser picks on the same blocked cells, JPS4 in all six), time of a pass in ms:

| Window and center | Unit median | Weighted median | Weighted p90 | Weighted min to max | Ratio of medians |
| --- | --- | --- | --- | --- | --- |
| 2272 x 1297 at 14779, 2491 (planned, radius 613) | 73.8 | 1055.5 | 1147.1 | 1027.3 to 1172.6 | 14.3 |
| 2048 x 2048 at 14779, 2491 | 162.1 | 730.4 | 781.9 | 704.6 to 795.4 | 4.5 |
| 2272 x 1297 at 2806, 7135 (harbor, radius 914, the biggest of the seed) | 212.1 | 604.2 | 628.1 | 565.7 to 672.5 | 2.9 |
| 2048 x 2048 at 2806, 7135 | 153.2 | 588.2 | 597.8 | 567.3 to 606.5 | 3.8 |
| 2272 x 1297 at 26234, 6063 (planned and walled, radius 904) | 154.0 | 458.8 | 465.6 | 440.2 to 465.6 | 3.0 |
| 2048 x 2048 at 26234, 6063 | 143.5 | 608.4 | 629.2 | 601.2 to 748.6 | 4.2 |

So a weighted search takes 38 to 88 ms on average in these windows (a pass divided by 12), and on every pair it returns a path at most as costly as the unit one (cheaper on all 12 pairs of each window). A slice of 50,000 expansions takes about 5 ms (median, 4.7 to 5.0), and the first slice of a query 10 to 14 ms (median, 2272 x 1297 and 2048 x 2048 at 14779, 2491). Unit-cost searches run at the timings given above. The slices keep the page responsive meanwhile, and a newer request abandons the running search at its next slice.

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

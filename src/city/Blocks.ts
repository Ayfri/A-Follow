import { CellType } from '../core/CellType';
import { hash, Salt, unit } from './hash';
import type { Streets } from './Streets';
import { DOWNTOWN_LEVEL, INNER_LEVEL, type Town, Towns } from './Towns';

/** How a block is built: the biggest lot side before it is split, the yard around a building, and the share of lots left as empty yards. */
interface Zone {
	lotMax: number;
	/** Cells between the lot border and the building, and the least the yard shrinks to on a lot too small for it. */
	setback: number;
	tightest: number;
	empty: number;
}

/**
 * Downtown lots are big and built to the street, with a 1 cell alley on their high sides (right, bottom) so the buildings stay separate;
 * the inner ring has a 1 cell yard all around; suburbs have small lots, a 2 cell yard and a good share of empty plots. A lot split into a
 * 4 to 7 cell side keeps a smaller yard instead of staying empty: the lots are uneven, and most of the small ones would not fit a building.
 */
const DOWNTOWN: Zone = { lotMax: 16, setback: 0, tightest: 0, empty: 0.03 };
const INNER: Zone = { lotMax: 11, setback: 1, tightest: 1, empty: 0.05 };
const SUBURB: Zone = { lotMax: 9, setback: 2, tightest: 1, empty: 0.15 };

/** Share of the blocks that are a park or a plaza, per zone. A downtown block is a park below `PARK` and a plaza below `PARK + PLAZA`. */
const DOWNTOWN_PARK = 0.05;
const DOWNTOWN_PLAZA = 0.04;
const INNER_PARK = 0.1;
const SUBURB_PARK = 0.06;
const TREE_SHARE = 0.12;

/** The split ratio of a lot is `SPLIT_MIN` plus up to `SPLIT_SPREAD`: lots differ in size, none is a sliver. */
const SPLIT_MIN = 0.35;
const SPLIT_SPREAD = 0.3;
const MIN_SIDE = 4;
/** A building smaller than this on a side is not built: the lot stays a yard. */
const MIN_BUILDING = 3;

/**
 * Towards the border of a town (below `INNER_LEVEL`) the share of empty lots grows by up to this much, and below `FRINGE_LEVEL` the yard of
 * a suburban building is one cell deeper: a town dissolves into the countryside instead of stopping at a line.
 */
const EDGE_EMPTY = 0.5;
const FRINGE_LEVEL = 0.12;
/** A block whose center is this far outside the town has no lot with a cell inside it: the slope of the level is under 0.04 per cell. */
const BLOCK_SKIP_LEVEL = -0.4;
/**
 * Lots whose center is below this level check each cell against the border of the town, since the border can cross them: it moves by under
 * 0.04 of level per cell, and a lot is at most 16 cells across (11.3 from its center to a corner, 0.45 of level). The bound doesn't hold for
 * a park or a plaza, which takes a whole block of up to ~35 cells, so those always check every cell.
 */
const CHECK_LEVEL = 0.6;

/**
 * The blocks of the street grids: the space between two streets and two cross streets. A block is a park, a plaza or cut into lots, each
 * with a building set back from the street. Only the cells that are still ground are painted, so water, fields and forest stay as they are,
 * and a lot is a pure function of its block: a tile recomputes the whole split tree of every block it overlaps.
 */
export class Blocks {
	private readonly towns: Towns;
	private readonly streets: Streets;
	private shapes: Float64Array = new Float64Array(0);
	private out: Uint8Array = new Uint8Array(0);
	private tileX = 0;
	private tileY = 0;
	private tileSize = 0;
	private town: Town | null = null;
	private zone: Zone = SUBURB;
	private blockId = 0;
	/**
	 * Whether several towns are near the tile, so every cell has to be checked for its owner. A lone town owns all its cells, so this only
	 * skips an `owns` loop that would say yes: a cell's result is the same whatever other towns the tile sees.
	 */
	private shared = false;

	constructor(towns: Towns, streets: Streets) {
		this.towns = towns;
		this.streets = streets;
	}

	/** Paints the blocks of every town near the `size` x `size` tile at (x0, y0) over its ground. Run it before the streets. */
	paint(x0: number, y0: number, size: number, out: Uint8Array): void {
		const { towns } = this;
		towns.prepare(x0, y0, size);
		const { present } = towns;
		if (present.length === 0) return;
		this.shapes = towns.shapes;
		this.out = out;
		this.tileX = x0;
		this.tileY = y0;
		this.tileSize = size;
		this.shared = present.length > 1;
		for (let t = 0; t < present.length; t++) this.paintTown(present[t]);
	}

	private paintTown(town: Town): void {
		const { streets, tileX, tileY, tileSize } = this;
		this.town = town;
		const centerK = streets.indexBelow(town, 0, town.x);
		const centerJ = streets.indexBelow(town, 1, town.y);
		const reach = Towns.reach(town);
		const lastJ = streets.indexBelow(town, 1, tileY + tileSize - 1);
		const lastK = streets.indexBelow(town, 0, tileX + tileSize - 1);
		for (let j = streets.indexBelow(town, 1, tileY); j <= lastJ; j++) {
			const top = streets.line(town, 1, j) + streets.width(j);
			const bottom = streets.line(town, 1, j + 1);
			for (let k = streets.indexBelow(town, 0, tileX); k <= lastK; k++) {
				const left = streets.line(town, 0, k) + streets.width(k);
				const right = streets.line(town, 0, k + 1);
				const dx = Math.max(left - town.x, 0, town.x - right + 1);
				const dy = Math.max(top - town.y, 0, town.y - bottom + 1);
				if (dx * dx + dy * dy > reach * reach) continue;
				this.block(town, k, j, left, top, right - left, bottom - top, k === centerK && j === centerJ);
			}
		}
	}

	private block(town: Town, k: number, j: number, x: number, y: number, w: number, h: number, center: boolean): void {
		const level = this.towns.urban(town, x + (w >> 1), y + (h >> 1));
		if (level < BLOCK_SKIP_LEVEL) return;
		const downtown = town.tier > 0 && level > DOWNTOWN_LEVEL;
		const zone = downtown ? DOWNTOWN : town.tier > 0 && level > INNER_LEVEL ? INNER : SUBURB;
		const id = hash(town.id, k, j, Salt.BLOCK);
		const roll = unit(id);
		const parkShare = downtown ? DOWNTOWN_PARK : zone === INNER ? INNER_PARK : SUBURB_PARK;
		const plazaShare = downtown ? DOWNTOWN_PLAZA : 0;
		if (center) this.fill(x, y, w, h, CellType.PLAZA, true, id);
		else if (roll < parkShare) this.fill(x, y, w, h, CellType.PARK, true, id);
		else if (roll < parkShare + plazaShare) this.fill(x, y, w, h, CellType.PLAZA, true, id);
		else {
			this.zone = zone;
			this.blockId = id;
			this.split(x, y, w, h);
		}
	}

	/** Whether the cell belongs to the current town: urban for it, and not deeper in another town. */
	private claims(x: number, y: number, i: number): boolean {
		const { town, shapes } = this;
		if (town === null) return false;
		const level = Towns.level(town, x, y, shapes[i]);
		return level > 0 && this.towns.owns(town, x, y, level, shapes[i]);
	}

	/** Paints the `w` x `h` rectangle at (x, y) clipped to the tile: `type` over ground cells, with trees in a park, checking owners when `check`. */
	private fill(x: number, y: number, w: number, h: number, type: number, check: boolean, id: number): void {
		const { out, tileX, tileY, tileSize, town } = this;
		if (town === null) return;
		const checked = check || this.shared;
		for (let cy = Math.max(y, tileY); cy < Math.min(y + h, tileY + tileSize); cy++) {
			for (let cx = Math.max(x, tileX); cx < Math.min(x + w, tileX + tileSize); cx++) {
				const i = (cy - tileY) * tileSize + cx - tileX;
				if (out[i] !== CellType.GROUND || (checked && !this.claims(cx, cy, i))) continue;
				out[i] = type === CellType.PARK && unit(hash(id, cx, cy, Salt.TREE)) < TREE_SHARE ? CellType.FOREST : type;
			}
		}
	}

	/** Splits the rectangle along its longer side until both sides fit the lots of the zone, and builds every lot that reaches the tile. */
	private split(x: number, y: number, w: number, h: number): void {
		const { tileX, tileY, tileSize } = this;
		if (x >= tileX + tileSize || x + w <= tileX || y >= tileY + tileSize || y + h <= tileY) return;
		const { lotMax } = this.zone;
		if (w <= lotMax && h <= lotMax) {
			this.lot(x, y, w, h);
			return;
		}
		/** The size is part of the hash: the first half of a split has the origin of its parent, and the two must not cut at the same ratio. */
		const ratio = SPLIT_MIN + SPLIT_SPREAD * unit(hash(this.blockId ^ ((w << 8) | h), x, y, Salt.SPLIT));
		if (w >= h) {
			const cut = Math.max(MIN_SIDE, Math.min(w - MIN_SIDE, Math.floor(w * ratio)));
			this.split(x, y, cut, h);
			this.split(x + cut, y, w - cut, h);
		} else {
			const cut = Math.max(MIN_SIDE, Math.min(h - MIN_SIDE, Math.floor(h * ratio)));
			this.split(x, y, w, cut);
			this.split(x, y + cut, w, h - cut);
		}
	}

	private lot(x: number, y: number, w: number, h: number): void {
		const { towns, town, zone } = this;
		if (town === null) return;
		const level = towns.urban(town, x + (w >> 1), y + (h >> 1));
		if (level <= 0) return;
		const roll = hash(this.blockId, x, y, Salt.LOT);
		const suburb = zone === SUBURB;
		const fade = level < INNER_LEVEL ? 1 - level / INNER_LEVEL : 0;
		if (unit(roll) < zone.empty + (suburb ? EDGE_EMPTY * fade : 0)) return;

		const extra = suburb ? ((roll >>> 8) & 1) + (level < FRINGE_LEVEL ? 1 : 0) : 0;
		let low = zone.setback + extra;
		let high = Math.max(low, 1);
		while (low > zone.tightest && Math.min(w, h) - low - high < MIN_BUILDING) {
			low--;
			high = Math.max(low, 1);
		}
		if (Math.min(w, h) - low - high < MIN_BUILDING) return;
		this.fill(x + low, y + low, w - low - high, h - low - high, CellType.BUILDING, level < CHECK_LEVEL, roll);
	}
}

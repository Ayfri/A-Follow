import { CellType } from '../core/CellType';
import { CBD_LEVEL, type District, Districts } from './Districts';
import { frameX, frameY, type FrameView, Line } from './Frame';
import { hash, Salt, unit } from './hash';
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
 * The center of a metropolis has bigger lots still.
 */
const DOWNTOWN: Zone = { lotMax: 16, setback: 0, tightest: 0, empty: 0.03 };
const INNER: Zone = { lotMax: 11, setback: 1, tightest: 1, empty: 0.05 };
const SUBURB: Zone = { lotMax: 9, setback: 2, tightest: 1, empty: 0.15 };
const CBD: Zone = { lotMax: 22, setback: 0, tightest: 0, empty: 0.01 };

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
/** The plaza at the center of a town is a disc of this radius plus `PLAZA_PER_TIER` for every tier. */
const PLAZA_RADIUS = 8;
const PLAZA_PER_TIER = 4;
/** Room for the block numbers of one district in a block key: a block number is within +-2048 of the seed of its district. */
const KEY_RANGE = 4096;

/** A park, a plaza, or a block cut into lots (`CellType.BUILDING`); `count` rectangles from the index `start` in `rects` are the buildings. */
interface Block {
	type: number;
	id: number;
	start: number;
	count: number;
	/** Index in `rects` of the rectangle that held the last building cell of the block, `start` before any. */
	hit: number;
}

/**
 * The urban fabric of every town: the district boundaries and the street grids of the districts, and what stands between the streets.
 * It paints every cell a town owns, in this order, the first match winning: the avenue on a district boundary, a street or an avenue of the
 * frame of the district, water (left alone), the plaza at the center of the town, then the block of the cell, as a park, a plaza or the
 * lots of the block with their buildings. Rock (mask code 3) is left alone. Streets stop at the water; avenues bridge a river and stop at
 * the sea and at a lake, where a bridge would be hundreds of cells long.
 *
 * A cell only reads its owner, the nine seeds around it and the lines of its frame, and a block is a pure function of its frame key and
 * its numbers, so a tile of any size and origin gives the same cells as a part of a bigger tile.
 */
export class Fabric {
	private readonly towns: Towns;
	private readonly districts: Districts;
	/** Blocks of the town being painted, by block key, and the rectangles of their buildings (4 numbers each). Cleared for every town of every tile. */
	private readonly blocks = new Map<number, Block>();
	private rects = new Int32Array(1024);
	private rectCount = 0;
	private lastKey = -1;
	private last: Block = { type: CellType.GROUND, id: 0, start: 0, count: 0, hit: 0 };

	/** The block being built. */
	private town: Town | null = null;
	private view: FrameView | null = null;
	private zone: Zone = SUBURB;
	private blockId = 0;
	private aligned = false;

	constructor(towns: Towns) {
		this.towns = towns;
		this.districts = new Districts(towns);
	}

	/** Paints the towns near the `size` x `size` tile at (x0, y0); `mask` is the water mask of `Water.fill` with 3 on rock. */
	paint(x0: number, y0: number, size: number, out: Uint8Array, mask: Uint8Array): void {
		const { towns } = this;
		towns.prepare(x0, y0, size);
		const { present } = towns;
		for (let t = 0; t < present.length; t++) this.paintTown(present[t], x0, y0, size, out, mask);
	}

	private paintTown(town: Town, x0: number, y0: number, size: number, out: Uint8Array, mask: Uint8Array): void {
		const { towns, districts, blocks } = this;
		const { shapes } = towns;
		const shared = towns.present.length > 1;
		const reach = Towns.reach(town);
		const plaza = PLAZA_RADIUS + PLAZA_PER_TIER * town.tier;
		districts.prepare(town, x0, y0, size);
		blocks.clear();
		this.rectCount = 0;
		this.lastKey = -1;

		for (let row = Math.max(0, Math.ceil(town.y - reach) - y0); row < Math.min(size, Math.floor(town.y + reach) - y0 + 1); row++) {
			const y = y0 + row;
			const half = Math.floor(Math.sqrt(reach * reach - (y - town.y) * (y - town.y)));
			for (let col = Math.max(0, town.x - half - x0); col < Math.min(size, town.x + half - x0 + 1); col++) {
				const i = row * size + col;
				const wet = mask[i];
				if (wet === 3) continue;
				const x = x0 + col;
				const level = Towns.level(town, x, y, shapes[i]);
				if (level <= 0 || (shared && !towns.owns(town, x, y, level, shapes[i]))) continue;

				const district = districts.locate(x, y);
				const { view } = district;
				let line: number = Line.AVENUE;
				if (!districts.boundary) {
					view.locate(x, y);
					line = view.line;
				}
				if (line === Line.AVENUE) {
					if (wet === 0) out[i] = CellType.AVENUE;
					else if (wet === 1) out[i] = CellType.BRIDGE;
				} else if (wet !== 0) {
					continue;
				} else if (line === Line.STREET) {
					out[i] = CellType.STREET;
				} else if ((x - town.x) * (x - town.x) + (y - town.y) * (y - town.y) < plaza * plaza) {
					out[i] = CellType.PLAZA;
				} else {
					out[i] = this.content(town, district, x, y);
				}
			}
		}
	}

	/** What stands on the ground cell (x, y) of a block: a park (with trees), a plaza, a building or nothing. */
	private content(town: Town, district: District, x: number, y: number): number {
		const { view } = district;
		const key = ((district.slot * KEY_RANGE + view.ka + KEY_RANGE / 2) * KEY_RANGE) + view.kb + KEY_RANGE / 2;
		let block = this.last;
		if (key !== this.lastKey) {
			let known = this.blocks.get(key);
			if (known === undefined) {
				known = this.build(town, view);
				this.blocks.set(key, known);
			}
			block = known;
			this.last = known;
			this.lastKey = key;
		}
		if (block.type === CellType.PARK) return unit(hash(block.id, x, y, Salt.TREE)) < TREE_SHARE ? CellType.FOREST : CellType.PARK;
		if (block.type === CellType.PLAZA) return CellType.PLAZA;
		if (block.count === 0) return CellType.GROUND;
		const { rects } = this;
		const { u, v } = view;
		/** The rectangle of the last building cell goes first: the cells of a row mostly stay in one building. */
		let r = block.hit;
		if (u >= rects[r] && u < rects[r + 2] && v >= rects[r + 1] && v < rects[r + 3]) return CellType.BUILDING;
		for (r = block.start; r < block.start + 4 * block.count; r += 4) {
			if (u >= rects[r] && u < rects[r + 2] && v >= rects[r + 1] && v < rects[r + 3]) {
				block.hit = r;
				return CellType.BUILDING;
			}
		}
		return CellType.GROUND;
	}

	/** Decides the block of the frame of `view` that holds its current cell: the zone comes from the level at the center of the block. */
	private build(town: Town, view: FrameView): Block {
		const { frame } = view;
		const centerA = view.originA + view.width / 2;
		const centerB = view.originB + view.height / 2;
		const level = this.towns.urban(town, Math.round(frameX(frame, centerA, centerB)), Math.round(frameY(frame, centerA, centerB)));
		const downtown = town.tier > 0 && level > DOWNTOWN_LEVEL;
		const zone = town.tier === 3 && level > CBD_LEVEL ? CBD : downtown ? DOWNTOWN : town.tier > 0 && level > INNER_LEVEL ? INNER : SUBURB;
		const id = hash(frame.key, view.ka, view.kb, Salt.BLOCK);
		const roll = unit(id);
		const parkShare = downtown ? DOWNTOWN_PARK : zone === INNER ? INNER_PARK : SUBURB_PARK;
		const plazaShare = downtown ? DOWNTOWN_PLAZA : 0;
		const block: Block = { type: CellType.BUILDING, id, start: this.rectCount * 4, count: 0, hit: this.rectCount * 4 };
		if (roll < parkShare) {
			block.type = CellType.PARK;
		} else if (roll < parkShare + plazaShare) {
			block.type = CellType.PLAZA;
		} else {
			this.town = town;
			this.view = view;
			this.zone = zone;
			this.blockId = id;
			this.aligned = frame.aligned;
			this.split(0, 0, Math.floor(view.width), Math.floor(view.height));
			block.count = this.rectCount - block.start / 4;
		}
		return block;
	}

	/** Splits the rectangle along its longer side until both sides fit the lots of the zone, in block-local cells. */
	private split(x: number, y: number, w: number, h: number): void {
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

	/**
	 * Adds the building of the lot at (x, y) of the block, if any. On a rotated frame every building keeps a yard of at least 1 on each
	 * side, so two buildings are 2 units apart: a gap of 2 units is at least `sqrt(2)` cells across at any angle, which keeps the yards
	 * between the buildings 4-connected. On an axis-aligned frame a downtown building can touch its street.
	 */
	private lot(x: number, y: number, w: number, h: number): void {
		const { town, view, zone } = this;
		if (town === null || view === null) return;
		const { frame } = view;
		const a = view.originA + x + w / 2;
		const b = view.originB + y + h / 2;
		const level = this.towns.urban(town, Math.round(frameX(frame, a, b)), Math.round(frameY(frame, a, b)));
		if (level <= 0) return;
		const roll = hash(this.blockId, x, y, Salt.LOT);
		const suburb = zone === SUBURB;
		const fade = level < INNER_LEVEL ? 1 - level / INNER_LEVEL : 0;
		if (unit(roll) < zone.empty + (suburb ? EDGE_EMPTY * fade : 0)) return;

		const floor = this.aligned ? 0 : 1;
		const extra = suburb ? ((roll >>> 8) & 1) + (level < FRINGE_LEVEL ? 1 : 0) : 0;
		const tightest = Math.max(zone.tightest, floor);
		let low = Math.max(zone.setback + extra, floor);
		let high = Math.max(low, 1);
		while (low > tightest && Math.min(w, h) - low - high < MIN_BUILDING) {
			low--;
			high = Math.max(low, 1);
		}
		if (Math.min(w, h) - low - high < MIN_BUILDING) return;

		if ((this.rectCount + 1) * 4 > this.rects.length) {
			const grown = new Int32Array(this.rects.length * 2);
			grown.set(this.rects);
			this.rects = grown;
		}
		const at = this.rectCount++ * 4;
		this.rects[at] = x + low;
		this.rects[at + 1] = y + low;
		this.rects[at + 2] = x + w - high;
		this.rects[at + 3] = y + h - high;
	}
}

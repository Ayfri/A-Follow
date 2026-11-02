import { CellType } from '../core/CellType';
import { hash, Salt, unit } from './hash';
import { rasterize } from './raster';
import { MOUNTAIN_LEVEL, type Relief } from './Relief';
import { type Town, Towns } from './Towns';
import type { Water } from './Water';

export interface Edge {
	a: Town;
	b: Town;
	/** HIGHWAY between two towns of tier 1 and up, AVENUE (a country road) otherwise. */
	type: typeof CellType.HIGHWAY | typeof CellType.AVENUE;
	width: number;
	/** Corner cells of the road from `a` to `b`, x and y interleaved: a curve cut into straight legs. */
	points: Int32Array;
	/** Cells the road can touch. */
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

const HIGHWAY_WIDTH = 3;
const COUNTRY_WIDTH = 2;
/** A highway with a metropolis at one end is a motorway. */
const MOTORWAY_WIDTH = 4;
/**
 * Highways are always kept and country roads mostly: with links dropped at random, up to one town in ten ended up cut off from the network
 * (measured on 3 seeds over 8192 x 8192 cells).
 */
const HIGHWAY_KEEP = 1;
const COUNTRY_KEEP = 0.9;
/** The middle of the road is pushed sideways by up to half this share of the distance between the towns: roads wander instead of being ruled. */
const BEND = 0.24;
/** Detours tried, as a share of the distance, when the first curve puts the road on water or across the mountains for too long. */
const DETOURS: readonly number[] = [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3];
/** The middle of the road never moves farther than this from the line between the towns, which bounds how far a road leaves its regions. */
const MAX_BEND = 300;
/** Length of a straight leg of the curve: short enough that two legs turn by a few degrees, which no longer shows as a kink. */
const LEG = 64;
/**
 * A town links to the first town found within this many regions east of it, and the same to the south. A metropolis keeps the regions
 * around it empty (`METRO_CLEAR`, about 2 regions), so a link from or to one needs more than 3 regions, which left metropolises unlinked eastward.
 */
const LINK_REGIONS = 5;
const MAX_MEMO = 4096;
/** A road that runs over more than this many cells of mountain (`MOUNTAIN_LEVEL` and up) looks for a detour; when none is better it keeps the pass with the least. */
const MAX_MOUNTAIN = 96;
/**
 * A road that runs on water for more than this many cells would be a causeway over a lake, so it tries a detour and is dropped when none
 * helps. A river crossed at 80 degrees off the perpendicular is 5.8 times its width: 23 cells for the narrowest river (4 wide) and 58 for
 * the widest (10 wide, at the coast), which only a straighter crossing bridges.
 */
const MAX_SPAN = 36;
/**
 * Water is looked up along the road every this many cells. A lake or a river that runs along the road spans several samples; a short
 * crossing can slip between two, which is harmless since it only needs a bridge. A step of 4 doubled the road generation time for nearly
 * the same roads (measured on seed 1).
 */
const WATER_SAMPLE = 8;
/** The curve and the width widen the bounding box of an edge past the line between its two towns; the road can leave this much. */
const SCAN_MARGIN = MAX_BEND + 20;

/**
 * The roads between towns. Every town links to the next town to its east and to its south, so the network is a mesh of the region grid.
 * An edge only depends on the towns of the regions it crosses, so a tile finds the roads that touch it without any global state.
 */
export class Roads {
	/** How far past a road `near` still reports it: the farthest a house of the ribbon along a country road stands from it. */
	static readonly NEAR = 12;

	private readonly towns: Towns;
	private readonly water: Water;
	private readonly relief: Relief;
	/** Water run and mountain length of the curve last passed to `survey`, in cells. */
	private longestWater = 0;
	private mountainCells = 0;
	private readonly regions = new Map<number, readonly Edge[]>();
	private readonly touching: Edge[] = [];
	private scannedX = Number.NaN;
	private scannedY = Number.NaN;
	private scannedSize = Number.NaN;
	private readonly fromRegion: Edge[] = [];
	private target: Uint8Array = new Uint8Array(0);
	/** Mask of the tile being painted: 0 dry, 1 river, 2 sea or lake, 3 rock. */
	private mask: Uint8Array = new Uint8Array(0);
	private tileX = 0;
	private tileY = 0;
	private tileSize = 0;
	private roadType: number = CellType.AVENUE;
	/**
	 * Bound once: the rasterizer calls it for every cell, with no allocation per call. A road bridges water and cuts through rock (a mountain
	 * pass). A country road leaves the highway under it alone: it would cut the ring road of a town, which the fabric painted before the roads.
	 * No road cuts a rampart: the gates are the only way through the wall of a town, so a road that reaches it stops there.
	 */
	private readonly stamp = (i: number): void => {
		const wet = this.mask[i];
		if (wet === 1 || wet === 2) this.target[i] = CellType.BRIDGE;
		else if (this.target[i] === CellType.RAMPART) return;
		else if (this.roadType !== CellType.AVENUE || this.target[i] !== CellType.HIGHWAY) this.target[i] = this.roadType;
	};

	constructor(towns: Towns, water: Water, relief: Relief) {
		this.towns = towns;
		this.water = water;
		this.relief = relief;
	}

	/** Replaces the content of `out` with the edges that start at the town of region (rx, ry): none without a town, up to two with one. */
	edgesFrom(rx: number, ry: number, out: Edge[]): void {
		out.length = 0;
		const key = Towns.regionKey(rx, ry);
		let edges = this.regions.get(key);
		if (edges === undefined) {
			edges = this.link(rx, ry);
			if (this.regions.size >= MAX_MEMO) this.regions.clear();
			this.regions.set(key, edges);
		}
		for (let i = 0; i < edges.length; i++) out.push(edges[i]);
	}

	/**
	 * The roads that come within `Roads.NEAR` cells of the `size` x `size` tile at (x0, y0). The roads and the ribbon houses of one tile share
	 * the scan: asking again for the same tile costs nothing.
	 */
	near(x0: number, y0: number, size: number): readonly Edge[] {
		const { touching } = this;
		if (x0 === this.scannedX && y0 === this.scannedY && size === this.scannedSize) return touching;
		this.scannedX = x0;
		this.scannedY = y0;
		this.scannedSize = size;
		const bits = Towns.REGION_BITS;
		touching.length = 0;
		const edges = this.fromRegion;
		/**
		 * The longest link joins towns `LINK_REGIONS` regions apart: at most `(LINK_REGIONS + 1)` regions minus one cell along the link (3071
		 * cells for 5) and under one region across (511). The road leaves its chord by at most `MAX_BEND`. The town that owns a link is always
		 * west or north of the other, so a link that reaches the tile starts at most `LINK_REGIONS` regions before the margin of the tile, and
		 * a link starting after the tile's far margin cannot reach it: the loop bounds below are exact for the longest link.
		 */
		for (let ry = ((y0 - SCAN_MARGIN) >> bits) - LINK_REGIONS; ry <= (y0 + size + SCAN_MARGIN) >> bits; ry++) {
			for (let rx = ((x0 - SCAN_MARGIN) >> bits) - LINK_REGIONS; rx <= (x0 + size + SCAN_MARGIN) >> bits; rx++) {
				this.edgesFrom(rx, ry, edges);
				for (let e = 0; e < edges.length; e++) {
					const edge = edges[e];
					if (edge.maxX + Roads.NEAR >= x0 && edge.minX - Roads.NEAR < x0 + size && edge.maxY + Roads.NEAR >= y0 && edge.minY - Roads.NEAR < y0 + size) touching.push(edge);
				}
			}
		}
		return touching;
	}

	/** Paints the roads that touch the `size` x `size` tile at (x0, y0): country roads first, then highways, so a highway wins at a crossing. */
	paint(x0: number, y0: number, size: number, out: Uint8Array, mask: Uint8Array): void {
		const touching = this.near(x0, y0, size);
		if (touching.length === 0) return;

		this.target = out;
		this.mask = mask;
		this.tileX = x0;
		this.tileY = y0;
		this.tileSize = size;
		this.roadType = CellType.AVENUE;
		this.paintAll(false);
		this.roadType = CellType.HIGHWAY;
		this.paintAll(true);
	}

	private paintAll(highways: boolean): void {
		const { touching, tileX, tileY, tileSize } = this;
		for (let e = 0; e < touching.length; e++) {
			const { points, width } = touching[e];
			if ((touching[e].type === CellType.HIGHWAY) !== highways) continue;
			for (let p = 0; p + 3 < points.length; p += 2) {
				const x0 = points[p];
				const y0 = points[p + 1];
				const x1 = points[p + 2];
				const y1 = points[p + 3];
				if (Math.max(x0, x1) + width < tileX || Math.min(x0, x1) - width >= tileX + tileSize) continue;
				if (Math.max(y0, y1) + width < tileY || Math.min(y0, y1) - width >= tileY + tileSize) continue;
				rasterize(x0, y0, x1, y1, width, tileX, tileY, tileSize, this.stamp);
			}
		}
	}

	private link(rx: number, ry: number): Edge[] {
		const a = this.towns.at(rx, ry);
		const edges: Edge[] = [];
		if (a === null) return edges;
		for (let axis = 0; axis < 2; axis++) {
			for (let step = 1; step <= LINK_REGIONS; step++) {
				const b = this.towns.at(rx + (axis === 0 ? step : 0), ry + (axis === 0 ? 0 : step));
				if (b === null) continue;
				const edge = this.edge(a, b);
				if (edge !== null) edges.push(edge);
				break;
			}
		}
		return edges;
	}

	/**
	 * The road between two towns, or null when this pair has none. The decision depends on the pair only, not on which town asks.
	 * The road is a quadratic curve bent by a hashed amount, or by the first detour that keeps it off water for `MAX_SPAN` cells and over
	 * the mountains for `MAX_MOUNTAIN`. When no detour keeps it off the mountains, it takes the one with the least mountain (a pass over
	 * the rock); when none keeps it off the water, the pair has no road: the lake or the sea is in the way.
	 */
	private edge(a: Town, b: Town): Edge | null {
		const highway = a.tier > 0 && b.tier > 0;
		const low = Math.min(a.id, b.id);
		const high = Math.max(a.id, b.id);
		if (unit(hash(low, high, 0, Salt.ROAD_KEEP)) >= (highway ? HIGHWAY_KEEP : COUNTRY_KEEP)) return null;

		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const length = Math.sqrt(dx * dx + dy * dy);
		const base = (unit(hash(low, high, 0, Salt.ROAD_BEND)) - 0.5) * BEND;
		const legs = Math.max(2, Math.ceil(length / LEG));
		const candidate = new Int32Array(2 * (legs + 1));
		let points: Int32Array | null = null;
		let fewest = Infinity;
		for (let d = 0; d < DETOURS.length && fewest > MAX_MOUNTAIN; d++) {
			const push = Math.max(-MAX_BEND, Math.min(MAX_BEND, (base + DETOURS[d]) * length));
			/** The control point is twice as far as the middle of the curve, which lands halfway between it and the chord. */
			const controlX = (a.x + b.x) / 2 - (dy / length) * 2 * push;
			const controlY = (a.y + b.y) / 2 + (dx / length) * 2 * push;
			for (let j = 0; j <= legs; j++) {
				const t = j / legs;
				const u = 1 - t;
				candidate[2 * j] = Math.floor(u * u * a.x + 2 * u * t * controlX + t * t * b.x + 0.5);
				candidate[2 * j + 1] = Math.floor(u * u * a.y + 2 * u * t * controlY + t * t * b.y + 0.5);
			}
			this.survey(candidate);
			if (this.longestWater > MAX_SPAN || this.mountainCells >= fewest) continue;
			fewest = this.mountainCells;
			points = Int32Array.from(candidate);
		}
		if (points === null) return null;

		const width = highway ? (a.tier === 3 || b.tier === 3 ? MOTORWAY_WIDTH : HIGHWAY_WIDTH) : COUNTRY_WIDTH;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (let j = 0; j < points.length; j += 2) {
			minX = Math.min(minX, points[j]);
			maxX = Math.max(maxX, points[j]);
			minY = Math.min(minY, points[j + 1]);
			maxY = Math.max(maxY, points[j + 1]);
		}
		return { a, b, type: highway ? CellType.HIGHWAY : CellType.AVENUE, width, points, minX: minX - width, minY: minY - width, maxX: maxX + width, maxY: maxY + width };
	}

	/**
	 * Sets `longestWater` to the longest stretch of water, in cells, on the road through `points` and `mountainCells` to the cells of it at
	 * `MOUNTAIN_LEVEL` and up, both looked up every `WATER_SAMPLE` cells along it. Water never covers a mountain, so only dry samples read
	 * the elevation.
	 */
	private survey(points: Int32Array): void {
		let longest = 0;
		let run = 0;
		let mountains = 0;
		for (let p = 0; p + 3 < points.length; p += 2) {
			const dx = points[p + 2] - points[p];
			const dy = points[p + 3] - points[p + 1];
			const samples = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / WATER_SAMPLE));
			/** A leg starts where the last one ended, so its first point is already counted. */
			for (let s = p === 0 ? 0 : 1; s <= samples; s++) {
				const x = points[p] + Math.floor((dx * s) / samples);
				const y = points[p + 1] + Math.floor((dy * s) / samples);
				if (this.water.at(x, y)) {
					run += WATER_SAMPLE;
					if (run > longest) longest = run;
				} else {
					run = 0;
					if (this.relief.elevationAt(x, y) >= MOUNTAIN_LEVEL) mountains += WATER_SAMPLE;
				}
			}
		}
		this.longestWater = longest;
		this.mountainCells = mountains;
	}
}

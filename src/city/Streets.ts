import { CellType } from '../core/CellType';
import { hash, Salt, unit } from './hash';
import { type Town, Towns } from './Towns';
import type { Water } from './Water';

/** Every 4th street of a town is an avenue, 2 cells wide. */
const AVENUE_EVERY = 4;
const AVENUE_WIDTH = 2;
/** Each street moves up to this many cells off its place on the regular grid, so a town does not look ruled. Lines stay straight and in order. */
const JITTER = 2;
/** Share of the street segments between two crossings that are left out of the suburbs: dead ends and missing links make a grid look grown. */
const DROP_SHARE = 0.12;
/** Where a town of tier 1 and up is downtown, and keeps its whole grid. */
const DOWNTOWN_LEVEL = 0.55;

/**
 * The street grid of every town: straight streets and avenues in both directions, only where the town is urban. Streets stop at the
 * water, avenues bridge a river and stop at a lake: a bridge over a lake would be hundreds of cells long.
 */
export class Streets {
	private readonly towns: Towns;
	private readonly water: Water;

	constructor(towns: Towns, water: Water) {
		this.towns = towns;
		this.water = water;
	}

	/** Position on `axis` (0 for the vertical lines at a given x, 1 for the horizontal lines at a given y) of the line number `k` of the town. */
	line(town: Town, axis: 0 | 1, k: number): number {
		const origin = axis === 0 ? town.x + town.phaseX : town.y + town.phaseY;
		return origin + k * town.block + (hash(town.id, k, axis, Salt.STREET_JITTER) % (2 * JITTER + 1)) - JITTER;
	}

	/** Number of the last line of `axis` at or before `v`. */
	indexBelow(town: Town, axis: 0 | 1, v: number): number {
		let k = Math.floor((v - (axis === 0 ? town.x + town.phaseX : town.y + town.phaseY)) / town.block);
		while (this.line(town, axis, k + 1) <= v) k++;
		while (this.line(town, axis, k) > v) k--;
		return k;
	}

	/** Paints the streets, then the avenues, of every town near the `size` x `size` tile at (x0, y0); `mask` is 1 on water. */
	paint(x0: number, y0: number, size: number, out: Uint8Array, mask: Uint8Array): void {
		const { towns } = this;
		towns.prepare(x0, y0, size);
		const { present } = towns;
		if (present.length === 0) return;
		for (let pass = 0; pass < 2; pass++) {
			for (let t = 0; t < present.length; t++) {
				this.paintLines(present[t], 0, pass === 1, x0, y0, size, out, mask);
				this.paintLines(present[t], 1, pass === 1, x0, y0, size, out, mask);
			}
		}
	}

	/** The lines of one axis and one kind: axis 0 runs along y at fixed x, axis 1 along x at fixed y. */
	private paintLines(town: Town, axis: 0 | 1, avenues: boolean, x0: number, y0: number, size: number, out: Uint8Array, mask: Uint8Array): void {
		const { towns } = this;
		const { present, shapes } = towns;
		const cross = axis === 0 ? 1 : 0;
		const across0 = axis === 0 ? x0 : y0;
		const along0 = axis === 0 ? y0 : x0;
		const width = avenues ? AVENUE_WIDTH : 1;
		const last = this.indexBelow(town, axis, across0 + size) + 1;

		for (let k = this.indexBelow(town, axis, across0 - 2); k <= last; k++) {
			if ((k % AVENUE_EVERY === 0) !== avenues) continue;
			const position = this.line(town, axis, k);
			if (position + width <= across0 || position >= across0 + size) continue;

			/** Segment `segment` runs from cross line `segment` to the next; a street segment can be dropped as a whole. */
			let segment = this.indexBelow(town, cross, along0);
			let segmentStart = this.line(town, cross, segment);
			let segmentEnd = this.line(town, cross, segment + 1);
			let dropped = !avenues && unit(hash(town.id, k, segment, axis === 0 ? Salt.STREET_DROP_X : Salt.STREET_DROP_Y)) < DROP_SHARE;
			for (let p = 0; p < size; p++) {
				const along = along0 + p;
				if (along >= segmentEnd) {
					segment++;
					segmentStart = segmentEnd;
					segmentEnd = this.line(town, cross, segment + 1);
					dropped = !avenues && unit(hash(town.id, k, segment, axis === 0 ? Salt.STREET_DROP_X : Salt.STREET_DROP_Y)) < DROP_SHARE;
				}
				/** The cells of a crossing are kept, so the lines on both sides of a dropped segment stay joined to the rest of the grid. */
				const crossing = along < segmentStart + (segment % AVENUE_EVERY === 0 ? AVENUE_WIDTH : 1);

				for (let w = 0; w < width; w++) {
					const across = position + w;
					if (across < across0 || across >= across0 + size) continue;
					const x = axis === 0 ? across : along;
					const y = axis === 0 ? along : across;
					const i = (y - y0) * size + x - x0;
					const level = Towns.level(town, x, y, shapes[i]);
					if (level <= 0) continue;
					/** Where two towns overlap, the one the cell is deeper in owns it, so two grids never mix. */
					let owned = true;
					for (let o = 0; o < present.length && owned; o++) {
						const other = present[o];
						if (other === town) continue;
						const otherLevel = Towns.level(other, x, y, shapes[i]);
						owned = otherLevel < level || (otherLevel === level && other.id < town.id);
					}
					if (!owned) continue;

					if (avenues) {
						if (mask[i] === 0) out[i] = CellType.AVENUE;
						else if (!this.water.lakeAt(x, y)) out[i] = CellType.BRIDGE;
					} else if (mask[i] === 0 && (!dropped || crossing || (town.tier > 0 && level > DOWNTOWN_LEVEL))) out[i] = CellType.STREET;
				}
			}
		}
	}
}

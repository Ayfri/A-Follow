import { CellType, TYPE_COUNT } from '../core/CellType';
import { hash, Salt, unit } from './hash';
import { minorOffset } from './raster';
import { type Edge, Roads } from './Roads';
import { type Town, Towns } from './Towns';

/** Cells of road per plot: a plot holds at most one house on each side, so houses never touch along the road. */
const PLOT = 8;
const MIN_LENGTH = 3;
const MAX_LENGTH = 5;
const MIN_DEPTH = 3;
const MAX_DEPTH = 5;
/** Cells between the road and the house: 1 to 3, so the houses of a row do not line up. */
const MAX_GAP = 3;
/**
 * Share of the plots that get a house just outside the border of a town: the chance falls linearly with the level of the town (0 at the
 * border, negative outside) and reaches none at `-FADE_LEVEL`, 0.6 radius out: 36 cells for a village, 170 for a city. Measured from the border and not the center, so the ribbon
 * follows the lobes of the outline, and none starts inside the town, where the blocks already are.
 */
const MAX_CHANCE = 0.95;
const FADE_LEVEL = 0.6;
/** The cells a house may stand on: open ground and farmland, never marsh, rock, snow, water or a road. */
const BUILDABLE = new Uint8Array(TYPE_COUNT);
for (const type of [CellType.GROUND, CellType.FIELD, CellType.FOREST, CellType.MEADOW, CellType.HILL, CellType.PINE, CellType.ORCHARD, CellType.SAND]) BUILDABLE[type] = 1;

/**
 * Houses along the country roads near the towns they link: ribbon development. A road is cut into plots of `PLOT` cells; each plot has a
 * hashed chance of a house on each side, falling with the distance to the border of the closest of its two towns, so the houses thin out
 * along the road and a town reaches into the countryside. A house depends on its road and its plot only, and paints the cells it may
 * stand on (`BUILDABLE`), so a tile paints the cells of the same house as a bigger tile. Run it after every other layer: a house never
 * covers a road, a street, water or rock.
 */
export class Ribbons {
	private readonly roads: Roads;
	private readonly towns: Towns;

	constructor(roads: Roads, towns: Towns) {
		this.roads = roads;
		this.towns = towns;
	}

	paint(x0: number, y0: number, size: number, out: Uint8Array): void {
		for (const edge of this.roads.near(x0, y0, size)) {
			if (edge.type !== CellType.AVENUE) continue;
			if (!Ribbons.reaches(edge, x0, y0, size)) continue;
			const { points } = edge;
			for (let p = 0; p + 3 < points.length; p += 2) this.leg(edge, p, x0, y0, size, out);
		}
	}

	/** Whether the tile is near enough to a town of the edge to have houses. */
	private static reaches(edge: Edge, x0: number, y0: number, size: number): boolean {
		return Ribbons.within(edge.a, x0, y0, size) || Ribbons.within(edge.b, x0, y0, size);
	}

	private static within(town: Town, x0: number, y0: number, size: number): boolean {
		const reach = Towns.reach(town) + FADE_LEVEL * town.radius + Roads.NEAR;
		return town.x + reach >= x0 && town.x - reach < x0 + size && town.y + reach >= y0 && town.y - reach < y0 + size;
	}

	/** The houses of one straight leg of the road, which `rasterize` draws with the same closed form. */
	private leg(edge: Edge, p: number, tileX: number, tileY: number, size: number, out: Uint8Array): void {
		const { points, a, b, width } = edge;
		const [ax, ay, bx, by] = [points[p], points[p + 1], points[p + 2], points[p + 3]];
		const dx = bx - ax;
		const dy = by - ay;
		const wide = Math.abs(dx) >= Math.abs(dy);
		const major = wide ? Math.abs(dx) : Math.abs(dy);
		const minor = wide ? Math.abs(dy) : Math.abs(dx);
		const majorStart = wide ? ax : ay;
		const minorStart = wide ? ay : ax;
		const majorSign = (wide ? dx : dy) < 0 ? -1 : 1;
		const minorSign = (wide ? dy : dx) < 0 ? -1 : 1;
		const tileMajor = wide ? tileX : tileY;
		const spread = -Math.floor((width - 1) / 2);
		const plots = Math.floor((major + 1) / PLOT);
		const first = majorSign > 0 ? tileMajor - majorStart : majorStart - (tileMajor + size - 1);
		const low = Math.min(a.id, b.id);
		const high = Math.max(a.id, b.id);

		for (let q = Math.max(0, Math.floor(first / PLOT)); q <= Math.min(plots - 1, Math.floor((first + size - 1) / PLOT)); q++) {
			const middle = q * PLOT + (PLOT >> 1);
			const roadX = wide ? majorStart + majorSign * middle : minorStart + minorSign * minorOffset(middle, major, minor);
			const roadY = wide ? minorStart + minorSign * minorOffset(middle, major, minor) : majorStart + majorSign * middle;
			const level = Math.max(this.towns.urban(a, roadX, roadY), this.towns.urban(b, roadX, roadY));
			if (level > 0 || level <= -FADE_LEVEL) continue;
			const chance = MAX_CHANCE * (1 + level / FADE_LEVEL);

			for (let side = 0; side < 2; side++) {
				const id = hash(low, high, (((p >> 1) << 10) | (q << 1)) | side, Salt.RIBBON);
				if (unit(id) >= chance) continue;
				const shape = hash(id, 0, 0, Salt.RIBBON_SIZE);
				const length = MIN_LENGTH + (shape % (MAX_LENGTH - MIN_LENGTH + 1));
				const depth = MIN_DEPTH + ((shape >>> 4) % (MAX_DEPTH - MIN_DEPTH + 1));
				const gap = 1 + ((shape >>> 8) % MAX_GAP);
				const from = q * PLOT + ((shape >>> 12) % (PLOT - length + 1));
				const to = from + length - 1;

				/** The road moves along the minor axis between the two ends of the house: the house clears all of it, so it never leans on the road. */
				const m0 = minorStart + minorSign * minorOffset(from, major, minor);
				const m1 = minorStart + minorSign * minorOffset(to, major, minor);
				const roadLow = Math.min(m0, m1) + spread;
				const roadHigh = Math.max(m0, m1) + spread + width - 1;
				const minorLow = side === 0 ? roadHigh + 1 + gap : roadLow - gap - depth;
				const minorHigh = minorLow + depth - 1;
				const m2 = majorStart + majorSign * from;
				const m3 = majorStart + majorSign * to;
				const majorLow = Math.min(m2, m3);
				const majorHigh = Math.max(m2, m3);

				const left = wide ? majorLow : minorLow;
				const right = wide ? majorHigh : minorHigh;
				const top = wide ? minorLow : majorLow;
				const bottom = wide ? minorHigh : majorHigh;
				for (let y = Math.max(top, tileY); y <= Math.min(bottom, tileY + size - 1); y++) {
					for (let x = Math.max(left, tileX); x <= Math.min(right, tileX + size - 1); x++) {
						const i = (y - tileY) * size + x - tileX;
						if (BUILDABLE[out[i]] === 1) out[i] = CellType.BUILDING;
					}
				}
			}
		}
	}
}

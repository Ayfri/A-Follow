/** One color per cell type with a fill; GROUND has none because it shows `background`. */
export interface ColorTheme {
	background: string;
	wall:       string;
	path:       string;
	grid:       string;
	player:     string;
	street:     string;
	avenue:     string;
	highway:    string;
	bridge:     string;
	plaza:      string;
	park:       string;
	field:      string;
	forest:     string;
	building:   string;
	water:      string;
}

export const DEFAULT_THEME: ColorTheme = {
	background: '#000000',
	wall:       '#3333bb',
	path:       '#004400',
	grid:       '#222222',
	player:     '#ffffff',
	street:     '#4a4a52',
	avenue:     '#6b6b75',
	highway:    '#a08a3c',
	bridge:     '#8c7a52',
	plaza:      '#3a3530',
	park:       '#1f4a24',
	field:      '#2e3318',
	forest:     '#123018',
	building:   '#5a4a3f',
	water:      '#123a6b'
};

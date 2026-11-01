export interface ColorTheme {
	background: string;
	wall: string;
	path: string;
	grid: string;
	player: string;
}

export const DEFAULT_THEME: ColorTheme = {
	background: '#000000',
	wall:       '#3333bb',
	path:       '#004400',
	grid:       '#222222',
	player:     '#ffffff'
};

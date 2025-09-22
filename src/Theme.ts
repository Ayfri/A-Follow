export interface ColorTheme {
	background: string;
	activeCell: string;
	path: string;
	grid: string;
	player: string;
}

export class Theme {
	private theme: ColorTheme = {
		background: '#000000',
		activeCell: '#3333bb',
		path: '#004400',
		grid: '#222222',
		player: '#ffffff'
	};

	getTheme(): ColorTheme {
		return { ...this.theme };
	}

	setBackgroundColor(color: string): void {
		this.theme.background = color;
	}

	setActiveCellColor(color: string): void {
		this.theme.activeCell = color;
	}

	setPathColor(color: string): void {
		this.theme.path = color;
	}

	setGridColor(color: string): void {
		this.theme.grid = color;
	}

	setPlayerColor(color: string): void {
		this.theme.player = color;
	}

	getBackgroundColor(): string {
		return this.theme.background;
	}

	getActiveCellColor(): string {
		return this.theme.activeCell;
	}

	getPathColor(): string {
		return this.theme.path;
	}

	getGridColor(): string {
		return this.theme.grid;
	}

	getPlayerColor(): string {
		return this.theme.player;
	}
}
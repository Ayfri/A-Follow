import type p5 from 'p5';
import type { Player } from './player';
import type { Grid } from './grid';
import { Slider } from './inputs/Slider';
import { ColorInput } from './inputs/ColorInput';
import { Theme } from './Theme';

export class Overlay {
	private speedSlider!: Slider;
	private gridSizeSlider!: Slider;
	private backgroundColorInput!: ColorInput;
	private activeCellColorInput!: ColorInput;
	private pathColorInput!: ColorInput;
	private gridColorInput!: ColorInput;
	private playerColorInput!: ColorInput;
	private container!: p5.Element;
	private p: p5;
	private player: Player;
	private grid: Grid;
	private theme: Theme;

	constructor(p: p5, player: Player, grid: Grid, theme: Theme) {
		this.p = p;
		this.player = player;
		this.grid = grid;
		this.theme = theme;
	}

	init(): void {
		this.createContainer();
		this.createSpeedControls();
		this.createGridSizeControls();
		this.createColorControls();
	}

	private createContainer(): void {
		this.container = this.p.createDiv('');
		this.container.position(20, 20);
		this.container.style('background-color', 'rgba(0, 0, 0, 0.8)');
		this.container.style('padding', '15px');
		this.container.style('border-radius', '8px');
		this.container.style('color', 'white');
		this.container.style('font-family', 'Arial, sans-serif');
		this.container.style('font-size', '14px');
	}

	private createSpeedControls(): void {
		this.speedSlider = new Slider(this.p, {
			label: 'Speed',
			min: 1,
			max: 40,
			defaultValue: this.player.getSpeed(),
			step: 1,
			onChange: (speed: number) => {
				this.player.setSpeed(speed);
			}
		});
		this.speedSlider.init(this.container);
	}

	private createGridSizeControls(): void {
		this.gridSizeSlider = new Slider(this.p, {
			label: 'Grid Size',
			min: 10,
			max: 50,
			defaultValue: this.grid.getCellSize(),
			step: 2,
			onChange: (size: number) => {
				this.grid.setCellSize(size);
				this.grid.init(this.p.width, this.p.height);
				this.player.init(this.grid);
			}
		});
		this.gridSizeSlider.init(this.container);
	}

	private createColorControls(): void {
		// Background color
		this.backgroundColorInput = new ColorInput(this.p, {
			label: 'Background Color',
			defaultValue: this.theme.getBackgroundColor(),
			onChange: (color: string) => {
				this.theme.setBackgroundColor(color);
			}
		});
		this.backgroundColorInput.init(this.container);

		// Active cell color
		this.activeCellColorInput = new ColorInput(this.p, {
			label: 'Wall Color',
			defaultValue: this.theme.getActiveCellColor(),
			onChange: (color: string) => {
				this.theme.setActiveCellColor(color);
			}
		});
		this.activeCellColorInput.init(this.container);

		// Path color
		this.pathColorInput = new ColorInput(this.p, {
			label: 'Path Color',
			defaultValue: this.theme.getPathColor(),
			onChange: (color: string) => {
				this.theme.setPathColor(color);
			}
		});
		this.pathColorInput.init(this.container);

		// Grid color
		this.gridColorInput = new ColorInput(this.p, {
			label: 'Grid Color',
			defaultValue: this.theme.getGridColor(),
			onChange: (color: string) => {
				this.theme.setGridColor(color);
			}
		});
		this.gridColorInput.init(this.container);

		// Player color
		this.playerColorInput = new ColorInput(this.p, {
			label: 'Player Color',
			defaultValue: this.theme.getPlayerColor(),
			onChange: (color: string) => {
				this.theme.setPlayerColor(color);
			}
		});
		this.playerColorInput.init(this.container);
	}

	destroy(): void {
        this.speedSlider?.destroy();
        this.gridSizeSlider?.destroy();
        this.backgroundColorInput?.destroy();
        this.activeCellColorInput?.destroy();
        this.pathColorInput?.destroy();
        this.gridColorInput?.destroy();
        this.playerColorInput?.destroy();
        this.container?.remove();
	}
}
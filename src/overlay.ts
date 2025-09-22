import type p5 from 'p5';
import type { Player } from './player';
import type { Grid } from './grid';
import { Slider } from './inputs/Slider';
import { ColorInput } from './inputs/ColorInput';
import { Button } from './inputs/Button';
import { Theme } from './Theme';

export class Overlay {
	private speedSlider!: Slider;
	private gridSizeSlider!: Slider;
	private backgroundColorInput!: ColorInput;
	private activeCellColorInput!: ColorInput;
	private pathColorInput!: ColorInput;
	private gridColorInput!: ColorInput;
	private playerColorInput!: ColorInput;
	private generateMazeButton!: Button;
	private generateRandomGridButton!: Button;
	private randomGridProbabilitySlider!: Slider;
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
		this.createMazeControls();
		this.createRandomGridControls();
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
			storageKey: 'player-speed',
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
			storageKey: 'grid-size',
			onChange: (size: number) => {
				this.grid.setCellSize(size);
				this.grid.init(this.p.width, this.p.height);
				this.player.init(this.grid);
			}
		});
		this.gridSizeSlider.init(this.container);
	}

	private createColorControls(): void {
		this.backgroundColorInput = new ColorInput(this.p, {
			label: 'Background Color',
			defaultValue: this.theme.getBackgroundColor(),
			storageKey: 'background-color',
			onChange: (color: string) => {
				this.theme.setBackgroundColor(color);
			}
		});
		this.backgroundColorInput.init(this.container);

		this.activeCellColorInput = new ColorInput(this.p, {
			label: 'Wall Color',
			defaultValue: this.theme.getActiveCellColor(),
			storageKey: 'wall-color',
			onChange: (color: string) => {
				this.theme.setActiveCellColor(color);
			}
		});
		this.activeCellColorInput.init(this.container);

		this.pathColorInput = new ColorInput(this.p, {
			label: 'Path Color',
			defaultValue: this.theme.getPathColor(),
			storageKey: 'path-color',
			onChange: (color: string) => {
				this.theme.setPathColor(color);
			}
		});
		this.pathColorInput.init(this.container);

		this.gridColorInput = new ColorInput(this.p, {
			label: 'Grid Color',
			defaultValue: this.theme.getGridColor(),
			storageKey: 'grid-color',
			onChange: (color: string) => {
				this.theme.setGridColor(color);
			}
		});
		this.gridColorInput.init(this.container);

		this.playerColorInput = new ColorInput(this.p, {
			label: 'Player Color',
			defaultValue: this.theme.getPlayerColor(),
			storageKey: 'player-color',
			onChange: (color: string) => {
				this.theme.setPlayerColor(color);
			}
		});
		this.playerColorInput.init(this.container);
	}

	private createMazeControls(): void {
		this.generateMazeButton = new Button(this.p, {
			label: 'Generate Random Maze',
			onClick: () => {
				this.grid.generateRandomMaze();
			}
		});
		this.generateMazeButton.init(this.container);
	}

	private createRandomGridControls(): void {
		this.randomGridProbabilitySlider = new Slider(this.p, {
			label: 'Random Grid Probability',
			min: 0.05,
			max: 0.6,
			defaultValue: 0.2,
			step: 0.025,
			storageKey: 'random-grid-probability',
			onChange: (probability: number) => {
				// Update button label to show current probability (only if button exists)
				if (this.generateRandomGridButton) {
					this.updateRandomGridButtonLabel(probability);
				}
			}
		});

		this.generateRandomGridButton = new Button(this.p, {
			label: 'Generate Random Grid (0.20)',
			onClick: () => {
				const probability = this.randomGridProbabilitySlider.getValue();
				this.grid.generateRandomGrid(probability);
			}
		});

		// Initialize slider first
		this.randomGridProbabilitySlider.init(this.container);
		// Then initialize button
		this.generateRandomGridButton.init(this.container);

		// Initialize button label with current slider value
		this.updateRandomGridButtonLabel(this.randomGridProbabilitySlider.getValue());
	}

	private updateRandomGridButtonLabel(probability: number): void {
		// Access the button element directly to update its text
		const buttonElement = this.generateRandomGridButton.button;
        buttonElement?.html(`Generate Random Grid (${probability.toFixed(3)})`);
	}

	destroy(): void {
        this.speedSlider?.destroy();
        this.gridSizeSlider?.destroy();
        this.randomGridProbabilitySlider?.destroy();
        this.generateMazeButton?.destroy();
        this.generateRandomGridButton?.destroy();
        this.backgroundColorInput?.destroy();
        this.activeCellColorInput?.destroy();
        this.pathColorInput?.destroy();
        this.gridColorInput?.destroy();
        this.playerColorInput?.destroy();
        this.container?.remove();
	}
}
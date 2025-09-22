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
	private toggleButton!: Button;
	private container!: p5.Element;
	private controlsContainer!: p5.Element;
	private p: p5;
	private player: Player;
	private grid: Grid;
	private theme: Theme;
	private isMinimized: boolean = false;

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
		this.container.style('position', 'absolute');
		this.container.style('top', '20px');
		this.container.style('left', '20px');
		this.container.style('background-color', 'rgba(0, 0, 0, 0.7)');
		this.container.style('padding', '10px');
		this.container.style('border-radius', '8px');
		this.container.style('color', 'white');
		this.container.style('font-family', 'Arial, sans-serif');
		this.container.style('font-size', '14px');
		this.container.style('z-index', '1000');

		// Create toggle button (icon mode, positioned absolutely)
		this.toggleButton = new Button(this.p, {
			label: 'collapse', // Collapse icon (menu is expanded by default)
			isIcon: true,
			onClick: () => {
				this.toggleMinimized();
			}
		});
		this.toggleButton.init(this.container);
		// Position the toggle button absolutely in top-right (only when expanded)
		this.toggleButton.button.style('position', 'absolute');
		this.toggleButton.button.style('top', '5px');
		this.toggleButton.button.style('right', '5px');

		// Create container for controls
		this.controlsContainer = this.p.createDiv('');
		this.controlsContainer.parent(this.container);
		this.controlsContainer.style('display', 'block');
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
		this.speedSlider.init(this.controlsContainer);
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
		this.gridSizeSlider.init(this.controlsContainer);
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
		this.backgroundColorInput.init(this.controlsContainer);

		this.activeCellColorInput = new ColorInput(this.p, {
			label: 'Wall Color',
			defaultValue: this.theme.getActiveCellColor(),
			storageKey: 'wall-color',
			onChange: (color: string) => {
				this.theme.setActiveCellColor(color);
			}
		});
		this.activeCellColorInput.init(this.controlsContainer);

		this.pathColorInput = new ColorInput(this.p, {
			label: 'Path Color',
			defaultValue: this.theme.getPathColor(),
			storageKey: 'path-color',
			onChange: (color: string) => {
				this.theme.setPathColor(color);
			}
		});
		this.pathColorInput.init(this.controlsContainer);

		this.gridColorInput = new ColorInput(this.p, {
			label: 'Grid Color',
			defaultValue: this.theme.getGridColor(),
			storageKey: 'grid-color',
			onChange: (color: string) => {
				this.theme.setGridColor(color);
			}
		});
		this.gridColorInput.init(this.controlsContainer);

		this.playerColorInput = new ColorInput(this.p, {
			label: 'Player Color',
			defaultValue: this.theme.getPlayerColor(),
			storageKey: 'player-color',
			onChange: (color: string) => {
				this.theme.setPlayerColor(color);
			}
		});
		this.playerColorInput.init(this.controlsContainer);
	}

	private createMazeControls(): void {
		this.generateMazeButton = new Button(this.p, {
			label: 'Generate Random Maze',
			onClick: () => {
				this.grid.generateRandomMaze();
			}
		});
		this.generateMazeButton.init(this.controlsContainer);
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
		this.randomGridProbabilitySlider.init(this.controlsContainer);
		// Then initialize button
		this.generateRandomGridButton.init(this.controlsContainer);

		// Initialize button label with current slider value
		this.updateRandomGridButtonLabel(this.randomGridProbabilitySlider.getValue());
	}

	private updateRandomGridButtonLabel(probability: number): void {
		// Access the button element directly to update its text
		const buttonElement = this.generateRandomGridButton.button;
        buttonElement?.html(`Generate Random Grid (${probability.toFixed(3)})`);
	}

	private toggleMinimized(): void {
		this.isMinimized = !this.isMinimized;
		if (this.isMinimized) {
			this.controlsContainer.style('display', 'none');
			this.container.style('padding', '0');
			this.container.style('min-width', '32px');
			this.container.style('min-height', '32px');
			this.container.style('display', 'flex');
			this.container.style('align-items', 'center');
			this.container.style('justify-content', 'center');
			// Remove absolute positioning to center the button
			this.toggleButton.button.style('position', 'static');
			this.toggleButton.button.style('top', 'auto');
			this.toggleButton.button.style('right', 'auto');
			this.toggleButton.setIcon('expand'); // Expand icon
		} else {
			this.controlsContainer.style('display', 'block');
			this.container.style('padding', '10px');
			this.container.style('min-width', 'auto');
			this.container.style('min-height', 'auto');
			this.container.style('display', 'block');
			// Restore absolute positioning
			this.toggleButton.button.style('position', 'absolute');
			this.toggleButton.button.style('top', '5px');
			this.toggleButton.button.style('right', '5px');
			this.toggleButton.setIcon('collapse'); // Collapse icon
		}
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
        this.toggleButton?.destroy();
        this.container?.remove();
	}
}
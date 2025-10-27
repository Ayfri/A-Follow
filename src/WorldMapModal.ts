import type p5 from 'p5';
import type { Grid } from './grid';
import type { Player } from './player';
import { Button } from './inputs/Button';
import { ColorInput } from './inputs/ColorInput';

export class WorldMapModal {
	private p: p5;
	private grid: Grid;
	private player: Player;
	private container!: p5.Element;
	private modalContent!: p5.Element;
	private closeButton!: Button;
	private generateButton!: Button;
	private toggleModeButton!: Button;
	private roadColorInput!: ColorInput;
	private mountainColorInput!: ColorInput;
	private riverColorInput!: ColorInput;
	private plainColorInput!: ColorInput;
	private isVisible: boolean = false;
	private onClose?: () => void;

	constructor(p: p5, grid: Grid, player: Player, onClose?: () => void) {
		this.p = p;
		this.grid = grid;
		this.player = player;
		this.onClose = onClose;
	}

	init(): void {
		// Create modal overlay
		this.container = this.p.createDiv('');
		this.container.style('position', 'fixed');
		this.container.style('top', '0');
		this.container.style('left', '0');
		this.container.style('width', '100%');
		this.container.style('height', '100%');
		this.container.style('background-color', 'rgba(0, 0, 0, 0.7)');
		this.container.style('display', 'none');
		this.container.style('justify-content', 'center');
		this.container.style('align-items', 'center');
		this.container.style('z-index', '2000');

		// Create modal content
		this.modalContent = this.p.createDiv('');
		this.modalContent.parent(this.container);
		this.modalContent.style('background-color', 'rgba(20, 20, 20, 0.95)');
		this.modalContent.style('padding', '30px');
		this.modalContent.style('border-radius', '12px');
		this.modalContent.style('color', 'white');
		this.modalContent.style('font-family', 'Arial, sans-serif');
		this.modalContent.style('max-width', '500px');
		this.modalContent.style('width', '90%');
		this.modalContent.style('box-shadow', '0 10px 40px rgba(0, 0, 0, 0.5)');

		// Title
		const title = this.p.createElement('h2', 'World Map Generator');
		title.parent(this.modalContent);
		title.style('margin', '0 0 20px 0');
		title.style('font-size', '24px');
		title.style('color', 'white');
		title.style('text-align', 'center');

		// Description
		const desc = this.p.createElement(
			'p',
			'Generate a procedural world map with roads, mountains, rivers, and cities. The player can only travel on roads.'
		);
		desc.parent(this.modalContent);
		desc.style('margin', '0 0 25px 0');
		desc.style('font-size', '14px');
		desc.style('color', '#ccc');
		desc.style('line-height', '1.5');
		desc.style('text-align', 'center');

		// Toggle mode button
		this.toggleModeButton = new Button(this.p, {
			label: this.grid.isWorldMapMode() ? 'Disable World Map Mode' : 'Enable World Map Mode',
			onClick: () => {
				const newMode = !this.grid.isWorldMapMode();
				this.grid.setWorldMapMode(newMode);
				
				// Update button label
				const buttonElement = this.toggleModeButton.button;
				buttonElement?.html(newMode ? 'Disable World Map Mode' : 'Enable World Map Mode');
				
				// Teleport player to nearest road if enabling world map mode
				if (newMode) {
					const playerPos = this.player.getPosition();
					const nearestRoad = this.grid.findNearestRoad(playerPos.x, playerPos.y);
					if (nearestRoad) {
						this.player.setPosition(nearestRoad.x, nearestRoad.y);
					}
				}
			}
		});
		this.toggleModeButton.init(this.modalContent);
		this.toggleModeButton.button.style('width', '100%');
		this.toggleModeButton.button.style('margin-bottom', '20px');
		this.toggleModeButton.button.style('padding', '12px');
		this.toggleModeButton.button.style('font-size', '16px');
		this.toggleModeButton.button.style('background-color', '#2563eb');

		// Generate button
		this.generateButton = new Button(this.p, {
			label: 'Generate New World Map',
			onClick: () => {
				this.grid.generateWorldMap();
				
				// Teleport player to nearest road
				const playerPos = this.player.getPosition();
				const nearestRoad = this.grid.findNearestRoad(playerPos.x, playerPos.y);
				if (nearestRoad) {
					this.player.setPosition(nearestRoad.x, nearestRoad.y);
				}
			}
		});
		this.generateButton.init(this.modalContent);
		this.generateButton.button.style('width', '100%');
		this.generateButton.button.style('margin-bottom', '20px');
		this.generateButton.button.style('padding', '12px');
		this.generateButton.button.style('font-size', '16px');

		// Color section title
		const colorTitle = this.p.createElement('h3', 'Terrain Colors');
		colorTitle.parent(this.modalContent);
		colorTitle.style('margin', '20px 0 15px 0');
		colorTitle.style('font-size', '18px');
		colorTitle.style('color', 'white');
		colorTitle.style('border-bottom', '2px solid rgba(255, 255, 255, 0.2)');
		colorTitle.style('padding-bottom', '10px');

		// Color inputs
		const colors = this.grid.getWorldMapColors();

		this.roadColorInput = new ColorInput(this.p, {
			label: 'Road Color',
			defaultValue: colors.road,
			storageKey: 'world-map-road-color',
			onChange: (color: string) => {
				this.grid.setWorldMapColors({ road: color });
			}
		});
		this.roadColorInput.init(this.modalContent);

		this.mountainColorInput = new ColorInput(this.p, {
			label: 'Mountain Color',
			defaultValue: colors.mountain,
			storageKey: 'world-map-mountain-color',
			onChange: (color: string) => {
				this.grid.setWorldMapColors({ mountain: color });
			}
		});
		this.mountainColorInput.init(this.modalContent);

		this.riverColorInput = new ColorInput(this.p, {
			label: 'River Color',
			defaultValue: colors.river,
			storageKey: 'world-map-river-color',
			onChange: (color: string) => {
				this.grid.setWorldMapColors({ river: color });
			}
		});
		this.riverColorInput.init(this.modalContent);

		this.plainColorInput = new ColorInput(this.p, {
			label: 'Plain Color',
			defaultValue: colors.plain,
			storageKey: 'world-map-plain-color',
			onChange: (color: string) => {
				this.grid.setWorldMapColors({ plain: color });
			}
		});
		this.plainColorInput.init(this.modalContent);

		// Close button at the bottom
		this.closeButton = new Button(this.p, {
			label: 'Close',
			onClick: () => {
				this.hide();
			}
		});
		this.closeButton.init(this.modalContent);
		this.closeButton.button.style('width', '100%');
		this.closeButton.button.style('margin-top', '25px');
		this.closeButton.button.style('padding', '12px');
		this.closeButton.button.style('font-size', '16px');
		this.closeButton.button.style('background-color', '#666');

		// Click outside to close
		this.container.mousePressed(() => {
			// Check if click was on the overlay (not the modal content)
			const target = (event as any).target;
			if (target === this.container.elt) {
				this.hide();
			}
		});
	}

	show(): void {
		this.isVisible = true;
		this.container.style('display', 'flex');
	}

	hide(): void {
		this.isVisible = false;
		this.container.style('display', 'none');
		if (this.onClose) {
			this.onClose();
		}
	}

	toggle(): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	destroy(): void {
		this.generateButton?.destroy();
		this.toggleModeButton?.destroy();
		this.closeButton?.destroy();
		this.roadColorInput?.destroy();
		this.mountainColorInput?.destroy();
		this.riverColorInput?.destroy();
		this.plainColorInput?.destroy();
		this.container?.remove();
	}
}

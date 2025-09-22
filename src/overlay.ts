import type p5 from 'p5';
import type { Player } from './player';
import { Slider } from './inputs/Slider';

export class Overlay {
	private speedSlider!: Slider;
	private container!: p5.Element;
	private p: p5;
	private player: Player;

	constructor(p: p5, player: Player) {
		this.p = p;
		this.player = player;
	}

	init(): void {
		this.createContainer();
		this.createSpeedControls();
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

	destroy(): void {
		if (this.speedSlider) {
			this.speedSlider.destroy();
		}
		if (this.container) {
			this.container.remove();
		}
	}
}
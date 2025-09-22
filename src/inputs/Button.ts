import type p5 from 'p5';

export interface ButtonConfig {
	label: string;
	onClick: () => void;
}

export class Button {
	public button!: p5.Element;
	private container!: p5.Element;
	private p: p5;
	private config: ButtonConfig;

	constructor(p: p5, config: ButtonConfig) {
		this.p = p;
		this.config = config;
	}

	init(parent?: p5.Element): void {
		this.createContainer(parent);
		this.createButton();
	}

	private createContainer(parent?: p5.Element): void {
		this.container = this.p.createDiv('');
		if (parent) {
			this.container.parent(parent);
		}
		this.container.style('margin-bottom', '15px');
	}

	private createButton(): void {
		this.button = this.p.createButton(this.config.label);
		this.button.parent(this.container);
		this.button.style('width', '200px');
		this.button.style('height', '30px');
		this.button.style('border', 'none');
		this.button.style('border-radius', '8px');
		this.button.style('background-color', '#4CAF50');
		this.button.style('color', 'white');
		this.button.style('cursor', 'pointer');
		this.button.style('font-weight', 'bold');

		this.button.mousePressed(this.config.onClick);
	}

	destroy(): void {
		this.container?.remove();
	}
}
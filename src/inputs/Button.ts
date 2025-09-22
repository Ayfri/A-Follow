import type p5 from 'p5';

export interface ButtonConfig {
	label: string;
	onClick: () => void;
	isIcon?: boolean;
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
		if (!this.config.isIcon) {
			this.container.style('margin-bottom', '15px');
		}
	}

	private createButton(): void {
		if (this.config.isIcon) {
			this.button = this.p.createButton('');
			this.button.parent(this.container);
			this.button.style('border', 'none');
			this.button.style('background', 'none');
			this.button.style('cursor', 'pointer');
			this.button.style('padding', '5px');
			this.button.style('display', 'flex');
			this.button.style('align-items', 'center');
			this.button.style('justify-content', 'center');
			
			// Add SVG icon based on label
			const svgIcon = this.getIconSvg(this.config.label);
			this.button.html(svgIcon);
		} else {
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
		}

		// Use DOM event listener instead of p5 mousePressed to avoid premature triggering
		this.button.elt.addEventListener('click', (event: MouseEvent) => {
			event.stopPropagation();
			this.config.onClick();
		});
		
		// Prevent event propagation on mouse events to avoid triggering canvas events
		this.button.elt.addEventListener('mousedown', (event: MouseEvent) => {
			event.stopPropagation();
		});
		this.button.elt.addEventListener('mouseup', (event: MouseEvent) => {
			event.stopPropagation();
		});
	}

	public setIcon(label: string): void {
		if (this.config.isIcon) {
			const svgIcon = this.getIconSvg(label);
			this.button.html(svgIcon);
		} else {
			this.button.html(label);
		}
	}

	private getIconSvg(label: string): string {
		const iconSize = '16px';
		const iconColor = 'white';
		
		switch (label) {
			case 'collapse':
				// Collapse icon (chevron down)
				return `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M6 9l6 6 6-6" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>`;
			case 'expand':
				// Expand icon (chevron up)
				return `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M18 15l-6-6-6 6" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>`;
			default:
				return label;
		}
	}

	destroy(): void {
		this.container?.remove();
	}
}
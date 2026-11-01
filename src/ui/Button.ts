import { createElement, type IconNode } from 'lucide';

export interface ButtonOptions {
	icon?: IconNode;
	iconOnly?: boolean;
}

export class Button {
	readonly element: HTMLButtonElement;
	private readonly iconOnly: boolean;

	constructor(label: string, onClick: () => void, options: ButtonOptions = {}) {
		this.iconOnly = options.iconOnly ?? false;
		this.element = Object.assign(document.createElement('button'), {
			type: 'button',
			className: this.iconOnly ? 'button button--icon' : 'button'
		});
		this.element.addEventListener('click', (event) => {
			onClick();
			/** A mouse click (`detail` > 0) drops the focus so a later Space reaches p5 instead of firing the button again. */
			if (event.detail > 0) this.element.blur();
		});
		this.setLabel(label, options.icon);
	}

	/** Icon-only buttons keep the label as accessible name and tooltip, the others show it next to the optional icon. */
	setLabel(label: string, icon?: IconNode): void {
		const svg = icon ? [createElement(icon, { 'aria-hidden': 'true' })] : [];
		if (this.iconOnly) {
			this.element.ariaLabel = label;
			this.element.title = label;
			this.element.replaceChildren(...svg);
		} else {
			this.element.replaceChildren(...svg, label);
		}
	}
}

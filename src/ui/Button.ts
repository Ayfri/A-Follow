import { createElement, type IconNode } from 'lucide';

export interface ButtonOptions {
	icon?: IconNode;
	variant?: 'primary' | 'secondary';
	iconOnly?: boolean;
}

export class Button {
	readonly element: HTMLButtonElement;
	private readonly iconOnly: boolean;

	constructor(label: string, onClick: () => void, options: ButtonOptions = {}) {
		this.iconOnly = options.iconOnly ?? false;
		this.element = Object.assign(document.createElement('button'), {
			type: 'button',
			className: `button button--${options.variant ?? 'secondary'}${this.iconOnly ? ' button--icon' : ''}`
		});
		this.element.addEventListener('click', onClick);
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

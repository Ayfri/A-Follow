import type p5 from 'p5';
import { StorageManager } from '../../utils/StorageManager';

export interface TextInputConfig {
	label: string;
	defaultValue: string;
	placeholder?: string;
	onChange?: (value: string) => void;
	storageKey?: string;
}

export class TextInput {
	private container!: p5.Element;
	private labelEl!: p5.Element;
	private input!: p5.Element;
	private p: p5;
	private config: TextInputConfig;

	constructor(p: p5, config: TextInputConfig) {
		this.p = p;
		this.config = config;
	}

	init(parent?: p5.Element): void {
		this.container = this.p.createDiv('');
		if (parent) this.container.parent(parent);
		this.container.style('margin-bottom', '15px');

		this.labelEl = this.p.createP(this.config.label);
		this.labelEl.parent(this.container);
		this.labelEl.style('margin', '0 0 8px 0');
		this.labelEl.style('font-weight', 'bold');

		this.input = this.p.createElement('input', '');
		this.input.parent(this.container);
		(this.input.elt as HTMLInputElement).type = 'text';
		this.input.attribute('placeholder', this.config.placeholder ?? '');
		this.input.style('width', '190px');
		this.input.style('padding', '4px 8px');
		this.input.style('border-radius', '6px');
		this.input.style('border', '1px solid #555');
		this.input.style('background', '#222');
		this.input.style('color', 'white');
		this.input.style('font-size', '13px');
		this.input.style('box-sizing', 'border-box');

		// Prevent canvas from receiving keyboard/mouse events when this input is focused
		this.input.elt.addEventListener('mousedown', (e: Event) => e.stopPropagation());
		this.input.elt.addEventListener('keydown', (e: Event) => e.stopPropagation());

		const initial = this.config.storageKey
			? StorageManager.load(this.config.storageKey, this.config.defaultValue)
			: this.config.defaultValue;
		this.setValue(initial);

		(this.input.elt as HTMLInputElement).addEventListener('change', () => {
			const val = this.getValue();
			if (this.config.storageKey) StorageManager.save(this.config.storageKey, val);
			this.config.onChange?.(val);
		});
	}

	getValue(): string {
		return (this.input.elt as HTMLInputElement).value;
	}

	setValue(value: string): void {
		(this.input.elt as HTMLInputElement).value = value;
	}

	destroy(): void {
		this.container?.remove();
	}
}


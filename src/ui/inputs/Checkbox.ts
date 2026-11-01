import type p5 from 'p5';
import { StorageManager } from '../../utils/StorageManager';

export interface CheckboxOptions {
	label: string;
	defaultValue?: boolean;
	storageKey?: string;
	onChange?: (value: boolean) => void;
}

export class Checkbox {
	private p: p5;
	private options: CheckboxOptions;
	private input!: p5.Element;

	constructor(p: p5, options: CheckboxOptions) {
		this.p = p;
		this.options = options;
	}

	init(parent: p5.Element): void {
		// Create container for checkbox
		const container = this.p.createDiv('');
		container.parent(parent);
		container.style('display', 'flex');
		container.style('align-items', 'center');
		container.style('margin-bottom', '15px');
		container.style('gap', '10px');

		// Create checkbox input directly using createElement
		const checkbox = this.p.createElement('input', '');
		checkbox.attribute('type', 'checkbox');
		this.input = checkbox;
		this.input.parent(container);
		this.input.style('width', '20px');
		this.input.style('height', '20px');
		this.input.style('cursor', 'pointer');
		this.input.style('margin', '0');
		this.input.style('accent-color', '#2563eb');

		// Create label
		const label = this.p.createSpan(this.options.label);
		label.parent(container);
		label.style('color', 'white');
		label.style('font-size', '14px');
		label.style('cursor', 'pointer');
		label.style('user-select', 'none');

		// Make label clickable
		label.mousePressed(() => {
			const currentValue = (this.input.elt as HTMLInputElement).checked;
			this.setValue(!currentValue);
		});

		// Load saved value or use default
		let initialValue = this.options.defaultValue || false;
		if (this.options.storageKey) {
			initialValue = StorageManager.load(this.options.storageKey, initialValue);
		}
		this.setValue(initialValue);

		// Handle changes
		(this.input.elt as HTMLInputElement).addEventListener('change', () => {
			const value = (this.input.elt as HTMLInputElement).checked;
			if (this.options.storageKey) {
				StorageManager.save(this.options.storageKey, value);
			}
			if (this.options.onChange) {
				this.options.onChange(value);
			}
		});
	}

	getValue(): boolean {
		return (this.input.elt as HTMLInputElement).checked;
	}

	setValue(value: boolean): void {
		(this.input.elt as HTMLInputElement).checked = value;
		if (this.options.storageKey) {
			StorageManager.save(this.options.storageKey, value);
		}
		if (this.options.onChange) {
			this.options.onChange(value);
		}
	}
}


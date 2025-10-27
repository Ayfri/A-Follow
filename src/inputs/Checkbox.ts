import type p5 from 'p5';
import { StorageManager } from '../StorageManager';

export interface CheckboxOptions {
	label: string;
	defaultValue?: boolean;
	storageKey?: string;
	onChange?: (value: boolean) => void;
}

export class Checkbox {
	private p: p5;
	private options: CheckboxOptions;
	public container!: p5.Element;
	public input!: p5.Element;
	private label!: p5.Element;

	constructor(p: p5, options: CheckboxOptions) {
		this.p = p;
		this.options = options;
	}

	init(parent: p5.Element): void {
		// Create container for checkbox
		this.container = this.p.createDiv('');
		this.container.parent(parent);
		this.container.style('display', 'flex');
		this.container.style('align-items', 'center');
		this.container.style('margin-bottom', '15px');
		this.container.style('gap', '10px');

		// Create checkbox input directly using createElement
		const checkbox = this.p.createElement('input', '');
		checkbox.attribute('type', 'checkbox');
		this.input = checkbox;
		this.input.parent(this.container);
		this.input.style('width', '20px');
		this.input.style('height', '20px');
		this.input.style('cursor', 'pointer');
		this.input.style('margin', '0');
		this.input.style('accent-color', '#2563eb');

		// Create label
		this.label = this.p.createSpan(this.options.label);
		this.label.parent(this.container);
		this.label.style('color', 'white');
		this.label.style('font-size', '14px');
		this.label.style('cursor', 'pointer');
		this.label.style('user-select', 'none');

		// Make label clickable
		this.label.mousePressed(() => {
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

	destroy(): void {
		this.input?.remove();
		this.label?.remove();
		this.container?.remove();
	}
}

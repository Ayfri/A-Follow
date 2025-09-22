import type p5 from 'p5';
import { StorageManager } from '../StorageManager';

export interface ColorConfig {
	label: string;
	defaultValue: string;
	onChange?: (color: string) => void;
	storageKey?: string; // Optional key for localStorage saving
}

export class ColorInput {
	private container!: p5.Element;
	private label!: p5.Element;
	private colorInput!: p5.Element;
	private p: p5;
	private config: ColorConfig;

	constructor(p: p5, config: ColorConfig) {
		this.p = p;
		this.config = config;
	}

	init(parent?: p5.Element): void {
		this.createContainer(parent);
		this.createLabel();
		this.createColorInput();
		this.loadFromStorage();
	}

	private createContainer(parent?: p5.Element): void {
		this.container = this.p.createDiv('');
		if (parent) {
			this.container.parent(parent);
		}
		this.container.style('margin-bottom', '15px');
	}

	private createLabel(): void {
		this.label = this.p.createP(this.config.label);
		this.label.parent(this.container);
		this.label.style('margin', '0 0 8px 0');
		this.label.style('font-weight', 'bold');
	}

	private createColorInput(): void {
		this.colorInput = this.p.createColorPicker(this.config.defaultValue);
		this.colorInput.parent(this.container);
		this.colorInput.style('width', '50px');
		this.colorInput.style('height', '30px');
        this.colorInput.style('border', 'none');
		this.colorInput.style('border-radius', '8px');
        this.colorInput.style('cursor', 'pointer');
        this.colorInput.style('padding', '0');
        this.colorInput.style('background', 'none');

		queueMicrotask(() => {
			this.colorInput.value(this.config.defaultValue);
		});

		(this.colorInput as any).input(() => {
			const color = this.getValue();
			this.saveToStorage(color);
			this.config.onChange?.(color);
		});
	}

	private loadFromStorage(): void {
		if (this.config.storageKey) {
			const savedValue = StorageManager.load(this.config.storageKey, this.config.defaultValue);
			this.setValue(savedValue);
			this.config.onChange?.(savedValue);
		}
	}

	private saveToStorage(color: string): void {
		if (this.config.storageKey) {
			StorageManager.save(this.config.storageKey, color);
		}
	}

	getValue(): string {
		return this.colorInput.value() as string;
	}

	setValue(color: string): void {
		this.colorInput.value(color);
	}

	destroy(): void {
		this.container?.remove();
	}
}
import type p5 from 'p5';

export interface ColorConfig {
	label: string;
	defaultValue: string;
	onChange?: (color: string) => void;
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

		// Ensure the default value is set with a small delay
		queueMicrotask(() => {
			(this.colorInput as any).value(this.config.defaultValue);
		});

		// Trigger callback when color changes
		(this.colorInput as any).input(() => {
			const color = this.getValue();
			if (this.config.onChange) {
				this.config.onChange(color);
			}
		});
	}

	getValue(): string {
		return (this.colorInput as any).value() as string;
	}

	setValue(color: string): void {
		(this.colorInput as any).value(color);
	}

	destroy(): void {
		if (this.container) {
			this.container.remove();
		}
	}
}
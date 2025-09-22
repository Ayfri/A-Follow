import type p5 from 'p5';

export interface SliderConfig {
	label: string;
	min: number;
	max: number;
	defaultValue: number;
	step?: number;
	onChange?: (value: number) => void;
}

export class Slider {
	private container!: p5.Element;
	private label!: p5.Element;
	private slider!: p5.Element;
	private p: p5;
	private config: SliderConfig;

	constructor(p: p5, config: SliderConfig) {
		this.p = p;
		this.config = config;
	}

	init(parent?: p5.Element): void {
		this.createContainer(parent);
		this.createLabel();
		this.createSlider();
	}

	private createContainer(parent?: p5.Element): void {
		this.container = this.p.createDiv('');
		if (parent) {
			this.container.parent(parent);
		}
		this.container.style('margin-bottom', '15px');
	}

	private createLabel(): void {
		const labelText = `${this.config.label}: ${this.config.defaultValue}`;
		this.label = this.p.createP(labelText);
		this.label.parent(this.container);
		this.label.style('margin', '0 0 8px 0');
		this.label.style('font-weight', 'bold');
	}

	private createSlider(): void {
		const step = this.config.step || 1;
		this.slider = this.p.createSlider(
			this.config.min,
			this.config.max,
			this.config.defaultValue,
			step
		);
		this.slider.parent(this.container);
		this.slider.style('width', '200px');

		// Update label and trigger callback when slider changes
		(this.slider as any).input(() => {
			const value = this.getValue();
			this.updateLabel(value);
			if (this.config.onChange) {
				this.config.onChange(value);
			}
		});
	}

	private updateLabel(value: number): void {
		this.label.html(`${this.config.label}: ${value}`);
	}

	getValue(): number {
		return (this.slider as any).value() as number;
	}

	setValue(value: number): void {
		(this.slider as any).value(value);
		this.updateLabel(value);
	}

	destroy(): void {
		if (this.container) {
			this.container.remove();
		}
	}
}
import { Field, type FieldOptions } from './Field';

export type RangeFieldOptions = FieldOptions<number> & {
	min: number;
	max: number;
	step: number;
	format?: (value: number) => string;
};

export class RangeField extends Field<number> {
	private readonly output: HTMLOutputElement;
	private readonly min: number;
	private readonly max: number;
	private readonly format: (value: number) => string;

	constructor(options: RangeFieldOptions) {
		super(options, 'range');
		this.min = options.min;
		this.max = options.max;
		this.format = options.format ?? String;
		Object.assign(this.input, { min: String(options.min), max: String(options.max), step: String(options.step) });
		this.output = Object.assign(document.createElement('output'), { className: 'field__value' });
		this.output.htmlFor.add(this.input.id);
		this.label.after(this.output);
		this.restore();
	}

	get value(): number {
		return this.input.valueAsNumber;
	}

	set value(value: number) {
		this.input.value = String(value);
		const applied = this.input.valueAsNumber;
		const text = this.format(applied);
		this.output.value = text;
		this.input.ariaValueText = text;
		this.input.style.setProperty('--fill', `${(applied - this.min) / (this.max - this.min) * 100}%`);
	}
}

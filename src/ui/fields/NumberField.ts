import { Field, type FieldOptions } from './Field';

export type NumberFieldOptions = FieldOptions<number> & {
	min: number;
	max: number;
};

/** An integer input saved on `change`. A value is floored and clamped to the range, and an empty or unreadable entry keeps the previous value. */
export class NumberField extends Field<number> {
	private readonly min: number;
	private readonly max: number;
	private current: number;

	constructor(options: NumberFieldOptions) {
		super(options, 'number');
		this.min = options.min;
		this.max = options.max;
		this.current = options.min;
		Object.assign(this.input, { min: String(options.min), max: String(options.max), step: '1' });
		this.restore();
	}

	get value(): number {
		return this.normalize(this.input.valueAsNumber);
	}

	set value(value: number) {
		this.current = this.normalize(value);
		this.input.value = String(this.current);
	}

	private normalize(value: number): number {
		return Number.isNaN(value) ? this.current : Math.min(this.max, Math.max(this.min, Math.floor(value)));
	}
}

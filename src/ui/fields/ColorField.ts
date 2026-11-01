import { Field, type FieldOptions } from './Field';

export class ColorField extends Field<string> {
	constructor(options: FieldOptions<string>) {
		super(options, 'color');
		this.restore();
	}

	get value(): string {
		return this.input.value;
	}

	set value(value: string) {
		this.input.value = value;
	}
}

import { Field, type FieldOptions } from './Field';

export class ToggleField extends Field<boolean> {
	constructor(options: FieldOptions<boolean>) {
		super(options, 'checkbox');
		this.input.role = 'switch';
		this.restore();
	}

	get value(): boolean {
		return this.input.checked;
	}

	set value(value: boolean) {
		this.input.checked = value;
	}
}

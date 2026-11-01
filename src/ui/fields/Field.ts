import type { Setting } from '../../utils/Setting';

type Primitive = string | number | boolean;

export type FieldOptions<T extends Primitive> = {
	label: string;
	onChange?: (value: T) => void;
} & ({ setting: Setting<T> } | { initial: T });

type InputType = 'range' | 'checkbox' | 'color';

/** A labelled input that mirrors one value. Subclasses own the control details; `restore()` must be their constructor's last call. */
export abstract class Field<T extends Primitive> {
	private static nextId = 0;
	readonly element: HTMLDivElement;
	readonly input: HTMLInputElement;
	protected readonly label: HTMLLabelElement;
	private readonly options: FieldOptions<T>;

	protected constructor(options: FieldOptions<T>, type: InputType) {
		this.options = options;
		this.input = Object.assign(document.createElement('input'), {
			type,
			id: `field-${Field.nextId++}`,
			className: 'field__input'
		});
		this.label = Object.assign(document.createElement('label'), {
			className: 'field__label',
			htmlFor: this.input.id,
			textContent: options.label
		});
		this.element = Object.assign(document.createElement('div'), {
			className: `field field--${type === 'checkbox' ? 'toggle' : type}`
		});
		this.element.append(this.label, this.input);

		const live = type === 'range' || type === 'color';
		this.input.addEventListener(live ? 'input' : 'change', () => this.apply(this.value));
	}

	abstract get value(): T;

	/** Writes the control only: no save, no onChange. Used for values coming from the app (animated zoom). */
	abstract set value(value: T);

	/** Writes, saves and calls onChange, exactly like a user edit. The value is read back, so browser clamping is what gets saved. */
	apply(value: T): void {
		this.value = value;
		const applied = this.value;
		if ('setting' in this.options) this.options.setting.save(applied);
		this.options.onChange?.(applied);
	}

	/** Loads the saved value (or the initial one) into the control. The value setter uses subclass elements, which don't exist during super(). */
	protected restore(): void {
		if ('setting' in this.options) {
			this.value = this.options.setting.load();
			this.options.onChange?.(this.value);
		} else {
			this.value = this.options.initial;
		}
	}
}

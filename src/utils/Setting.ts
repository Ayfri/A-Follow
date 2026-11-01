/** One value in localStorage as JSON under `a-follow-<key>`. The prefix and the JSON encoding are fixed so saved settings keep loading. */
export class Setting<T extends string | number | boolean> {
	private static readonly PREFIX = 'a-follow-';
	readonly key: string;
	readonly fallback: T;
	private readonly isValid: (value: unknown) => value is T;

	constructor(key: string, fallback: T, isValid: (value: unknown) => value is T) {
		this.key = key;
		this.fallback = fallback;
		this.isValid = isValid;
	}

	static number(key: string, fallback: number): Setting<number> {
		return new Setting(key, fallback, (value): value is number => typeof value === 'number' && Number.isFinite(value));
	}

	static boolean(key: string, fallback: boolean): Setting<boolean> {
		return new Setting(key, fallback, (value): value is boolean => typeof value === 'boolean');
	}

	static color(key: string, fallback: string): Setting<string> {
		return new Setting(key, fallback, (value): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
	}

	/** A missing key, invalid JSON, a value of the wrong type or an unavailable storage all give the fallback. */
	load(): T {
		try {
			const stored = localStorage.getItem(Setting.PREFIX + this.key);
			if (stored === null) return this.fallback;
			const value: unknown = JSON.parse(stored);
			return this.isValid(value) ? value : this.fallback;
		} catch (error) {
			console.warn(`Error loading ${this.key}:`, error);
			return this.fallback;
		}
	}

	save(value: T): void {
		try {
			localStorage.setItem(Setting.PREFIX + this.key, JSON.stringify(value));
		} catch (error) {
			console.warn(`Error saving ${this.key}:`, error);
		}
	}
}

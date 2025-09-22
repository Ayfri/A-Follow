/**
 * Centralized manager for saving and loading data in localStorage
 * Uses p5.js storeItem() and getItem() functions for data persistence
 */
export class StorageManager {
	private static readonly PREFIX = 'a-follow-';

	/**
	 * Saves a value in localStorage with a prefix to avoid conflicts
	 * @param key - Unique key to identify the value
	 * @param value - Value to save (string, number, or boolean)
	 */
	static save(key: string, value: string | number | boolean): void {
		try {
			const fullKey = this.PREFIX + key;
			localStorage.setItem(fullKey, JSON.stringify(value));
		} catch (error) {
			console.warn(`Error saving ${key}:`, error);
		}
	}

	/**
	 * Loads a value from localStorage
	 * @param key - Unique key to identify the value
	 * @param defaultValue - Default value if the key doesn't exist
	 * @returns The loaded value or the default value
	 */
	static load<T extends string | number | boolean>(key: string, defaultValue: T): T {
		try {
			const fullKey = this.PREFIX + key;
			const storedValue = localStorage.getItem(fullKey);
			
			if (storedValue === null) {
				return defaultValue;
			}
			
			return JSON.parse(storedValue) as T;
		} catch (error) {
			console.warn(`Error loading ${key}:`, error);
			return defaultValue;
		}
	}

	/**
	 * Removes a value from localStorage
	 * @param key - Unique key to identify the value to remove
	 */
	static remove(key: string): void {
		try {
			const fullKey = this.PREFIX + key;
			localStorage.removeItem(fullKey);
		} catch (error) {
			console.warn(`Error removing ${key}:`, error);
		}
	}

	/**
	 * Removes all application data from localStorage
	 */
	static clearAll(): void {
		try {
			const keys = Object.keys(localStorage);
			keys.forEach(key => {
				if (key.startsWith(this.PREFIX)) {
					localStorage.removeItem(key);
				}
			});
		} catch (error) {
			console.warn('Error clearing all data:', error);
		}
	}
}
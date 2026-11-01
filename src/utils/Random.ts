export class Rng {
	private state: number;

	constructor(seed: number) {
		this.state = seed >>> 0;
	}

	random(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let z = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
		z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
		return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
	}

	static randomSeed(): number {
		return (Math.random() * 0xffffffff) >>> 0;
	}
}

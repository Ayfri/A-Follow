export interface TabSpec {
	label: string;
	content: readonly Node[];
}

/** Accessible tab list (roving tabindex, arrow keys, Home and End) with one panel per tab. */
export class Tabs<Id extends string> {
	readonly list: HTMLDivElement;
	readonly panels: HTMLDivElement;
	private readonly ids: Id[];
	private readonly parts = new Map<Id, { tab: HTMLButtonElement; panel: HTMLDivElement }>();

	constructor(specs: Readonly<Record<Id, TabSpec>>, initial: Id) {
		this.ids = Object.keys(specs) as Id[];
		this.list = Object.assign(document.createElement('div'), {
			className: 'tabs',
			role: 'tablist',
			ariaLabel: 'Settings sections'
		});
		this.panels = document.createElement('div');

		for (const id of this.ids) {
			const tab = Object.assign(document.createElement('button'), {
				type: 'button',
				className: 'tabs__tab',
				id: `tab-${id}`,
				role: 'tab',
				textContent: specs[id].label
			});
			tab.setAttribute('aria-controls', `panel-${id}`);
			tab.addEventListener('click', () => this.select(id));

			const panel = Object.assign(document.createElement('div'), {
				className: 'tabs__panel',
				id: `panel-${id}`,
				role: 'tabpanel'
			});
			panel.setAttribute('aria-labelledby', tab.id);
			panel.append(...specs[id].content);

			this.parts.set(id, { tab, panel });
			this.list.append(tab);
			this.panels.append(panel);
		}

		this.list.addEventListener('keydown', (event) => this.onKeyDown(event));
		this.select(initial);
	}

	select(id: Id, focus = false): void {
		for (const [other, { tab, panel }] of this.parts) {
			const selected = other === id;
			tab.ariaSelected = String(selected);
			tab.tabIndex = selected ? 0 : -1;
			panel.hidden = !selected;
			if (selected && focus) tab.focus();
		}
	}

	private onKeyDown(event: KeyboardEvent): void {
		const current = this.ids.findIndex((id) => this.parts.get(id)?.tab.ariaSelected === 'true');
		const last = this.ids.length - 1;
		const target = new Map([
			['ArrowLeft', current === 0 ? last : current - 1],
			['ArrowRight', current === last ? 0 : current + 1],
			['Home', 0],
			['End', last]
		]).get(event.key);
		if (target === undefined) return;

		event.preventDefault();
		this.select(this.ids[target], true);
	}
}

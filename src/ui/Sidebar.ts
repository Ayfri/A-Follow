import { ChevronLeft, ChevronRight, Dices, Eraser, type IconNode, LocateFixed, Route, Shuffle } from 'lucide';
import { Camera } from '../core/Camera';
import type { Generation } from '../core/pathMessages';
import type { PathPreview } from '../core/PathPreview';
import type { Player } from '../core/Player';
import type { ColorTheme } from '../core/Theme';
import type { WallGrid } from '../core/WallGrid';
import type { World } from '../core/World';
import { Setting } from '../utils/Setting';
import { Button } from './Button';
import { ColorField } from './fields/ColorField';
import { NumberField } from './fields/NumberField';
import { RangeField } from './fields/RangeField';
import { ToggleField } from './fields/ToggleField';
import { Tabs } from './Tabs';

export interface SidebarHost {
	readonly grid: WallGrid;
	readonly camera: Camera;
	readonly player: Player;
	readonly theme: ColorTheme;
	readonly preview: PathPreview;
}

const SPEED_STEPS = 40;
const MAX_SPEED = 5000;

/**
 * Speed is stored as a step index 1..40 on a log scale from 1 to 5000 cells/s, so every range of speeds is easy to reach.
 * The key differs from the earlier base-200 scale (`player-speed-log`), whose saved indexes would map to other speeds here.
 */
const speedFromIndex = (index: number): number => MAX_SPEED ** ((index - 1) / (SPEED_STEPS - 1));
const indexFromSpeed = (speed: number): number => Math.round(Math.log(speed) / Math.log(MAX_SPEED) * (SPEED_STEPS - 1) + 1);

const formatSpeed = (index: number): string => {
	const speed = speedFromIndex(index);
	const text = speed < 10 ? speed.toFixed(1) : speed < 1000 ? speed.toFixed(0) : `${(speed / 1000).toFixed(1)}k`;
	return `${text} cells/s`;
};

interface ThemeColor {
	key: keyof ColorTheme;
	storage: string;
	label: string;
}

/** The storage key `background` predates the terrain colors: the background is now the ground color, and keeps its saved value. */
const THEME_COLORS: readonly ThemeColor[] = [
	{ key: 'background', storage: 'background', label: 'Ground (background)' },
	{ key: 'wall', storage: 'wall', label: 'Wall' },
	{ key: 'path', storage: 'path', label: 'Path' },
	{ key: 'grid', storage: 'grid', label: 'Grid Lines' },
	{ key: 'player', storage: 'player', label: 'Player' }
];

const TERRAIN_COLORS: readonly ThemeColor[] = [
	{ key: 'street', storage: 'street', label: 'Street' },
	{ key: 'avenue', storage: 'avenue', label: 'Avenue' },
	{ key: 'highway', storage: 'highway', label: 'Highway' },
	{ key: 'bridge', storage: 'bridge', label: 'Bridge' },
	{ key: 'plaza', storage: 'plaza', label: 'Plaza' },
	{ key: 'park', storage: 'park', label: 'Park' },
	{ key: 'field', storage: 'field', label: 'Field' },
	{ key: 'forest', storage: 'forest', label: 'Forest' },
	{ key: 'building', storage: 'building', label: 'Building' },
	{ key: 'water', storage: 'water', label: 'Water' },
	{ key: 'sand', storage: 'sand', label: 'Sand' },
	{ key: 'marsh', storage: 'marsh', label: 'Marsh' },
	{ key: 'rock', storage: 'rock', label: 'Rock' },
	{ key: 'snow', storage: 'snow', label: 'Snow' },
	{ key: 'hill', storage: 'hill', label: 'Hill' },
	{ key: 'meadow', storage: 'meadow', label: 'Meadow' },
	{ key: 'orchard', storage: 'orchard', label: 'Orchard' },
	{ key: 'pine', storage: 'pine', label: 'Pine Forest' },
	{ key: 'rampart', storage: 'rampart', label: 'Rampart' }
];

const MAX_SEED = 2 ** 32 - 1;

const HINTS: readonly (readonly [keys: readonly string[], action: string])[] = [
	[['B'], 'Toggle build mode'],
	[['Left drag'], 'Draw walls, or pan when not building'],
	[['Right drag'], 'Erase your walls'],
	[['Shift + drag'], 'Straight line'],
	[['Middle drag', 'Space + drag', 'Arrows'], 'Pan'],
	[['Wheel'], 'Zoom']
];

const TAB_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);
const RANGE_KEYS: ReadonlySet<string> = new Set([...TAB_KEYS, 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']);
const ACTIVATION_KEYS: ReadonlySet<string> = new Set([' ', 'Enter']);

/**
 * A control keeps only the keys it uses (sliders: arrows and paging, switches and buttons: Space and Enter), the rest reaches p5.
 * A number input keeps every key: digits, arrows and Backspace edit the value, and none of them may pan or toggle build mode.
 */
const consumed = ({ target, key }: KeyboardEvent): boolean => {
	if (target instanceof HTMLInputElement) {
		if (target.type === 'number') return true;
		return (target.type === 'range' ? RANGE_KEYS : ACTIVATION_KEYS).has(key);
	}
	if (target instanceof HTMLButtonElement) return ACTIVATION_KEYS.has(key) || (target.role === 'tab' && TAB_KEYS.has(key));
	return false;
};

export class Sidebar {
	readonly element: HTMLElement;
	private readonly host: SidebarHost;
	private readonly buildToggle: ToggleField;
	private readonly gridToggle: ToggleField;
	private readonly snapToggle: ToggleField;
	private readonly cityToggle: ToggleField;
	private readonly seedField: NumberField;
	private readonly zoom: RangeField;
	private readonly collapseButton: Button;
	private readonly inner: HTMLDivElement;
	private readonly generateButtons: Button[] = [];
	private collapsed = false;
	private shownZoom = Number.NaN;
	/** False while the fields restore their saved values: each restore calls `onChange`, which must not reset the world before all of them exist. */
	private ready = false;

	constructor(host: SidebarHost) {
		this.host = host;
		const { camera } = host;

		this.buildToggle = new ToggleField({ label: 'Build', setting: Setting.boolean('build-mode', true) });
		this.gridToggle = new ToggleField({ label: 'Show grid lines', setting: Setting.boolean('show-grid-color', true) });
		this.snapToggle = new ToggleField({ label: 'Snap to nearest tile', setting: Setting.boolean('snap-to-nearest-tile', false) });
		this.cityToggle = new ToggleField({ label: 'City', setting: Setting.boolean('world-city', true), onChange: () => this.applyWorld() });
		this.seedField = new NumberField({
			label: 'Seed',
			setting: Setting.number('world-seed', 1),
			min: 0,
			max: MAX_SEED,
			onChange: () => this.applyWorld()
		});
		this.zoom = new RangeField({
			label: 'Zoom',
			initial: 100,
			min: Camera.MIN_ZOOM * 100,
			max: Camera.MAX_ZOOM * 100,
			step: 1,
			format: (value) => `${value}%`,
			onChange: (value) => camera.setZoom(value / 100)
		});
		this.collapseButton = new Button('Collapse panel', () => this.toggleCollapse(), { icon: ChevronLeft, iconOnly: true });
		this.collapseButton.element.classList.add('sidebar__toggle');
		this.collapseButton.element.ariaExpanded = 'true';
		this.collapseButton.element.setAttribute('aria-controls', 'sidebar-inner');

		const tabs = new Tabs<'general' | 'theme'>({
			general: { label: 'General', content: this.buildGeneral() },
			theme: { label: 'Theme', content: this.buildTheme() }
		}, 'general');

		this.inner = Object.assign(document.createElement('div'), { className: 'sidebar__inner', id: 'sidebar-inner' });
		const header = Object.assign(document.createElement('header'), { className: 'sidebar__header' });
		const body = Object.assign(document.createElement('div'), { className: 'sidebar__body' });
		header.append(tabs.list);
		body.append(tabs.panels);
		this.inner.append(header, body);

		this.element = Object.assign(document.createElement('aside'), { className: 'sidebar', ariaLabel: 'Settings' });
		this.element.append(this.collapseButton.element, this.inner);
		this.isolateEvents();
		this.sync();

		/** The app starts in the saved world: one reset after every field restored, then the view opens on the player. */
		this.ready = true;
		this.applyWorld();
		const { x, y } = host.player.getPosition();
		camera.centerOn(x, y);
	}

	get build(): boolean {
		return this.buildToggle.value;
	}

	get showGrid(): boolean {
		return this.gridToggle.value;
	}

	get snapToNearest(): boolean {
		return this.snapToggle.value;
	}

	toggleBuild(): void {
		this.buildToggle.apply(!this.buildToggle.value);
	}

	/** Call once per frame: mirrors the animated zoom into the zoom field, touching the DOM only when the shown percentage changes. */
	sync(): void {
		const percent = Math.round(this.host.camera.zoom * 100);
		if (percent === this.shownZoom) return;
		this.shownZoom = percent;
		this.zoom.value = percent;
	}

	static section(title: string, ...children: Node[]): HTMLElement {
		const section = Object.assign(document.createElement('section'), { className: 'section' });
		section.append(Object.assign(document.createElement('h3'), { className: 'section__title', textContent: title }), ...children);
		return section;
	}

	private buildGeneral(): Node[] {
		const { grid, camera, player, preview } = this.host;

		const speed = new RangeField({
			label: 'Speed',
			setting: Setting.number('player-speed-step', indexFromSpeed(player.getSpeed())),
			min: 1,
			max: SPEED_STEPS,
			step: 1,
			format: formatSpeed,
			onChange: (index) => player.setSpeed(speedFromIndex(index))
		});
		const cellSize = new RangeField({
			label: 'Cell Size',
			setting: Setting.number('grid-size', camera.cellSize),
			min: 3,
			max: 60,
			step: 1,
			format: (value) => `${value} px`,
			onChange: (size) => camera.setCellSize(size)
		});
		const probability = new RangeField({
			label: 'Wall Probability',
			setting: Setting.number('random-grid-probability', 0.2),
			min: 0.05,
			max: 0.6,
			step: 0.025,
			format: (value) => `${+(value * 100).toFixed(1)}%`
		});
		const resetView = new Button('Reset view', () => {
			const { x, y } = player.getPosition();
			camera.centerOn(x, y);
		}, { icon: LocateFixed });

		const hints = Object.assign(document.createElement('dl'), { className: 'hints' });
		for (const [keys, action] of HINTS) {
			const term = document.createElement('dt');
			term.append(...keys.map((key) => Object.assign(document.createElement('kbd'), { textContent: key })));
			const row = Object.assign(document.createElement('div'), { className: 'hints__row' });
			row.append(term, Object.assign(document.createElement('dd'), { textContent: action }));
			hints.append(row);
		}

		return [
			Sidebar.section('Mode', this.buildToggle.element, hints),
			Sidebar.section('Player', speed.element),
			Sidebar.section('Grid', cellSize.element, this.gridToggle.element, this.snapToggle.element),
			Sidebar.section('World',
				this.cityToggle.element,
				this.seedField.element,
				new Button('New seed', () => this.seedField.apply(crypto.getRandomValues(new Uint32Array(1))[0]), { icon: Dices }).element
			),
			Sidebar.section('Maze',
				this.generateButton('Generate Maze', Route, () => ({ kind: 'maze' })).element,
				probability.element,
				this.generateButton('Random Grid', Shuffle, () => ({ kind: 'random', probability: probability.value })).element,
				new Button('Clear', () => { preview.cancelGeneration(); grid.clear(); }, { icon: Eraser }).element
			),
			Sidebar.section('Camera', this.zoom.element, resetView.element)
		];
	}

	/**
	 * Drops every edit and switches the grid to the city of the seed field, or to the empty world when City is off.
	 * Nothing happens when the grid already holds that world: the seed field keeps changing with City off, and that must not wipe the walls.
	 */
	private applyWorld(): void {
		if (!this.ready) return;
		const world: World = this.cityToggle.value ? { kind: 'city', seed: this.seedField.value } : { kind: 'empty' };
		const current = this.host.grid.world;
		if (current.kind === world.kind && (current.kind === 'empty' || (world.kind === 'city' && current.seed === world.seed))) return;
		this.host.preview.setWorld(world, this.host.player);
	}

	/** Both generate buttons are disabled while a fill is pending, so a second click can't replace the first one mid-way. */
	private generateButton(label: string, icon: IconNode, generation: () => Generation): Button {
		const button = new Button(label, async () => {
			for (const other of this.generateButtons) other.element.disabled = true;
			try {
				await this.host.preview.generate(this.host.camera.visibleRect(), generation());
			} finally {
				for (const other of this.generateButtons) other.element.disabled = false;
			}
		}, { icon });
		this.generateButtons.push(button);
		return button;
	}

	private buildTheme(): Node[] {
		const { theme } = this.host;
		const section = (title: string, colors: readonly ThemeColor[]): HTMLElement => Sidebar.section(title, ...colors.map(({ key, storage, label }) => new ColorField({
			label,
			setting: Setting.color(`${storage}-color`, theme[key]),
			onChange: (color) => { theme[key] = color; }
		}).element));
		return [section('Theme Colors', THEME_COLORS), section('Terrain Colors', TERRAIN_COLORS)];
	}

	private toggleCollapse(): void {
		this.collapsed = !this.collapsed;
		this.element.classList.toggle('sidebar--collapsed', this.collapsed);
		this.inner.inert = this.collapsed;
		this.collapseButton.element.ariaExpanded = String(!this.collapsed);
		if (this.collapsed) this.collapseButton.setLabel('Expand panel', ChevronRight);
		else this.collapseButton.setLabel('Collapse panel', ChevronLeft);
	}

	/**
	 * p5 listens on `window` for pointerdown, pointermove, click, dblclick, wheel and dragover (node_modules/p5/dist/events/pointer.js:9-25)
	 * and calls mousePressed without checking the target, so the panel stops them before they bubble up.
	 * pointerup, pointercancel, dragend and keyup are never stopped: p5 must see every release, or the mouse button and
	 * Shift (keyboard.js:24-36 listens on window too) stay stuck as pressed.
	 */
	private isolateEvents(): void {
		const stop = (event: Event): void => event.stopPropagation();
		for (const type of ['pointerdown', 'pointermove', 'click', 'dblclick', 'dragover']) this.element.addEventListener(type, stop);
		this.element.addEventListener('wheel', stop, { passive: true });
		for (const type of ['keydown', 'keypress'] as const) {
			this.element.addEventListener(type, (event) => { if (consumed(event)) event.stopPropagation(); });
		}
	}
}

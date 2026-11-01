import { ChevronLeft, ChevronRight, createElement, Dices, type IconNode, Zap } from 'lucide';
import type p5 from 'p5';
import type { Camera } from '../core/Camera';
import type { Grid, WorldMapColors } from '../core/Grid';
import type { Player } from '../core/Player';
import type { ColorTheme } from '../core/Theme';
import { DEFAULT_LAYERS, type WorldGenOptions, type WorldLayer } from '../generators/WorldMapGenerator';
import { Rng } from '../utils/Rng';
import { StorageManager } from '../utils/StorageManager';
import { Checkbox } from './inputs/Checkbox';
import { ColorInput } from './inputs/ColorInput';
import { Slider } from './inputs/Slider';
import { TextInput } from './inputs/TextInput';

const ICON_ATTRS = { width: 14, height: 14 };

type Tab = 'general' | 'map' | 'generation' | 'terrain' | 'theme';

type RegenMap = (seed: number, enable: WorldGenOptions['enable'], multiplier: number) => void;

export class Sidebar {
	// Public state consumed by main.ts
	public showGridColor = true;
	public snapToNearest = false;

	private p: p5;
	private player: Player;
	private grid: Grid;
	private camera: Camera;
	private theme: ColorTheme;
	private onRegenMap: RegenMap;
	private onToggleMapMode: (enabled: boolean) => void;

	private container!: p5.Element;
	private tabBar!: p5.Element;
	private contentArea!: p5.Element;
	private collapseBtn!: p5.Element;
	private isCollapsed = false;
	private tabPanes: Partial<Record<Tab, p5.Element>> = {};

	// Map tab
	private zoomSlider!: Slider;

	// Generation tab
	private seedInput!: TextInput;
	private readonly layerToggles = new Map<WorldLayer, Checkbox>();
	private worldMultiplier = 3;

	constructor(
		p: p5,
		player: Player,
		grid: Grid,
		camera: Camera,
		theme: ColorTheme,
		onRegenMap: RegenMap,
		onToggleMapMode: (enabled: boolean) => void
	) {
		this.p = p;
		this.player = player;
		this.grid = grid;
		this.camera = camera;
		this.theme = theme;
		this.onRegenMap = onRegenMap;
		this.onToggleMapMode = onToggleMapMode;
	}

	init(): void {
		this.buildShell();
		this.buildTabBar();
		this.buildAllPanes();
		this.showTab('general');
	}

	// ─── Shell ───────────────────────────────────────────────────────────────

	private buildShell(): void {
		this.container = this.p.createDiv('');
		this.container.style('position', 'fixed');
		this.container.style('top', '0');
		this.container.style('left', '0');
		this.container.style('height', '100vh');
		this.container.style('width', '300px');
		this.container.style('background', 'rgba(15, 15, 20, 0.92)');
		this.container.style('backdrop-filter', 'blur(6px)');
		this.container.style('display', 'flex');
		this.container.style('flex-direction', 'column');
		this.container.style('z-index', '1000');
		this.container.style('font-family', 'system-ui, sans-serif');
		this.container.style('font-size', '13px');
		this.container.style('color', 'white');
		this.container.style('border-right', '1px solid rgba(255,255,255,0.08)');
		this.container.style('transition', 'width 0.2s ease');

		// Prevent canvas events from bleeding through the sidebar
		this.container.elt.addEventListener('mousedown', (e: Event) => e.stopPropagation());
		this.container.elt.addEventListener('wheel', (e: Event) => e.stopPropagation());

		// Collapse toggle button (top-right corner)
		this.collapseBtn = this.p.createDiv('');
		this.collapseBtn.parent(this.container);
		this.collapseBtn.style('position', 'absolute');
		this.collapseBtn.style('top', '8px');
		this.collapseBtn.style('right', '-14px');
		this.collapseBtn.style('width', '28px');
		this.collapseBtn.style('height', '28px');
		this.collapseBtn.style('background', 'rgba(30,30,40,0.95)');
		this.collapseBtn.style('border', '1px solid rgba(255,255,255,0.12)');
		this.collapseBtn.style('border-radius', '0 6px 6px 0');
		this.collapseBtn.style('cursor', 'pointer');
		this.collapseBtn.style('display', 'flex');
		this.collapseBtn.style('align-items', 'center');
		this.collapseBtn.style('justify-content', 'center');
		this.collapseBtn.style('z-index', '1001');
		this.collapseBtn.elt.append(createElement(ChevronLeft, ICON_ATTRS));
		this.collapseBtn.elt.addEventListener('click', () => this.toggleCollapse());

		// Tab bar header
		this.tabBar = this.p.createDiv('');
		this.tabBar.parent(this.container);
		this.tabBar.style('display', 'flex');
		this.tabBar.style('gap', '4px');
		this.tabBar.style('padding', '10px 10px 0');
		this.tabBar.style('flex-shrink', '0');
		this.tabBar.style('flex-wrap', 'wrap');

		// Scrollable content area
		this.contentArea = this.p.createDiv('');
		this.contentArea.parent(this.container);
		this.contentArea.style('flex', '1');
		this.contentArea.style('overflow-y', 'auto');
		this.contentArea.style('padding', '14px 14px 20px');
		this.contentArea.style('scrollbar-width', 'thin');
		this.contentArea.style('scrollbar-color', 'rgba(255,255,255,0.15) transparent');
	}

	// ─── Tab bar ─────────────────────────────────────────────────────────────

	private readonly TAB_LABELS: Record<Tab, string> = {
		general: 'General',
		map: 'Map',
		generation: 'Gen',
		terrain: 'Terrain',
		theme: 'Theme',
	};

	private buildTabBar(): void {
		for (const id of Object.keys(this.TAB_LABELS) as Tab[]) {
			const btn = this.p.createDiv(this.TAB_LABELS[id]);
			btn.parent(this.tabBar);
			btn.attribute('data-tab', id);
			this.styleTabButton(btn, false);
			btn.elt.addEventListener('click', () => this.showTab(id));
		}
	}

	private styleTabButton(btn: p5.Element, active: boolean): void {
		btn.style('padding', '5px 10px');
		btn.style('border-radius', '6px');
		btn.style('cursor', 'pointer');
		btn.style('font-size', '12px');
		btn.style('font-weight', active ? 'bold' : 'normal');
		btn.style('background', active ? '#2563eb' : 'rgba(255,255,255,0.07)');
		btn.style('color', 'white');
		btn.style('user-select', 'none');
		btn.style('white-space', 'nowrap');
	}

	private showTab(tab: Tab): void {
		// Update tab button styles via direct DOM
		const btns = this.tabBar.elt.querySelectorAll<HTMLElement>('[data-tab]');
		btns.forEach((btn) => {
			const isActive = btn.dataset.tab === tab;
			btn.style.fontWeight = isActive ? 'bold' : 'normal';
			btn.style.background = isActive ? '#2563eb' : 'rgba(255,255,255,0.07)';
		});
		// Show/hide panes
		for (const [id, pane] of Object.entries(this.tabPanes)) {
			if (pane) pane.style('display', id === tab ? 'block' : 'none');
		}
	}

	// ─── Pane builder helpers ─────────────────────────────────────────────────

	private createPane(tab: Tab): p5.Element {
		const pane = this.p.createDiv('');
		pane.parent(this.contentArea);
		pane.style('display', 'none');
		this.tabPanes[tab] = pane;
		return pane;
	}

	private sectionTitle(parent: p5.Element, text: string): void {
		const h = this.p.createElement('h3', text);
		h.parent(parent);
		h.style('margin', '0 0 12px 0');
		h.style('font-size', '13px');
		h.style('font-weight', '600');
		h.style('text-transform', 'uppercase');
		h.style('letter-spacing', '0.08em');
		h.style('color', 'rgba(255,255,255,0.45)');
		h.style('border-bottom', '1px solid rgba(255,255,255,0.08)');
		h.style('padding-bottom', '6px');
	}

	private spacer(parent: p5.Element): void {
		const s = this.p.createDiv('');
		s.parent(parent);
		s.style('height', '16px');
	}

	// ─── All panes ────────────────────────────────────────────────────────────

	private buildAllPanes(): void {
		this.buildGeneralPane();
		this.buildMapPane();
		this.buildGenerationPane();
		this.buildTerrainPane();
		this.buildThemePane();
	}

	private buildGeneralPane(): void {
		const pane = this.createPane('general');

		this.sectionTitle(pane, 'Player');
		const speedSlider = new Slider(this.p, {
			label: 'Speed',
			min: 1,
			max: 40,
			defaultValue: Math.round(Math.log(this.player.getSpeed()) / Math.log(200) * 39 + 1),
			step: 1,
			storageKey: 'player-speed-log',
			valueFormatter: (v) => v.toFixed(1),
			onChange: (v) => {
				const speed = Math.pow(200, (v - 1) / 39);
				this.player.setSpeed(speed);
			}
		});
		speedSlider.init(pane);

		this.spacer(pane);
		this.sectionTitle(pane, 'Grid');

		const gridSizeSlider = new Slider(this.p, {
			label: 'Cell Size',
			min: 3,
			max: 60,
			defaultValue: this.grid.getCellSize(),
			step: 1,
			storageKey: 'grid-size',
			onChange: (size) => {
				this.grid.setCellSize(size);
				this.grid.init(this.p.width, this.p.height);
				this.player.init(this.grid);
			}
		});
		gridSizeSlider.init(pane);

		const showGridCheckbox = new Checkbox(this.p, {
			label: 'Show grid lines',
			defaultValue: true,
			storageKey: 'show-grid-color',
			onChange: (v) => { this.showGridColor = v; }
		});
		showGridCheckbox.init(pane);
		this.showGridColor = showGridCheckbox.getValue();

		const snapCheckbox = new Checkbox(this.p, {
			label: 'Snap to nearest tile',
			defaultValue: false,
			storageKey: 'snap-to-nearest-tile',
			onChange: (v) => { this.snapToNearest = v; }
		});
		snapCheckbox.init(pane);
		this.snapToNearest = snapCheckbox.getValue();

		this.spacer(pane);
		this.sectionTitle(pane, 'Maze');

		this.makeBtn(pane, 'Generate Maze', () => this.grid.generateRandomMaze());

		const probSlider = new Slider(this.p, {
			label: 'Wall Probability',
			min: 0.05,
			max: 0.6,
			defaultValue: 0.2,
			step: 0.025,
			storageKey: 'random-grid-probability',
		});
		probSlider.init(pane);

		this.makeBtn(pane, 'Random Grid', () => this.grid.generateRandomGrid(probSlider.getValue()));
	}

	private buildMapPane(): void {
		const pane = this.createPane('map');

		this.sectionTitle(pane, 'Mode');

		const toggleBtn = this.makeBtn(pane, this.grid.isWorldMapMode() ? 'Disable Map Mode' : 'Enable Map Mode', () => {
			const newMode = !this.grid.isWorldMapMode();
			this.onToggleMapMode(newMode);
			toggleBtn.html(newMode ? 'Disable Map Mode' : 'Enable Map Mode');
		});

		this.spacer(pane);
		this.sectionTitle(pane, 'Camera');

		this.zoomSlider = new Slider(this.p, {
			label: 'Zoom',
			min: 25,
			max: 400,
			defaultValue: 100,
			step: 5,
			valueFormatter: (v) => `${v}%`,
			onChange: (v) => {
				if (this.grid.isWorldMapMode()) {
					this.camera.setZoom(v / 100, this.p.width / 2, this.p.height / 2);
				}
			}
		});
		this.zoomSlider.init(pane);

		this.makeBtn(pane, 'Reset Camera', () => {
			if (this.grid.isWorldMapMode()) {
				const pos = this.player.getPosition();
				const worldCenter = this.grid.getCenterPixelFromCell(pos.x, pos.y);
				this.camera.resetTo(worldCenter.x, worldCenter.y);
				this.zoomSlider.setValue(100);
			}
		});

		this.spacer(pane);
		this.sectionTitle(pane, 'Map Controls');

		const info = this.p.createP('Arrow keys / drag: pan\nScroll wheel: zoom\nLeft-click: draw road\nRight-click: erase to plain');
		info.parent(pane);
		info.style('margin', '0');
		info.style('color', 'rgba(255,255,255,0.5)');
		info.style('font-size', '12px');
		info.style('line-height', '1.6');
		info.style('white-space', 'pre-line');
	}

	private buildGenerationPane(): void {
		const pane = this.createPane('generation');

		this.sectionTitle(pane, 'Seed');

		this.seedInput = new TextInput(this.p, {
			label: 'Seed (0 = random)',
			defaultValue: '0',
			placeholder: '0',
			storageKey: 'world-map-seed',
		});
		this.seedInput.init(pane);

		// Dice button (randomize seed)
		const seedRow = this.p.createDiv('');
		seedRow.parent(pane);
		seedRow.style('display', 'flex');
		seedRow.style('gap', '8px');
		seedRow.style('margin-bottom', '16px');

		this.makeInlineBtn(seedRow, 'Random seed', () => {
			const seed = Rng.randomSeed();
			this.seedInput.setValue(String(seed));
			StorageManager.save('world-map-seed', String(seed));
		}, Dices);

		this.spacer(pane);
		this.sectionTitle(pane, 'World Size');

		const sizeSlider = new Slider(this.p, {
			label: 'Size Multiplier',
			min: 1,
			max: 6,
			defaultValue: this.worldMultiplier,
			step: 1,
			storageKey: 'world-size-multiplier',
			valueFormatter: (v) => `${v}×`,
			onChange: (v) => { this.worldMultiplier = v; }
		});
		sizeSlider.init(pane);
		this.worldMultiplier = sizeSlider.getValue();

		this.spacer(pane);
		this.sectionTitle(pane, 'Layers');

		const TOGGLES: { key: WorldLayer; label: string }[] = [
			{ key: 'mountains', label: 'Mountains' },
			{ key: 'hills', label: 'Hills' },
			{ key: 'lakes', label: 'Lakes' },
			{ key: 'rivers', label: 'Rivers' },
			{ key: 'forests', label: 'Forests' },
			{ key: 'cities', label: 'Cities & Roads' },
			{ key: 'villages', label: 'Villages' },
			{ key: 'bridges', label: 'Bridges' },
			{ key: 'coastlines', label: 'Coastlines' },
			{ key: 'sand', label: 'Sand Beaches' },
		];

		for (const { key, label } of TOGGLES) {
			const cb = new Checkbox(this.p, {
				label,
				defaultValue: true,
				storageKey: `gen-layer-${key}`,
			});
			cb.init(pane);
			this.layerToggles.set(key, cb);
		}

		this.spacer(pane);

		this.makeBtn(pane, 'Generate Map', () => {
			this.triggerGenerate();
		}, '#2563eb', Zap);
	}

	private buildTerrainPane(): void {
		const pane = this.createPane('terrain');

		this.sectionTitle(pane, 'Terrain Colors');

		const colors = this.grid.getWorldMapColors();
		const TERRAIN_COLORS: { key: keyof WorldMapColors; label: string }[] = [
			{ key: 'road', label: 'Road' },
			{ key: 'plain', label: 'Plain' },
			{ key: 'mountain', label: 'Mountain' },
			{ key: 'hill', label: 'Hill' },
			{ key: 'forest', label: 'Forest' },
			{ key: 'river', label: 'River / Lake' },
			{ key: 'sand', label: 'Sand Beach' },
			{ key: 'coast', label: 'Coastline' },
			{ key: 'bridge', label: 'Bridge' },
			{ key: 'village', label: 'Village' },
		];

		for (const { key, label } of TERRAIN_COLORS) {
			new ColorInput(this.p, {
				label,
				defaultValue: colors[key],
				storageKey: `world-map-${key}-color`,
				onChange: (color) => {
					this.grid.setWorldMapColors({ [key]: color });
				}
			}).init(pane);
		}
	}

	private buildThemePane(): void {
		const pane = this.createPane('theme');

		this.sectionTitle(pane, 'Theme Colors');

		const THEME_COLORS: { key: keyof ColorTheme; storage: 'bg' | 'wall' | 'path' | 'grid' | 'player'; label: string }[] = [
			{ key: 'background', storage: 'bg', label: 'Background' },
			{ key: 'activeCell', storage: 'wall', label: 'Wall' },
			{ key: 'path', storage: 'path', label: 'Path' },
			{ key: 'grid', storage: 'grid', label: 'Grid Lines' },
			{ key: 'player', storage: 'player', label: 'Player' },
		];

		for (const { key, storage, label } of THEME_COLORS) {
			new ColorInput(this.p, {
				label,
				defaultValue: this.theme[key],
				storageKey: `${storage}-color`,
				onChange: (color) => { this.theme[key] = color; },
			}).init(pane);
		}
	}

	// ─── Private helpers ──────────────────────────────────────────────────────

	private prependIcon(btn: p5.Element, icon: IconNode): void {
		btn.style('display', 'inline-flex');
		btn.style('align-items', 'center');
		btn.style('gap', '6px');
		btn.elt.prepend(createElement(icon, ICON_ATTRS));
	}

	private makeBtn(parent: p5.Element, label: string, onClick: () => void, bg = '#3a3a4a', icon?: IconNode): p5.Element {
		const btn = this.p.createButton(label);
		btn.parent(parent);
		btn.style('width', '100%');
		btn.style('padding', '8px 12px');
		btn.style('margin-bottom', '10px');
		btn.style('border', 'none');
		btn.style('border-radius', '6px');
		btn.style('background', bg);
		btn.style('color', 'white');
		btn.style('cursor', 'pointer');
		btn.style('font-size', '13px');
		btn.style('font-weight', '500');
		btn.style('text-align', 'left');
		if (icon) this.prependIcon(btn, icon);
		btn.elt.addEventListener('click', (e: Event) => { e.stopPropagation(); onClick(); });
		btn.elt.addEventListener('mousedown', (e: Event) => e.stopPropagation());
		return btn;
	}

	private makeInlineBtn(parent: p5.Element, label: string, onClick: () => void, icon?: IconNode): p5.Element {
		const btn = this.p.createButton(label);
		btn.parent(parent);
		btn.style('flex', '1');
		btn.style('padding', '6px 10px');
		btn.style('border', 'none');
		btn.style('border-radius', '6px');
		btn.style('background', '#3a3a4a');
		btn.style('color', 'white');
		btn.style('cursor', 'pointer');
		btn.style('font-size', '12px');
		btn.style('justify-content', 'center');
		if (icon) this.prependIcon(btn, icon);
		btn.elt.addEventListener('click', (e: Event) => { e.stopPropagation(); onClick(); });
		btn.elt.addEventListener('mousedown', (e: Event) => e.stopPropagation());
		return btn;
	}

	private triggerGenerate(): void {
		const enable = { ...DEFAULT_LAYERS };
		for (const [key, cb] of this.layerToggles) enable[key] = cb.getValue();

		const seedStr = this.seedInput.getValue().trim();
		const seed = (seedStr && parseInt(seedStr) !== 0) ? parseInt(seedStr) : 0;
		this.onRegenMap(seed, enable, this.worldMultiplier);
	}

	// ─── Collapse ─────────────────────────────────────────────────────────────

	private toggleCollapse(): void {
		this.isCollapsed = !this.isCollapsed;
		if (this.isCollapsed) {
			this.container.style('width', '0px');
			this.tabBar.style('display', 'none');
			this.contentArea.style('display', 'none');
			this.collapseBtn.elt.replaceChildren(createElement(ChevronRight, ICON_ATTRS));
			this.collapseBtn.style('right', '-28px');
		} else {
			this.container.style('width', '300px');
			this.tabBar.style('display', 'flex');
			this.contentArea.style('display', 'block');
			this.collapseBtn.elt.replaceChildren(createElement(ChevronLeft, ICON_ATTRS));
			this.collapseBtn.style('right', '-14px');
		}
	}

	// ─── Public API ───────────────────────────────────────────────────────────

	/** Update the zoom slider to reflect external camera changes (e.g. scroll wheel) */
	updateZoomDisplay(zoom: number): void {
		this.zoomSlider?.setValue(Math.round(zoom * 100));
	}

	/** Update the displayed seed after generation */
	updateSeedDisplay(seed: number): void {
		this.seedInput?.setValue(String(seed));
		StorageManager.save('world-map-seed', String(seed));
	}
}


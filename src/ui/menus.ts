import type { DataAct } from '../debug/hooks';
import type { CrashCause, RunResult, SaveData } from '../game/types';
import { actButton, el, hasKeyboard, num, stopOnButtons } from './hud';
import { coinNode, iconNode, type IconName } from './icons';

/** Mounts a panel's content into its body element. Called every time the panel opens, with an empty body. */
export type PanelMount = (panel: HTMLElement) => void;

/** Where the menus read the save: the best score, the gold total and the mute setting. */
export type SaveSource = () => Readonly<SaveData>;

/** Called with the action when a `[data-act]` button is pressed. */
export type ActListener = (act: DataAct) => void;

/** What Menus is showing: `pause` sits over the run, the others replace one another. */
export type MenuScreen = 'menu' | 'results' | 'pause' | 'panel';

/** The colour of a sign's header band. */
type Tone = 'ink' | 'teal' | 'gold' | 'red';

interface Panel {
  mount: PanelMount;
  title: string;
  tone: Tone;
}

/** The panels the menu opens. Other packages fill them: settings WP-43, upgrades WP-32, credits WP-52. */
const PANEL_LOOK: Record<string, { title: string; tone: Tone }> = {
  settings: { title: 'SETTINGS', tone: 'ink' },
  howto: { title: 'HOW TO PLAY', tone: 'teal' },
  credits: { title: 'CREDITS', tone: 'ink' },
  upgrades: { title: 'UPGRADES', tone: 'gold' },
};

/**
 * A screen-changing action pressed again within this many ms is the same press: a double tap, or Enter arriving
 * both as a key (onConfirm) and as the focused button's click.
 */
const REPEAT_MS = 350;
const SCREEN_ACTS: ReadonlySet<string> = new Set(['play', 'retry', 'menu', 'resume', 'back']);

/** Why the run ended, in a few words under the results heading. */
const CAUSE_TEXT: Record<CrashCause, string> = {
  front: 'Crashed head-on',
  stumble: 'Tripped up twice in a row',
  wall: 'Clipped something on the wall',
  train: 'Hit by a metro train',
  fall: 'Fell into a gap',
};

type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/**
 * Full screen is worth offering where the browser allows it (Android, iPad; not iPhone Safari), because a phone
 * held sideways loses a big share of its height to the browser's bars. Inside a portal's iframe the portal owns
 * full screen, so the button stays away there.
 */
export function canFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  let framed = true;
  try {
    framed = window.self !== window.top;
  } catch {
    // A cross-origin parent: framed.
  }
  return !framed && Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

function isFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

function toggleFullscreen(): void {
  const doc = document as FullscreenDocument;
  const root = document.documentElement as FullscreenElement;
  if (isFullscreen()) {
    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
  } else if (root.requestFullscreen) {
    root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  } else {
    root.webkitRequestFullscreen?.();
  }
}

/** Starts fetching the two faces before the first screen needs them, so titles never flash in a fallback font. */
function warmFonts(): void {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  for (const font of ['400 1em "Lilita One"', '600 1em Fredoka']) fonts.load(font).catch(() => {});
}

/** A keyboard key cap. */
function kbd(key: string): HTMLElement {
  return el(null, 'kbd', '', key);
}

/** An icon with a class, for spots that style it on their own. */
function iconWith(name: IconName, className: string): SVGSVGElement {
  const node = iconNode(name);
  node.classList.add(className);
  return node;
}

/** One item of a dashed-rule line: a value with its icon, and a small label under it. */
function stat(parent: HTMLElement, mark: Element, value: string, label: string): void {
  const item = el(parent, 'div', 'stat');
  el(item, 'dt', '', label);
  const dd = el(item, 'dd', '');
  dd.append(mark, value);
}

/**
 * The how-to panel WP-05 draws until WP-43 registers its own: the moves, the wall-run and the four power-ups,
 * with key caps on a keyboard and swipe arrows on a touch screen. Short lines; the tutorial teaches the rest.
 */
function mountHowTo(panel: HTMLElement): void {
  const keys = hasKeyboard();
  const list = el(panel, 'ul', 'howto');
  const row = (cue: (string | Node)[], title: string, detail: string, kind = '') => {
    const item = el(list, 'li', kind ? `howto-row howto-${kind}` : 'howto-row');
    el(item, 'span', 'howto-cue').append(...cue);
    const text = el(item, 'span', 'howto-text');
    el(text, 'b', '', title);
    el(text, 'span', '', detail);
  };
  const swipe = (...dirs: IconName[]) => dirs.map((d) => iconWith(d, 'howto-arrow'));
  row(keys ? [kbd('←'), kbd('→')] : swipe('left', 'right'), 'Change lane', keys ? 'Arrow keys, or A and D.' : 'Swipe left or right.');
  row(keys ? [kbd('↑')] : swipe('up'), 'Jump', keys ? 'Up, W or Space.' : 'Swipe up.');
  row(keys ? [kbd('↓')] : swipe('down'), 'Slide', keys ? 'Down or S. In the air it drops you fast.' : 'Swipe down. In the air it drops you fast.');
  row(
    [iconWith('wallrun', 'howto-wall')],
    'Run on walls',
    'No floor ahead? Head for a wall to run along it. Up and down change height; away jumps across.',
  );
  row([iconWith('magnet', 'howto-pu')], 'Magnet', 'Pulls nearby gold in.', 'magnet');
  row([iconWith('shield', 'howto-pu')], 'Shield', 'Takes one hit for you.', 'shield');
  row([iconWith('x2', 'howto-pu')], 'Double score', 'Score and gold count twice.', 'multiplier');
  row([iconWith('glide', 'howto-pu')], 'Glide board', 'Floats over gaps and saves you from one fall.', 'glide');
  if (keys) row([kbd('P')], 'Pause', 'P or Esc. M turns the sound on or off.');
}

/**
 * Every screen that is not the run: the main menu, the results, the pause sign, and the panels other packages
 * register (settings, how to play, credits, upgrades). Screens are built when shown and removed when left, so
 * only the visible screen's `[data-act]` buttons are in the page. Screen classes: `.scr-menu`, `.scr-results`,
 * `.scr-pause`, `.scr-panel` (with `data-panel`).
 *
 * The app listens with `on(act, fn)` for `play`, `retry`, `menu`, `pause`... and calls `showMenu`,
 * `showResults`, `showPause`, `hideAll` when the session changes screen. Panel buttons open their panels by
 * themselves (and still tell listeners); `back` closes a panel.
 */
export class Menus {
  readonly root: HTMLElement;
  /** The layer every screen is drawn in. */
  readonly layer: HTMLElement;
  private readonly panels = new Map<string, Panel>();
  private readonly listeners = new Map<string, Set<ActListener>>();
  private readonly save: SaveSource | null;
  /** The menu, the results or a panel. */
  private main: HTMLElement | null = null;
  private mainKind: 'menu' | 'results' | 'panel' | null = null;
  /** The pause sign, over the run. */
  private pauseScreen: HTMLElement | null = null;
  private panelId = '';
  /** Where `back` returns from a panel. */
  private returnTo: 'menu' | 'results' | 'pause' = 'menu';
  private result: RunResult | null = null;
  private muted = false;
  private lastAct = '';
  private lastActAt = -Infinity;

  /** `save` (optional) is read whenever a screen is drawn, e.g. `() => progress.data`. */
  constructor(root: HTMLElement, save?: SaveSource) {
    this.root = root;
    this.save = save ?? null;
    this.layer = el(root, 'div', 'ui-screens');
    this.layer.addEventListener('pointerdown', stopOnButtons);
    this.layer.addEventListener('click', (event) => this.onClick(event));
    document.addEventListener('fullscreenchange', () => this.paintFullscreen());
    document.addEventListener('webkitfullscreenchange', () => this.paintFullscreen());
    this.muted = this.save?.().settings.muted ?? false;
    this.registerPanel('howto', mountHowTo);
    warmFonts();
  }

  /** What is showing: the pause sign first, as it sits on top. Null during a run with nothing over it. */
  get screen(): MenuScreen | null {
    return this.pauseScreen ? 'pause' : this.mainKind;
  }

  /**
   * Registers a panel another package owns (settings WP-43, upgrades WP-32, credits WP-52; `howto` replaces the
   * default). `mount` fills the panel's scrolling body each time it opens. Known ids have a title and a header
   * colour; give `title` for any other id. The panel opens from `[data-act=<id>]` or `openPanel(id)`.
   */
  registerPanel(id: string, mount: PanelMount, title?: string): void {
    const look = PANEL_LOOK[id];
    this.panels.set(id, { mount, title: title ?? look?.title ?? id.toUpperCase(), tone: look?.tone ?? 'ink' });
  }

  /**
   * Calls `fn` whenever a `[data-act=<act>]` button in a menu screen or panel is pressed (including `buy-<kind>`
   * buttons a panel draws). Returns a function that stops listening.
   */
  on(act: DataAct, fn: ActListener): () => void {
    let set = this.listeners.get(act);
    if (!set) {
      set = new Set();
      this.listeners.set(act, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * The main menu, laid over the scene like a game's front screen rather than a card: the logo in one corner,
   * best score and gold in another, the tools in a third, and PLAY with upgrades and how to play in the last.
   * `.menu-sign` is the action cluster.
   */
  showMenu(): void {
    this.clear();
    const save = this.save?.() ?? null;
    const screen = this.setMain('menu', 'scr scr-menu');

    const logo = el(screen, 'div', 'menu-logo');
    const title = el(logo, 'h1', 'game-title');
    title.setAttribute('aria-label', 'Catch the Thief');
    el(title, 'span', 't-catch', 'CATCH THE');
    el(title, 'span', 't-thief', 'THIEF');
    el(logo, 'div', 'logo-tag', 'GET THE GOLD BACK!');

    // Best score and gold, two pills with their icon in a badge on the left.
    const stats = el(screen, 'div', 'menu-stats');
    const best = el(stats, 'div', 'pill pill-best');
    best.setAttribute('aria-label', `Best: ${num(save?.highScore ?? 0)}`);
    el(best, 'span', 'pill-badge').append(iconNode('trophy'));
    const bestText = el(best, 'span', 'pill-text');
    el(bestText, 'span', 'pill-label', 'BEST');
    el(bestText, 'span', 'pill-value', num(save?.highScore ?? 0));
    const gold = el(stats, 'div', 'pill pill-gold');
    gold.setAttribute('aria-label', `Gold: ${num(save?.gold ?? 0)}`);
    el(gold, 'span', 'pill-badge pill-coin').append(coinNode());
    const goldText = el(gold, 'span', 'pill-text');
    el(goldText, 'span', 'pill-label', 'GOLD');
    el(goldText, 'span', 'pill-value', num(save?.gold ?? 0));

    const tools = el(screen, 'div', 'menu-tools');
    this.muteButton(tools, false);
    actButton(tools, 'settings', 'tool-btn', '', 'settings', 'Settings');
    actButton(tools, 'credits', 'tool-btn', '', 'info', 'Credits');
    if (canFullscreen()) {
      const full = el(tools, 'button', 'tool-btn');
      full.type = 'button';
      full.dataset.ui = 'fullscreen';
      full.addEventListener('click', toggleFullscreen);
      this.paintFullscreen(full);
    }

    const sign = el(screen, 'div', 'sign menu-sign');
    actButton(sign, 'play', 'btn btn-go btn-big', 'PLAY', 'play').dataset.primary = '';
    const row = el(sign, 'div', 'menu-row');
    const upgrades = actButton(row, 'upgrades', 'btn btn-gold', 'UPGRADES');
    upgrades.prepend(coinNode());
    actButton(row, 'howto', 'btn btn-teal', 'HOW TO PLAY', 'help');

    // The menu lists keys or swipes, not rules: the tutorial teaches the rules.
    const hints = el(sign, 'p', 'menu-hints');
    const group = (label: string, ...cue: Node[]) => el(hints, 'span', '').append(...cue, label);
    if (hasKeyboard()) {
      group('lanes', kbd('←'), kbd('→'));
      group('jump', kbd('↑'));
      group('slide', kbd('↓'));
      group('pause', kbd('P'));
    } else {
      group('Swipe', iconNode('left'), iconNode('right'), iconNode('up'), iconNode('down'));
    }
  }

  /** The results: one big score (NEW BEST stamped on it), distance, gold and best on one line, RETRY and MENU. */
  showResults(result: RunResult): void {
    this.clear();
    this.result = result;
    const screen = this.setMain('results', 'scr scr-results');
    const sign = el(screen, 'div', 'sign res-sign scrolls');
    if (result.newBest) sign.classList.add('is-best');

    const head = el(sign, 'h2', 'sign-head tone-red');
    head.append(iconNode('mask'), 'HE GOT AWAY!');
    el(sign, 'p', 'res-cause', CAUSE_TEXT[result.cause] ?? 'The run is over');

    const score = el(sign, 'div', 'res-score');
    if (result.newBest) el(score, 'div', 'res-stamp', 'NEW BEST!');
    el(score, 'span', 'res-value', num(result.score));
    el(score, 'span', 'res-label', 'SCORE');

    const line = el(sign, 'dl', 'res-line');
    stat(line, iconNode('flag'), `${num(result.distance)} m`, 'distance');
    stat(line, coinNode(), num(result.gold), 'gold');
    if (!result.newBest) stat(line, iconNode('trophy'), num(result.best), 'best');

    const buttons = el(sign, 'div', 'res-buttons');
    actButton(buttons, 'retry', 'btn btn-go', 'RETRY', 'retry').dataset.primary = '';
    actButton(buttons, 'menu', 'btn btn-quiet', 'MENU', 'home');
    if (hasKeyboard()) el(sign, 'p', 'sign-hint', 'Enter: run again');
  }

  /** Shows or removes the pause sign over the run: RESUME, MENU and the sound switch. */
  showPause(paused: boolean): void {
    this.pauseScreen?.remove();
    this.pauseScreen = null;
    if (!paused) return;
    const screen = el(this.layer, 'div', 'scr scr-pause');
    const sign = el(screen, 'div', 'sign pause-sign scrolls');
    el(sign, 'h2', 'sign-head tone-ink', 'PAUSED');
    actButton(sign, 'resume', 'btn btn-go', 'RESUME', 'play').dataset.primary = '';
    const row = el(sign, 'div', 'pause-row');
    actButton(row, 'menu', 'btn btn-quiet', 'MENU', 'home');
    this.muteButton(row, true);
    if (hasKeyboard()) el(sign, 'p', 'sign-hint', 'P or Esc: resume');
    this.pauseScreen = screen;
  }

  /** Removes every screen (the run is on). */
  hideAll(): void {
    this.clear();
  }

  /** Opens a registered panel in place of the screen showing; BACK returns to it. */
  openPanel(id: string): void {
    const panel = this.panels.get(id);
    const look = panel ?? { title: PANEL_LOOK[id]?.title ?? id.toUpperCase(), tone: PANEL_LOOK[id]?.tone ?? 'ink' };
    if (this.pauseScreen) {
      this.returnTo = 'pause';
      this.pauseScreen.remove();
      this.pauseScreen = null;
    } else if (this.mainKind === 'results' || this.mainKind === 'menu') {
      this.returnTo = this.mainKind;
    }
    this.main?.remove();
    const screen = this.setMain('panel', 'scr scr-panel');
    screen.dataset.panel = id;
    this.panelId = id;
    const sign = el(screen, 'div', 'sign panel-sign');
    el(sign, 'h2', `sign-head tone-${look.tone}`, look.title);
    const body = el(sign, 'div', 'panel-body scrolls');
    body.dataset.panel = id;
    if (panel) {
      try {
        panel.mount(body);
      } catch (error) {
        console.error(`panel ${id} failed to mount`, error);
      }
    }
    if (!body.childNodes.length) el(body, 'p', 'panel-empty', 'Coming soon.');
    // A panel's own sound switch (settings) is drawn here, like the menu's, and kept current by setMuted.
    for (const button of body.querySelectorAll<HTMLButtonElement>('[data-act="mute"]')) this.paintMute(button);
    actButton(el(sign, 'div', 'panel-foot'), 'back', 'btn btn-quiet', 'BACK', 'back');
  }

  /** Closes the open panel and shows the screen it came from. */
  closePanel(): void {
    if (this.mainKind !== 'panel') return;
    const to = this.returnTo;
    this.clear();
    if (to === 'results' && this.result) this.showResults(this.result);
    else if (to === 'pause') this.showPause(true);
    else this.showMenu();
  }

  /** The id of the open panel, or '' when none is open. */
  get openPanelId(): string {
    return this.mainKind === 'panel' ? this.panelId : '';
  }

  /** Shows the sound switches as on or off. The app calls this after it changes the setting. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const button of this.layer.querySelectorAll<HTMLButtonElement>('[data-act="mute"]')) this.paintMute(button);
  }

  /** Enter: presses the showing screen's main button (PLAY, RETRY, RESUME). False when there is none. */
  confirm(): boolean {
    const scope = this.pauseScreen ?? this.main;
    const primary = scope?.querySelector<HTMLButtonElement>('[data-primary]');
    if (!primary || primary.disabled) return false;
    primary.click();
    return true;
  }

  /** Escape: closes the open panel. False when no panel is open, so the key can do something else. */
  back(): boolean {
    if (this.mainKind !== 'panel') return false;
    this.dispatch('back');
    return true;
  }

  /**
   * How much of the screen the main menu's sign covers, CSS px: from the right edge when it sits on the right
   * (wide screens), from the bottom when it sits at the bottom (tall screens). The menu camera frames the scene
   * in the rest. Measured without the entrance animation; null when the menu is not showing.
   */
  menuCover(): { right: number; bottom: number } | null {
    if (this.mainKind !== 'menu' || !this.main) return null;
    const sign = this.main.querySelector<HTMLElement>('.menu-sign');
    if (!sign || !sign.offsetWidth) return null;
    const onRight = sign.offsetLeft > window.innerWidth / 3 && sign.offsetTop + sign.offsetHeight < window.innerHeight * 0.98;
    const wide = window.innerWidth >= window.innerHeight * 1.25;
    return wide || onRight
      ? { right: Math.max(0, window.innerWidth - sign.offsetLeft), bottom: 0 }
      : { right: 0, bottom: Math.max(0, window.innerHeight - sign.offsetTop) };
  }

  private setMain(kind: 'menu' | 'results' | 'panel', className: string): HTMLElement {
    const screen = el(this.layer, 'div', className);
    this.main = screen;
    this.mainKind = kind;
    return screen;
  }

  private clear(): void {
    this.main?.remove();
    this.main = null;
    this.mainKind = null;
    this.panelId = '';
    this.pauseScreen?.remove();
    this.pauseScreen = null;
  }

  /** The sound switch: an icon on the menu's tool row, icon and words on the pause sign. */
  private muteButton(parent: HTMLElement, labelled: boolean): HTMLButtonElement {
    const button = el(parent, 'button', labelled ? 'btn btn-quiet' : 'tool-btn');
    button.type = 'button';
    button.dataset.act = 'mute';
    if (labelled) button.dataset.labelled = '';
    this.paintMute(button);
    return button;
  }

  private paintMute(button: HTMLButtonElement): void {
    const muted = this.muted;
    button.replaceChildren(iconNode(muted ? 'muted' : 'sound'));
    if (button.dataset.labelled !== undefined) el(button, 'span', 'btn-label', muted ? 'SOUND OFF' : 'SOUND ON');
    button.classList.toggle('is-off', muted);
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Sound off (M)' : 'Sound on (M)');
    button.title = muted ? 'Sound off (M)' : 'Sound on (M)';
  }

  private paintFullscreen(only?: HTMLElement): void {
    const buttons = only ? [only] : [...this.layer.querySelectorAll<HTMLElement>('[data-ui="fullscreen"]')];
    const on = isFullscreen();
    for (const button of buttons) {
      button.replaceChildren(iconNode(on ? 'shrink' : 'expand'));
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
      button.title = on ? 'Leave full screen' : 'Full screen';
    }
  }

  private onClick(event: MouseEvent): void {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-act]') : null;
    if (!button || !this.layer.contains(button)) return;
    if (button instanceof HTMLButtonElement && button.disabled) return;
    // A tapped button keeps focus, and a later Space or Enter would press it again: let go of it.
    if (event.detail > 0) button.blur();
    const act = button.dataset.act;
    if (act) this.dispatch(act as DataAct);
  }

  private dispatch(act: DataAct): void {
    const now = performance.now();
    if (SCREEN_ACTS.has(act) && act === this.lastAct && now - this.lastActAt < REPEAT_MS) return;
    this.lastAct = act;
    this.lastActAt = now;
    if (act === 'settings' || act === 'howto' || act === 'credits' || act === 'upgrades') this.openPanel(act);
    else if (act === 'back') this.closePanel();
    const set = this.listeners.get(act);
    if (set) for (const fn of [...set]) fn(act);
    // The app's mute listener changed the setting: show what the save now says.
    if (act === 'mute' && this.save) this.setMuted(this.save().settings.muted);
  }
}

import type { DataAct } from '../debug/hooks';
import type { PowerUpKind, RunState } from '../game/types';
import { coinNode, iconNode, type IconName } from './icons';
import './styles.css';

/**
 * Text readouts change at most this often, s. Setting text costs layout work over the WebGL canvas, so twelve
 * times a second is plenty; the power-up bars move every frame through `transform`, which
 * costs nothing.
 */
const TEXT_INTERVAL = 1 / 12;
/** The ease-out every entrance uses (docs/UI-DESIGN.md: 200 to 260 ms, ease-out). */
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** Celebrations (a banner, NEW BEST, a power-up chip) may overshoot a little. Menus never do. */
const EASE_POP = 'cubic-bezier(0.34, 1.45, 0.64, 1)';
/** Entrance length, ms. */
const ENTER_MS = 240;
/** How long a toast stays, ms. */
const TOAST_MS = 2400;
/** How long a banner stays by default, ms. */
const BANNER_MS = 1600;
/** A power-up timer that goes up by more than this between frames was picked up again, s. */
const REFILL_STEP = 0.05;
/** The order of the power-up chips, top to bottom. */
const POWER_UPS: readonly PowerUpKind[] = ['magnet', 'shield', 'multiplier', 'glide'];
const POWER_UP_ICON: Record<PowerUpKind, IconName> = { magnet: 'magnet', shield: 'shield', multiplier: 'x2', glide: 'glide' };
const POWER_UP_NAME: Record<PowerUpKind, string> = { magnet: 'Magnet', shield: 'Shield', multiplier: 'Double score', glide: 'Glide board' };

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** A whole number with thousands separators ("12,345"). Scores and distances round down. */
export function num(n: number): string {
  return NUMBER.format(Math.floor(n));
}

/** Creates an element, gives it a class and text, and appends it to `parent` (when there is one). */
export function el<K extends keyof HTMLElementTagNameMap>(
  parent: Element | null,
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** Sets text only when it changed: the write is what costs layout. */
export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * A button for a `[data-act]` action (the test contract in src/debug/hooks.ts), with an optional icon and label.
 * Icon-only buttons need `aria`, which also becomes the tooltip.
 */
export function actButton(
  parent: Element,
  act: DataAct,
  className: string,
  label = '',
  iconName: IconName | null = null,
  aria = '',
): HTMLButtonElement {
  const node = el(parent, 'button', className);
  node.type = 'button';
  node.dataset.act = act;
  if (iconName) node.append(iconNode(iconName));
  if (label) el(node, 'span', 'btn-label', label);
  if (aria) {
    node.setAttribute('aria-label', aria);
    node.title = aria;
  }
  return node;
}

/**
 * True when there is probably a keyboard: a mouse or trackpad usually comes with one. Decides between key hints
 * and swipe hints. Same test as the `(hover: hover) and (pointer: fine)` rules in styles.css.
 */
export function hasKeyboard(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** The player's motion setting (SaveData.settings.reducedMotion): follow the device, reduce, or full motion. */
export type MotionPreference = 'auto' | 'on' | 'off';

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Applies the motion setting to the whole UI: `on` reduces motion, `off` keeps full motion even when the device
 * asks for less, `auto` follows `prefers-reduced-motion`. Sets `data-motion` on <html>, which styles.css reads.
 */
export function setMotionPreference(preference: MotionPreference): void {
  const root = document.documentElement;
  if (preference === 'auto') delete root.dataset.motion;
  else root.dataset.motion = preference === 'on' ? 'reduced' : 'full';
}

/** True when the UI should keep fades but drop movement, scaling and flashes. */
export function reducedMotion(): boolean {
  const preference = document.documentElement.dataset.motion;
  if (preference === 'reduced') return true;
  if (preference === 'full') return false;
  return motionQuery?.matches ?? false;
}

/**
 * Keeps presses on UI buttons away from the swipe detector: a press on a button is never a swipe, and a pointer
 * captured by the page would steal the button's click. Listened for on each UI layer.
 */
export function stopOnButtons(event: Event): void {
  if (event.target instanceof Element && event.target.closest('button')) event.stopPropagation();
}

/** Colours for banners and flashes: gold celebrates, teal informs, red warns. */
export type BannerTone = 'gold' | 'teal' | 'red';

/** One power-up timer chip. `full` is the timer's length when it was last picked up, so the bar knows its scale. */
interface Chip {
  root: HTMLElement;
  fill: HTMLElement;
  full: number;
  left: number;
  scale: number;
  shown: boolean;
}

/** The HUD that last drew a toast surface: `toast()` below writes there. */
let toastHud: Hud | null = null;

/**
 * Shows a one-line toast from anywhere (a panel, an upgrade bought). Does nothing before the HUD exists.
 */
export function toast(text: string, iconName?: IconName): void {
  toastHud?.toast(text, iconName);
}

/**
 * The in-run HUD: score with the multiplier stamp, gold, power-up timer chips, the pause button, the 3-2-1
 * countdown, banners and flashes. Plus the toast line, which also shows over the menus.
 *
 * The run layer is in the page only while the HUD is visible, so every `[data-act]` and `[data-hud]` in the DOM
 * is one the player can see. Readouts carry the fixed selectors: `[data-hud=score|gold|multiplier|powerups]`,
 * `[data-act=pause]`.
 */
export class Hud {
  readonly root: HTMLElement;
  /** The run layer: everything that shows only during a run. */
  readonly layer: HTMLElement;
  private readonly scoreValue: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly goldValue: HTMLElement;
  private readonly goldCoin: SVGSVGElement;
  private readonly chips: Record<PowerUpKind, Chip>;
  private readonly countBox: HTMLElement;
  private readonly countDigit: HTMLElement;
  private readonly bannerBox: HTMLElement;
  private readonly flashBox: HTMLElement;
  private readonly toastBox: HTMLElement;
  private readonly pauseListeners = new Set<(act: DataAct) => void>();
  private toastAnimation: Animation | null = null;
  private visible = false;
  private textTimer = 0;
  private shownGold = -1;
  private shownMultiplier = 1;
  private countShown = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.layer = el(null, 'div', 'hud-run');
    this.layer.addEventListener('pointerdown', stopOnButtons);
    this.layer.addEventListener('click', (event) => this.onClick(event));
    const layer = this.layer;

    // Over the scene a flash sits lowest, so readouts stay legible through it.
    this.flashBox = el(layer, 'div', 'hud-flash');

    actButton(layer, 'pause', 'tool-btn hud-pause', '', 'pause', 'Pause (P)');

    // Power-up timers, one chip per kind, shown while it runs. WP-32 fills RunState.powerUps; nothing else to wire.
    const chips = el(layer, 'div', 'hud-chips');
    chips.dataset.hud = 'powerups';
    const chip = (kind: PowerUpKind): Chip => {
      const node = el(chips, 'div', 'pu-chip hidden');
      node.dataset.kind = kind;
      node.setAttribute('aria-label', POWER_UP_NAME[kind]);
      node.append(iconNode(POWER_UP_ICON[kind]));
      const bar = el(node, 'span', 'pu-bar');
      return { root: node, fill: el(bar, 'span', 'pu-fill'), full: 1, left: 0, scale: -1, shown: false };
    };
    this.chips = { magnet: chip('magnet'), shield: chip('shield'), multiplier: chip('multiplier'), glide: chip('glide') };

    // Score and gold, top right. The multiplier stamp rides on the score plate while it counts.
    const stack = el(layer, 'div', 'hud-stack');
    const score = el(stack, 'div', 'hud-score plate');
    this.multiplier = el(score, 'span', 'hud-mult hidden', '×1');
    this.multiplier.dataset.hud = 'multiplier';
    this.scoreValue = el(score, 'span', 'hud-score-value', '0');
    this.scoreValue.dataset.hud = 'score';
    const gold = el(stack, 'div', 'hud-gold plate');
    this.goldCoin = coinNode();
    gold.append(this.goldCoin);
    this.goldValue = el(gold, 'span', 'hud-gold-value', '0');
    this.goldValue.dataset.hud = 'gold';

    const count = el(layer, 'div', 'hud-count hidden');
    this.countBox = count;
    this.countDigit = el(count, 'span', 'hud-count-digit');
    this.bannerBox = el(el(layer, 'div', 'hud-banner-row'), 'div', 'hud-banner');

    // The toast line lives outside the run layer: it also shows over the menus.
    const toastRow = el(root, 'div', 'ui-toast-row');
    this.toastBox = el(toastRow, 'div', 'ui-toast plate hidden');
    this.toastBox.setAttribute('role', 'status');
    toastHud = this;
  }

  /**
   * Calls `fn` when the player presses the HUD's pause button. Returns a function that stops listening.
   * The HUD has no other actions: menus, results and pause are Menus'.
   */
  on(act: 'pause', fn: (act: DataAct) => void): () => void {
    if (act !== 'pause') return () => {};
    this.pauseListeners.add(fn);
    return () => this.pauseListeners.delete(fn);
  }

  /** Shows the run layer for a run and resets it; hides it (out of the page) otherwise. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) {
      this.layer.remove();
      return;
    }
    this.root.appendChild(this.layer);
    this.textTimer = 0;
    this.shownGold = -1;
    this.shownMultiplier = 1;
    this.multiplier.classList.add('hidden');
    for (const kind of POWER_UPS) this.hideChip(this.chips[kind]);
    this.setCountdown(0);
    this.bannerBox.replaceChildren();
  }

  /** Per frame: power-up bars every frame, text 12 times a second. */
  update(run: RunState, dt: number): void {
    if (!this.visible) return;
    this.updateChips(run.powerUps);

    this.textTimer -= dt;
    if (this.textTimer > 0) return;
    this.textTimer = TEXT_INTERVAL;
    setText(this.scoreValue, num(run.score));
    if (run.gold !== this.shownGold) {
      const gained = this.shownGold >= 0 && run.gold > this.shownGold;
      this.shownGold = run.gold;
      setText(this.goldValue, num(run.gold));
      if (gained && !reducedMotion()) {
        this.goldCoin.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], { duration: 180, easing: EASE_OUT });
      }
    }
    if (run.multiplier !== this.shownMultiplier) {
      this.shownMultiplier = run.multiplier;
      const on = run.multiplier > 1;
      this.multiplier.classList.toggle('hidden', !on);
      if (on) {
        setText(this.multiplier, `×${run.multiplier}`);
        this.pop(this.multiplier);
      }
    }
  }

  /**
   * The resume countdown (3-2-1). Pass the seconds left every frame; the digit is `ceil(left)`, and the overlay
   * hides at 0 or below. The app owns the timing (RESULTS.resumeCountdown), this only draws it.
   */
  setCountdown(left: number): void {
    const shown = left > 0 ? Math.ceil(left) : 0;
    if (shown === this.countShown) return;
    this.countShown = shown;
    this.countBox.classList.toggle('hidden', shown === 0);
    if (!shown) return;
    this.countDigit.textContent = String(shown);
    const frames: Keyframe[] = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'scale(1.45)' }, { opacity: 1, transform: 'none' }];
    this.countDigit.animate(frames, { duration: ENTER_MS, easing: EASE_OUT });
  }

  /**
   * Big lettering in the upper middle of the run: pops in, holds, then drifts up and away. For the moments that
   * matter (NEW BEST, a new district, GO!). Ignored while the HUD is hidden.
   */
  banner(text: string, tone: BannerTone = 'gold', ms = BANNER_MS): void {
    if (!this.visible) return;
    const box = this.bannerBox;
    box.dataset.tone = tone;
    box.replaceChildren(el(null, 'span', '', text));
    const frames: Keyframe[] = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: 'translateY(10px) scale(0.7)', easing: EASE_POP },
          { opacity: 1, transform: 'none', offset: 0.16 },
          { opacity: 1, transform: 'none', offset: 0.82, easing: EASE_OUT },
          { opacity: 0, transform: 'translateY(-14px)' },
        ];
    box.animate(frames, { duration: ms, fill: 'both' });
  }

  /**
   * A short full-screen colour flash (a crash, a shield breaking). Flat colour fading out, no glow; skipped with
   * reduced motion. Ignored while the HUD is hidden.
   */
  flash(tone: BannerTone = 'red'): void {
    if (!this.visible || reducedMotion()) return;
    this.flashBox.dataset.tone = tone;
    this.flashBox.animate([{ opacity: 0.38 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
  }

  /** A one-line message under the top readouts, on any screen. A new toast replaces the one showing. */
  toast(text: string, iconName: IconName = 'chevron'): void {
    const box = this.toastBox;
    box.replaceChildren(iconNode(iconName), el(null, 'span', '', text));
    box.classList.remove('hidden');
    this.toastAnimation?.cancel();
    const lift = reducedMotion() ? 0 : 1;
    const animation = box.animate(
      [
        { opacity: 0, transform: `translateY(${-8 * lift}px)`, easing: EASE_OUT },
        { opacity: 1, transform: 'none', offset: 0.09 },
        { opacity: 1, transform: 'none', offset: 0.9, easing: EASE_OUT },
        { opacity: 0, transform: `translateY(${-6 * lift}px)` },
      ],
      { duration: TOAST_MS, fill: 'both' },
    );
    animation.onfinish = () => box.classList.add('hidden');
    this.toastAnimation = animation;
  }

  private onClick(event: MouseEvent): void {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-act]') : null;
    if (!button || button.dataset.act !== 'pause') return;
    // A tapped button keeps focus, and Space (jump) would press it again: let go of it.
    if (event.detail > 0) button.blur();
    for (const fn of [...this.pauseListeners]) fn('pause');
  }

  private updateChips(powerUps: Record<PowerUpKind, number>): void {
    for (const kind of POWER_UPS) {
      const chip = this.chips[kind];
      const left = powerUps[kind];
      if (left <= 0) {
        if (chip.shown) this.hideChip(chip);
        continue;
      }
      // A new pickup, or the same one again: the bar's full length is the timer it starts from.
      if (!chip.shown || left > chip.left + REFILL_STEP) chip.full = left;
      chip.left = left;
      if (!chip.shown) {
        chip.shown = true;
        chip.root.classList.remove('hidden');
        this.pop(chip.root);
      }
      const scale = Math.round((left / chip.full) * 200) / 200;
      if (scale !== chip.scale) {
        chip.scale = scale;
        chip.fill.style.transform = `scaleX(${scale})`;
      }
    }
  }

  private hideChip(chip: Chip): void {
    chip.shown = false;
    chip.left = 0;
    chip.scale = -1;
    chip.root.classList.add('hidden');
  }

  /** A small celebratory pop for something that just appeared. */
  private pop(node: Element): void {
    const frames: Keyframe[] = reducedMotion()
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }];
    node.animate(frames, { duration: ENTER_MS, easing: EASE_POP });
  }
}

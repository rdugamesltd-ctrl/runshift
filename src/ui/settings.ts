import type { Progress } from '../game/systems/progress';
import { tutorialDone } from '../game/systems/tutorial';
import type { SaveData } from '../game/types';
import { el } from './hud';
import { iconNode } from './icons';

type Settings = SaveData['settings'];

/** How the app applies a changed setting at once. The panel has already saved it. */
export interface SettingsHooks {
  /** Reduced motion changed: 'auto' follows the device, 'on' reduces, 'off' keeps full motion. */
  motion?(value: Settings['reducedMotion']): void;
  /** Graphics quality changed: 'auto' adapts to the frame rate. */
  quality?(value: Settings['quality']): void;
  /** Any switch was pressed (for a click sound). */
  changed?(): void;
}

/** One choice of a segmented switch. */
interface Choice<V extends string> {
  value: V;
  label: string;
}

/** A labelled row: the name and a short line on the left, the control on the right. */
function row(list: HTMLElement, name: string, detail: string): HTMLElement {
  const item = el(list, 'li', 'set-row');
  const text = el(item, 'div', 'set-text');
  el(text, 'b', '', name);
  el(text, 'span', '', detail);
  return el(item, 'div', 'set-control');
}

/**
 * A segmented switch, one button per choice, as a radio group: arrow keys move the choice, like native radios.
 * Pressing a choice calls `pick`; the switch shows it at once.
 */
function segmented<V extends string>(parent: HTMLElement, label: string, choices: readonly Choice<V>[], current: V,
  pick: (value: V) => void): void {
  const group = el(parent, 'div', 'seg');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  const buttons = choices.map((choice) => {
    const button = el(group, 'button', 'seg-btn', choice.label);
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.dataset.value = choice.value;
    return button;
  });
  const show = (value: V) => {
    for (const button of buttons) {
      const on = button.dataset.value === value;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    }
  };
  const choose = (index: number, focus: boolean) => {
    const value = choices[index].value;
    show(value);
    if (focus) buttons[index].focus();
    pick(value);
  };
  group.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.seg-btn') : null;
    const index = button ? buttons.indexOf(button) : -1;
    if (index < 0 || button?.getAttribute('aria-checked') === 'true') return;
    if (event.detail > 0) button?.blur();
    choose(index, false);
  });
  group.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    // Arrow keys belong to this switch while it has focus, not to the game.
    event.preventDefault();
    event.stopPropagation();
    const at = buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true');
    choose((at + step + buttons.length) % buttons.length, true);
  });
  show(current);
}

/**
 * Fills the settings panel: sound, reduced motion and graphics quality, all saved in `save.settings` the moment
 * they change and applied at once through `hooks`, and a button that replays the tutorial on the next run. The
 * sound switch is a `[data-act=mute]` button, so the app's mute (and the M key) keeps it current.
 */
export function mountSettings(panel: HTMLElement, progress: Progress, hooks: SettingsHooks = {}): void {
  const settings = progress.data.settings;
  const list = el(panel, 'ul', 'set-list');

  const sound = el(row(list, 'Sound', 'Music and sound effects.'), 'button', 'btn btn-quiet set-mute');
  sound.type = 'button';
  sound.dataset.act = 'mute';
  sound.dataset.labelled = '';

  segmented(row(list, 'Motion', 'Less turns off camera shake, tilt and bouncy menus.'), 'Motion', [
    { value: 'auto', label: 'AUTO' },
    { value: 'on', label: 'LESS' },
    { value: 'off', label: 'FULL' },
  ], settings.reducedMotion, (value) => {
    progress.setSetting('reducedMotion', value);
    hooks.motion?.(value);
    hooks.changed?.();
  });

  segmented(row(list, 'Graphics', 'Auto lowers detail when your device can\'t keep up.'), 'Graphics', [
    { value: 'auto', label: 'AUTO' },
    { value: 'high', label: 'HIGH' },
    { value: 'low', label: 'LOW' },
  ], settings.quality, (value) => {
    progress.setSetting('quality', value);
    hooks.quality?.(value);
    hooks.changed?.();
  });

  const lessons = row(list, 'Tutorial', 'Play the lessons again on your next run.');
  const replay = el(lessons, 'button', 'btn btn-teal set-replay');
  replay.type = 'button';
  const paintReplay = () => {
    const queued = !tutorialDone(progress.data.tips);
    replay.replaceChildren(iconNode(queued ? 'check' : 'retry'));
    el(replay, 'span', 'btn-label', queued ? 'READY' : 'REPLAY');
    replay.disabled = queued;
  };
  replay.addEventListener('click', () => {
    progress.replayTutorial();
    paintReplay();
    hooks.changed?.();
  });
  paintReplay();
}

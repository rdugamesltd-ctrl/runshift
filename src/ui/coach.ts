import type { TutorialStep } from '../game/track/tutorialTrack';
import type { Action } from '../game/types';
import { el, hasKeyboard, setText } from './hud';
import { iconNode } from './icons';

/** What each step's card says under the press: what the move does there. */
const DETAIL: Record<string, string> = {
  'lanes:left': 'CHANGE LANE',
  'lanes:right': 'BACK THE OTHER WAY',
  'jump:up': 'JUMP THE BARRIER',
  'slide:down': 'SLIDE UNDER IT',
  'wall:right': 'RUN ON THE WALL',
  'band:up': 'RUN HIGHER, OVER THE VENT',
  'wallJump:left': 'JUMP TO THE OTHER WALL',
};

const WORD: Record<Action, string> = { left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN' };
const KEY: Record<Action, string> = { left: '←', right: '→', up: '↑', down: '↓' };

/**
 * The tutorial's HUD: the lesson card shown while a step holds the run (`[data-tip]` names the step's tip), and a
 * top pill with the lesson count and a SKIP button (`[data-ui=skip-tutorial]`) while lessons are ahead.
 */
export class Coach {
  private readonly card: HTMLElement;
  private readonly pill: HTMLElement;
  private readonly count: HTMLElement;

  constructor(root: HTMLElement, onSkip: () => void) {
    this.card = el(root, 'div', 'coach-card hidden');
    this.card.setAttribute('role', 'status');
    this.card.setAttribute('aria-live', 'polite');
    this.card.addEventListener('animationend', () => this.card.classList.remove('is-wrong'));

    this.pill = el(root, 'div', 'coach-pill hidden');
    this.count = el(this.pill, 'span', 'coach-count');
    const skip = el(this.pill, 'button', 'coach-skip', 'SKIP');
    skip.type = 'button';
    skip.dataset.ui = 'skip-tutorial';
    skip.setAttribute('aria-label', 'Skip the tutorial');
    // Input ignores strokes that start on a button, so a tap on SKIP is never a swipe.
    skip.addEventListener('click', () => {
      skip.blur();
      onSkip();
    });
  }

  /** Shows a step's card, or hides it (null). */
  show(step: TutorialStep | null): void {
    this.card.classList.toggle('hidden', step === null);
    this.card.classList.remove('is-wrong');
    if (!step) {
      this.card.replaceChildren();
      delete this.card.dataset.tip;
      delete this.card.dataset.action;
      return;
    }
    this.card.dataset.tip = step.tip;
    this.card.dataset.action = step.action;
    const keys = hasKeyboard();
    const arrow = iconNode(step.action);
    arrow.classList.add('coach-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    const text = el(null, 'span', 'coach-text');
    el(text, 'span', 'coach-do', keys ? `PRESS ${KEY[step.action]}` : `SWIPE ${WORD[step.action]}`);
    el(text, 'small', '', DETAIL[`${step.tip}:${step.action}`] ?? '');
    this.card.replaceChildren(arrow, text);
  }

  /** Shakes the card: that was not the press it waits for. */
  nudge(): void {
    this.card.classList.remove('is-wrong');
    // Restart the animation even when presses come quickly.
    void this.card.offsetWidth;
    this.card.classList.add('is-wrong');
  }

  /** Shows the lesson count (`done` of `total` steps) while lessons are ahead, or hides the pill. */
  setProgress(active: boolean, done = 0, total = 0): void {
    this.pill.classList.toggle('hidden', !active);
    if (active) setText(this.count, `TUTORIAL ${Math.min(done + 1, total)}/${total}`);
  }
}

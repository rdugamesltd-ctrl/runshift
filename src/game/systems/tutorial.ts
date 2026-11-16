import { TUTORIAL } from '../../balance';
import { tutorialMarks } from '../track/tutorialTrack';
import type { TutorialMark, TutorialStep } from '../track/tutorialTrack';
import type { Action, RunState, TipId } from '../types';
import { TIP_IDS } from './save';

/** True once every tutorial tip is in the save, so a new run skips the tutorial. */
export function tutorialDone(tips: readonly TipId[]): boolean {
  return TIP_IDS.every((tip) => tips.includes(tip));
}

/**
 * The first-run tutorial. Its lessons sit on the tutorial track (src/game/track/tutorialTrack.ts); at each
 * step the run freezes (RunState.frozen), the card shows, and only the step's press goes through. A player who
 * has already made the move is never stopped. After the right press, the move must show within
 * TUTORIAL.confirmTime or the run stops for it again (a lane change from the far lane, say).
 */
export class Tutorial {
  enabled = false;
  /** The step the run is frozen for, or null. */
  step: TutorialStep | null = null;
  /** The card to show (a step) or hide (null). */
  onTip: ((step: TutorialStep | null) => void) | null = null;
  /** A step was done: save its tip. */
  onComplete: ((tip: TipId) => void) | null = null;
  /** A wrong press while frozen. */
  onWrong: ((action: Action) => void) | null = null;
  /** Every step is done (or the tutorial was skipped). */
  onFinish: ((skipped: boolean) => void) | null = null;
  private marks: TutorialMark[] = [];
  private next = 0;
  private readTime = 0;
  /** Sim time of the last accepted press for the current step, or null. */
  private acceptedAt: number | null = null;

  /** Starts the lessons afresh for a run that starts at `startD`, or turns the tutorial off. */
  reset(enabled: boolean, startD = 0): void {
    this.enabled = enabled;
    this.step = null;
    this.readTime = 0;
    this.acceptedAt = null;
    this.marks = enabled ? tutorialMarks(startD) : [];
    this.next = 0;
    this.onTip?.(null);
  }

  /** True while lessons are still ahead. */
  get active(): boolean {
    return this.enabled && this.next < this.marks.length;
  }

  /** Steps done so far and in all. */
  get progress(): { done: number; total: number } {
    return { done: this.next, total: this.marks.length };
  }

  /** Called once per frame before simulation; returns whether the run is frozen. */
  update(state: RunState, dt: number): boolean {
    if (!this.active || state.phase !== 'running') return false;
    if (this.step) this.readTime += dt;
    return this.check(state);
  }

  /** Checks the next step during each fixed step (so fast-forwarded runs stop too); returns whether frozen. */
  check(state: RunState): boolean {
    if (!this.active || state.phase !== 'running') return false;
    if (this.step) return true;
    const mark = this.marks[this.next];
    if (state.d < mark.d) return false;
    if (mark.step.done(state.player)) {
      this.completeStep();
      return false;
    }
    // Only a grounded or wall-borne runner can make the move; a jet glide carries him over the lesson.
    if (state.player.gliding) {
      this.completeStep();
      return false;
    }
    if (this.acceptedAt !== null && state.time - this.acceptedAt < TUTORIAL.confirmTime) return false;
    this.acceptedAt = null;
    this.step = mark.step;
    this.readTime = 0;
    state.frozen = true;
    this.onTip?.(this.step);
    return true;
  }

  /** Whether a press goes to the run: always, except while frozen, when only the step's own press does. */
  accept(action: Action, state: RunState): boolean {
    if (!this.step) return true;
    if (this.readTime < TUTORIAL.readTime) return false;
    if (action !== this.step.action) {
      this.onWrong?.(action);
      return false;
    }
    this.step = null;
    this.acceptedAt = state.time;
    state.frozen = false;
    this.onTip?.(null);
    return true;
  }

  /** Ends the lessons now: every remaining tip counts as seen and the run goes on. */
  skip(state: RunState): void {
    if (!this.active) return;
    for (let i = this.next; i < this.marks.length; i++) this.onComplete?.(this.marks[i].step.tip);
    this.next = this.marks.length;
    this.step = null;
    state.frozen = false;
    this.onTip?.(null);
    this.onFinish?.(true);
  }

  private completeStep(): void {
    const mark = this.marks[this.next++];
    this.acceptedAt = null;
    this.onComplete?.(mark.step.tip);
    if (this.next === this.marks.length) this.onFinish?.(false);
  }
}

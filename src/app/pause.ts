import { RESULTS } from '../balance';

/** Where a pause stands: the run going, the pause screen waiting for a tap, or the 3-2-1 before the run goes on. */
export type PausePhase = 'running' | 'paused' | 'countdown';

/** What the pause flow asks the app to do. */
export interface PauseHandlers {
  /** The run has stopped: show the pause screen, release input, quiet the sound. */
  paused(): void;
  /** Show this countdown number (3, 2, 1), or hide the countdown (null). Only called when it changes. */
  countdown(n: number | null): void;
  /** The countdown is over: the run goes on. */
  resumed(): void;
}

/**
 * Pausing and resuming a run. A pause (the pause button, Esc or P, the tab hidden, the window blurred) stops the run
 * at once; it only goes on after a tap and a countdown of RESULTS.resumeCountdown seconds, so a player coming back
 * is never caught out. Pure: the app feeds it real frame time (?speed does not hurry the countdown).
 */
export class PauseFlow {
  /** Where the pause stands. */
  phase: PausePhase = 'running';
  private readonly handlers: PauseHandlers;
  private readonly seconds: number;
  private remaining = 0;
  private shown: number | null = null;

  constructor(handlers: PauseHandlers, seconds: number = RESULTS.resumeCountdown) {
    this.handlers = handlers;
    this.seconds = seconds;
  }

  /** True unless the run is going (so during the countdown too). */
  get paused(): boolean {
    return this.phase !== 'running';
  }

  /** Pauses the run, or stops a countdown. Returns false if it was already paused. */
  pause(): boolean {
    if (this.phase === 'paused') return false;
    this.phase = 'paused';
    this.show(null);
    this.handlers.paused();
    return true;
  }

  /** The player tapped to go on: starts the countdown. Returns false unless the run was paused. */
  resume(): boolean {
    if (this.phase !== 'paused') return false;
    if (this.seconds <= 0) {
      this.finish();
      return true;
    }
    this.phase = 'countdown';
    this.remaining = this.seconds;
    this.show(Math.ceil(this.remaining));
    return true;
  }

  /** Esc and P: pause a going run, resume a paused one, stop a countdown. */
  toggle(): void {
    if (this.phase === 'paused') this.resume();
    else this.pause();
  }

  /** Real time passing, s. Counts the countdown down and resumes the run at zero. */
  update(elapsed: number): void {
    if (this.phase !== 'countdown') return;
    this.remaining -= elapsed;
    if (this.remaining <= 0) this.finish();
    else this.show(Math.ceil(this.remaining));
  }

  /** Back to running at once, quietly (a new run, the menu): only the countdown display is hidden. */
  clear(): void {
    this.phase = 'running';
    this.remaining = 0;
    this.show(null);
  }

  private finish(): void {
    this.phase = 'running';
    this.remaining = 0;
    this.show(null);
    this.handlers.resumed();
  }

  private show(n: number | null): void {
    if (n === this.shown) return;
    this.shown = n;
    this.handlers.countdown(n);
  }
}

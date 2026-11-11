import type { RunResult, StreamerOptions } from '../types';
import type { Progress } from './progress';
import type { Run } from './run';

/** The app's screens. */
export type Screen = 'menu' | 'run' | 'results';

/**
 * The flow between screens: menu → run → results → retry or menu. The app calls step() once per fixed step.
 * TODO WP-01: a seed per run, the results delay (RESULTS.crashDelay, fallDelay), tutorial runs; WP-04:
 * pausing around it.
 */
export class Session {
  screen: Screen = 'menu';
  readonly run: Run;
  readonly progress: Progress;
  result: RunResult | null = null;
  paused = false;
  /** Called whenever the screen changes. */
  onScreen: ((screen: Screen) => void) | null = null;
  private readonly options: StreamerOptions;

  constructor(run: Run, progress: Progress, options: StreamerOptions) {
    this.run = run;
    this.progress = progress;
    this.options = options;
  }

  /** Starts a run. */
  play(): void {
    this.result = null;
    this.paused = false;
    this.run.reset(this.options);
    this.setScreen('run');
  }

  /** Runs again from the results. */
  retry(): void {
    this.play();
  }

  /** Back to the menu. */
  toMenu(): void {
    this.paused = false;
    this.setScreen('menu');
  }

  /** Pauses or resumes the run. Only a run can pause. */
  setPaused(paused: boolean): void {
    this.paused = paused && this.screen === 'run';
  }

  /** One fixed step. */
  step(dt: number): void {
    if (this.screen !== 'run' || this.paused) return;
    this.run.step(dt);
    const s = this.run.state;
    if (s.phase !== 'over' || this.result) return;
    const distance = s.d - (this.options.startD ?? 0);
    const best = this.progress.data.highScore;
    this.result = { score: s.score, distance, gold: s.gold, best: Math.max(best, s.score), newBest: s.score > best, cause: s.cause ?? 'front' };
    this.progress.bank(this.result);
    this.setScreen('results');
  }

  private setScreen(screen: Screen): void {
    this.screen = screen;
    this.onScreen?.(screen);
  }
}

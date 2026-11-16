import { AIR, RESULTS } from '../../balance';
import type { RunResult, StreamerOptions } from '../types';
import type { Progress } from './progress';
import type { Run } from './run';

/** The app's screens. */
export type Screen = 'menu' | 'run' | 'results';

/**
 * The flow between screens: menu → run → results → retry or menu. The app calls step() once per fixed step.
 * A run is a tutorial run when the options ask for one (?tutorial) or wantsTutorial says so (a new player).
 * TODO WP-01: a seed per run, the results delay (RESULTS.crashDelay, fallDelay); WP-04:
 * pausing around it.
 */
export class Session {
  screen: Screen = 'menu';
  readonly run: Run;
  readonly progress: Progress;
  result: RunResult | null = null;
  paused = false;
  /** Whether the current run is a tutorial run. */
  tutorial = false;
  /** Asked at the start of each run: play the tutorial? (?tutorial in the options always does.) */
  wantsTutorial: (() => boolean) | null = null;
  /** Called whenever the screen changes. */
  onScreen: ((screen: Screen) => void) | null = null;
  private readonly options: StreamerOptions;
  private resultsWait = 0;

  constructor(run: Run, progress: Progress, options: StreamerOptions) {
    this.run = run;
    this.progress = progress;
    this.options = options;
  }

  /** Starts a run. */
  play(): void {
    this.result = null;
    this.resultsWait = 0;
    this.paused = false;
    this.run.setUpgrades(this.progress.data.upgrades);
    this.tutorial = this.options.tutorial === true || (this.wantsTutorial?.() ?? false);
    this.run.reset(this.tutorial ? { ...this.options, tutorial: true } : this.options);
    this.setScreen('run');
  }

  /** Runs again from the results. */
  retry(): void {
    this.play();
  }

  /**
   * Back to the menu. The run is put back to a fresh start, so the hero stands idle on the menu instead of held in
   * the pose he left in, and the frozen run's last step (prev ≠ now) cannot shimmer under the render interpolation.
   */
  toMenu(): void {
    this.paused = false;
    this.resultsWait = 0;
    this.run.reset(this.options);
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
    // The fall animation ends at AIR.fallTime; hold the picture until RESULTS.fallDelay since the fall began.
    if (s.cause === 'fall') {
      this.resultsWait += dt;
      if (this.resultsWait < Math.max(0, RESULTS.fallDelay - AIR.fallTime)) return;
    }
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

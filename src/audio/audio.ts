import type { GameEvent, RunState } from '../game/types';

/**
 * All game sound. WP-00 stub: silent.
 * TODO WP-03: Rail's GameAudio (buses, noise buffer, tone/burst/blip, mute/pause/hidden), the AudioContext made
 * on the first gesture and resumed on every gesture, M0 sounds; WP-35: a sound for every GameEvent (sfx.ts).
 */
export class GameAudio {
  muted = false;

  /** Creates the AudioContext. Call from the first user gesture. */
  start(): void {}

  /** Resumes a suspended context. Call on every gesture. */
  resume(): void {}

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Quiet while paused or frozen. */
  setPaused(_paused: boolean): void {}

  /** Suspended while the tab is hidden. */
  setHidden(_hidden: boolean): void {}

  /** Plays the sound for one event. */
  onEvent(_event: GameEvent): void {}

  /** Speed-scaled loops (footsteps, wind). Once per frame. */
  update(_state: RunState, _dt: number): void {}
}

/**
 * The input contract (WP-00). Frozen: later changes are additive only and go through the integrator.
 */
import type { Action } from '../game/types';

/** One press or swipe. `at` is when it happened in performance.now() milliseconds, the time base of DOM events. */
export interface ActionEvent { action: Action; at: number; source: 'touch' | 'mouse' | 'key' | 'bot' }
/** Swipe detection: the threshold is thresholdFrac of the screen's short side, clamped to [minPx, maxPx] CSS px. */
export interface SwipeSettings { thresholdFrac: number; minPx: number; maxPx: number; windowMs: number; dominance: number }
/** What the app reads input through. Actions are drained once per frame; the callbacks are for one-off keys and gestures. */
export interface InputPort { drain(out: ActionEvent[]): number; inject(action: Action): void; releaseAll(): void; setActive(active: boolean): void;
  onPause: () => void; onMute: () => void; onConfirm: () => void; onFirstGesture: () => void; onGesture: () => void }
// class SwipeDetector { constructor(s: SwipeSettings, viewport: () => { w; h }); down(id,x,y,t); move(id,x,y,t): Action|null; up(id,x,y,t): Action|null; cancel(id) }

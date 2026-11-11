import type { Action } from '../game/types';
import type { SwipeSettings } from './types';

/** Where one pointer's current swipe started. */
interface Origin {
  x: number;
  y: number;
  t: number;
}

/**
 * Turns pointer movement into swipes. Coordinates are CSS px, times ms. WP-00 stub: a plain threshold and
 * dominance check from where the pointer went down (or last swiped).
 * TODO WP-03: the windowMs window keeping one older sample, diagonals resolved on pointerup, ≥12 trace tests.
 */
export class SwipeDetector {
  private readonly settings: SwipeSettings;
  private readonly viewport: () => { w: number; h: number };
  private readonly origins = new Map<number, Origin>();

  constructor(settings: SwipeSettings, viewport: () => { w: number; h: number }) {
    this.settings = settings;
    this.viewport = viewport;
  }

  /** Swipe distance, CSS px: thresholdFrac of the short side, clamped to [minPx, maxPx]. */
  threshold(): number {
    const { w, h } = this.viewport();
    const s = this.settings;
    return Math.min(s.maxPx, Math.max(s.minPx, s.thresholdFrac * Math.min(w, h)));
  }

  down(id: number, x: number, y: number, t: number): void {
    this.origins.set(id, { x, y, t });
  }

  /** The swipe this movement completes, or null. A swipe restarts from where it fired. */
  move(id: number, x: number, y: number, t: number): Action | null {
    const origin = this.origins.get(id);
    if (!origin) return null;
    if (t - origin.t > this.settings.windowMs) {
      // Too slow to be a swipe: start again from here.
      origin.x = x;
      origin.y = y;
      origin.t = t;
      return null;
    }
    const action = this.classify(x - origin.x, y - origin.y);
    if (action) {
      origin.x = x;
      origin.y = y;
      origin.t = t;
    }
    return action;
  }

  up(id: number, x: number, y: number, t: number): Action | null {
    const action = this.move(id, x, y, t);
    this.origins.delete(id);
    return action;
  }

  cancel(id: number): void {
    this.origins.delete(id);
  }

  private classify(dx: number, dy: number): Action | null {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < this.threshold()) return null;
    if (ax >= ay * this.settings.dominance) return dx < 0 ? 'left' : 'right';
    // Screen y grows downwards, so a swipe up has dy < 0.
    if (ay >= ax * this.settings.dominance) return dy < 0 ? 'up' : 'down';
    return null;
  }
}

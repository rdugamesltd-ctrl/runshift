import type { Action } from '../game/types';
import type { SwipeSettings } from './types';

/**
 * Samples one pointer's trace holds. Moves arrive at most a few hundred times a second, so this covers the swipe
 * window; if a trace ever fills up, its oldest sample goes, which only shortens the window.
 */
const TRACE_CAPACITY = 64;
/** Traces of lifted pointers kept for reuse, so a touch allocates nothing. More fingers than this is rare. */
const SPARE_TRACES = 10;

/** One pointer's recent path (a ring buffer, oldest first) and the last swipe its stroke made. */
class Trace {
  readonly xs = new Float64Array(TRACE_CAPACITY);
  readonly ys = new Float64Array(TRACE_CAPACITY);
  readonly ts = new Float64Array(TRACE_CAPACITY);
  /** Ring index of the oldest sample: the anchor a swipe is measured from. */
  head = 0;
  count = 0;
  /** The direction this pointer last swiped (null before its first swipe)... */
  last: Action | null = null;
  /** ...and when, ms; follow-through moves the time on. */
  lastAt = 0;

  /** Forgets the path: (x, y) at t becomes the only sample, the new origin. */
  restart(x: number, y: number, t: number): void {
    this.head = 0;
    this.count = 0;
    this.push(x, y, t);
  }

  push(x: number, y: number, t: number): void {
    if (this.count === TRACE_CAPACITY) {
      this.head = (this.head + 1) % TRACE_CAPACITY;
      this.count--;
    }
    const i = (this.head + this.count) % TRACE_CAPACITY;
    this.xs[i] = x;
    this.ys[i] = y;
    this.ts[i] = t;
    this.count++;
  }

  /**
   * Drops old samples until just one is older than windowMs. The anchor is then where the pointer was about a
   * window ago, so a slow drag keeps re-anchoring and never adds up to a swipe; and as a still pointer sends no
   * moves, one that rested and then flicked is measured from where it rested.
   */
  trim(now: number, windowMs: number): void {
    while (this.count > 2 && now - this.ts[(this.head + 1) % TRACE_CAPACITY] >= windowMs) {
      this.head = (this.head + 1) % TRACE_CAPACITY;
      this.count--;
    }
  }
}

/**
 * Turns pointer movement into swipes: pure, so it is tested with recorded traces. Coordinates are CSS px and
 * times performance.now() ms; each pointer id is tracked on its own, so several fingers never mix.
 *
 * - A swipe covers the threshold (`threshold()`) within the window: the distance is measured from the oldest
 *   sample, which is kept one sample older than `windowMs`.
 * - It fires on the move where the major axis reaches the threshold and is at least `dominance` times the minor.
 * - Lifting on a diagonal past the threshold fires the larger axis, so a real swipe is never dropped.
 * - After a swipe the origin resets: a second swipe in the same touch needs a fresh threshold.
 * - Follow-through: while a stroke keeps going the way it just swiped, it re-anchors instead of firing again, so a
 *   long flick is one swipe however far it travels. The same way fires again once the pointer has gone a window
 *   without covering the threshold that way (it paused or slowed); any other way fires at once.
 */
export class SwipeDetector {
  private readonly settings: SwipeSettings;
  private readonly viewport: () => { w: number; h: number };
  private readonly traces = new Map<number, Trace>();
  private readonly spare: Trace[] = [];

  /** `viewport` gives the screen size in CSS px; it is read on every move, so a rotation applies at once. */
  constructor(settings: SwipeSettings, viewport: () => { w: number; h: number }) {
    this.settings = settings;
    this.viewport = viewport;
  }

  /** Swipe distance, CSS px: thresholdFrac of the viewport's short side, clamped to [minPx, maxPx]. */
  threshold(): number {
    const { w, h } = this.viewport();
    const s = this.settings;
    return Math.min(s.maxPx, Math.max(s.minPx, s.thresholdFrac * Math.min(w, h)));
  }

  /** Pointers being tracked. */
  get size(): number {
    return this.traces.size;
  }

  /** Pointer `id` went down at (x, y) at time t: its first stroke starts here. */
  down(id: number, x: number, y: number, t: number): void {
    const trace = this.traces.get(id) ?? this.spare.pop() ?? new Trace();
    trace.restart(x, y, t);
    trace.last = null;
    trace.lastAt = 0;
    this.traces.set(id, trace);
  }

  /** Pointer `id` moved to (x, y) at time t: the swipe this completes, or null. */
  move(id: number, x: number, y: number, t: number): Action | null {
    const trace = this.traces.get(id);
    if (!trace) return null;
    trace.push(x, y, t);
    trace.trim(t, this.settings.windowMs);
    return this.judge(trace, x, y, t, false);
  }

  /** Pointer `id` lifted at (x, y) at time t: the swipe this completes, or null. The pointer is then forgotten. */
  up(id: number, x: number, y: number, t: number): Action | null {
    const trace = this.traces.get(id);
    if (!trace) return null;
    trace.push(x, y, t);
    trace.trim(t, this.settings.windowMs);
    const action = this.judge(trace, x, y, t, true);
    this.release(id, trace);
    return action;
  }

  /** Pointer `id` was cancelled (the browser took it over): it is forgotten without a swipe. */
  cancel(id: number): void {
    const trace = this.traces.get(id);
    if (trace) this.release(id, trace);
  }

  /** Forgets every pointer (blur, pause). */
  clear(): void {
    for (const [id, trace] of this.traces) this.release(id, trace);
  }

  /** The swipe the pointer's path makes now, if any; resets the origin when it fires or follows through. */
  private judge(trace: Trace, x: number, y: number, t: number, lifted: boolean): Action | null {
    const s = this.settings;
    const dx = x - trace.xs[trace.head];
    const dy = y - trace.ys[trace.head];
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < this.threshold()) return null;
    const recent = trace.last !== null && t - trace.lastAt < s.windowMs;
    let action: Action | null = null;
    // Screen y grows downwards, so a swipe up has dy < 0.
    if (ax >= ay * s.dominance) action = dx < 0 ? 'left' : 'right';
    else if (ay >= ax * s.dominance) action = dy < 0 ? 'up' : 'down';
    // Lifting on a diagonal: the larger axis wins (a tie goes to the lane change). Not straight after a swipe,
    // though: then the diagonal is that stroke's tail curling off as the finger lifts.
    else if (lifted && !recent) action = ax >= ay ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    if (action === null) return null;
    trace.restart(x, y, t);
    if (recent && action === trace.last) {
      // Follow-through of the swipe that just fired: swallowed, and measured on from here.
      trace.lastAt = t;
      return null;
    }
    trace.last = action;
    trace.lastAt = t;
    return action;
  }

  private release(id: number, trace: Trace): void {
    this.traces.delete(id);
    if (this.spare.length < SPARE_TRACES) this.spare.push(trace);
  }
}

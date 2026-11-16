import { INPUT } from '../../balance';
import type { Action } from '../types';

/**
 * Most presses the buffer holds at once. A player cannot swipe faster than a few times a frame, so a ninth
 * press only ever comes from mashing; it pushes the oldest one out.
 */
const CAPACITY = 8;

/** One press waiting in the buffer: what it was and the sim time after which it is no longer usable. */
interface Slot {
  action: Action;
  at: number;
  expires: number;
  outer: boolean;
}

/**
 * Holds presses for INPUT.buffer seconds of sim time until the player can use them, so an early swipe
 * still counts: a jump pressed just before landing fires on landing. Times here are sim seconds
 * (RunState.time), not the ActionEvent's performance.now() milliseconds.
 *
 * The player step offers every live press to the current mode, oldest first; the mode uses it (it leaves
 * the buffer) or leaves it waiting. A press that cannot be used yet never blocks a later one: during a jump
 * an early `up` waits for the landing while a `left` is used at once.
 *
 * Allocation-free: the slots are made once and recycled. WP-11's wall entry buffer (WALL.entryBuffer) can
 * keep one press alive for longer with `hold`.
 */
export class ActionBuffer {
  private readonly slots: Slot[] = Array.from({ length: CAPACITY }, (): Slot => ({ action: 'up', at: 0, expires: 0, outer: false }));
  private count = 0;

  /** Queues a press made at sim time `at`. It stays usable until `at + INPUT.buffer`. */
  push(action: Action, at: number): void {
    if (this.count === CAPACITY) this.removeAt(0);
    const slot = this.slots[this.count++];
    slot.action = action;
    slot.at = at;
    slot.expires = at + INPUT.buffer;
    slot.outer = false;
  }

  /** Drops presses that expired before sim time `now` and returns how many are still live. */
  live(now: number, onOuterExpired?: (action: Action) => void): number {
    for (let i = 0; i < this.count; ) {
      if (this.slots[i].expires < now) {
        if (this.slots[i].outer) onOuterExpired?.(this.slots[i].action);
        this.removeAt(i);
      }
      else i++;
    }
    return this.count;
  }

  /** The i-th waiting press, oldest first (0 ≤ i < size). Call `live(now)` first to drop expired ones. */
  actionAt(i: number): Action {
    return this.slots[i].action;
  }

  /** Extends an outer-lane press once, from when it was made, and marks it for a bump on expiry. */
  holdOuter(i: number, duration: number): void {
    const slot = this.slots[i];
    if (!slot || i >= this.count || slot.outer) return;
    slot.outer = true;
    slot.expires = Math.max(slot.expires, slot.at + duration);
  }

  /** Removes the i-th waiting press (it was used, or is to be forgotten). */
  removeAt(i: number): void {
    if (i < 0 || i >= this.count) return;
    const slot = this.slots[i];
    for (let k = i; k < this.count - 1; k++) this.slots[k] = this.slots[k + 1];
    this.slots[this.count - 1] = slot;
    this.count--;
  }

  /** Keeps the i-th press usable until sim time `until` at least (WP-11: the outer lane's wall entry buffer). */
  hold(i: number, until: number): void {
    if (i >= 0 && i < this.count) this.slots[i].expires = Math.max(this.slots[i].expires, until);
  }

  /** The oldest press still live at sim time `now`, without taking it. */
  peek(now: number): Action | null {
    return this.live(now) > 0 ? this.slots[0].action : null;
  }

  /** Takes the oldest press still live at sim time `now`, or null. */
  take(now: number): Action | null {
    if (this.live(now) === 0) return null;
    const action = this.slots[0].action;
    this.removeAt(0);
    return action;
  }

  /** Forgets every press. */
  clear(): void {
    this.count = 0;
  }

  /** Presses waiting, live or not. */
  get size(): number {
    return this.count;
  }
}

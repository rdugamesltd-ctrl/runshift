import { INPUT } from '../../balance';
import type { Action } from '../types';

/** A press waiting in the buffer, with the sim time it was pushed at. */
interface Buffered {
  action: Action;
  at: number;
}

/**
 * Holds presses for INPUT.buffer seconds of sim time until the player can use them, so an early swipe
 * still counts. Times here are sim seconds (RunState.time), not the ActionEvent's milliseconds.
 * TODO WP-01: anything the mode logic needs beyond take/peek; WP-11: the wall entry buffer (WALL.entryBuffer).
 */
export class ActionBuffer {
  private readonly items: Buffered[] = [];

  /** Queues a press made at sim time `at`. */
  push(action: Action, at: number): void {
    this.items.push({ action, at });
  }

  /** The oldest press still live at sim time `now`, without taking it. */
  peek(now: number): Action | null {
    this.expire(now);
    return this.items.length > 0 ? this.items[0].action : null;
  }

  /** Takes the oldest press still live at sim time `now`, or null. */
  take(now: number): Action | null {
    this.expire(now);
    return this.items.shift()?.action ?? null;
  }

  /** Forgets every press. */
  clear(): void {
    this.items.length = 0;
  }

  /** Presses waiting, live or not. */
  get size(): number {
    return this.items.length;
  }

  private expire(now: number): void {
    while (this.items.length > 0 && now - this.items[0].at > INPUT.buffer) this.items.shift();
  }
}

import type { Action } from '../game/types';
import type { ActionEvent, InputPort } from './types';

/**
 * Keyboard, touch and mouse merged into one queue of actions, drained once per frame. WP-00 stub: no DOM
 * listeners yet, so only inject() (bots, window.__runshift.act) feeds it.
 * TODO WP-03: pointer events on window with setPointerCapture, SwipeDetector, keyboard, page guards
 * (contextmenu, gesturestart, dblclick, touchmove except .scrolls), blur → releaseAll.
 */
export class Input implements InputPort {
  private readonly queue: ActionEvent[] = [];
  private active = true;
  onPause: () => void = () => {};
  onMute: () => void = () => {};
  onConfirm: () => void = () => {};
  onFirstGesture: () => void = () => {};
  onGesture: () => void = () => {};

  /** Moves every queued action into out[0..n) and returns n. */
  drain(out: ActionEvent[]): number {
    const n = this.queue.length;
    for (let i = 0; i < n; i++) out[i] = this.queue[i];
    out.length = n;
    this.queue.length = 0;
    return n;
  }

  /** Queues an action as if pressed now (source 'bot'). */
  inject(action: Action): void {
    if (this.active) this.queue.push({ action, at: performance.now(), source: 'bot' });
  }

  /** Forgets everything held or queued (on blur, pause). */
  releaseAll(): void {
    this.queue.length = 0;
  }

  /** Turns gameplay input on or off (off on menus). */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.queue.length = 0;
  }
}

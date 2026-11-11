import type { Action } from '../game/types';

/** Arrows and WASD move, Space jumps. */
const KEY_ACTIONS: Readonly<Record<string, Action>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  Space: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

/** The action a KeyboardEvent.code stands for, or null. TODO WP-03: Esc/P pause, M mute, Enter confirm, e.repeat. */
export function keyToAction(code: string): Action | null {
  return KEY_ACTIONS[code] ?? null;
}

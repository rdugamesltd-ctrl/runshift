import type { Action } from '../game/types';

/** What a key does when it is not a move: pause the run, toggle the sound, or confirm (play, retry). */
export type KeyCommand = 'pause' | 'mute' | 'confirm';

/**
 * Arrows and WASD move, Space jumps. Keys go by KeyboardEvent.code, the key's position, so WASD is ZQSD on an
 * AZERTY keyboard.
 */
const KEY_ACTIONS: ReadonlyMap<string, Action> = new Map<string, Action>([
  ['ArrowLeft', 'left'],
  ['KeyA', 'left'],
  ['ArrowRight', 'right'],
  ['KeyD', 'right'],
  ['ArrowUp', 'up'],
  ['KeyW', 'up'],
  ['Space', 'up'],
  ['ArrowDown', 'down'],
  ['KeyS', 'down'],
]);

/** Esc and P pause, M mutes, Enter confirms. */
const KEY_COMMANDS: ReadonlyMap<string, KeyCommand> = new Map<string, KeyCommand>([
  ['Escape', 'pause'],
  ['KeyP', 'pause'],
  ['KeyM', 'mute'],
  ['Enter', 'confirm'],
  ['NumpadEnter', 'confirm'],
]);

/** The move a KeyboardEvent.code stands for, or null. */
export function keyToAction(code: string): Action | null {
  return KEY_ACTIONS.get(code) ?? null;
}

/** The command a KeyboardEvent.code stands for, or null. No key is both a move and a command. */
export function keyToCommand(code: string): KeyCommand | null {
  return KEY_COMMANDS.get(code) ?? null;
}

import { describe, expect, it } from 'vitest';
import type { Action } from '../game/types';
import { keyToAction, keyToCommand, type KeyCommand } from './keyboard';

const MOVES: [string, Action][] = [
  ['ArrowLeft', 'left'],
  ['KeyA', 'left'],
  ['ArrowRight', 'right'],
  ['KeyD', 'right'],
  ['ArrowUp', 'up'],
  ['KeyW', 'up'],
  ['Space', 'up'],
  ['ArrowDown', 'down'],
  ['KeyS', 'down'],
];

const COMMANDS: [string, KeyCommand][] = [
  ['Escape', 'pause'],
  ['KeyP', 'pause'],
  ['KeyM', 'mute'],
  ['Enter', 'confirm'],
  ['NumpadEnter', 'confirm'],
];

describe('keyToAction', () => {
  it('maps Arrows and WASD to moves and Space to up', () => {
    for (const [code, action] of MOVES) expect(keyToAction(code), code).toBe(action);
  });

  it('ignores every other key, by code (the key position), not by the character typed', () => {
    const others = ['KeyQ', 'KeyZ', 'Tab', 'ShiftLeft', 'Digit1', 'Numpad4', 'F5', 'a', 'arrowleft', '', 'toString', '__proto__'];
    for (const code of others) expect(keyToAction(code), code).toBeNull();
  });
});

describe('keyToCommand', () => {
  it('maps Esc and P to pause, M to mute, Enter to confirm', () => {
    for (const [code, command] of COMMANDS) expect(keyToCommand(code), code).toBe(command);
  });

  it('ignores every other key', () => {
    for (const code of ['KeyR', 'KeyC', 'Backspace', 'constructor', '']) expect(keyToCommand(code), code).toBeNull();
  });

  it('no key is both a move and a command', () => {
    for (const [code] of MOVES) expect(keyToCommand(code), code).toBeNull();
    for (const [code] of COMMANDS) expect(keyToAction(code), code).toBeNull();
  });
});

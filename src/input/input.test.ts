import { afterEach, describe, expect, it } from 'vitest';
import type { Action } from '../game/types';
import { Input } from './input';
import type { ActionEvent } from './types';

/** An Input on stand-in window and document targets, with a viewport and a clock the test controls. */
interface Rig {
  input: Input;
  win: EventTarget;
  doc: EventTarget;
  clock: { now: number };
  calls: { pause: number; mute: number; confirm: number };
}

const rigs: Rig[] = [];

function rig(w = 390, h = 844): Rig {
  const win = new EventTarget();
  const doc = new EventTarget();
  const size = { w, h };
  const clock = { now: 1000 };
  const input = new Input({ window: win, document: doc, viewport: () => size, now: () => clock.now });
  const calls = { pause: 0, mute: 0, confirm: 0 };
  input.onPause = () => calls.pause++;
  input.onMute = () => calls.mute++;
  input.onConfirm = () => calls.confirm++;
  const made = { input, win, doc, clock, calls };
  rigs.push(made);
  return made;
}

afterEach(() => {
  for (const made of rigs.splice(0)) made.input.dispose();
});

/** A stand-in element. */
interface FakeElement {
  captured: number[];
  closest(selector: string): object | null;
  setPointerCapture(id: number): void;
}

/** An element stand-in: closest() matches any of `selectors`; pointer capture is recorded, or throws. */
function element(selectors: string[] = [], captureThrows = false): FakeElement {
  const captured: number[] = [];
  return {
    captured,
    closest: (selector) => (selector.split(',').some((part) => selectors.includes(part.trim())) ? {} : null),
    setPointerCapture(id) {
      if (captureThrows) throw new Error('InvalidPointerId');
      captured.push(id);
    },
  };
}

/** Dispatches a cancelable `type` event with `props` on `on`; `target` stands in for the element it happened on. */
function fire(on: EventTarget, type: string, props: object = {}, target?: object): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), props);
  if (target) Object.defineProperty(event, 'target', { value: target });
  on.dispatchEvent(event);
  return event;
}

function key(r: Rig, code: string, props: object = {}, target?: object): Event {
  const plain = { code, key: code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false };
  return fire(r.win, 'keydown', { ...plain, ...props }, target);
}

function pointer(r: Rig, type: string, id: number, x: number, y: number, props: object = {}, target: object = element()): Event {
  return fire(r.win, type, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, ...props }, target);
}

/** A quick stroke by (dx, dy) in four moves 16 ms apart, then the lift. */
function stroke(r: Rig, id: number, dx: number, dy: number, props: object = {}, target: object = element()): void {
  const x = 200;
  const y = 400;
  pointer(r, 'pointerdown', id, x, y, props, target);
  for (let i = 1; i <= 4; i++) {
    r.clock.now += 16;
    pointer(r, 'pointermove', id, x + (dx * i) / 4, y + (dy * i) / 4, props);
  }
  r.clock.now += 16;
  pointer(r, 'pointerup', id, x + dx, y + dy, props);
}

function drained(r: Rig): ActionEvent[] {
  const out: ActionEvent[] = [];
  r.input.drain(out);
  return out;
}

function actions(r: Rig): Action[] {
  return drained(r).map((e) => e.action);
}

describe('Input keys', () => {
  it('Arrows and WASD move and Space jumps, one queued action per press, at the time of the press', () => {
    const cases: [string, Action][] = [
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
    const r = rig();
    for (const [code, action] of cases) {
      r.clock.now += 5;
      key(r, code);
      expect(drained(r), code).toEqual([{ action, at: r.clock.now, source: 'key' }]);
    }
  });

  it('an auto-repeat presses nothing, but the key is still kept from the browser', () => {
    const r = rig();
    const held = key(r, 'ArrowLeft', { repeat: true });
    expect(actions(r)).toEqual([]);
    expect(held.defaultPrevented).toBe(true);
    key(r, 'Escape', { repeat: true });
    key(r, 'KeyM', { repeat: true });
    key(r, 'Enter', { repeat: true });
    expect(r.calls).toEqual({ pause: 0, mute: 0, confirm: 0 });
    key(r, 'ArrowLeft');
    expect(actions(r)).toEqual(['left']);
  });

  it('game keys never reach the browser (no page scroll, no focused button pressed); other keys do', () => {
    const r = rig();
    for (const code of ['ArrowDown', 'ArrowUp', 'Space', 'KeyW', 'Enter', 'Escape']) {
      expect(key(r, code).defaultPrevented, code).toBe(true);
    }
    for (const code of ['KeyQ', 'Tab', 'F5', 'PageDown']) expect(key(r, code).defaultPrevented, code).toBe(false);
  });

  it('Esc and P pause, M mutes, Enter confirms', () => {
    const r = rig();
    for (const code of ['Escape', 'KeyP', 'KeyM', 'Enter', 'NumpadEnter']) key(r, code);
    expect(r.calls).toEqual({ pause: 2, mute: 1, confirm: 2 });
    expect(actions(r)).toEqual([]);
  });

  it('shortcuts with Ctrl, Alt or Meta, text composition and typing in a field stay the browser\'s', () => {
    const r = rig();
    const pressed = [
      key(r, 'ArrowLeft', { ctrlKey: true }),
      key(r, 'KeyM', { metaKey: true }),
      key(r, 'KeyP', { altKey: true }),
      key(r, 'KeyS', { isComposing: true }),
      key(r, 'KeyA', {}, element(['input'])),
      key(r, 'Space', {}, element(['textarea'])),
    ];
    expect(actions(r)).toEqual([]);
    expect(r.calls).toEqual({ pause: 0, mute: 0, confirm: 0 });
    for (const event of pressed) expect(event.defaultPrevented).toBe(false);
  });

  it('while inactive (menus) nothing is queued, but pause, mute and confirm still work', () => {
    const r = rig();
    r.input.setActive(false);
    key(r, 'ArrowLeft');
    r.input.inject('up');
    key(r, 'KeyM');
    key(r, 'Enter');
    key(r, 'KeyP');
    expect(actions(r)).toEqual([]);
    expect(r.calls).toEqual({ pause: 1, mute: 1, confirm: 1 });
    r.input.setActive(true);
    key(r, 'ArrowRight');
    expect(actions(r)).toEqual(['right']);
  });

  it('on the menus a focused button keeps Enter and Space, a scrolling panel its arrows; in a run they are the game\'s', () => {
    const r = rig();
    const button = element(['button', '[data-act]']);
    const panel = element(['.scrolls']);
    r.input.setActive(false);
    expect(key(r, 'Enter', {}, button).defaultPrevented).toBe(false);
    expect(key(r, 'Space', {}, button).defaultPrevented).toBe(false);
    expect(key(r, 'ArrowDown', {}, panel).defaultPrevented).toBe(false);
    expect(r.calls.confirm).toBe(0);
    // Not a key the button or the panel uses: still the game's.
    expect(key(r, 'KeyM', {}, button).defaultPrevented).toBe(true);
    expect(r.calls.mute).toBe(1);
    r.input.setActive(true);
    expect(key(r, 'Space', {}, button).defaultPrevented).toBe(true);
    expect(key(r, 'Enter', {}, button).defaultPrevented).toBe(true);
    expect(actions(r)).toEqual(['up']);
    expect(r.calls.confirm).toBe(1);
  });
});

describe('Input pointers', () => {
  it('a touch swipe is queued with source touch, at the time it fires', () => {
    const r = rig();
    pointer(r, 'pointerdown', 1, 200, 400);
    r.clock.now += 16;
    pointer(r, 'pointermove', 1, 188, 400);
    r.clock.now += 16;
    pointer(r, 'pointermove', 1, 176, 400);
    const fired = r.clock.now;
    r.clock.now += 16;
    pointer(r, 'pointerup', 1, 170, 400);
    expect(drained(r)).toEqual([{ action: 'left', at: fired, source: 'touch' }]);
  });

  it('a mouse drag with the main button is a swipe; other buttons are not', () => {
    const r = rig();
    stroke(r, 1, 60, 0, { pointerType: 'mouse' });
    expect(drained(r)).toEqual([expect.objectContaining({ action: 'right', source: 'mouse' })]);
    stroke(r, 1, 0, -60, { pointerType: 'mouse', button: 2 });
    stroke(r, 1, 0, -60, { pointerType: 'mouse', button: 1 });
    expect(actions(r)).toEqual([]);
    stroke(r, 2, 0, 60, { pointerType: 'pen' });
    expect(drained(r)).toEqual([expect.objectContaining({ action: 'down', source: 'touch' })]);
  });

  it('strokes that start on the UI are not actions', () => {
    const r = rig();
    for (const selector of ['[data-act]', '.panel', '.scrolls', 'button']) stroke(r, 1, -60, 0, {}, element([selector]));
    expect(actions(r)).toEqual([]);
    expect(r.input.stats).toEqual({ strokes: 0, swipes: 0 });
    stroke(r, 1, -60, 0);
    expect(actions(r)).toEqual(['left']);
    expect(r.input.stats).toEqual({ strokes: 1, swipes: 1 });
  });

  it('captures the pointer, and a capture that throws still keeps the stroke', () => {
    const r = rig();
    const canvas = element();
    pointer(r, 'pointerdown', 7, 200, 400, {}, canvas);
    expect(canvas.captured).toEqual([7]);
    pointer(r, 'pointerup', 7, 200, 400);
    stroke(r, 8, 0, -60, {}, element([], true));
    expect(actions(r)).toEqual(['up']);
  });

  it('two fingers swipe independently', () => {
    const r = rig();
    pointer(r, 'pointerdown', 1, 100, 400);
    pointer(r, 'pointerdown', 2, 300, 400);
    for (let i = 1; i <= 3; i++) {
      r.clock.now += 10;
      pointer(r, 'pointermove', 1, 100 - 10 * i, 400);
      pointer(r, 'pointermove', 2, 300, 400 + 10 * i);
    }
    pointer(r, 'pointerup', 1, 70, 400);
    pointer(r, 'pointerup', 2, 300, 430);
    expect(actions(r)).toEqual(['left', 'down']);
  });

  it('pointercancel forgets the stroke', () => {
    const r = rig();
    pointer(r, 'pointerdown', 1, 200, 400);
    pointer(r, 'pointermove', 1, 190, 400);
    pointer(r, 'pointercancel', 1, 0, 0);
    pointer(r, 'pointermove', 1, 100, 400);
    pointer(r, 'pointerup', 1, 100, 400);
    expect(actions(r)).toEqual([]);
  });

  it('blur and pagehide release everything: queued actions and strokes in progress', () => {
    for (const type of ['blur', 'pagehide']) {
      const r = rig();
      key(r, 'ArrowUp');
      pointer(r, 'pointerdown', 1, 200, 400);
      pointer(r, 'pointermove', 1, 190, 400);
      fire(r.win, type);
      pointer(r, 'pointermove', 1, 100, 400);
      pointer(r, 'pointerup', 1, 100, 400);
      expect(actions(r), type).toEqual([]);
    }
  });

  it('turning gameplay input on or off releases strokes in progress, so a finger already down does not act', () => {
    const r = rig();
    r.input.setActive(false);
    pointer(r, 'pointerdown', 1, 200, 400);
    r.input.setActive(true);
    pointer(r, 'pointermove', 1, 100, 400);
    pointer(r, 'pointerup', 1, 100, 400);
    expect(actions(r)).toEqual([]);
    // Setting the same state again changes nothing.
    pointer(r, 'pointerdown', 2, 200, 400);
    r.input.setActive(true);
    pointer(r, 'pointermove', 2, 100, 400);
    expect(actions(r)).toEqual(['left']);
  });
});

describe('Input page guards', () => {
  it('no context menu, no pinch zoom, no double-tap zoom', () => {
    const r = rig();
    expect(fire(r.win, 'contextmenu').defaultPrevented).toBe(true);
    expect(fire(r.doc, 'gesturestart').defaultPrevented).toBe(true);
    expect(fire(r.doc, 'dblclick').defaultPrevented).toBe(true);
  });

  it('touch scrolling is blocked everywhere but inside .scrolls', () => {
    const r = rig();
    expect(fire(r.doc, 'touchmove', {}, element()).defaultPrevented).toBe(true);
    expect(fire(r.doc, 'touchmove', {}, element(['.panel'])).defaultPrevented).toBe(true);
    expect(fire(r.doc, 'touchmove', {}, element(['.scrolls'])).defaultPrevented).toBe(false);
  });
});

describe('Input queue', () => {
  it('drain moves the queue into out[0..n), sets out.length = n and returns n', () => {
    const r = rig();
    r.input.inject('left');
    r.input.inject('up');
    const out: ActionEvent[] = [];
    for (let i = 0; i < 5; i++) out.push({ action: 'down', at: 0, source: 'key' });
    expect(r.input.drain(out)).toBe(2);
    expect(out.map((e) => e.action)).toEqual(['left', 'up']);
    expect(r.input.drain(out)).toBe(0);
    expect(out.length).toBe(0);
  });

  it('inject queues as the bot would press, at the current time', () => {
    const r = rig();
    r.clock.now = 4321;
    r.input.inject('down');
    expect(drained(r)).toEqual([{ action: 'down', at: 4321, source: 'bot' }]);
  });

  it('a queue nobody drains keeps only the newest presses', () => {
    const r = rig();
    for (let i = 0; i < 20; i++) r.input.inject(i % 2 === 0 ? 'left' : 'right');
    const out = drained(r);
    expect(out.length).toBe(16);
    expect(out[15].action).toBe('right');
  });

  it('releaseAll drops what is queued', () => {
    const r = rig();
    r.input.inject('left');
    r.input.releaseAll();
    expect(actions(r)).toEqual([]);
  });

  it('dispose removes every listener', () => {
    const r = rig();
    r.input.dispose();
    key(r, 'ArrowLeft');
    stroke(r, 1, -60, 0);
    expect(actions(r)).toEqual([]);
    expect(fire(r.win, 'contextmenu').defaultPrevented).toBe(false);
    expect(fire(r.doc, 'touchmove', {}, element()).defaultPrevented).toBe(false);
  });
});

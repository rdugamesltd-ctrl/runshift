import { describe, expect, it } from 'vitest';
import { installUnlock } from './unlock';

/** A port that logs its calls, on a stand-in window. */
function setUp(): { target: EventTarget; log: string[]; port: { onFirstGesture: () => void; onGesture: () => void } } {
  const target = new EventTarget();
  const log: string[] = [];
  const port = { onFirstGesture: () => log.push('first'), onGesture: () => log.push('gesture') };
  return { target, log, port };
}

function fire(target: EventTarget, type: string, props: object = {}): void {
  target.dispatchEvent(Object.assign(new Event(type), props));
}

describe('installUnlock', () => {
  it('calls onFirstGesture once, on the first gesture, and onGesture on every gesture', () => {
    const { target, log, port } = setUp();
    installUnlock(port, target);
    fire(target, 'pointerup');
    fire(target, 'touchend');
    fire(target, 'keydown', { key: 'a' });
    expect(log).toEqual(['first', 'gesture', 'gesture', 'gesture']);
  });

  it('each of pointerup, touchend and keydown can be the first gesture; other events are not gestures', () => {
    for (const type of ['pointerup', 'touchend', 'keydown']) {
      const { target, log, port } = setUp();
      installUnlock(port, target);
      for (const other of ['pointerdown', 'pointermove', 'touchstart', 'keyup', 'click']) fire(target, other);
      expect(log, type).toEqual([]);
      fire(target, type, { key: 'Enter' });
      expect(log, type).toEqual(['first', 'gesture']);
    }
  });

  it('skips Escape, which browsers do not count as a gesture', () => {
    const { target, log, port } = setUp();
    installUnlock(port, target);
    fire(target, 'keydown', { key: 'Escape' });
    expect(log).toEqual([]);
    fire(target, 'keydown', { key: ' ' });
    expect(log).toEqual(['first', 'gesture']);
  });

  it('reads the callbacks when a gesture comes, so they can be set after installing', () => {
    const { target, log, port } = setUp();
    installUnlock(port, target);
    port.onFirstGesture = () => log.push('late first');
    fire(target, 'pointerup');
    expect(log).toEqual(['late first', 'gesture']);
  });

  it('the returned function removes the listeners', () => {
    const { target, log, port } = setUp();
    const remove = installUnlock(port, target);
    remove();
    fire(target, 'pointerup');
    fire(target, 'keydown', { key: 'a' });
    expect(log).toEqual([]);
  });
});

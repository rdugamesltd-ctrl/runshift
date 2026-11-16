import { describe, expect, it } from 'vitest';
import { INPUT } from '../balance';
import type { Action } from '../game/types';
import { SwipeDetector } from './swipe';

/** One recorded pointer event: [kind, pointer id, x, y, t] (CSS px, ms). */
type Step = readonly ['down' | 'move' | 'up' | 'cancel', number, number, number, number];

/** A detector with the game's settings on a w×h viewport; `size` can be changed afterwards (a rotation). */
function detector(w = 390, h = 844): { det: SwipeDetector; size: { w: number; h: number } } {
  const size = { w, h };
  return { det: new SwipeDetector(INPUT.swipe, () => size), size };
}

/** Feeds a trace to the detector and lists every swipe it fires as 'id:action@t'. */
function play(det: SwipeDetector, steps: readonly Step[]): string[] {
  const fired: string[] = [];
  for (const [kind, id, x, y, t] of steps) {
    let action: Action | null = null;
    if (kind === 'down') det.down(id, x, y, t);
    else if (kind === 'move') action = det.move(id, x, y, t);
    else if (kind === 'up') action = det.up(id, x, y, t);
    else det.cancel(id);
    if (action) fired.push(`${id}:${action}@${t}`);
  }
  return fired;
}

/** Moves pointer `id` in a straight line from (x0, y0) by (dx, dy) in `n` even steps, one every `every` ms after t0. */
function line(id: number, x0: number, y0: number, dx: number, dy: number, t0: number, n: number, every: number): Step[] {
  const steps: Step[] = [];
  for (let i = 1; i <= n; i++) steps.push(['move', id, x0 + (dx * i) / n, y0 + (dy * i) / n, t0 + every * i]);
  return steps;
}

describe('SwipeDetector threshold', () => {
  it('is 6% of the viewport short side, clamped to [24, 48] CSS px', () => {
    const cases: [number, number, number][] = [
      [390, 844, 24], // 23.4 → 24
      [320, 568, 24],
      [844, 390, 24], // landscape: the short side is the height
      [700, 500, 30],
      [1280, 720, 43.2],
      [768, 1024, 46.08],
      [1920, 1080, 48], // 64.8 → 48
      [0, 0, 24],
    ];
    for (const [w, h, px] of cases) expect(detector(w, h).det.threshold()).toBeCloseTo(px, 9);
  });
});

describe('SwipeDetector traces', () => {
  it('fires each direction once, on the move that reaches the threshold', () => {
    const ways: [Action, number, number][] = [
      ['left', -60, 0],
      ['right', 60, 0],
      ['up', 0, -60],
      ['down', 0, 60],
    ];
    for (const [action, dx, dy] of ways) {
      const { det } = detector();
      // 10 px every 10 ms: 20 px at t = 20 is short of 24, 30 px at t = 30 is past it.
      const trace: Step[] = [['down', 1, 200, 400, 0], ...line(1, 200, 400, dx, dy, 0, 6, 10), ['up', 1, 200 + dx, 400 + dy, 70]];
      expect(play(det, trace), action).toEqual([`1:${action}@30`]);
    }
  });

  it('small screens: 23.9 px is not a swipe, 24 px is', () => {
    const { det } = detector(390, 844);
    expect(play(det, [['down', 1, 100, 100, 0], ['move', 1, 76.1, 100, 40], ['up', 1, 76.1, 100, 50]])).toEqual([]);
    expect(play(det, [['down', 1, 100, 100, 0], ['move', 1, 76, 100, 40], ['up', 1, 76, 100, 50]])).toEqual(['1:left@40']);
  });

  it('large screens: the threshold caps at 48 px; in between it is 6% of the short side', () => {
    const big = detector(1920, 1080).det;
    expect(play(big, [['down', 1, 500, 500, 0], ['move', 1, 500, 452.1, 60], ['up', 1, 500, 452.1, 70]])).toEqual([]);
    expect(play(big, [['down', 1, 500, 500, 0], ['move', 1, 500, 452, 60], ['up', 1, 500, 452, 70]])).toEqual(['1:up@60']);
    const mid = detector(700, 500).det;
    expect(play(mid, [['down', 1, 300, 300, 0], ['move', 1, 329.9, 300, 60], ['up', 1, 329.9, 300, 70]])).toEqual([]);
    expect(play(mid, [['down', 1, 300, 300, 0], ['move', 1, 330, 300, 60]])).toEqual(['1:right@60']);
  });

  it('the threshold follows the viewport (a rotation applies at once)', () => {
    const { det, size } = detector(390, 844);
    expect(play(det, [['down', 1, 300, 300, 0], ['move', 1, 330, 300, 30]])).toEqual(['1:right@30']);
    size.w = 1920;
    size.h = 1080;
    expect(play(det, [['down', 2, 300, 300, 100], ['move', 2, 330, 300, 130], ['up', 2, 330, 300, 140]])).toEqual([]);
  });

  it('fires on a move only when the major axis is at least 1.25× the minor', () => {
    const { det } = detector();
    // 40 = 1.25 × 32: just dominant enough.
    expect(play(det, [['down', 1, 100, 100, 0], ['move', 1, 140, 132, 40]])).toEqual(['1:right@40']);
    // 40 < 1.25 × 32.1: not on the move; the lift resolves it (next test).
    expect(play(det, [['down', 2, 100, 100, 100], ['move', 2, 140, 132.1, 140]])).toEqual([]);
    expect(play(det, [['up', 2, 140, 132.1, 150]])).toEqual(['2:right@150']);
  });

  it('a diagonal past the threshold resolves to the larger axis on the lift, so a real swipe is never dropped', () => {
    const { det } = detector();
    const steep: Step[] = [['down', 1, 200, 400, 0], ...line(1, 200, 400, -30, -36, 0, 3, 20), ['up', 1, 170, 364, 70]];
    expect(play(det, steep)).toEqual(['1:up@70']);
    // A tie goes to the lane change.
    const tie: Step[] = [['down', 2, 200, 400, 100], ['move', 2, 230, 430, 130], ['up', 2, 230, 430, 140]];
    expect(play(det, tie)).toEqual(['2:right@140']);
    // Short of the threshold it is nothing, diagonal or not.
    expect(play(det, [['down', 3, 200, 400, 200], ['move', 3, 220, 420, 230], ['up', 3, 220, 420, 240]])).toEqual([]);
  });

  it('a flick reported only by its down and up still swipes', () => {
    const { det } = detector();
    expect(play(det, [['down', 1, 0, 0, 0], ['up', 1, 60, 0, 50]])).toEqual(['1:right@50']);
  });

  it('a slow drag keeps re-anchoring and never adds up to a swipe', () => {
    const { det } = detector();
    // 120 px in 2.4 s at 60 Hz: about 15 px per window, well short of 24.
    const trace: Step[] = [['down', 1, 100, 400, 0], ...line(1, 100, 400, 120, 0, 0, 144, 1000 / 60), ['up', 1, 220, 400, 2410]];
    expect(play(det, trace)).toEqual([]);
  });

  it('measures from one sample older than the 280 ms window', () => {
    // 30 px over 270 ms: inside the window.
    expect(play(detector().det, [['down', 1, 0, 0, 0], ...line(1, 0, 0, 30, 0, 0, 3, 90)])).toEqual(['1:right@270']);
    // 30 px over 300 ms: the start is the one older sample kept, so it still counts.
    expect(play(detector().det, [['down', 1, 0, 0, 0], ...line(1, 0, 0, 30, 0, 0, 3, 100)])).toEqual(['1:right@300']);
    // 30 px over 600 ms: by the end the anchor has moved on to 10 px, so only 20 px are left.
    expect(play(detector().det, [['down', 1, 0, 0, 0], ...line(1, 0, 0, 30, 0, 0, 3, 200), ['up', 1, 30, 0, 600]])).toEqual([]);
  });

  it('a finger that rests and then flicks is measured from where it rested', () => {
    const { det } = detector();
    // A still finger sends no moves; after a second of rest a 48 px flick swipes as soon as it passes 24 px.
    const trace: Step[] = [['down', 1, 200, 400, 0], ...line(1, 200, 400, -48, 0, 1000, 4, 16)];
    expect(play(det, trace)).toEqual(['1:left@1032']);
  });

  it('a slow drag one way and then a flick the other way swipes the flick', () => {
    const { det } = detector();
    // Drag right 60 px over 1.5 s (2 px every 50 ms), then flick left 12 px every 16 ms. The flick has to undo
    // the drag's last window (10 px) first, so it fires at 26 px from the anchor, at t = 1548.
    const trace: Step[] = [
      ['down', 1, 100, 400, 0],
      ...line(1, 100, 400, 60, 0, 0, 30, 50),
      ...line(1, 160, 400, -48, 0, 1500, 4, 16),
    ];
    expect(play(det, trace)).toEqual(['1:left@1548']);
  });

  it('the origin resets after a swipe: a second swipe in the same touch needs a fresh threshold', () => {
    const { det } = detector();
    const trace: Step[] = [
      ['down', 1, 200, 400, 0],
      ['move', 1, 188, 400, 16],
      ['move', 1, 176, 400, 32], // 24 px left: fires
      ['move', 1, 176, 377, 48], // 23 px up from there: not yet
      ['move', 1, 176, 376, 64], // 24 px up: fires
      ['up', 1, 176, 376, 80],
    ];
    expect(play(det, trace)).toEqual(['1:left@32', '1:up@64']);
  });

  it('reversing in the same touch swipes back once it covers a fresh threshold', () => {
    const { det } = detector();
    const trace: Step[] = [
      ['down', 1, 200, 400, 0],
      ['move', 1, 176, 400, 32], // left
      ['move', 1, 190, 400, 48], // 14 px back: not yet
      ['move', 1, 200, 400, 64], // 24 px back: right
      ['up', 1, 200, 400, 80],
    ];
    expect(play(det, trace)).toEqual(['1:left@32', '1:right@64']);
  });

  it('a long flick is one swipe however far it goes, and a turn at its end still swipes', () => {
    const { det } = detector();
    // 150 px left in 150 ms: fires at 30 px, the other 120 px are follow-through. Then 30 px up in 30 ms.
    const trace: Step[] = [
      ['down', 1, 300, 400, 0],
      ...line(1, 300, 400, -150, 0, 0, 15, 10),
      ...line(1, 150, 400, 0, -30, 150, 3, 10),
      ['up', 1, 150, 370, 190],
    ];
    expect(play(det, trace)).toEqual(['1:left@30', '1:up@180']);
  });

  it('the same way twice in one touch needs the stroke to stop for a window in between', () => {
    // Flick, hold still for 300 ms, flick again: two swipes.
    const flick: Step[] = [['down', 1, 300, 400, 0], ...line(1, 300, 400, -30, 0, 0, 3, 10)];
    expect(play(detector().det, [...flick, ...line(1, 270, 400, -30, 0, 330, 3, 10)])).toEqual(['1:left@30', '1:left@360']);
    // Only 100 ms between the flicks: still the first stroke's follow-through.
    expect(play(detector().det, [...flick, ...line(1, 270, 400, -30, 0, 130, 3, 10)])).toEqual(['1:left@30']);
  });

  it('tracks each pointer on its own', () => {
    const { det } = detector();
    const trace: Step[] = [
      ['down', 1, 100, 400, 0],
      ['down', 2, 300, 400, 5],
      ['move', 1, 90, 400, 10],
      ['move', 2, 300, 390, 15],
      ['move', 1, 80, 400, 20],
      ['move', 2, 300, 380, 25],
      ['move', 1, 70, 400, 30], // pointer 1: 30 px left
      ['move', 2, 300, 370, 35], // pointer 2: 30 px up
      ['up', 1, 70, 400, 40],
      ['move', 2, 320, 370, 45], // pointer 1's lift leaves pointer 2 alone
      ['move', 2, 330, 370, 55], // 30 px right of where pointer 2 swiped
      ['cancel', 2, 0, 0, 60],
    ];
    expect(play(det, trace)).toEqual(['1:left@30', '2:up@35', '2:right@55']);
    expect(det.size).toBe(0);
  });

  it('a cancelled pointer is forgotten without a swipe', () => {
    const { det } = detector();
    const trace: Step[] = [
      ['down', 1, 200, 400, 0],
      ['move', 1, 180, 400, 10],
      ['cancel', 1, 0, 0, 20],
      ['move', 1, 140, 400, 30],
      ['up', 1, 140, 400, 40],
    ];
    expect(play(det, trace)).toEqual([]);
  });

  it('a tap, a jitter or an unknown pointer is not a swipe', () => {
    const { det } = detector();
    const jitter: Step[] = [
      ['down', 1, 200, 400, 0],
      ['move', 1, 203, 398, 16],
      ['move', 1, 198, 402, 32],
      ['move', 1, 201, 401, 48],
      ['up', 1, 201, 401, 60],
    ];
    expect(play(det, jitter)).toEqual([]);
    expect(play(det, [['down', 2, 10, 10, 100], ['up', 2, 10, 10, 180]])).toEqual([]);
    expect(play(det, [['move', 9, 500, 500, 200], ['up', 9, 600, 500, 210]])).toEqual([]);
  });

  it('a second down on a tracked pointer starts afresh', () => {
    const { det } = detector();
    // The lift of the first press went missing; the new press must not be measured from the old one.
    const trace: Step[] = [
      ['down', 1, 100, 400, 0],
      ['move', 1, 90, 400, 10],
      ['down', 1, 300, 400, 500],
      ['move', 1, 290, 400, 510],
      ['up', 1, 290, 400, 520],
    ];
    expect(play(det, trace)).toEqual([]);
  });

  it('clear() forgets every pointer', () => {
    const { det } = detector();
    play(det, [['down', 1, 100, 400, 0], ['down', 2, 300, 400, 0], ['move', 1, 90, 400, 10]]);
    det.clear();
    expect(det.size).toBe(0);
    expect(play(det, [['move', 1, 40, 400, 20], ['up', 2, 300, 300, 30]])).toEqual([]);
  });
});

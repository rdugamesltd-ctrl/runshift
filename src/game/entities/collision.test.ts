import { describe, expect, it } from 'vitest';
import { LANES, STUMBLE } from '../../balance';
import { createRunState } from '../systems/run';
import { createTestTrack, testBox } from '../track/testTrack';
import type { GameEvent } from '../types';
import { collide } from './collision';

describe('ground collisions', () => {
  it('crashes on a box directly ahead', () => {
    const box = testBox({ d0: 0.3, d1: 1, x0: -0.5, x1: 0.5, y0: 0, y1: 2 });
    const state = createRunState();
    state.phase = 'running';
    state.prev.d = 0;
    state.d = 0.1;
    const events: GameEvent[] = [];
    collide(state, createTestTrack({ boxes: [box] }), events, []);
    expect(state.player.mode.kind).toBe('crash');
    expect(state.cause).toBe('front');
    expect(events).toContainEqual({ type: 'crash', cause: 'front' });
  });

  it('stumbles when the lane change alone caused a hit, and crashes on a second one', () => {
    const first = testBox({ d0: 0, d1: 2, x0: 0.7, x1: 1.3, y0: 0, y1: 2 });
    const state = createRunState();
    const p = state.player;
    state.phase = 'running';
    state.time = 1;
    p.x = 0.6;
    p.lane = 1;
    p.laneFrom = 0;
    p.laneT = LANES.changeTime / 2;
    const events: GameEvent[] = [];
    collide(state, createTestTrack({ boxes: [first] }), events, []);
    expect(events).toContainEqual({ type: 'stumble', side: 1 });
    expect(p.lane).toBe(0);
    expect(p.stumbleT).toBe(STUMBLE.recover);

    const second = testBox({ d0: 0, d1: 2, x0: 0.7, x1: 1.3, y0: 0, y1: 2 });
    state.time += 1;
    p.invulnT = 0;
    p.x = 0.6;
    p.lane = 1;
    p.laneFrom = 0;
    p.laneT = LANES.changeTime / 2;
    collide(state, createTestTrack({ boxes: [second] }), events, []);
    expect(state.cause).toBe('stumble');
    expect(p.mode.kind).toBe('crash');
  });

  it('breaks an obstacle with the shield and grants invulnerability', () => {
    const box = testBox({ d0: 0, d1: 1, x0: -0.5, x1: 0.5, y0: 0, y1: 2 });
    const state = createRunState();
    state.powerUps.shield = 4;
    const events: GameEvent[] = [];
    collide(state, createTestTrack({ boxes: [box] }), events, []);
    expect(box.broken).toBe(true);
    expect(state.powerUps.shield).toBe(0);
    expect(state.player.invulnT).toBeGreaterThan(0);
    expect(events).toContainEqual({ type: 'shieldBreak', boxId: box.id });
  });

  it('uses the wall band box and reports a wall crash only in the blocked band', () => {
    const high = testBox({ d0: 0, d1: 1, x0: 2, x1: 3.6, y0: 1.5, y1: 3, kind: 'wallSignHigh', rule: 'bandHigh' });
    const low = testBox({ d0: 0, d1: 1, x0: 2, x1: 3.6, y0: 0.2, y1: 1.45, kind: 'wallVentLow', rule: 'bandLow' });
    const state = createRunState();
    state.player.mode = { kind: 'wallRun', side: 1, band: 'high', t: 0, bandY0: 2.1, bandT: 0.15 };
    state.player.x = 2.8;
    state.player.y = 2.1;
    const events: GameEvent[] = [];
    collide(state, createTestTrack({ boxes: [low] }), events, []);
    expect(events).toEqual([]);
    collide(state, createTestTrack({ boxes: [high] }), events, []);
    expect(state.cause).toBe('wall');
    expect(events).toContainEqual({ type: 'crash', cause: 'wall' });
  });

  it.each([
    { kind: 'wallSignHigh', rule: 'bandHigh', band: 'high', y: 2.1, blocked: true },
    { kind: 'wallSignHigh', rule: 'bandHigh', band: 'low', y: 0.9, blocked: false },
    { kind: 'wallVentLow', rule: 'bandLow', band: 'low', y: 0.9, blocked: true },
    { kind: 'wallVentLow', rule: 'bandLow', band: 'high', y: 2.1, blocked: false },
    { kind: 'wallPipeFull', rule: 'wallJump', band: 'low', y: 0.9, blocked: true },
    { kind: 'wallPipeFull', rule: 'wallJump', band: 'high', y: 2.1, blocked: true },
  ] as const)('$kind in $band band blocked=$blocked', ({ kind, rule, band, y, blocked }) => {
    const y0 = kind === 'wallSignHigh' ? 1.65 : kind === 'wallVentLow' ? 0.45 : 0.2;
    const y1 = kind === 'wallSignHigh' ? 2.55 : kind === 'wallVentLow' ? 1.35 : 3;
    const box = testBox({ d0: 0, d1: 1, x0: 2, x1: 3.6, y0, y1, kind, rule });
    const state = createRunState();
    state.player.mode = { kind: 'wallRun', side: 1, band, t: 0, bandY0: y, bandT: 0.15 };
    state.player.x = 2.8;
    state.player.y = y;
    const events: GameEvent[] = [];
    collide(state, createTestTrack({ boxes: [box] }), events, []);
    expect(state.cause === 'wall').toBe(blocked);
  });
});

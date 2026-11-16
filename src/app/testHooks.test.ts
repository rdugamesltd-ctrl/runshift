import { describe, expect, it } from 'vitest';
import type { GameEvent, RunState } from '../game/types';
import { debugState, EventLog } from './testHooks';

/** A run state built from the contract alone, so this test does not depend on the sim's own constructors. */
function makeRun(d: number): RunState {
  return {
    phase: 'running',
    time: 3,
    endTime: 0,
    d,
    v: 12,
    prev: { d, x: 0, y: 0, thiefD: d + 11, thiefX: 0, thiefY: 0 },
    player: {
      mode: { kind: 'jump', t: 0.1, fastFall: false },
      lane: 1,
      laneFrom: 0,
      laneT: 0,
      x: 2,
      y: 0.4,
      vy: 6,
      height: 1.7,
      wallTime: 0,
      stumbleT: 0,
      lastStumble: -99,
      invulnT: 0,
      gliding: false,
      glideSaves: 0,
    },
    thief: { d: d + 11, x: 0, y: 0, pose: 'run', side: 0, band: 'low', phase: 0 },
    gold: 4,
    score: 107,
    multiplier: 1,
    streak: 2,
    powerUps: { magnet: 0, shield: 0, multiplier: 0, glide: 0 },
    tier: 1,
    district: 'street',
    cause: null,
    frozen: false,
    airCoins: [],
  };
}

describe('debugState', () => {
  it('reports the run as the test contract describes', () => {
    const state = debugState(makeRun(100));
    expect(state).toEqual({
      phase: 'running',
      d: 100,
      v: 12,
      mode: 'jump',
      lane: 1,
      x: 2,
      y: 0.4,
      gold: 4,
      score: 107,
      tier: 1,
      district: 'street',
      thiefLead: 11,
      powerUps: { magnet: 0, shield: 0, multiplier: 0, glide: 0 },
    });
  });

  it('hands out copies, so a kept state does not change with the run', () => {
    const run = makeRun(0);
    const state = debugState(run);
    run.powerUps.magnet = 5;
    expect(state.powerUps.magnet).toBe(0);
  });
});

describe('EventLog', () => {
  it('gives every event since the last call, oldest first, then nothing', () => {
    const log = new EventLog();
    const a: GameEvent = { type: 'jump' };
    const b: GameEvent = { type: 'land', hard: false };
    log.push(a);
    log.push(b);
    expect(log.take()).toEqual([a, b]);
    expect(log.take()).toEqual([]);
  });

  it('keeps only the newest `max` events', () => {
    const log = new EventLog(10);
    for (let i = 0; i < 35; i++) log.push({ type: 'milestone', metres: i });
    expect(log.size).toBe(10);
    const events = log.take();
    expect(events).toHaveLength(10);
    expect(events[0]).toEqual({ type: 'milestone', metres: 25 });
    expect(events[9]).toEqual({ type: 'milestone', metres: 34 });
  });
});

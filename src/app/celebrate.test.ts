import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../game/types';
import { celebrate, type CelebrateTargets } from './celebrate';

function targets() {
  const log = { sounds: [] as GameEvent[], shakes: [] as number[], kicks: [] as number[], toasts: [] as string[] };
  const t: CelebrateTargets = {
    audio: { onEvent: (event) => log.sounds.push(event) },
    camera: { shake: (amount) => log.shakes.push(amount), kick: (amount) => log.kicks.push(amount) },
    toast: (text) => log.toasts.push(text),
  };
  return { t, log };
}

/** One of every GameEvent. */
const EVERY_EVENT: GameEvent[] = [
  { type: 'runStart' },
  { type: 'lane', from: 0, to: 1 },
  { type: 'bump', side: 1 },
  { type: 'jump' },
  { type: 'land', hard: false },
  { type: 'land', hard: true },
  { type: 'slide' },
  { type: 'fastFall' },
  { type: 'stumble', side: -1 },
  { type: 'wallAttach', side: -1, band: 'low' },
  { type: 'wallBand', band: 'high' },
  { type: 'wallSlip' },
  { type: 'wallJump', from: -1, to: 'wall' },
  { type: 'wallExit', side: 1 },
  { type: 'coin', d: 10, x: 0, y: 1, streak: 3, magnet: false },
  { type: 'pickup', kind: 'magnet' },
  { type: 'powerUpEnd', kind: 'shield' },
  { type: 'shieldBreak', boxId: 4 },
  { type: 'glideSave' },
  { type: 'thiefDemo', act: 'wall' },
  { type: 'thiefDrop' },
  { type: 'thiefTaunt' },
  { type: 'tier', tier: 2 },
  { type: 'district', district: 'subway' },
  { type: 'milestone', metres: 500 },
  { type: 'newBest' },
  { type: 'tip', id: 'jump', on: true },
  { type: 'crash', cause: 'front' },
  { type: 'fall' },
  { type: 'gameOver', cause: 'fall' },
];

describe('celebrate', () => {
  it('gives every event its sound, in order', () => {
    const { t, log } = targets();
    for (const event of EVERY_EVENT) celebrate(event, t);
    expect(log.sounds).toEqual(EVERY_EVENT);
  });

  it('shakes harder for a crash than a stumble, and a stumble than a hard landing; soft landings do not shake', () => {
    const shakeOf = (event: GameEvent) => {
      const { t, log } = targets();
      celebrate(event, t);
      return log.shakes.reduce((a, b) => a + b, 0);
    };
    expect(shakeOf({ type: 'land', hard: false })).toBe(0);
    const hard = shakeOf({ type: 'land', hard: true });
    const stumble = shakeOf({ type: 'stumble', side: 1 });
    const crash = shakeOf({ type: 'crash', cause: 'front' });
    expect(hard).toBeGreaterThan(0);
    expect(stumble).toBeGreaterThan(hard);
    expect(crash).toBeGreaterThan(stumble);
    expect(crash).toBeLessThanOrEqual(1);
  });

  it('kicks the FOV for bursts of speed', () => {
    for (const event of [{ type: 'wallJump', from: 1, to: 'floor' }, { type: 'glideSave' }, { type: 'tier', tier: 1 }] as GameEvent[]) {
      const { t, log } = targets();
      celebrate(event, t);
      expect(log.kicks.length).toBe(1);
    }
  });

  it('toasts milestones, new tiers, new bests, districts and pickups, but not the first tier', () => {
    const { t, log } = targets();
    for (const event of EVERY_EVENT) celebrate(event, t);
    celebrate({ type: 'tier', tier: 0 }, t);
    expect(log.toasts).toEqual(['MAGNET!', 'SHIELD BROKEN!', 'SAVED!', 'FASTER!', 'SUBWAY', '500 M', 'NEW BEST!']);
  });
});

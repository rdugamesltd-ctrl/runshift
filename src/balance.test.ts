import { describe, expect, it } from 'vitest';
import { CAMERA, CHUNK, FOG, JUMP, LANES, QUALITY, SPEED, THIEF, TIERS, UPGRADES, WALL } from './balance';
import obstacles from './game/track/obstacles.json';
import { hashString, makeRng, mixSeed } from './game/track/random';
import { distanceAt, speedAt, timeForDistance } from './game/track/speed';

/** The next `n` numbers from a generator. */
function take(rng: () => number, n: number): number[] {
  return Array.from({ length: n }, () => rng());
}

describe('balance invariants', () => {
  it('an ordinary jump stays below a metro train roof', () => {
    const g = (8 * JUMP.apex) / JUMP.airtime ** 2;
    expect(g).toBeGreaterThan(0);
    expect(JUMP.apex).toBeLessThan(obstacles.metroCar.y1);
  });

  it('the wall band boxes are valid, disjoint, and hold their band heights', () => {
    const { low, high } = WALL.bandBox;
    expect(low[0]).toBeLessThan(low[1]);
    expect(high[0]).toBeLessThan(high[1]);
    expect(low[1]).toBeLessThan(high[0]);
    expect(WALL.bandLow).toBeGreaterThan(low[0]);
    expect(WALL.bandLow).toBeLessThan(low[1]);
    expect(WALL.bandHigh).toBeGreaterThan(high[0]);
    expect(WALL.bandHigh).toBeLessThan(high[1]);
  });

  it('the W1 attach reach covers the near and centre lanes but not the far lane', () => {
    for (const side of [-1, 1] as const) {
      const gap = (lane: number) => Math.abs(lane * LANES.width - side * WALL.planeX);
      expect(gap(side)).toBeLessThanOrEqual(WALL.attachReach);
      expect(gap(0)).toBeLessThanOrEqual(WALL.attachReach);
      expect(gap(-side)).toBeGreaterThan(WALL.attachReach);
    }
  });

  it('a wall-jump spans exactly from one wall plane to the other', () => {
    expect(WALL.jumpLateral).toBeCloseTo(2 * WALL.planeX, 9);
  });

  it('speed starts at 11 m/s and tends to 26 m/s', () => {
    expect(speedAt(0)).toBe(11);
    expect(SPEED.start + SPEED.gain).toBe(26);
    expect(Math.abs(speedAt(10000) - 26)).toBeLessThanOrEqual(0.01);
  });

  it('timeForDistance(distanceAt(t)) gives t back', () => {
    for (const t of [0, 0.25, 1, 7.5, 60, 150, 600, 3600]) {
      expect(Math.abs(timeForDistance(distanceAt(t)) - t)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('the rng is deterministic per seed', () => {
    const a = take(makeRng(1234), 200);
    expect(take(makeRng(1234), 200)).toEqual(a);
    expect(take(makeRng(1235), 200)).not.toEqual(a);
    for (const x of a) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mixSeed(7, 3)).toBe(mixSeed(7, 3));
    expect(mixSeed(7, 3)).not.toBe(mixSeed(7, 4));
    expect(take(makeRng(mixSeed(7, -2)), 20)).toEqual(take(makeRng(mixSeed(7, -2)), 20));
    expect(hashString('runshift')).toBe(hashString('runshift'));
    expect(hashString('runshift')).not.toBe(hashString('runShift'));
  });

  it('the streaming window fits in CHUNK.maxActive chunks and reaches past the fog', () => {
    const worst = Math.ceil((CHUNK.horizon + CHUNK.recycleBehind) / CHUNK.length) + 1;
    expect(worst).toBeLessThanOrEqual(CHUNK.maxActive);
    expect(CHUNK.horizon).toBeGreaterThanOrEqual(FOG.far);
    expect(FOG.near).toBeLessThan(FOG.far);
    expect(FOG.far).toBeLessThan(CAMERA.far);
  });

  it('tiers start at 0 m and get denser, tighter and wallier, from 10% to 25% walls', () => {
    expect(TIERS[0].from).toBe(0);
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].from).toBeGreaterThan(TIERS[i - 1].from);
      expect(TIERS[i].actionsPer40).toBeGreaterThan(TIERS[i - 1].actionsPer40);
      expect(TIERS[i].minGap).toBeLessThan(TIERS[i - 1].minGap);
      expect(TIERS[i].wallShare).toBeGreaterThan(TIERS[i - 1].wallShare);
    }
    expect(TIERS[0].wallShare).toBe(0.1);
    expect(TIERS[TIERS.length - 1].wallShare).toBe(0.25);
  });

  it('along the whole speed curve the thief lead is leadS·v, inside its clamp', () => {
    expect(THIEF.minLead).toBeLessThan(THIEF.maxLead);
    expect(THIEF.leadS * SPEED.start).toBeGreaterThanOrEqual(THIEF.minLead);
    expect(THIEF.leadS * (SPEED.start + SPEED.gain)).toBeLessThanOrEqual(THIEF.maxLead);
  });

  it('upgrade costs cover every level and rise; quality scales step down from full resolution', () => {
    expect(UPGRADES.cost.length).toBe(UPGRADES.maxLevel);
    for (let i = 1; i < UPGRADES.cost.length; i++) expect(UPGRADES.cost[i]).toBeGreaterThan(UPGRADES.cost[i - 1]);
    expect(QUALITY.scales[0]).toBe(1);
    for (let i = 1; i < QUALITY.scales.length; i++) expect(QUALITY.scales[i]).toBeLessThan(QUALITY.scales[i - 1]);
  });
});

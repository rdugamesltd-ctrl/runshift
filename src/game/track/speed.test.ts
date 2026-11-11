import { describe, expect, it } from 'vitest';
import { SPEED } from '../../balance';
import { distanceAt, speedAt, timeForDistance } from './speed';

/** ∫₀ᵀ speedAt by Simpson's rule, as an independent check on the closed form. */
function simpson(T: number, n = 2000): number {
  const h = T / n;
  let sum = speedAt(0) + speedAt(T);
  for (let i = 1; i < n; i++) sum += speedAt(i * h) * (i % 2 === 1 ? 4 : 2);
  return (sum * h) / 3;
}

describe('speed curve', () => {
  it('follows v(t) = start + gain·(1 − e^(−t/tau))', () => {
    expect(speedAt(0)).toBe(SPEED.start);
    expect(speedAt(SPEED.tau)).toBeCloseTo(SPEED.start + SPEED.gain * (1 - Math.exp(-1)), 12);
    expect(speedAt(600)).toBeCloseTo(SPEED.start + SPEED.gain * (1 - Math.exp(-4)), 12);
  });

  it('is the start speed before the run starts', () => {
    expect(speedAt(-5)).toBe(SPEED.start);
    expect(distanceAt(-5)).toBe(0);
    expect(distanceAt(0)).toBe(0);
  });

  it('rises all the way and never reaches the top speed', () => {
    let last = speedAt(0);
    for (let t = 1; t <= 1500; t++) {
      const v = speedAt(t);
      expect(v).toBeGreaterThan(last);
      expect(v).toBeLessThan(SPEED.start + SPEED.gain);
      last = v;
    }
  });

  it('distanceAt is the integral of speedAt', () => {
    for (const T of [0.5, 30, 150, 900]) expect(distanceAt(T)).toBeCloseTo(simpson(T), 6);
  });

  it('distanceAt grows at speedAt', () => {
    for (const t of [0.1, 20, 150, 2000]) {
      const h = 1e-4;
      expect((distanceAt(t + h) - distanceAt(t - h)) / (2 * h)).toBeCloseTo(speedAt(t), 5);
    }
  });

  it('timeForDistance inverts distanceAt both ways, out to a million metres', () => {
    for (const t of [1e-3, 0.5, 2, 10, 75, 150, 400, 1000, 5000, 20000]) {
      expect(Math.abs(timeForDistance(distanceAt(t)) - t)).toBeLessThanOrEqual(1e-6);
    }
    for (const d of [0.01, 1, 40, 300, 1200, 3000, 6000, 1e5, 1e6]) {
      expect(Math.abs(distanceAt(timeForDistance(d)) - d)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('timeForDistance is 0 at or before the start and increases with distance', () => {
    expect(timeForDistance(0)).toBe(0);
    expect(timeForDistance(-10)).toBe(0);
    expect(timeForDistance(Number.NaN)).toBe(0);
    let last = 0;
    for (let d = 10; d <= 20000; d += 10) {
      const t = timeForDistance(d);
      expect(t).toBeGreaterThan(last);
      last = t;
    }
  });
});

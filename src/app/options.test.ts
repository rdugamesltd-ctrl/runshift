import { describe, expect, it } from 'vitest';
import { TIERS } from '../balance';
import { parseParams } from '../debug/params';
import { fixedQuality, randomSeed, reducedMotion, runOptions, startDistance } from './options';

describe('run options from the URL', () => {
  it('starts at 0 on a random seed by default', () => {
    expect(runOptions(parseParams(''), 1234)).toEqual({ seed: 1234, startD: 0 });
  });

  it('passes ?seed, ?d, ?tutorial, ?pattern and ?district to the track', () => {
    expect(runOptions(parseParams('?seed=7&d=640&tutorial&pattern=tut-lanes&district=subway'), 1)).toEqual({
      seed: 7,
      startD: 640,
      tutorial: true,
      pattern: 'tut-lanes',
      district: 'subway',
    });
  });

  it('starts ?tier=N at the first metre of tier N, clamped, unless ?d says otherwise', () => {
    expect(startDistance(parseParams('?tier=2'))).toBe(TIERS[2].from);
    expect(startDistance(parseParams('?tier=99'))).toBe(TIERS[TIERS.length - 1].from);
    expect(startDistance(parseParams('?tier=-3'))).toBe(0);
    expect(startDistance(parseParams('?tier=3&d=10'))).toBe(10);
    expect(startDistance(parseParams('?d=-50'))).toBe(0);
  });

  it('makes whole, non-negative 31-bit seeds', () => {
    expect(runOptions(parseParams('?seed=7.9'), 1).seed).toBe(7);
    for (const r of [0, 0.5, 0.999999]) {
      const seed = randomSeed(() => r);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 31);
    }
  });
});

describe('settings with URL overrides', () => {
  it('reduces motion for ?reduced, the setting, or the system preference on auto', () => {
    expect(reducedMotion(true, 'off', false)).toBe(true);
    expect(reducedMotion(false, 'on', false)).toBe(true);
    expect(reducedMotion(false, 'auto', true)).toBe(true);
    expect(reducedMotion(false, 'auto', false)).toBe(false);
    expect(reducedMotion(false, 'off', true)).toBe(false);
  });

  it('fixes the quality from ?quality first, then the setting', () => {
    expect(fixedQuality('low', 'high')).toBe('low');
    expect(fixedQuality(null, 'high')).toBe('high');
    expect(fixedQuality(null, 'auto')).toBeNull();
  });
});

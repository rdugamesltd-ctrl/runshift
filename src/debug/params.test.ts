import { describe, expect, it } from 'vitest';
import { parseParams, usesMemoryStore } from './params';

describe('parseParams', () => {
  it('gives the defaults for an empty query', () => {
    expect(parseParams('')).toEqual({
      debug: false,
      bot: null,
      seed: null,
      d: null,
      tier: null,
      pattern: null,
      district: null,
      speed: 1,
      greybox: false,
      quality: null,
      reduced: false,
      tutorial: false,
      powerups: null,
      nosw: false,
      chase: false,
    });
  });

  it('reads every parameter of the test contract', () => {
    const p = parseParams(
      '?debug&bot=perfect&seed=7&d=1200.5&tier=2&pattern=t2-wall-left-sign&district=rooftop&speed=4&greybox&quality=low&reduced&tutorial&powerups=all&nosw&chase',
    );
    expect(p).toEqual({
      debug: true,
      bot: 'perfect',
      seed: 7,
      d: 1200.5,
      tier: 2,
      pattern: 't2-wall-left-sign',
      district: 'rooftop',
      speed: 4,
      greybox: true,
      quality: 'low',
      reduced: true,
      tutorial: true,
      powerups: 'all',
      nosw: true,
      chase: true,
    });
  });

  it('treats unknown or malformed values as absent', () => {
    const p = parseParams('?bot=genius&seed=abc&d=&district=moon&speed=-2&quality=ultra&powerups=some&pattern=');
    expect(p.bot).toBeNull();
    expect(p.seed).toBeNull();
    expect(p.d).toBeNull();
    expect(p.district).toBeNull();
    expect(p.speed).toBe(1);
    expect(p.quality).toBeNull();
    expect(p.powerups).toBeNull();
    expect(p.pattern).toBeNull();
    expect(parseParams('?speed=0').speed).toBe(1);
    expect(parseParams('?speed=Infinity').speed).toBe(1);
  });
});

describe('usesMemoryStore', () => {
  it('switches test URLs to a throwaway save', () => {
    for (const query of ['?seed=1', '?d=500', '?tier=1', '?pattern=x', '?district=subway', '?bot=idle', '?tutorial']) {
      expect(usesMemoryStore(parseParams(query))).toBe(true);
    }
  });

  it('keeps the real save for ?debug, ?speed, ?quality, ?reduced, ?greybox and ?nosw', () => {
    expect(usesMemoryStore(parseParams('?debug&speed=2&quality=high&reduced&greybox&nosw'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { SPEED } from '../../balance';
import { PATTERNS } from './patterns';
import { validatePattern } from './validator';

describe('authored pattern replay', () => {
  for (const pattern of PATTERNS) {
    it.each([SPEED.start, SPEED.start + SPEED.gain])(`${pattern.id} survives at %i m/s`, v => {
      const result = validatePattern(pattern, v);
      expect(result.solvable).toBe(true);
      expect(result.pathOk).toBe(true);
      expect(result.minActions).toBe(pattern.actions);
    });
  }
});

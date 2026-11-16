import { describe, expect, it } from 'vitest';
import { formatCount, overlayText, type OverlaySample } from './overlay';

const sample: OverlaySample = {
  fps: 60,
  calls: 11,
  triangles: 12_345,
  dpr: 1.5,
  quality: 0,
  d: 123.456,
  v: 12.3456,
  tier: 1,
  district: 'street',
  screen: 'run',
  paused: false,
  phase: 'running',
  mode: 'jump',
  lane: -1,
  x: -2,
  y: 0.75,
  swipes: 4,
  strokes: 5,
};

describe('overlayText', () => {
  it('shows fps, calls, tris, d, v, tier and mode', () => {
    const text = overlayText(sample);
    for (const part of ['60 fps', '11 calls', '12.3k tris', 'd 123.5 m', 'v 12.35 m/s', 'tier 1', 'running/jump', 'swipes 4/5']) {
      expect(text).toContain(part);
    }
  });

  it('marks a pause and leaves out swipes the input does not report', () => {
    const text = overlayText({ ...sample, paused: true, swipes: null, strokes: null });
    expect(text).toContain('run paused');
    expect(text).not.toContain('swipes');
  });

  it('formats counts compactly', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(12_345)).toBe('12.3k');
    expect(formatCount(1_234_567)).toBe('1.23M');
  });
});

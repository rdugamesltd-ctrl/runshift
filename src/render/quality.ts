import { QUALITY } from '../balance';

/** Render scale for a quality level (0 = full), from QUALITY.scales. */
export function qualityScale(level: number): number {
  const scales = QUALITY.scales;
  return scales[Math.min(scales.length - 1, Math.max(0, Math.floor(level)))];
}

// TODO WP-04: watchFrameRate (below QUALITY.slowFps over QUALITY.window s → stage.lowerResolution).
// TODO WP-44: race perf.js governor (median of 90 frames, settle QUALITY.settle s), persist save.perf, probe a step up.

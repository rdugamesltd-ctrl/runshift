import { describe, expect, it } from 'vitest';
import { QUALITY } from '../balance';
import { clampQuality, FrameRateWatch, LOWEST_QUALITY, pixelRatioFor, qualityScale, watchFrameRate, isSoftwareRenderer } from './quality';

/** Feeds `seconds` of frames at `fps` and returns how many times the watch asked for a lower resolution. */
function feed(watch: FrameRateWatch, fps: number, seconds: number, active = true): number {
  let asks = 0;
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) if (watch.sample(1 / fps, active)) asks++;
  return asks;
}

describe('quality levels', () => {
  it('maps levels to QUALITY.scales, clamped', () => {
    expect(qualityScale(0)).toBe(1);
    expect(qualityScale(1)).toBe(QUALITY.scales[1]);
    expect(qualityScale(99)).toBe(QUALITY.scales[LOWEST_QUALITY]);
    expect(qualityScale(-1)).toBe(1);
    expect(clampQuality(Number.NaN)).toBe(0);
    expect(clampQuality(2.7)).toBe(2);
  });

  it('caps the pixel ratio at 1.5 on touch screens and 2 on desktops, times the render scale', () => {
    expect(pixelRatioFor(3, true, 0)).toBe(QUALITY.dprTouch);
    expect(pixelRatioFor(3, false, 0)).toBe(QUALITY.dprDesktop);
    expect(pixelRatioFor(1, false, 0)).toBe(1);
    expect(pixelRatioFor(2, false, 1)).toBeCloseTo(2 * QUALITY.scales[1], 9);
    expect(pixelRatioFor(Number.NaN, true, 0)).toBe(1);
  });
});

describe('FrameRateWatch', () => {
  it('leaves a fast device alone', () => {
    expect(feed(new FrameRateWatch(), 60, 30)).toBe(0);
  });

  it('asks once per window below QUALITY.slowFps, then settles before measuring again', () => {
    const watch = new FrameRateWatch();
    // 30 fps: the first window closes after QUALITY.window s.
    expect(feed(watch, 30, QUALITY.window - 0.1)).toBe(0);
    expect(feed(watch, 30, 0.2)).toBe(1);
    // During the settle time nothing is measured.
    expect(feed(watch, 30, QUALITY.settle - 0.1)).toBe(0);
    expect(feed(watch, 30, QUALITY.window + 0.3)).toBe(1);
  });

  it('only counts frames while active: a menu or pause restarts the window', () => {
    const watch = new FrameRateWatch();
    expect(feed(watch, 20, QUALITY.window - 0.5)).toBe(0);
    expect(feed(watch, 20, 0.2, false)).toBe(0);
    expect(feed(watch, 20, QUALITY.window - 0.5)).toBe(0);
    expect(feed(watch, 20, 1)).toBe(1);
  });

  it('watchFrameRate lowers until nothing is left to lower', () => {
    let level = 0;
    const lower = () => {
      if (level >= LOWEST_QUALITY) return false;
      level++;
      return true;
    };
    const tick = watchFrameRate(lower);
    for (let i = 0; i < 20 * 60 * 10; i++) tick(1 / 20, true);
    expect(level).toBe(LOWEST_QUALITY);
  });
});

describe('software rendering', () => {
  it('recognises CPU rasterisers by their renderer name', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('Microsoft Basic Render Driver')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)')).toBe(false);
    expect(isSoftwareRenderer('Apple GPU')).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});

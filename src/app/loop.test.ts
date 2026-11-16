import { describe, expect, it } from 'vitest';
import { SIM } from '../balance';
import { FixedStepper, startLoop, type FrameSource, type LoopHooks } from './loop';

/** Hooks that record what the loop did, in order. */
function recorder() {
  const calls: string[] = [];
  const alphas: number[] = [];
  let steps = 0;
  const hooks: LoopHooks = {
    frame: (elapsed) => calls.push(`frame ${elapsed.toFixed(4)}`),
    step: (dt) => {
      expect(dt).toBe(SIM.fixedDt);
      steps++;
      calls.push('step');
    },
    render: (alpha) => {
      alphas.push(alpha);
      calls.push('render');
    },
  };
  return { hooks, calls, alphas, steps: () => steps };
}

/** A fake requestAnimationFrame and clock: frames run only when the test says, at the times it gives (ms). */
function fakeFrames() {
  let pending: ((now: number) => void) | null = null;
  let last: number | null = null;
  let delta = 0;
  let disposed = false;
  const source: FrameSource = {
    request(callback) {
      pending = callback;
      return 1;
    },
    cancel() {
      pending = null;
    },
    clock: {
      update(timestamp?: number) {
        const now = timestamp ?? 0;
        delta = last === null ? 0 : (now - last) / 1000;
        last = now;
      },
      getDelta: () => delta,
      dispose() {
        disposed = true;
      },
    },
  };
  return {
    source,
    /** Runs the next animation frame at `now` ms. Returns false if none was requested. */
    run(now: number): boolean {
      const callback = pending;
      pending = null;
      callback?.(now);
      return callback !== null;
    },
    disposed: () => disposed,
  };
}

describe('FixedStepper', () => {
  it('runs one step per 1/60 s frame and drains input before the first step', () => {
    const r = recorder();
    const stepper = new FixedStepper(r.hooks);
    for (let i = 0; i < 60; i++) stepper.tick(1 / 60);
    expect(r.steps()).toBe(60);
    expect(r.calls.slice(0, 3)).toEqual(['frame 0.0167', 'step', 'render']);
  });

  it('accumulates short frames and interpolates between steps', () => {
    const r = recorder();
    const stepper = new FixedStepper(r.hooks);
    // A 120 Hz display: a step every other frame.
    const counts = Array.from({ length: 8 }, () => stepper.tick(1 / 120));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
    for (const alpha of r.alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
    expect(r.alphas[0]).toBeCloseTo(0.5, 6);
    expect(r.alphas[1]).toBeCloseTo(0, 6);
  });

  it('cuts a long frame to SIM.maxFrame so the sim never spirals', () => {
    const r = recorder();
    const stepper = new FixedStepper(r.hooks);
    const steps = stepper.tick(5);
    expect(steps).toBe(Math.round(SIM.maxFrame / SIM.fixedDt));
    expect(r.calls[0]).toBe(`frame ${SIM.maxFrame.toFixed(4)}`);
  });

  it('scales sim time with timeScale (?speed)', () => {
    const r = recorder();
    const stepper = new FixedStepper(r.hooks);
    stepper.timeScale = 4;
    for (let i = 0; i < 30; i++) stepper.tick(1 / 60);
    expect(r.steps()).toBe(120);
  });

  it('holds alpha and runs no steps while paused, then carries on where it was', () => {
    const r = recorder();
    const stepper = new FixedStepper(r.hooks);
    stepper.tick(1.5 / 60);
    expect(r.steps()).toBe(1);
    const held = stepper.alpha;
    expect(held).toBeCloseTo(0.5, 6);
    stepper.paused = true;
    for (let i = 0; i < 10; i++) stepper.tick(1 / 60);
    expect(r.steps()).toBe(1);
    expect(r.alphas.slice(-10).every((alpha) => alpha === held)).toBe(true);
    stepper.paused = false;
    stepper.tick(0.5 / 60);
    expect(r.steps()).toBe(2);
  });

  it('treats negative and NaN frame times as zero', () => {
    const r = recorder();
    const stepper = new FixedStepper(r.hooks);
    expect(stepper.tick(-0.004)).toBe(0);
    expect(stepper.tick(Number.NaN)).toBe(0);
    expect(r.alphas).toEqual([0, 0]);
  });

  it('keeps exact time over a long run of uneven frames', () => {
    const r = recorder();
    const stepper = new FixedStepper(r.hooks);
    const frames = [0.016, 0.017, 0.0165, 0.033, 0.008, 0.0167];
    let total = 0;
    for (let i = 0; i < 600; i++) {
      const dt = frames[i % frames.length];
      total += dt;
      stepper.tick(dt);
    }
    expect(r.steps()).toBe(Math.floor(total / SIM.fixedDt + 1e-6));
  });
});

describe('startLoop', () => {
  it('drives the stepper from animation frames and the clock, and stops for good', () => {
    const r = recorder();
    const frames = fakeFrames();
    const loop = startLoop(r.hooks, frames.source);
    // The first frame has no previous time: a zero delta, no step.
    frames.run(1000);
    expect(r.steps()).toBe(0);
    for (let i = 1; i <= 60; i++) frames.run(1000 + (i * 1000) / 60);
    expect(r.steps()).toBe(60);
    loop.timeScale = 2;
    frames.run(1000 + (61 * 1000) / 60);
    expect(r.steps()).toBe(62);
    loop.paused = true;
    frames.run(1000 + (62 * 1000) / 60);
    expect(r.steps()).toBe(62);
    loop.stop();
    expect(frames.disposed()).toBe(true);
    expect(frames.run(2000)).toBe(false);
  });
});

import { Timer } from 'three';
import { SIM } from '../balance';

/** What the loop calls each animation frame. */
export interface LoopHooks {
  /** Once per frame before the steps: drain input here, so the frame's first step uses it. `elapsed` is the frame time, s. */
  frame(elapsed: number): void;
  /** One fixed step of SIM.fixedDt seconds. */
  step(dt: number): void;
  /** Draws the frame. `alpha` in [0, 1) is how far time has got between the last step and the next. */
  render(alpha: number, elapsed: number): void;
}

/** The running loop. */
export interface Loop {
  /** While paused no steps run and `alpha` holds still, so the picture does not shimmer; frames still draw. */
  paused: boolean;
  /** Sim speed (?speed): sim seconds per real second. */
  timeScale: number;
  /** Stops for good (the WebGL context was lost, or tests). */
  stop(): void;
}

/** The clock the loop reads once per frame: three's Timer, or a fake in tests. Deltas are seconds. */
export interface FrameClock {
  update(timestamp?: number): unknown;
  getDelta(): number;
  dispose(): void;
}

/** Where frames come from: requestAnimationFrame and a Timer in the browser, fakes in tests. */
export interface FrameSource {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
  clock: FrameClock;
}

/** An accumulator within this much of a whole step runs it, s: sums of 1/60 drift by a few ulps. */
const STEP_EPSILON = 1e-9;
/** At most this many steps in one frame, however high ?speed goes, so a tab never locks up. */
const MAX_STEPS_PER_FRAME = 600;

/**
 * The fixed-step accumulator without the DOM (so tests drive it with a fake clock). Each tick() is one frame:
 * the frame time is cut to `maxFrame` (a hitch or a tab coming back never makes the sim spiral), `frame()` runs
 * once, then as many fixed steps as the scaled time allows, then `render()` with the interpolation alpha.
 */
export class FixedStepper {
  /** While paused no steps run and the accumulator (so alpha) keeps its value. */
  paused = false;
  /** Sim seconds per real second. */
  timeScale = 1;
  readonly fixedDt: number;
  readonly maxFrame: number;
  private readonly hooks: LoopHooks;
  private accumulator = 0;

  constructor(hooks: LoopHooks, fixedDt: number = SIM.fixedDt, maxFrame: number = SIM.maxFrame) {
    this.hooks = hooks;
    this.fixedDt = fixedDt;
    this.maxFrame = maxFrame;
  }

  /** How far time has got between the last step and the next, in [0, 1). */
  get alpha(): number {
    const alpha = this.accumulator / this.fixedDt;
    return alpha <= 0 ? 0 : Math.min(alpha, 1 - Number.EPSILON);
  }

  /** Runs one frame that took `frameSeconds` of real time (negative or NaN counts as 0). Returns the steps run. */
  tick(frameSeconds: number): number {
    const elapsed = frameSeconds > 0 ? Math.min(frameSeconds, this.maxFrame) : 0;
    this.hooks.frame(elapsed);
    let steps = 0;
    if (!this.paused) {
      const scale = this.timeScale > 0 && Number.isFinite(this.timeScale) ? this.timeScale : 1;
      this.accumulator += elapsed * scale;
      while (this.accumulator >= this.fixedDt - STEP_EPSILON && steps < MAX_STEPS_PER_FRAME) {
        this.hooks.step(this.fixedDt);
        this.accumulator -= this.fixedDt;
        steps++;
      }
      // Only reachable at an absurd ?speed: drop the backlog rather than carry it into the next frame.
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = Math.min(this.accumulator, this.fixedDt * (1 - Number.EPSILON));
    }
    this.hooks.render(this.alpha, elapsed);
    return steps;
  }
}

/** requestAnimationFrame and a Timer connected to the document, which never hands back the time a hidden tab spent away. */
export function browserFrames(): FrameSource {
  const timer = new Timer();
  timer.connect(document);
  return {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
    clock: timer,
  };
}

/**
 * Starts the fixed-step loop: SIM.fixedDt steps, frames capped at SIM.maxFrame, render interpolation
 * (FixedStepper), one animation frame at a time from `source`.
 */
export function startLoop(hooks: LoopHooks, source: FrameSource = browserFrames()): Loop {
  const stepper = new FixedStepper(hooks);
  let running = true;
  let handle = 0;
  const frame = (now: number) => {
    if (!running) return;
    handle = source.request(frame);
    source.clock.update(now);
    stepper.tick(source.clock.getDelta());
  };
  handle = source.request(frame);
  return {
    get paused() {
      return stepper.paused;
    },
    set paused(paused: boolean) {
      stepper.paused = paused;
    },
    get timeScale() {
      return stepper.timeScale;
    },
    set timeScale(scale: number) {
      stepper.timeScale = scale;
    },
    stop() {
      if (!running) return;
      running = false;
      source.cancel(handle);
      source.clock.dispose();
    },
  };
}

/**
 * Calls `onLeave` whenever the player may have looked away: the tab is hidden, the window loses focus, or the page is
 * put away (pagehide; iOS sends it when the app goes to the background). Returns a function that stops listening.
 */
export function watchPageLeave(onLeave: () => void): () => void {
  const hidden = () => {
    if (document.hidden) onLeave();
  };
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('blur', onLeave);
  window.addEventListener('pagehide', onLeave);
  return () => {
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('blur', onLeave);
    window.removeEventListener('pagehide', onLeave);
  };
}

/**
 * Calls `onLost` once if the GPU drops the WebGL context (a driver reset, too many tabs on a phone). The default is
 * prevented, so the page is not torn down; the app stops its loop and offers a reload.
 */
export function watchContextLoss(canvas: HTMLCanvasElement, onLost: () => void): void {
  let lost = false;
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (lost) return;
    lost = true;
    onLost();
  });
}

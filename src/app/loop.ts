import { Timer } from 'three';
import { SIM } from '../balance';

/** What the loop calls each animation frame. */
export interface LoopHooks {
  /** Once per frame before the steps (drain input here). `elapsed` is the frame time, s. */
  frame(elapsed: number): void;
  /** One fixed step of SIM.fixedDt seconds. */
  step(dt: number): void;
  /** Draws the frame. `alpha` in [0, 1) is how far time has got between the last step and the next. */
  render(alpha: number, elapsed: number): void;
}

/** The running loop. */
export interface Loop {
  /** While paused no steps run; frames still draw. */
  paused: boolean;
  /** Sim speed (?speed). */
  timeScale: number;
  stop(): void;
}

/**
 * Starts the fixed-step loop: SIM.fixedDt steps, frames capped at SIM.maxFrame, render interpolation.
 * The Timer follows page visibility, so a hidden tab never comes back with a huge frame.
 * TODO WP-04: pause on visibilitychange/blur/pagehide, resume by tap plus 3-2-1, watchFrameRate.
 */
export function startLoop(hooks: LoopHooks): Loop {
  const timer = new Timer();
  timer.connect(document);
  let accumulator = 0;
  let handle = 0;
  const loop: Loop = {
    paused: false,
    timeScale: 1,
    stop() {
      cancelAnimationFrame(handle);
      timer.dispose();
    },
  };
  const frame = (now: number) => {
    handle = requestAnimationFrame(frame);
    timer.update(now);
    const elapsed = Math.min(timer.getDelta(), SIM.maxFrame);
    hooks.frame(elapsed);
    if (loop.paused) accumulator = 0;
    else {
      accumulator += elapsed * loop.timeScale;
      while (accumulator >= SIM.fixedDt) {
        hooks.step(SIM.fixedDt);
        accumulator -= SIM.fixedDt;
      }
    }
    hooks.render(accumulator / SIM.fixedDt, elapsed);
  };
  handle = requestAnimationFrame(frame);
  return loop;
}

import { QUALITY } from '../balance';

/** The lowest quality level: the last index into QUALITY.scales. */
export const LOWEST_QUALITY = QUALITY.scales.length - 1;

/** A quality level clamped to a whole index into QUALITY.scales. */
export function clampQuality(level: number): number {
  return Math.min(LOWEST_QUALITY, Math.max(0, Math.floor(level) || 0));
}

/** Render scale for a quality level (0 = full), from QUALITY.scales. */
export function qualityScale(level: number): number {
  return QUALITY.scales[clampQuality(level)];
}

/**
 * The renderer's pixel ratio: the device's, capped at QUALITY.dprTouch on touch screens (a phone at 1.5 looks sharp
 * and draws about half the pixels of 2) or QUALITY.dprDesktop, times the quality level's render scale.
 */
export function pixelRatioFor(devicePixelRatio: number, touch: boolean, level: number): number {
  const cap = touch ? QUALITY.dprTouch : QUALITY.dprDesktop;
  const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(device, cap) * qualityScale(level);
}

/** Renderer names that mean WebGL is drawn on the CPU (no usable GPU): Chrome's SwiftShader, Mesa's llvmpipe and softpipe, Windows' basic adapter. */
const SOFTWARE_RENDERERS = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** Whether a WebGL renderer name (the unmasked renderer string) is a software rasteriser. */
export function isSoftwareRenderer(name: string | null | undefined): boolean {
  return typeof name === 'string' && SOFTWARE_RENDERERS.test(name);
}

/**
 * Whether this browser draws WebGL without a GPU, asked of a throwaway context before the game's own is made. Such
 * a machine starts at the lowest quality (no shadows, no multisampling, the smallest render scale) instead of
 * spending its first seconds finding that out frame by frame. False when it cannot tell.
 */
export function softwareRendering(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoftwareRenderer(typeof name === 'string' ? name : null);
  } catch {
    return false;
  }
}

/**
 * Watches the frame rate while a run is on. Pure: the loop feeds it frame times. A window of QUALITY.window seconds
 * averaging below QUALITY.slowFps asks for a lower resolution; after that it waits QUALITY.settle seconds before
 * measuring again, so the new resolution is judged on its own frames. Frames that do not count (a menu, a pause, a
 * hidden tab, the intro) restart the window, so a loading hitch never lowers the resolution.
 */
export class FrameRateWatch {
  private time = 0;
  private frames = 0;
  private settle = 0;

  constructor(
    private readonly slowFps: number = QUALITY.slowFps,
    private readonly span: number = QUALITY.window,
    private readonly settleTime: number = QUALITY.settle,
  ) {}

  /** Counts one frame of `elapsed` seconds. Returns true when the window just closed below slowFps. */
  sample(elapsed: number, active: boolean): boolean {
    if (!active || !(elapsed > 0)) {
      this.time = 0;
      this.frames = 0;
      return false;
    }
    if (this.settle > 0) {
      this.settle -= elapsed;
      return false;
    }
    this.time += elapsed;
    this.frames++;
    if (this.time < this.span) return false;
    const fps = this.frames / this.time;
    this.time = 0;
    this.frames = 0;
    if (fps >= this.slowFps) return false;
    this.settle = this.settleTime;
    return true;
  }

  /** Forgets the frames counted so far. */
  reset(): void {
    this.time = 0;
    this.frames = 0;
  }
}

/**
 * A slow device draws at a lower resolution rather than at a juddering frame rate (Rail in the Air's rule): returns a
 * per-frame function that lowers the resolution through `lower` whenever FrameRateWatch says so, until `lower`
 * reports there is nothing left to lower. Measured over running frames only (`active`).
 * TODO WP-44: race perf.js governor (median of 90 frames), persist save.perf, probe a step up next session.
 */
export function watchFrameRate(lower: () => boolean): (elapsed: number, active: boolean) => void {
  const watch = new FrameRateWatch();
  let exhausted = false;
  return (elapsed, active) => {
    if (!exhausted && watch.sample(elapsed, active)) exhausted = !lower();
  };
}

/** One reading of the debug overlay (?debug). */
export interface OverlaySample {
  fps: number;
  /** Draw calls and triangles of the last frame. */
  calls: number;
  triangles: number;
  dpr: number;
  /** Adaptive quality level (index into QUALITY.scales). */
  quality: number;
  d: number;
  v: number;
  tier: number;
  district: string;
  screen: string;
  paused: boolean;
  phase: string;
  mode: string;
  lane: number;
  x: number;
  y: number;
  /** Swipes recognised out of strokes started on the play area, when the input reports them. */
  swipes: number | null;
  strokes: number | null;
}

/** 1234 → '1234', 12345 → '12.3k', 1234567 → '1.23M'. */
export function formatCount(n: number): string {
  if (n < 10_000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** The overlay's lines: frame cost, where the run is, what the player is doing, how swipes are landing. */
export function overlayText(s: OverlaySample): string {
  const lines = [
    `${s.fps} fps  ${s.calls} calls  ${formatCount(s.triangles)} tris  dpr ${s.dpr.toFixed(2)}  q${s.quality}`,
    `d ${s.d.toFixed(1)} m  v ${s.v.toFixed(2)} m/s  tier ${s.tier}  ${s.district}`,
    `${s.screen}${s.paused ? ' paused' : ''}  ${s.phase}/${s.mode}  lane ${s.lane}  x ${s.x.toFixed(2)}  y ${s.y.toFixed(2)}`,
  ];
  if (s.swipes !== null && s.strokes !== null) lines.push(`swipes ${s.swipes}/${s.strokes}`);
  return lines.join('\n');
}

/** A small monospace readout in the bottom-left corner (?debug). Never takes a touch. */
export class DebugOverlay {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.className = 'debug-overlay';
    Object.assign(this.el.style, {
      position: 'absolute',
      left: 'calc(8px + env(safe-area-inset-left, 0px))',
      bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
      zIndex: '5',
      margin: '0',
      padding: '4px 8px',
      font: '11px/1.4 ui-monospace, Consolas, monospace',
      color: '#fff4dd',
      background: 'rgba(28, 35, 64, 0.8)',
      borderRadius: '4px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    });
    parent.appendChild(this.el);
  }

  /** Replaces the text (only touches the DOM when it changed). */
  show(text: string): void {
    if (this.el.textContent !== text) this.el.textContent = text;
  }

  dispose(): void {
    this.el.remove();
  }
}

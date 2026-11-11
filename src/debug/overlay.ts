/**
 * A small monospace readout in the corner (?debug). TODO WP-04: fps, calls, tris, d, v, tier, mode, swipe count.
 */
export class DebugOverlay {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.className = 'debug-overlay';
    Object.assign(this.el.style, {
      position: 'absolute',
      left: '8px',
      bottom: '8px',
      margin: '0',
      padding: '4px 8px',
      font: '12px/1.4 ui-monospace, Consolas, monospace',
      color: '#fff4dd',
      background: 'rgba(28, 35, 64, 0.8)',
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

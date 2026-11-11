import type { RunState } from '../game/types';
import './styles.css';

/**
 * The in-run HUD. WP-00 stub: shows nothing.
 * TODO WP-05: score, gold, multiplier and power-up readouts ([data-hud=...]), pause button, text at 1/12 s.
 */
export class Hud {
  readonly root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  setVisible(_visible: boolean): void {}
  update(_run: RunState, _dt: number): void {}
}

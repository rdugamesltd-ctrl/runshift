import type { RunResult } from '../game/types';

/** Mounts a panel's content into its element. */
export type PanelMount = (panel: HTMLElement) => void;

/**
 * Menu, results, pause and countdown screens (.scr-menu, .scr-results, .scr-pause). WP-00 stub: shows nothing.
 * TODO WP-05: every screen, [data-act=...] buttons, NEW BEST, toasts, panels (settings, upgrades, credits, howto).
 */
export class Menus {
  private readonly panels = new Map<string, PanelMount>();

  constructor(_root: HTMLElement) {}

  /** Registers a panel another package owns (settings WP-43, upgrades WP-32, credits WP-52). */
  registerPanel(id: string, mount: PanelMount): void {
    this.panels.set(id, mount);
  }

  showMenu(): void {}
  showResults(_result: RunResult): void {}
  showPause(_paused: boolean): void {}
  hideAll(): void {}
}

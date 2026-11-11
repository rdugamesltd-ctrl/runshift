/**
 * The test contract (WP-00 types, WP-04 implementation): what browser tests, bots and tools may rely on.
 * Frozen like the other contracts: later changes are additive only.
 *
 * - `window.__runshift` exists with ?debug or ?bot.
 * - DOM selectors: screens `.scr-menu`, `.scr-results`, `.scr-pause`; buttons `[data-act=...]` (DataAct);
 *   HUD readouts `[data-hud=...]` (DataHud).
 * - URL params: UrlParams below. Any of seed/d/tier/pattern/district/bot/tutorial switches the save to a
 *   throwaway memoryStore, so tests never touch the player's real save.
 * - Performance marks: PerfMark below.
 */
import type { Action, District, GameEvent, Lane, PlayerMode, PowerUpKind, RunPhase, SaveData } from '../game/types';

/** The app's screens (Session.screen). */
export type ScreenName = 'menu' | 'run' | 'results';

/** What window.__runshift.state() returns. */
export interface DebugState {
  phase: RunPhase;
  d: number;
  v: number;
  mode: PlayerMode['kind'];
  lane: Lane;
  x: number;
  y: number;
  gold: number;
  score: number;
  tier: number;
  district: District;
  /** Metres from the player to the thief (thief.d − d). */
  thiefLead: number;
  /** As in RunState.powerUps. */
  powerUps: Record<PowerUpKind, number>;
}

/** What window.__runshift.stats() returns: the last frame's renderer numbers. */
export interface DebugStats {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  dpr: number;
  /** Adaptive quality level: an index into QUALITY.scales. */
  quality: number;
}

/** window.__runshift. */
export interface RunshiftHooks {
  /** True once the first frame is drawn. */
  ready: boolean;
  screen(): ScreenName;
  paused(): boolean;
  play(): void;
  retry(): void;
  toMenu(): void;
  /** Presses an action as the bot input source would. */
  act(action: Action): void;
  /** Every GameEvent since the previous call, oldest first. */
  events(): GameEvent[];
  state(): DebugState;
  stats(): DebugStats;
  /** A copy of the current save. */
  save(): SaveData;
}

/** `data-act` values on buttons. */
export type DataAct =
  | 'play' | 'retry' | 'menu' | 'pause' | 'resume' | 'mute' | 'settings' | 'howto' | 'credits' | 'upgrades' | 'back'
  | `buy-${PowerUpKind}`;

/** `data-hud` values on HUD readouts. */
export type DataHud = 'score' | 'gold' | 'multiplier' | 'powerups';

/** Screen classes. */
export type ScreenClass = 'scr-menu' | 'scr-results' | 'scr-pause';

/** Bot kinds for ?bot=. */
export type BotName = 'perfect' | 'sloppy' | 'random' | 'idle';

/** URL parameters, parsed by src/debug/params.ts. Absent values are null (or false, or speed 1). */
export interface UrlParams {
  /** ?debug: hooks and the debug overlay. */
  debug: boolean;
  /** ?bot=perfect|sloppy|random|idle: a bot plays (hooks on). */
  bot: BotName | null;
  /** ?seed=N: the track seed. */
  seed: number | null;
  /** ?d=metres: start this far along. */
  d: number | null;
  /** ?tier=N: force a tier. */
  tier: number | null;
  /** ?pattern=id: repeat one pattern. */
  pattern: string | null;
  /** ?district=street|rooftop|subway. */
  district: District | null;
  /** ?speed=x: time scale (default 1). */
  speed: number;
  /** ?greybox: grey-box view even when the kit is there. */
  greybox: boolean;
  /** ?quality=low|high: fixed quality. */
  quality: 'low' | 'high' | null;
  /** ?reduced: reduced motion. */
  reduced: boolean;
  /** ?tutorial: replay the tutorial. */
  tutorial: boolean;
  /** ?powerups=all: start with every power-up. */
  powerups: 'all' | null;
  /** ?nosw: no service worker. */
  nosw: boolean;
}

/** performance.mark names: script start, assets loaded, menu shown, first run frame. */
export type PerfMark = 'runshift:main' | 'runshift:assets' | 'runshift:menu' | 'runshift:run';

declare global {
  interface Window {
    __runshift?: RunshiftHooks;
  }
}

/** Puts the hooks on window.__runshift. Call only with ?debug or ?bot. */
export function installHooks(hooks: RunshiftHooks): void {
  window.__runshift = hooks;
}

import { QUALITY, UPGRADES } from '../../balance';
import type { PowerUpKind, SaveData, TipId } from '../types';

/** Bump when the save's shape changes; cleanSave carries old saves over field by field. */
export const SAVE_VERSION = 1;
/** localStorage key. */
export const SAVE_KEY = 'runshift-save';
/** Every power-up, in display order. */
export const POWER_UPS: readonly PowerUpKind[] = ['magnet', 'shield', 'multiplier', 'glide'];
/** Every tutorial tip, in the order a new player meets them. */
export const TIP_IDS: readonly TipId[] = ['lanes', 'jump', 'slide', 'wall', 'band', 'wallJump'];

/** A new player's save. */
export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 0,
    highScore: 0,
    bestDistance: 0,
    upgrades: { magnet: 0, shield: 0, multiplier: 0, glide: 0 },
    settings: { muted: false, reducedMotion: 'auto', quality: 'auto' },
    tips: [],
    totals: { runs: 0, metres: 0, goldEarned: 0, wallRuns: 0 },
    perf: { level: 0, low: false },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function whole(value: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/**
 * Builds a valid save out of whatever was stored. Anything missing or wrong falls back to its default,
 * field by field, so one bad value never costs the player the rest of their progress (Rail's pattern).
 * TODO WP-01: fuzz tests.
 */
export function cleanSave(raw: unknown): SaveData {
  const save = defaultSave();
  if (!isObject(raw)) return save;
  save.gold = whole(raw.gold);
  save.highScore = whole(raw.highScore);
  save.bestDistance = whole(raw.bestDistance);
  const upgrades = raw.upgrades;
  if (isObject(upgrades)) for (const kind of POWER_UPS) save.upgrades[kind] = whole(upgrades[kind], 0, UPGRADES.maxLevel);
  const settings = raw.settings;
  if (isObject(settings)) {
    save.settings.muted = settings.muted === true;
    save.settings.reducedMotion = oneOf(settings.reducedMotion, ['auto', 'on', 'off'], 'auto');
    save.settings.quality = oneOf(settings.quality, ['auto', 'high', 'low'], 'auto');
  }
  if (Array.isArray(raw.tips)) {
    const tips: unknown[] = raw.tips;
    save.tips = TIP_IDS.filter((id) => tips.includes(id));
  }
  const totals = raw.totals;
  if (isObject(totals)) {
    save.totals = {
      runs: whole(totals.runs),
      metres: whole(totals.metres),
      goldEarned: whole(totals.goldEarned),
      wallRuns: whole(totals.wallRuns),
    };
  }
  const perf = raw.perf;
  if (isObject(perf)) save.perf = { level: whole(perf.level, 0, QUALITY.scales.length - 1), low: perf.low === true };
  return save;
}

/** Where the save goes. Tests and URL test hooks use an in-memory one. */
export interface SaveStore {
  read(key: string): string | null;
  write(key: string, text: string): void;
}

/** localStorage, falling back to memory for the session where it is blocked (some embedded pages). */
export function browserStore(): SaveStore {
  const memory = new Map<string, string>();
  return {
    read(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    write(key, text) {
      memory.set(key, text);
      try {
        localStorage.setItem(key, text);
      } catch {
        // Storage is full or blocked. The copy in memory keeps this session going.
      }
    },
  };
}

/** A throwaway store, for tests and test URLs. */
export function memoryStore(initial: Record<string, string> = {}): SaveStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    read: (key) => data.get(key) ?? null,
    write: (key, text) => {
      data.set(key, text);
    },
  };
}

/** Reads the save from a store, cleaned. An unreadable save starts over. */
export function loadSave(store: SaveStore): SaveData {
  const text = store.read(SAVE_KEY);
  if (!text) return defaultSave();
  try {
    return cleanSave(JSON.parse(text));
  } catch {
    return defaultSave();
  }
}

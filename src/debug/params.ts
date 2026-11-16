import type { District } from '../game/types';
import type { BotName, UrlParams } from './hooks';

const BOTS: readonly BotName[] = ['perfect', 'sloppy', 'random', 'idle'];
const DISTRICTS: readonly District[] = ['street', 'rooftop', 'subway'];
const QUALITIES: readonly ('low' | 'high')[] = ['low', 'high'];

function oneOf<T extends string>(value: string | null, options: readonly T[]): T | null {
  return options.find((option) => option === value) ?? null;
}

function numberParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Reads the URL test parameters (see UrlParams in hooks.ts). Unknown or malformed values count as absent. */
export function parseParams(search: string): UrlParams {
  const params = new URLSearchParams(search);
  const speed = numberParam(params, 'speed');
  return {
    debug: params.has('debug'),
    bot: oneOf(params.get('bot'), BOTS),
    seed: numberParam(params, 'seed'),
    d: numberParam(params, 'd'),
    tier: numberParam(params, 'tier'),
    pattern: params.get('pattern') || null,
    district: oneOf(params.get('district'), DISTRICTS),
    speed: speed !== null && speed > 0 ? speed : 1,
    greybox: params.has('greybox'),
    quality: oneOf(params.get('quality'), QUALITIES),
    reduced: params.has('reduced'),
    tutorial: params.has('tutorial'),
    powerups: params.get('powerups') === 'all' ? 'all' : null,
    nosw: params.has('nosw'),
    chase: params.has('chase'),
  };
}

/** Test URLs (seed, d, tier, pattern, district, bot, tutorial) play on a throwaway save. */
export function usesMemoryStore(p: UrlParams): boolean {
  return p.seed !== null || p.d !== null || p.tier !== null || p.pattern !== null || p.district !== null || p.bot !== null || p.tutorial;
}

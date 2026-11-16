import { TIERS } from '../balance';
import type { UrlParams } from '../debug/hooks';
import type { SaveData, StreamerOptions } from '../game/types';

/**
 * Where a run starts, m: ?d wins; ?tier=N starts at the first metre of tier N (TIERS[N].from, N clamped), since a
 * tier follows from the distance; otherwise 0. Never negative.
 */
export function startDistance(params: Pick<UrlParams, 'd' | 'tier'>): number {
  if (params.d !== null) return Math.max(0, params.d);
  if (params.tier !== null) return TIERS[Math.min(TIERS.length - 1, Math.max(0, Math.floor(params.tier)))].from;
  return 0;
}

/** The run's track options from the URL test hooks: ?seed (else `randomSeed`), ?d or ?tier, ?tutorial, ?pattern, ?district. */
export function runOptions(params: UrlParams, randomSeed: number): StreamerOptions {
  const options: StreamerOptions = {
    seed: params.seed !== null ? Math.trunc(params.seed) : randomSeed,
    startD: startDistance(params),
  };
  if (params.tutorial) options.tutorial = true;
  if (params.pattern !== null) options.pattern = params.pattern;
  if (params.district !== null) options.district = params.district;
  return options;
}

/** A fresh random track seed (31 bits, so it survives any integer maths in the streamer). */
export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff);
}

/** Reduced motion: ?reduced, or the setting ('on'), or with the setting on 'auto' the system's preference. */
export function reducedMotion(param: boolean, setting: SaveData['settings']['reducedMotion'], systemPrefers: boolean): boolean {
  return param || setting === 'on' || (setting === 'auto' && systemPrefers);
}

/** A fixed quality from ?quality, else from the setting; null leaves it adaptive. */
export function fixedQuality(param: UrlParams['quality'], setting: SaveData['settings']['quality']): 'low' | 'high' | null {
  return param ?? (setting === 'auto' ? null : setting);
}

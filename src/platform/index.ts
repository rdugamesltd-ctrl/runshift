import { LocalPlatform } from './local';
import type { Platform } from './platform';

/**
 * The platform adapter for this build, picked by __PLATFORM__ (from `vite --mode`, see vite.config.ts). A portal
 * adapter is a dynamic import, so its code is only in its own build: in the local build the branches are constant
 * false and drop out. If a portal adapter fails to load, the game still plays, as the local build.
 */
export async function loadPlatform(): Promise<Platform> {
  try {
    if (__PLATFORM__ === 'poki') return new (await import('./poki')).PokiPlatform();
    if (__PLATFORM__ === 'crazygames') return new (await import('./crazygames')).CrazyGamesPlatform();
  } catch (error) {
    console.warn(`RUNSHIFT: the ${__PLATFORM__} adapter did not load, playing without the portal`, error);
  }
  return new LocalPlatform();
}

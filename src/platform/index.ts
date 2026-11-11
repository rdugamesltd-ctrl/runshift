import { LocalPlatform } from './local';
import type { Platform } from './platform';

/**
 * The platform adapter for this build (__PLATFORM__, from `vite --mode`). A portal's SDK code is only loaded
 * in its own build.
 */
export async function loadPlatform(): Promise<Platform> {
  if (__PLATFORM__ === 'poki') return new (await import('./poki')).PokiPlatform();
  if (__PLATFORM__ === 'crazygames') return new (await import('./crazygames')).CrazyGamesPlatform();
  return new LocalPlatform();
}

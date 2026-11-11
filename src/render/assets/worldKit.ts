import type { AssetRegistry } from '../types';

/**
 * Loads public/assets/world-kit.glb. WP-00 stub: there is no kit yet, so the game runs in grey-box mode.
 * TODO WP-22: load and register every KitModel.
 */
export async function loadWorldKit(): Promise<AssetRegistry | null> {
  return null;
}

import type { AssetRegistry, CharacterAsset, CharacterName } from '../types';

/**
 * A registry with no models in it. TODO WP-22: the real registry from the world kit; WP-24: characters.
 */
export function createEmptyRegistry(): AssetRegistry {
  return {
    has: () => false,
    parts: () => [],
    extras: () => ({}),
    character(name: CharacterName): CharacterAsset {
      throw new Error(`No character model for ${name} yet`);
    },
  };
}

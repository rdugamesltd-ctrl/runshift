import type { CharacterAsset, CharacterName } from '../types';

/**
 * Loads public/assets/characters/{hero,thief}.glb. WP-00 stub: none yet (grey-box capsules stand in).
 * TODO WP-24: load, map clips to ClipName, bones, height, runNaturalSpeed.
 */
export async function loadCharacters(): Promise<Record<CharacterName, CharacterAsset> | null> {
  return null;
}

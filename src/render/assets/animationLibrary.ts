import type { AnimationClip } from 'three';
import type { AnimationLibrary, ClipName } from '../types';

/** An AnimationLibrary over clips already matched to ClipNames. TODO WP-24: the regex clip map (characters.json). */
export function createAnimationLibrary(clips: Partial<Record<ClipName, AnimationClip>>): AnimationLibrary {
  const available = (Object.keys(clips) as ClipName[]).filter((name) => clips[name] !== undefined);
  return {
    get: (name) => clips[name] ?? null,
    has: (name) => clips[name] !== undefined,
    available,
  };
}

import { Box3, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { TOON } from '../../balance';
import type { CharacterAsset, CharacterBones, CharacterName, ClipName } from '../types';
import { createAnimationLibrary } from './animationLibrary';
import { assetUrl } from './loaders';
import { makeRamp } from '../toon/ramp';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { buildCharacter, HERO_DESIGN, THIEF_DESIGN } from '../characters/characterBuilder';
import { dressTexturedCharacter } from '../characters/texturedCharacter';

/** The CC0 rig the thief is built on (its skeleton and clips; the body is ours, see characterBuilder). */
const RIG_FILE = 'characters/thief.glb';
/**
 * The hero: the police officer, a Tripo model rigged on the same skeleton names and clips as the rig
 * (tools/assets/build-cop.mjs). Without it the hero falls back to the built speedster on the rig.
 */
const HERO_FILE = 'characters/cop.glb';

/** The game's clip names and the source clip each plays. */
const CLIP_MAP: Partial<Record<ClipName, string>> = {
  idle: 'Idle', run: 'Run', jump: 'Jump', fall: 'Jump_Idle', land: 'Jump_Land', slide: 'Duck',
  hurt: 'HitReact', knockback: 'Death', victory: 'Yes', dive: 'Jump', turn: 'Walk', walk: 'Walk',
};

/**
 * Loads the cop and the animated rig, builds the thief (and, if the cop is missing, a speedster hero) on the rig, and
 * maps the source clips to the game's clip names.
 */
export async function loadCharacters(): Promise<Record<CharacterName, CharacterAsset> | null> {
  const loader = new GLTFLoader();
  const ramp = makeRamp(TOON.ramp);
  const rig = loader.loadAsync(assetUrl(RIG_FILE));
  rig.catch(() => undefined);
  const cop = loader.loadAsync(assetUrl(HERO_FILE));
  cop.catch(() => undefined);

  const asset = (gltf: GLTF, scene: Object3D): CharacterAsset => {
    const source = new Map(gltf.animations.map(clip => [clip.name.split('|').pop() ?? clip.name, clip]));
    const clips: Partial<Record<ClipName, (typeof gltf.animations)[number]>> = {};
    for (const [name, sourceName] of Object.entries(CLIP_MAP) as [ClipName, string][]) {
      const clip = source.get(sourceName);
      if (clip) clips[name] = clip;
    }
    // GLTFLoader strips the dots from node names ('Foot.L' loads as 'FootL').
    const boneNames = new Set<string>();
    scene.traverse(object => { if (object.type === 'Bone') boneNames.add(object.name); });
    const find = (names: string[]): string | null =>
      names.map(name => name.replaceAll('.', '')).find(name => boneNames.has(name)) ?? null;
    const bones: CharacterBones = {
      hips: find(['Hips', 'Body']) ?? 'Hips', spine: find(['Torso', 'Abdomen']), chest: find(['Torso']),
      head: find(['Head']), handL: find(['Fist.L', 'Middle1.L']), handR: find(['Fist.R', 'Middle1.R']),
      footL: find(['Foot.L']), footR: find(['Foot.R']),
    };
    const bounds = new Box3().setFromObject(scene);
    return { template: scene, clips: createAnimationLibrary(clips), bones,
      height: bounds.max.y - bounds.min.y, runNaturalSpeed: 11 };
  };

  const loadHero = async (): Promise<CharacterAsset> => {
    try {
      const gltf = await cop;
      dressTexturedCharacter(gltf.scene);
      return asset(gltf, gltf.scene);
    } catch (error) {
      console.warn('Cop model unavailable; building the speedster hero instead.', error);
      const gltf = await rig;
      const scene = clone(gltf.scene);
      buildCharacter(scene, HERO_DESIGN, ramp);
      return asset(gltf, scene);
    }
  };

  try {
    // The hero first: should it fall back, it copies the rig before the thief takes the original.
    const hero = await loadHero();
    const gltf = await rig;
    buildCharacter(gltf.scene, THIEF_DESIGN, ramp);
    const thief = asset(gltf, gltf.scene);
    return { hero, thief };
  } catch (error) {
    console.warn('Character assets unavailable; using grey-box capsules.', error);
    return null;
  }
}

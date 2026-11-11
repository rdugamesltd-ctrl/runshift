/**
 * The render contract (WP-00). Frozen: later changes are additive only and go through the integrator.
 * Views read the simulation and never write it.
 */
import type { AnimationClip, BufferGeometry, Material, Object3D, PerspectiveCamera, Scene } from 'three';
import type { ChunkStreamer, RunState } from '../game/types';

/** Every model in the baked world kit (public/assets/world-kit.glb). */
export type KitModel = 'barrier-low' | 'barrier-high' | 'blocker' | 'car-taxi' | 'metro-car' | 'roof-unit' | 'wall-sign' | 'wall-vent' | 'wall-pipe'
  | 'coin' | 'pickup-magnet' | 'pickup-shield' | 'pickup-multiplier' | 'pickup-glide' | 'gold-sack' | 'glide-board'
  | 'cone' | 'water-tower' | 'scaffolding' | 'street-lamp' | 'hydrant' | 'bench' | 'bin' | 'fence' | 'roof-exit' | 'fire-escape' | 'billboard'
  | `building-${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}`;
/** One drawable part of a kit model. `shellStart` is where the baked outline shell starts in the index buffer, or null. */
export interface KitPart { geometry: BufferGeometry; material: Material; shellStart: number | null }
/** The two animated characters. */
export type CharacterName = 'hero' | 'thief';
/** Animation clips a character may have. Missing ones fall back to poses. */
export type ClipName = 'idle' | 'run' | 'jump' | 'fall' | 'land' | 'slide' | 'hurt' | 'knockback' | 'victory' | 'dive' | 'turn' | 'walk';
/** A character's clips by name. */
export interface AnimationLibrary { get(name: ClipName): AnimationClip | null; has(name: ClipName): boolean; readonly available: readonly ClipName[] }
/** Names of the bones the views drive directly (sanitised by GLTFLoader, for example 'mixamorigHips'). */
export interface CharacterBones { hips: string; spine: string | null; chest: string | null; head: string | null; handL: string | null; handR: string | null; footL: string | null; footR: string | null }
/** A loaded character: a template to clone, its clips and bones, its height (m) and the speed (m/s) its run clip was made for. */
export interface CharacterAsset { template: Object3D; clips: AnimationLibrary; bones: CharacterBones; height: number; runNaturalSpeed: number }
/** Every loaded model, by name. */
export interface AssetRegistry { has(name: KitModel): boolean; parts(name: KitModel): readonly KitPart[]; extras(name: KitModel): Readonly<Record<string, unknown>>; character(name: CharacterName): CharacterAsset }
/** Motion settings that change how views animate. */
export interface MotionSettings { reduced: boolean }
/** What every view is built with. `assets` is null in grey-box mode. */
export interface ViewContext { scene: Scene; camera: PerspectiveCamera; assets: AssetRegistry | null; motion: MotionSettings }
/** A per-frame view of the run. `alpha` in [0, 1) interpolates from run.prev to the current step; `dt` is the frame time, s. */
export interface View { update(run: RunState, track: ChunkStreamer, alpha: number, dt: number): void; dispose(): void }

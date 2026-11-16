import { Mesh, type Color, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { AssetRegistry, KitModel, KitPart } from '../types';
import { markShared } from '../dispose';
import { toonify } from '../toon/toonify';
import { makeRamp } from '../toon/ramp';
import { TOON } from '../../balance';
import { assetUrl } from './loaders';

/**
 * The city's own colours for the CC0 building and scenery models, by source material name. The models arrive in
 * greys; here their walls turn white so each lot can tint them (`tint`), and trims, glass, roofs and doors take the
 * game's warm palette.
 */
const REPAINT: Readonly<Record<string, { colour: string; tint?: boolean; glow?: number }>> = {
  _defaultMat: { colour: '#ffffff', tint: true },
  White: { colour: '#ffffff', tint: true },
  LightYellow: { colour: '#ffffff', tint: true },
  border: { colour: '#f3e9d8' },
  Beige: { colour: '#f3e9d8' },
  GreyBlue: { colour: '#e4d9c8' },
  WhiteBlue: { colour: '#f4f8fa' },
  LightBlue: { colour: '#8fd3f4', glow: 0.12 },
  window: { colour: '#8fd3f4', glow: 0.12 },
  Grey: { colour: '#8d8691' },
  DarkGrey: { colour: '#5d5a66' },
  BrickRed: { colour: '#cf6a50' },
  Brown: { colour: '#8a5a3c' },
  door: { colour: '#bfae9a' },
  roof: { colour: '#d9694a' },
  foliage: { colour: '#4cb568' },
  wood: { colour: '#9b6b47' },
  Light: { colour: '#fff3c4', glow: 0.5 },
};

/** Repaints a model's materials from REPAINT (matched by name) and marks the tintable ones in userData.tint. */
function repaint(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const paint = REPAINT[material.name];
      if (!paint || !('color' in material)) continue;
      (material.color as Color).set(paint.colour);
      if (paint.tint) material.userData.tint = true;
      if (paint.glow && 'emissive' in material) {
        (material.emissive as Color).set(paint.colour);
        material.emissiveIntensity = paint.glow;
      }
    }
  });
}

/** Loads the baked world kit. Missing optional assets leave the grey-box playable. */
export async function loadWorldKit(): Promise<AssetRegistry | null> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let scene: Object3D;
  try {
    scene = (await loader.loadAsync(assetUrl('world-kit.glb'))).scene;
  } catch (error) {
    console.warn('World kit unavailable; using grey-box scenery.', error);
    return null;
  }
  const optional = async (file: string): Promise<Object3D | null> => {
    try { return (await loader.loadAsync(assetUrl(file))).scene; }
    catch (error) { console.warn(`${file} unavailable; using built-in scenery.`, error); return null; }
  };
  const [obstacles, additionalBuildings, scenery] = await Promise.all([optional('obstacles.glb'), optional('city-buildings.glb'), optional('street-scenery.glb')]);
  // Facade UVs repeat along the street, so angled surfaces lose detail without anisotropic sampling.
  const ramp = makeRamp(TOON.ramp);
  for (const root of [scene, obstacles, additionalBuildings, scenery]) {
    if (!root) continue;
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const map = 'map' in material ? material.map : null;
        if (map && typeof map === 'object' && 'anisotropy' in map) map.anisotropy = 4;
      }
    });
    toonify(root, ramp);
    if (root === additionalBuildings || root === scenery) repaint(root);
  }
  const models = new Map<string, { template: Object3D; parts: KitPart[] }>();
  for (const child of [...scene.children, ...(obstacles?.children ?? []), ...(additionalBuildings?.children ?? []), ...(scenery?.children ?? [])]) {
    const parts: KitPart[] = [];
    child.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) parts.push({ geometry: object.geometry, material: markShared(material), shellStart: null });
    });
    models.set(child.name, { template: child, parts });
  }
  return {
    has(name: KitModel) { return models.has(name); },
    parts(name: KitModel) { return models.get(name)?.parts ?? []; },
    extras(name: KitModel) { return models.has(name) ? { template: models.get(name)?.template } : {}; },
    character(name) { throw new Error(`Character ${name} is not in the world kit`); },
  };
}

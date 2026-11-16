import { Mesh, MeshToonMaterial, type Material, type Object3D, type Texture } from 'three';
import { markShared } from '../dispose';

/** Converts model materials to shared toon materials while preserving the visible source properties. */
export function toonify(root: Object3D, ramp: Texture): void {
  const converted = new Map<Material, MeshToonMaterial>();
  const convert = (source: Material): MeshToonMaterial => {
    const cached = converted.get(source);
    if (cached) return cached;
    const input = source as Material & {
      color?: MeshToonMaterial['color']; map?: Texture | null;
      emissive?: MeshToonMaterial['emissive']; emissiveMap?: Texture | null; emissiveIntensity?: number;
      alphaMap?: Texture | null; vertexColors?: boolean; wireframe?: boolean;
    };
    const toon = markShared(new MeshToonMaterial({
      color: input.color?.clone(),
      map: input.map ?? null,
      emissive: input.emissive?.clone(),
      emissiveMap: input.emissiveMap ?? null,
      emissiveIntensity: input.emissiveIntensity ?? 1,
      alphaMap: input.alphaMap ?? null,
      opacity: source.opacity,
      transparent: source.transparent,
      alphaTest: source.alphaTest,
      side: source.side,
      depthWrite: source.depthWrite,
      depthTest: source.depthTest,
      vertexColors: input.vertexColors ?? false,
      wireframe: input.wireframe ?? false,
      gradientMap: ramp,
    }));
    toon.name = source.name;
    converted.set(source, toon);
    return toon;
  };
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
  });
}

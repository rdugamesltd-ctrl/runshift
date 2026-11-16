import {
  BackSide, BufferAttribute, Color, MeshBasicMaterial, MeshLambertMaterial, SkinnedMesh, type Material, type Object3D, type Texture,
} from 'three';
import { TOON } from '../../balance';

/**
 * Outline thickness of a textured character, m at its own scale (the cop is 1.8 m tall). Thin: a sculpted model has
 * small hollows (eyes, ears, fingers) that a thicker shell pokes through as dark specks.
 */
const OUTLINE = 0.006;
/** Share of the texture's own colour added unlit, so the shadow side stays bright and clean. */
const SELF_LIGHT = 0.3;

/**
 * Dresses a textured, skinned character (a model made outside the game, such as the cop from Tripo) in the game's
 * look. Its texture is already painted with soft shading, so it gets smooth light lifted by some of its own colour
 * rather than the stepped toon ramp (which bands across a painted face); each skinned mesh gets a thin ink outline
 * shell, a copy grown along its normals and drawn inside out, bound to the same skeleton.
 */
export function dressTexturedCharacter(root: Object3D): void {
  const meshes: SkinnedMesh[] = [];
  root.traverse((object) => { if (object instanceof SkinnedMesh) meshes.push(object); });
  if (!meshes.length) throw new Error('Character model has no skinned mesh');
  const ink = new MeshBasicMaterial({ color: TOON.ink, side: BackSide });
  for (const mesh of meshes) {
    const old = mesh.material as Material & { map?: Texture | null };
    const map = old.map ?? null;
    mesh.material = new MeshLambertMaterial({ map, emissiveMap: map, emissive: new Color(SELF_LIGHT, SELF_LIGHT, SELF_LIGHT) });
    old.dispose();
    mesh.castShadow = true;
    mesh.frustumCulled = false;

    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const shellGeometry = geometry.clone();
    const grown = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      grown[i * 3] = position.getX(i) + normal.getX(i) * OUTLINE;
      grown[i * 3 + 1] = position.getY(i) + normal.getY(i) * OUTLINE;
      grown[i * 3 + 2] = position.getZ(i) + normal.getZ(i) * OUTLINE;
    }
    shellGeometry.setAttribute('position', new BufferAttribute(grown, 3));
    shellGeometry.deleteAttribute('uv');
    const shell = new SkinnedMesh(shellGeometry, ink);
    shell.name = 'character-outline';
    shell.frustumCulled = false;
    shell.bindMode = mesh.bindMode;
    mesh.parent?.add(shell);
    shell.position.copy(mesh.position);
    shell.quaternion.copy(mesh.quaternion);
    shell.scale.copy(mesh.scale);
    shell.bind(mesh.skeleton, mesh.bindMatrix);
  }
}

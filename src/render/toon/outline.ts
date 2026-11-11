import type { Mesh } from 'three';

/**
 * Adds an inverted-hull outline to a character mesh. WP-00 stub: adds nothing and returns null.
 * TODO WP-23: skinned hull (onBeforeCompile BackSide, transformed += normal * uThickness, SkinnedMesh.bind with
 * the same skeleton, frustumCulled = false, crease-smoothed normals), thickness TOON.outline, colour TOON.ink.
 */
export function addOutline(_mesh: Mesh, _thickness: number): Mesh | null {
  return null;
}

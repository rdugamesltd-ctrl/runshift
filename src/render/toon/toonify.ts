import type { Object3D, Texture } from 'three';

/**
 * Converts a loaded model's materials to MeshToonMaterial with the shared ramp. WP-00 stub: leaves them alone.
 * TODO WP-23: keep map, emissive, alpha and vertexColors; share materials (markShared).
 */
export function toonify(_root: Object3D, _ramp: Texture): void {}

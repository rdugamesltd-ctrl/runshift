import { Group, type Object3D } from 'three';

/**
 * A soft round shadow under a character (blob shadows instead of shadow maps on mobile). WP-00 stub: an empty
 * group. TODO WP-25: a radial-gradient quad that shrinks and fades with height.
 */
export function createBlobShadow(_radius: number): Object3D {
  return new Group();
}

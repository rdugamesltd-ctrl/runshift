import type { Material, Mesh, Object3D, Texture } from 'three';

/** Marks a material as shared (the kit and toon materials), so disposing one view or chunk leaves it alone. */
export function markShared<T extends Material>(material: T): T {
  material.userData.shared = true;
  return material;
}

function disposeMaterial(material: Material): void {
  if (material.userData.shared) return;
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose();
  }
  material.dispose();
}

/**
 * Frees the GPU memory behind everything under `root`, and takes it out of the scene. Used when a view
 * is replaced or disposed, so nothing piles up however many runs are played. (Copied from Rail in the Air.)
 */
export function disposeObject(root: Object3D): void {
  root.removeFromParent();
  root.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
    // Instanced meshes hold their own GPU buffers too.
    const disposable = object as unknown as { dispose?: () => void };
    if (typeof disposable.dispose === 'function') disposable.dispose();
  });
}

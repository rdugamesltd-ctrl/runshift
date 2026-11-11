import { DynamicDrawUsage, InstancedMesh, type BufferGeometry, type Material, type Matrix4 } from 'three';

/**
 * Every copy of one model drawn in a single call, refilled each frame between begin() and end(). Draw calls
 * scale with distinct models, not with chunks. Never frustum-culled: copies spread over the whole track.
 */
export class InstanceBatch {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  private count = 0;
  private warned = false;

  constructor(geometry: BufferGeometry, material: Material, capacity: number, name = 'batch') {
    this.capacity = capacity;
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = name;
  }

  /** Starts a new frame's fill. */
  begin(): void {
    this.count = 0;
  }

  /** Adds one copy. Past capacity it warns once and drops the copy (returns false). */
  push(matrix: Matrix4): boolean {
    if (this.count >= this.capacity) {
      if (!this.warned) {
        console.warn(`InstanceBatch ${this.mesh.name}: over capacity (${this.capacity})`);
        this.warned = true;
      }
      return false;
    }
    this.mesh.setMatrixAt(this.count++, matrix);
    return true;
  }

  /** Finishes the fill: draws exactly the copies pushed. */
  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Frees the instance buffers. The geometry and material belong to the caller. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

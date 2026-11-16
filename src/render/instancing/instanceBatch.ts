import { DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type BufferGeometry, type Color, type Material, type Matrix4 } from 'three';

/** How a batch is built. */
export interface InstanceBatchOptions {
  /** Each copy gets its own colour (InstancedMesh.instanceColor), set with color() after push(). */
  colours?: boolean;
}

/**
 * Every copy of one model drawn in a single call, refilled each frame between begin() and end(). Draw calls
 * scale with distinct models, not with chunks. The copies are compacted to the front of the buffer and only that
 * part is uploaded (DynamicDrawUsage). Never frustum-culled: copies spread over the whole track, and the bounding
 * sphere of the first frame would be wrong for the next.
 */
export class InstanceBatch {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  private n = 0;
  private warned = false;
  private wanted = true;
  private readonly matrices: Float32Array;
  private readonly colours: Float32Array | null;

  constructor(geometry: BufferGeometry, material: Material | Material[], capacity: number, name = 'batch', options: InstanceBatchOptions = {}) {
    this.capacity = Math.max(0, Math.floor(capacity));
    this.mesh = new InstancedMesh(geometry, material, this.capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    if (options.colours) {
      const colour = new InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3);
      colour.setUsage(DynamicDrawUsage);
      this.mesh.instanceColor = colour;
      this.colours = colour.array as Float32Array;
    } else this.colours = null;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = name;
  }

  /** Copies pushed since begin(). */
  get count(): number {
    return this.n;
  }

  /** Whether the owner wants the batch drawn. An empty batch is hidden anyway, so it costs no draw call. */
  get visible(): boolean {
    return this.wanted;
  }

  set visible(on: boolean) {
    this.wanted = on;
    this.mesh.visible = on && this.n > 0;
  }

  /** Starts a new frame's fill. */
  begin(): void {
    this.n = 0;
  }

  /**
   * Adds one copy at (x, y, z), turned rotY radians about the vertical axis and scaled (sx, sy, sz), without
   * building a matrix. Past capacity it warns once and drops the copy (returns false).
   */
  push(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1): boolean {
    if (!this.room()) return false;
    const e = this.matrices;
    const o = this.n++ * 16;
    const c = rotY === 0 ? 1 : Math.cos(rotY);
    const s = rotY === 0 ? 0 : Math.sin(rotY);
    // Column-major T · Ry · S.
    e[o] = c * sx;
    e[o + 1] = 0;
    e[o + 2] = -s * sx;
    e[o + 3] = 0;
    e[o + 4] = 0;
    e[o + 5] = sy;
    e[o + 6] = 0;
    e[o + 7] = 0;
    e[o + 8] = s * sz;
    e[o + 9] = 0;
    e[o + 10] = c * sz;
    e[o + 11] = 0;
    e[o + 12] = x;
    e[o + 13] = y;
    e[o + 14] = z;
    e[o + 15] = 1;
    return true;
  }

  /** Adds one copy with any transform. Past capacity it warns once and drops the copy (returns false). */
  pushMatrix(matrix: Matrix4): boolean {
    if (!this.room()) return false;
    matrix.toArray(this.matrices, this.n++ * 16);
    return true;
  }

  /** Colours the copy pushed last (batches built with `colours` only; a dropped copy is not coloured). */
  color(colour: Color): void {
    const colours = this.colours;
    if (!colours || this.n === 0) return;
    const o = (this.n - 1) * 3;
    colours[o] = colour.r;
    colours[o + 1] = colour.g;
    colours[o + 2] = colour.b;
  }

  /** Finishes the fill: draws exactly the copies pushed, uploading only their part of the buffers. */
  end(): void {
    const n = this.n;
    const mesh = this.mesh;
    mesh.count = n;
    mesh.visible = this.wanted && n > 0;
    if (n === 0) return;
    const matrices = mesh.instanceMatrix;
    matrices.clearUpdateRanges();
    matrices.addUpdateRange(0, n * 16);
    matrices.needsUpdate = true;
    const colours = mesh.instanceColor;
    if (colours && this.colours) {
      colours.clearUpdateRanges();
      colours.addUpdateRange(0, n * 3);
      colours.needsUpdate = true;
    }
  }

  /** Frees the instance buffers. The geometry and material belong to the caller. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }

  private room(): boolean {
    if (this.n < this.capacity) return true;
    if (!this.warned) {
      console.warn(`InstanceBatch ${this.mesh.name}: over capacity (${this.capacity}), extra copies are not drawn`);
      this.warned = true;
    }
    return false;
  }
}

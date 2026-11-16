import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A point in model space, m: [x, y, z]. */
export type Point = readonly [number, number, number];

const scratchColour = new Color();
const scratchMatrix = new Matrix4();
const scratchQuaternion = new Quaternion();
const scratchEuler = new Euler();

/**
 * Builds one vertex-coloured mesh out of many simple painted parts (boxes, cylinders, balls, flat polygons, lofted
 * hulls), so a whole model is a single geometry and every copy of it one instanced draw call. Parts keep their own
 * hard edges; curved parts keep smooth normals.
 */
export class MeshBuilder {
  private readonly parts: BufferGeometry[] = [];

  /** Adds any geometry in one colour, moved by `matrix`. The geometry is consumed. */
  add(geometry: BufferGeometry, colour: string, matrix?: Matrix4): this {
    if (matrix) geometry.applyMatrix4(matrix);
    const count = geometry.getAttribute('position').count;
    scratchColour.set(colour);
    const data = new Float32Array(count * 3);
    for (let i = 0; i < data.length; i += 3) {
      data[i] = scratchColour.r;
      data[i + 1] = scratchColour.g;
      data[i + 2] = scratchColour.b;
    }
    geometry.setAttribute('color', new BufferAttribute(data, 3));
    geometry.deleteAttribute('uv');
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    if (!geometry.getIndex()) {
      const index = new Uint32Array(count);
      for (let i = 0; i < count; i++) index[i] = i;
      geometry.setIndex(new BufferAttribute(index, 1));
    }
    this.parts.push(geometry);
    return this;
  }

  /** A box of size (sx, sy, sz) centred on (x, y, z), turned by Euler angles (radians). */
  box(colour: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(new BoxGeometry(sx, sy, sz), colour, place(x, y, z, rx, ry, rz));
  }

  /** A cylinder along `axis` centred on (x, y, z); `top` is the radius at its +axis end (defaults to `radius`). */
  cylinder(colour: string, x: number, y: number, z: number, radius: number, length: number, axis: 'x' | 'y' | 'z' = 'y', sides = 12, top = radius): this {
    const geometry = new CylinderGeometry(top, radius, length, sides);
    return this.add(geometry, colour, place(x, y, z, axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? -Math.PI / 2 : 0));
  }

  /** A ball of radii (rx, ry, rz) centred on (x, y, z). */
  ball(colour: string, x: number, y: number, z: number, rx: number, ry = rx, rz = rx, detail = 10): this {
    const geometry = new SphereGeometry(1, detail, Math.max(4, Math.round(detail * 0.7)));
    return this.add(geometry, colour, scratchMatrix.makeScale(rx, ry, rz).setPosition(x, y, z).clone());
  }

  /** A flat convex polygon (points in order, counter-clockwise seen from its front). */
  polygon(colour: string, points: readonly Point[]): this {
    const positions: number[] = [];
    for (let i = 1; i < points.length - 1; i++) positions.push(...points[0], ...points[i], ...points[i + 1]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();
    return this.add(geometry, colour);
  }

  /**
   * A hull lofted along z through cross-sections. `profile` is the right half of the section from the bottom centre
   * line up and over to the top centre line, as [x, y] points (x ≥ 0); it is mirrored to the left. Each `band`
   * colours the strip between profile points i and i + 1. `stations` are [z, scale] pairs from back to front: the
   * profile is scaled about (0, `pivotY`) at each. Both ends are capped in `capColour`.
   */
  loft(profile: readonly (readonly [number, number])[], bands: readonly string[], stations: readonly (readonly [number, number])[], pivotY: number, capColour: string): this {
    const at = (p: readonly [number, number], station: readonly [number, number], side: number): Point =>
      [p[0] * station[1] * side, pivotY + (p[1] - pivotY) * station[1], station[0]];
    for (let s = 0; s < stations.length - 1; s++) {
      const a = stations[s];
      const b = stations[s + 1];
      for (let i = 0; i < profile.length - 1; i++) {
        const colour = bands[Math.min(i, bands.length - 1)];
        // Right side faces +x, left side −x: wind each so its front is outward.
        this.polygon(colour, [at(profile[i], b, 1), at(profile[i], a, 1), at(profile[i + 1], a, 1), at(profile[i + 1], b, 1)]);
        this.polygon(colour, [at(profile[i], a, -1), at(profile[i], b, -1), at(profile[i + 1], b, -1), at(profile[i + 1], a, -1)]);
      }
    }
    const cap = (station: readonly [number, number], front: boolean) => {
      const ring: Point[] = [];
      for (const p of profile) ring.push(at(p, station, 1));
      for (let i = profile.length - 1; i >= 0; i--) ring.push(at(profile[i], station, -1));
      this.polygon(capColour, front ? ring : ring.reverse());
    };
    cap(stations[0], false);
    cap(stations[stations.length - 1], true);
    return this;
  }

  /**
   * Merges the parts into one geometry (and frees them). `normalise` then maps the box min..max onto the unit box
   * centred on the origin, the shape instanced obstacles are scaled from.
   */
  build(normalise?: { min: Point; max: Point }): BufferGeometry {
    const merged = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    if (!merged) throw new Error('MeshBuilder: the parts do not merge');
    if (normalise) {
      const { min, max } = normalise;
      const size = new Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      merged.translate(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -(min[2] + max[2]) / 2);
      merged.scale(1 / size.x, 1 / size.y, 1 / size.z);
      // A non-uniform scale skews the normals: transform them by the inverse scale and renormalise.
      const normal = merged.getAttribute('normal');
      const v = new Vector3();
      for (let i = 0; i < normal.count; i++) {
        v.fromBufferAttribute(normal, i).multiply(size).normalize();
        normal.setXYZ(i, v.x, v.y, v.z);
      }
    }
    return merged;
  }
}

/** A transform: a turn by Euler angles (radians), then a move to (x, y, z). */
export function place(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Matrix4 {
  scratchQuaternion.setFromEuler(scratchEuler.set(rx, ry, rz));
  return new Matrix4().compose(new Vector3(x, y, z), scratchQuaternion, new Vector3(1, 1, 1));
}

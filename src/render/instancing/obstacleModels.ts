import { BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Matrix4, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ObstacleKind } from '../../game/types';
import { TRAIN_LIVERIES, trainCarGeometry } from './trainModel';

export { TRAIN_LIVERIES, type TrainLivery } from './trainModel';

/** Makes one coloured mesh per obstacle, so every copy can be instanced in a single draw call. */
export function obstacleGeometry(kind: ObstacleKind): BufferGeometry {
  if (kind === 'metroCar') return trainCarGeometry(TRAIN_LIVERIES[0]);
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, colour: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    geometry.applyMatrix4(new Matrix4().makeScale(sx, sy, sz));
    geometry.translate(x, y, z);
    const c = new Color(colour);
    const data = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < data.length; i += 3) { data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; }
    geometry.setAttribute('color', new BufferAttribute(data, 3));
    parts.push(geometry);
  };
  const box = (colour: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    add(new BoxGeometry(1, 1, 1), colour, x, y, z, sx, sy, sz);
  const tube = (colour: string, x: number, y: number, z: number, radius: number, height: number, sides = 8) =>
    add(new CylinderGeometry(1, 1, 1, sides), colour, x, y, z, radius, height, radius);
  const ball = (colour: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    add(new SphereGeometry(1, 8, 6), colour, x, y, z, sx, sy, sz);

  if (kind === 'barrierLow') {
    for (const x of [-0.37, 0.37]) {
      box('#47505a', x, -0.32, 0, 0.09, 0.35, 0.46);
      box('#364149', x, -0.49, 0, 0.21, 0.04, 0.52);
    }
    box('#ea563e', 0, 0.06, 0, 0.96, 0.47, 0.16);
    for (const x of [-0.34, -0.11, 0.12, 0.35]) box('#fff7df', x, 0.06, 0.09, 0.12, 0.43, 0.015);
    box('#333d48', 0, 0.32, 0, 1, 0.07, 0.21);
  } else if (kind === 'barrierHigh') {
    // Suspended hazard sign: its lower edge sits at the collision box's bottom, leaving a visible slide gap.
    box('#33434c', 0, 0.39, 0, 0.96, 0.17, 0.34);
    for (const x of [-0.35, 0.35]) tube('#46545c', x, 0.12, 0, 0.035, 0.43, 6);
    box('#e4a72e', 0, -0.19, 0, 0.98, 0.48, 0.18);
    box('#26343c', 0, -0.19, 0.095, 0.94, 0.42, 0.025);
    for (const x of [-0.36, -0.18, 0, 0.18, 0.36]) box('#ffcc48', x, -0.19, 0.113, 0.09, 0.4, 0.015);
    box('#202b33', 0, -0.44, 0, 1, 0.08, 0.24);
  } else if (kind === 'blocker') {
    box('#347969', 0, -0.05, 0, 0.91, 0.76, 0.87);
    box('#1e4d49', 0, 0.37, -0.03, 1, 0.18, 0.96);
    box('#244949', 0, 0.31, 0.46, 0.98, 0.05, 0.05);
    for (const x of [-0.31, -0.1, 0.1, 0.31]) box('#245c55', x, -0.08, 0.45, 0.035, 0.57, 0.025);
    for (const x of [-0.35, 0.35]) {
      box('#e7d283', x, 0.01, 0.47, 0.13, 0.13, 0.025);
      for (const z of [-0.35, 0.35]) ball('#263039', x, -0.39, z, 0.1, 0.1, 0.1);
    }
  } else if (kind === 'car') {
    box('#f5ad25', 0, -0.19, 0, 0.92, 0.45, 0.96);
    box('#f7c345', 0, 0.15, -0.06, 0.78, 0.33, 0.6);
    box('#294956', 0, 0.15, 0.26, 0.63, 0.22, 0.025);
    box('#355968', 0, 0.15, -0.38, 0.63, 0.22, 0.025);
    box('#253844', 0, -0.39, 0.48, 0.78, 0.12, 0.035);
    box('#f7e5ac', 0, 0.35, -0.04, 0.28, 0.09, 0.23);
    for (const x of [-0.35, 0.35]) {
      for (const z of [-0.31, 0.31]) ball('#202a35', x, -0.35, z, 0.14, 0.14, 0.14);
      box('#fff3c0', x, -0.18, 0.49, 0.16, 0.13, 0.03);
    }
  } else if (kind === 'roofUnit' || kind === 'wallVentLow') {
    box('#9baeb8', 0, 0, 0, 0.9, 0.78, 0.75);
    box('#e0e9e5', 0, 0.4, 0, 0.98, 0.1, 0.85);
    for (const y of [-0.25, -0.13, -0.01, 0.11, 0.23]) box('#486779', 0, y, 0.39, 0.76, 0.045, 0.04);
    for (const x of [-0.38, 0.38]) box('#60727d', x, -0.44, 0, 0.1, 0.11, 0.6);
  } else if (kind === 'wallSignHigh') {
    box('#394957', 0, 0, 0, 0.95, 0.91, 0.25);
    box('#e9453b', 0, 0.02, 0.14, 0.84, 0.75, 0.03);
    box('#fff2d3', 0, 0.02, 0.16, 0.53, 0.11, 0.025);
    for (const x of [-0.3, 0.3]) box('#f9d470', x, -0.34, 0.17, 0.11, 0.1, 0.03);
  } else if (kind === 'wallPipeFull') {
    for (const z of [-0.29, 0.29]) {
      tube('#364854', 0, 0, z, 0.16, 0.98);
      for (const y of [-0.36, 0.36]) box('#e0ae47', 0, y, z, 0.38, 0.08, 0.3);
    }
    box('#516977', 0, 0.2, 0, 0.24, 0.12, 0.68);
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error(`Cannot build ${kind} obstacle geometry`);
  for (const part of parts) part.dispose();
  return merged;
}

/** One carriage painted in TRAIN_LIVERIES[livery], in a unit box like obstacleGeometry('metroCar'). */
export function trainGeometry(livery: number): BufferGeometry {
  return trainCarGeometry(TRAIN_LIVERIES[((livery % TRAIN_LIVERIES.length) + TRAIN_LIVERIES.length) % TRAIN_LIVERIES.length]);
}

/** A solid climbable wedge: near end at track height, far end level with the train roof. */
export function trainRampGeometry(): BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const triangle = (a: number[], b: number[], c: number[], colour: string) => {
    const paint = new Color(colour);
    for (const point of [a, b, c]) {
      positions.push(point[0], point[1], point[2]);
      colours.push(paint.r, paint.g, paint.b);
    }
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], colour: string) => {
    triangle(a, b, c, colour);
    triangle(a, c, d, colour);
  };
  const nearLeft = [-0.5, -0.5, 0.5];
  const nearRight = [0.5, -0.5, 0.5];
  const farLeftTop = [-0.5, 0.5, -0.5];
  const farRightTop = [0.5, 0.5, -0.5];
  const farLeftBottom = [-0.5, -0.5, -0.5];
  const farRightBottom = [0.5, -0.5, -0.5];
  // The climbing face in yellow and charcoal hazard bands, with a grey steel lip.
  const BANDS = 8;
  for (let i = 0; i < BANDS; i++) {
    const a = i / BANDS;
    const b = (i + 1) / BANDS;
    const at = (u: number, x: number) => [x, -0.5 + u, 0.5 - u];
    quad(at(a, -0.5), at(a, 0.5), at(b, 0.5), at(b, -0.5), i % 2 === 0 ? '#f6c431' : '#2c3138');
  }
  triangle(nearLeft, farLeftTop, farLeftBottom, '#7b8792');
  triangle(nearRight, farRightBottom, farRightTop, '#7b8792');
  quad(farLeftTop, farRightTop, farRightBottom, farLeftBottom, '#4a535c');
  quad(nearRight, nearLeft, farLeftBottom, farRightBottom, '#3a424a');
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  result.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
  result.computeVertexNormals();
  return result;
}

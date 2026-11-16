import type { BufferGeometry } from 'three';
import { MeshBuilder } from './meshBuilder';

/** A train's paint: body, accent stripe, upper band, doors and roof colours. */
export interface TrainLivery { body: string; accent: string; upper: string; door: string; roof: string }

/** The train liveries, picked per train so a yard of them reads as different trains. */
export const TRAIN_LIVERIES: readonly TrainLivery[] = [
  { body: '#1f7de0', accent: '#ffd23f', upper: '#f4f7fa', door: '#1763b8', roof: '#c9d6e2' },
  { body: '#ee4b3c', accent: '#fff4dd', upper: '#fbf3e6', door: '#c93a2e', roof: '#d9cfc4' },
  { body: '#ffb81f', accent: '#27375c', upper: '#fff8e8', door: '#e39a0c', roof: '#d6d0c2' },
  { body: '#18a888', accent: '#ffe27a', upper: '#f0f8f4', door: '#108a6f', roof: '#c6d6ce' },
];

/** The carriage is modelled at this size, m (across, tall, long), then squeezed into the unit box instances scale. */
const CAR = { width: 1.8, height: 2.25, length: 6 } as const;
const GLASS = '#16293a';
const GLINT = '#5c8fb3';
const FRAME = '#262d35';
const GEAR = '#33393f';

/**
 * One carriage, about 1.8 × 2.25 × 6 m, in a unit box (scaled per instance to its collision box): a lofted body
 * with a skirt, an accent stripe, a pale window band and curved roof shoulders under a flat roof walk (the running
 * surface, at the box's top); glazed windows with a glint; two pairs of doors a side; tapered cab ends with a
 * windscreen, lamp clusters, a destination board and a coupler; bogies with round wheels on the rails.
 */
export function trainCarGeometry(paint: TrainLivery): BufferGeometry {
  const b = new MeshBuilder();
  // The body is a little narrower than the box, so the proud doors and glazing stay inside it.
  const half = CAR.width / 2 - 0.03;
  const top = CAR.height;
  const end = CAR.length / 2;

  // Running gear: bogies, wheels on the rails (0.55 m either side of the lane centre), underfloor boxes, couplers.
  for (const z of [-1.95, 1.95]) {
    b.box(GEAR, 0, 0.27, z, 1.3, 0.16, 1.5);
    for (const dz of [-0.48, 0.48]) {
      for (const x of [-0.55, 0.55]) {
        b.cylinder('#1c2126', x, 0.21, z + dz, 0.21, 0.1, 'x', 10);
      }
    }
  }
  b.box(FRAME, 0, 0.33, 0, 1.24, 0.2, 1.7);
  b.box('#444c54', 0.3, 0.3, -0.2, 0.5, 0.22, 0.7);
  b.box('#444c54', -0.32, 0.3, 0.3, 0.46, 0.22, 0.6);

  // The body: bottom centre, out to the skirt, up the side in paint bands, over the roof shoulder to the roof walk.
  const profile: [number, number][] = [
    [0, 0.42], [half - 0.1, 0.42], [half - 0.02, 0.5], [half, 0.66], [half, 1.0], [half, 1.1], [half, 1.22],
    [half, 1.96], [half - 0.04, 2.08], [half - 0.16, 2.19], [half - 0.34, top], [0, top],
  ];
  const bands = [FRAME, FRAME, paint.door, paint.body, paint.accent, paint.body, paint.upper, paint.roof, paint.roof, paint.roof, paint.upper];
  b.loft(profile, bands, [[-end, 0.9], [-end + 0.22, 1], [end - 0.22, 1], [end, 0.9]], 1.2, paint.body);

  // Glazing along both sides: windows either side of the doors, each with a pale glint along its top.
  const pane = (side: number, z: number, width: number, y0: number, y1: number) => {
    const x = side * (half + 0.004);
    b.box(GLASS, x, (y0 + y1) / 2, z, 0.02, y1 - y0, width);
    b.box(GLINT, x + side * 0.004, y1 - 0.07, z, 0.02, 0.07, width * 0.88);
  };
  for (const side of [-1, 1]) {
    for (const z of [-2.42, -0.45, 0.45, 2.42]) pane(side, z, 0.74, 1.3, 1.82);
    for (const z of [-1.42, 1.42]) {
      // A pair of door leaves, slightly proud of the body, each with its own window and a kick strip.
      b.box(paint.door, side * (half + 0.006), 1.2, z, 0.024, 1.48, 0.94);
      b.box(FRAME, side * (half + 0.012), 1.2, z, 0.02, 1.48, 0.025);
      for (const dz of [-0.235, 0.235]) pane(side, z + dz, 0.34, 1.16, 1.8);
      b.box(paint.accent, side * (half + 0.014), 0.52, z, 0.02, 0.06, 0.94);
    }
    // A gutter where the side meets the roof.
    b.box(paint.door, side * (half + 0.004), 1.95, 0, 0.03, 0.045, CAR.length - 0.5);
  }

  // Flush roof panels: two cooling units with dark grilles, set into the roof walk so the feet clear them.
  for (const z of [-1.5, 1.5]) {
    b.box('#aeb9c2', 0, top - 0.004, z, 0.84, 0.012, 1.3);
    b.box('#6f7b86', 0, top - 0.002, z, 0.5, 0.012, 0.86);
  }

  // Cab ends.
  for (const face of [-1, 1]) {
    const z = face * (end + 0.004);
    b.box(GLASS, 0, 1.56, z, 1.36, 0.6, 0.02);
    b.box(GLINT, -0.3, 1.74, z + face * 0.004, 0.62, 0.1, 0.02);
    b.box(FRAME, 0, 1.56, z, 0.035, 0.6, 0.03);
    // Destination board.
    b.box(FRAME, 0, 1.98, z, 0.84, 0.15, 0.02);
    b.box('#ffb324', 0, 1.98, z + face * 0.004, 0.62, 0.08, 0.02);
    // A swooping accent under the windscreen, then the lamp clusters.
    b.box(paint.accent, 0, 1.17, z, 1.5, 0.1, 0.02);
    for (const x of [-0.56, 0.56]) {
      b.box(FRAME, x, 0.8, z, 0.36, 0.2, 0.02);
      b.cylinder('#fff6c9', x - 0.07, 0.8, z + face * 0.006, 0.07, 0.02, 'z', 10);
      b.cylinder('#ff5a4a', x + 0.09, 0.8, z + face * 0.006, 0.045, 0.02, 'z', 8);
    }
    b.box(FRAME, 0, 0.5, z - face * 0.03, 1.56, 0.14, 0.1);
    b.box('#59636d', 0, 0.38, face * (end - 0.06), 0.22, 0.14, 0.12);
  }

  return b.build({ min: [-CAR.width / 2, 0, -end - 0.03], max: [CAR.width / 2, top + 0.004, end + 0.03] });
}

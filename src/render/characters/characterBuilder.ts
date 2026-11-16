import {
  BackSide, Bone, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4,
  MeshBasicMaterial, MeshToonMaterial, Quaternion, Skeleton, SkinnedMesh, SphereGeometry, TorusGeometry, Uint16BufferAttribute, Vector3,
  type Object3D, type Texture,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOON } from '../../balance';

/**
 * Builds the game's own characters on a rigged skeleton. The skeleton and its clips come from a CC0 animated figure;
 * the body is ours: rounded, painted pieces, each riding one bone, merged into a single skinned mesh with an ink
 * outline shell (two draw calls a character). Proportions are in the rig's own units (about 2.9 to the top of the
 * head; the rig faces +z and its left is +x).
 */

/** Outline thickness in rig units (about 1.3 cm in the game). */
const OUTLINE = 0.022;
/** The arms of the source rig hang to the knees: upper arms are shortened to this share. */
const UPPER_ARM = 0.66;
/** Forearm length, rig units (the hand sits at its end). */
const FOREARM = 0.46;

const UP = new Vector3(0, 1, 0);

/** GLTFLoader strips the dots from node names ('UpperArm.L' loads as 'UpperArmL'): compare names without them. */
function sameBone(bone: Bone, name: string): boolean {
  return bone.name.replaceAll('.', '') === name.replaceAll('.', '');
}

/** A point in rig space. */
type P = readonly [number, number, number];

function vec(p: P | Vector3): Vector3 {
  return p instanceof Vector3 ? p : new Vector3(p[0], p[1], p[2]);
}

/** Collects painted parts, each bound rigidly to one bone, and merges them into the body and its outline shell. */
class SkinBuilder {
  private readonly parts: { geometry: BufferGeometry; bone: number; colour: string; outline: boolean }[] = [];
  private current = 0;

  constructor(private readonly bones: readonly Bone[]) {}

  /** Parts added from now on ride this bone. */
  on(name: string): this {
    const index = this.bones.findIndex(bone => sameBone(bone, name));
    if (index < 0) throw new Error(`Character rig has no bone ${name}`);
    this.current = index;
    return this;
  }

  /** Adds a geometry (already in rig space, bind pose) in one colour. */
  add(geometry: BufferGeometry, colour: string, outline = true): this {
    geometry.deleteAttribute('uv');
    this.parts.push({ geometry: geometry.index ? geometry.toNonIndexed() : geometry, bone: this.current, colour, outline });
    return this;
  }

  /** An ellipsoid centred on `c` with radii (rx, ry, rz), optionally turned by Euler angles. */
  ball(colour: string, c: P, rx: number, ry = rx, rz = rx, turn: P = [0, 0, 0], outline = true, detail = 10): this {
    const geometry = new SphereGeometry(1, detail, Math.round(detail * 0.7));
    geometry.applyMatrix4(new Matrix4().compose(vec(c), new Quaternion().setFromEuler(new Euler(turn[0], turn[1], turn[2])), new Vector3(rx, ry, rz)));
    return this.add(geometry, colour, outline);
  }

  /** A box of size `s` centred on `c`, turned by Euler angles. */
  box(colour: string, c: P, s: P, turn: P = [0, 0, 0], outline = true): this {
    const geometry = new BoxGeometry(s[0], s[1], s[2]);
    geometry.applyMatrix4(new Matrix4().compose(vec(c), new Quaternion().setFromEuler(new Euler(turn[0], turn[1], turn[2])), new Vector3(1, 1, 1)));
    return this.add(geometry, colour, outline);
  }

  /**
   * A rounded limb from `a` to `b`: a tapered tube of radius r0 at a and r1 at b with a ball at each end. `flat`
   * squashes it front to back (for torsos).
   */
  limb(colour: string, a: P | Vector3, b: P | Vector3, r0: number, r1 = r0, flat = 1, outline = true, caps: 'both' | 'start' | 'end' | 'none' = 'both'): this {
    const from = vec(a);
    const to = vec(b);
    const axis = to.clone().sub(from);
    const length = axis.length();
    const turn = new Quaternion().setFromUnitVectors(UP, axis.normalize());
    const squash = new Matrix4().makeScale(1, 1, flat);
    const tube = new CylinderGeometry(r1, r0, length, 10, 1, true);
    tube.applyMatrix4(new Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), turn, new Vector3(1, 1, 1)));
    this.add(tube.applyMatrix4(squash), colour, outline);
    for (const [centre, radius, wanted] of [[from, r0, caps === 'both' || caps === 'start'], [to, r1, caps === 'both' || caps === 'end']] as const) {
      if (!wanted) continue;
      const cap = new SphereGeometry(radius, 10, 6);
      cap.applyMatrix4(new Matrix4().makeTranslation(centre.x, centre.y, centre.z));
      this.add(cap.applyMatrix4(squash), colour, outline);
    }
    return this;
  }

  /** A ring (torus) of radius `r` and tube `tube` centred on `c`, lying flat unless turned. */
  ring(colour: string, c: P, r: number, tube: number, turn: P = [Math.PI / 2, 0, 0], arc = Math.PI * 2, outline = true): this {
    const geometry = new TorusGeometry(r, tube, 6, 14, arc);
    geometry.applyMatrix4(new Matrix4().compose(vec(c), new Quaternion().setFromEuler(new Euler(turn[0], turn[1], turn[2])), new Vector3(1, 1, 1)));
    return this.add(geometry, colour, outline);
  }

  /** The upper part of a sphere (a cap or helmet): radius `r` centred on `c`, down to `cut` radians from the pole. */
  dome(colour: string, c: P, r: number, cut: number, turn: P = [0, 0, 0], scale: P = [1, 1, 1]): this {
    const geometry = new SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, cut);
    geometry.applyMatrix4(new Matrix4().compose(vec(c), new Quaternion().setFromEuler(new Euler(turn[0], turn[1], turn[2])), vec(scale)));
    return this.add(geometry, colour);
  }

  /** Merges the parts. `shell` is the outline: every outlined part grown along its smoothed normals. */
  build(): { body: BufferGeometry; shell: BufferGeometry } {
    const colour = new Color();
    const skin = (geometry: BufferGeometry, bone: number, tint: string | null) => {
      const count = geometry.getAttribute('position').count;
      const index = new Uint16Array(count * 4);
      const weight = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        index[i * 4] = bone;
        weight[i * 4] = 1;
      }
      geometry.setAttribute('skinIndex', new Uint16BufferAttribute(index, 4));
      geometry.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4));
      if (tint) {
        colour.set(tint);
        const colours = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colour.toArray(colours, i * 3);
        geometry.setAttribute('color', new BufferAttribute(colours, 3));
      }
      return geometry;
    };
    const bodies: BufferGeometry[] = [];
    const shells: BufferGeometry[] = [];
    const normal = new Vector3();
    for (const part of this.parts) {
      if (part.outline) {
        // Weld the part by position so its normals are smooth, then push every vertex out along them.
        const bare = new BufferGeometry();
        bare.setAttribute('position', part.geometry.getAttribute('position').clone());
        const welded = mergeVertices(bare, 1e-4);
        welded.computeVertexNormals();
        const position = welded.getAttribute('position');
        const normals = welded.getAttribute('normal');
        for (let i = 0; i < position.count; i++) {
          normal.fromBufferAttribute(normals, i);
          position.setXYZ(i, position.getX(i) + normal.x * OUTLINE, position.getY(i) + normal.y * OUTLINE, position.getZ(i) + normal.z * OUTLINE);
        }
        const shell = welded.toNonIndexed();
        shell.deleteAttribute('normal');
        shells.push(skin(shell, part.bone, null));
        bare.dispose();
        welded.dispose();
      }
      bodies.push(skin(part.geometry, part.bone, part.colour));
    }
    const body = mergeGeometries(bodies);
    const shell = mergeGeometries(shells);
    for (const geometry of [...bodies, ...shells]) geometry.dispose();
    this.parts.length = 0;
    if (!body || !shell) throw new Error('Character parts do not merge');
    return { body, shell };
  }
}

/** A character's colours and kit. */
export interface CharacterDesign {
  skin: string;
  /** Jacket or jumper; `stripe` alternates with it in bands when set. */
  top: string;
  stripe: string | null;
  cuffs: string;
  gloves: string;
  trousers: string;
  kneePads: string | null;
  shoes: string;
  soles: string;
  headgear: 'helmet' | 'beanie';
  hat: string;
  hatTrim: string;
  /** A bandit mask across the eyes, knotted behind. */
  mask: string | null;
}

/** The hero: a teal and orange speedster in a courier's helmet. */
export const HERO_DESIGN: CharacterDesign = {
  skin: '#f6c39a', top: '#17b3a3', stripe: null, cuffs: '#fff4dd', gloves: '#ff7a1f', trousers: '#0f8a7e',
  kneePads: '#fff4dd', shoes: '#ff7a1f', soles: '#fff4dd', headgear: 'helmet', hat: '#17b3a3', hatTrim: '#ff7a1f',
  mask: null,
};

/** The thief: a masked burglar in a striped jumper and a beanie. He throws the gold down behind him (CoinsView). */
export const THIEF_DESIGN: CharacterDesign = {
  skin: '#eeb48c', top: '#f4ecda', stripe: '#272c38', cuffs: '#272c38', gloves: '#1d212b', trousers: '#39415a',
  kneePads: null, shoes: '#e2452f', soles: '#fff4dd', headgear: 'beanie', hat: '#2c3654', hatTrim: '#e2452f',
  mask: '#1d212b',
};

/** Bands along a limb from a to b, alternating two colours. */
function banded(b: SkinBuilder, colours: readonly [string, string], a: Vector3, to: Vector3, r0: number, r1: number, bands: number, flat = 1): void {
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    // Only the two ends are rounded off: caps between bands of different colours would fight for the same pixels.
    const caps = bands === 1 ? 'both' : i === 0 ? 'start' : i === bands - 1 ? 'end' : 'none';
    b.limb(colours[i % 2], a.clone().lerp(to, t0), a.clone().lerp(to, t1), r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, flat, true, caps);
  }
}

/**
 * Replaces the rigged figure under `root` with one of our characters: removes its meshes, re-proportions the arms,
 * and binds a new body and outline to the same bones, so every clip made for the rig plays on it.
 */
export function buildCharacter(root: Object3D, design: CharacterDesign, ramp: Texture): void {
  const old: SkinnedMesh[] = [];
  root.traverse((object) => { if (object instanceof SkinnedMesh) old.push(object); });
  if (!old.length) throw new Error('Character rig has no skinned mesh');
  const bones = [...old[0].skeleton.bones];
  for (const mesh of old) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  const bone = (name: string): Bone => {
    const found = bones.find(b => sameBone(b, name));
    if (!found) throw new Error(`Character rig has no bone ${name}`);
    return found;
  };
  // Shorter upper arms: the elbow moves in along the bone. The clips only turn these bones, so they still fit.
  for (const side of ['L', 'R']) bone(`LowerArm.${side}`).position.multiplyScalar(UPPER_ARM);
  root.updateMatrixWorld(true);
  const at = (name: string): Vector3 => new Vector3().setFromMatrixPosition(bone(name).matrixWorld);

  const b = new SkinBuilder(bones);
  const top: readonly [string, string] = [design.top, design.stripe ?? design.top];
  const spineZ = at('Torso').z;

  // Legs and feet.
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const hip = at(`UpperLeg.${side}`);
    const knee = at(`LowerLeg.${side}`);
    const foot = at(`Foot.${side}`);
    const ankle = new Vector3(foot.x, foot.y + 0.1, foot.z + 0.02);
    b.on(`UpperLeg.${side}`).limb(design.trousers, hip, knee, 0.17, 0.14);
    if (design.kneePads) b.ball(design.kneePads, [knee.x, knee.y + 0.02, knee.z + 0.08], 0.13, 0.13, 0.1);
    b.on(`LowerLeg.${side}`).limb(design.trousers, knee, ankle, 0.14, 0.115);
    b.on(`Foot.${side}`)
      .ball(design.shoes, [foot.x, foot.y + 0.1, foot.z + 0.13], 0.15, 0.125, 0.29)
      .ball(design.soles, [foot.x, foot.y + 0.012, foot.z + 0.13], 0.17, 0.075, 0.315)
      .ball(design.soles, [foot.x + sx * 0.02, foot.y + 0.13, foot.z + 0.3], 0.085, 0.05, 0.1, [0.5, 0, 0], false);
  }

  // Hips, belly and chest.
  const hips = at('Hips');
  const belly = at('Abdomen');
  const chest = at('Torso');
  b.on('Hips').ball(design.trousers, [0, hips.y + 0.17, spineZ - 0.02], 0.38, 0.26, 0.29);
  b.on('Abdomen');
  banded(b, [top[1], top[0]], new Vector3(0, belly.y - 0.04, spineZ - 0.02), new Vector3(0, chest.y + 0.02, spineZ), 0.36, 0.39, 2, 0.8);
  b.on('Torso');
  banded(b, top, new Vector3(0, chest.y + 0.02, spineZ), new Vector3(0, chest.y + 0.36, spineZ + 0.02), 0.39, 0.36, design.stripe ? 3 : 1, 0.8);
  if (design.headgear === 'helmet') {
    // The speedster's jacket: an orange collar, a cream chest band and a forward chevron.
    b.ring(design.hatTrim, [0, chest.y + 0.47, spineZ + 0.04], 0.2, 0.07, [Math.PI / 2, 0, 0]);
    b.limb(design.cuffs, [0, chest.y + 0.13, spineZ + 0.005], [0, chest.y + 0.2, spineZ + 0.01], 0.395, 0.39, 0.8, true, 'none');
    b.on('Abdomen').limb(design.hatTrim, [0, belly.y + 0.0, spineZ - 0.02], [0, belly.y + 0.06, spineZ - 0.02], 0.375, 0.378, 0.8, true, 'none').on('Torso');
  } else {
    b.ring(design.cuffs, [0, chest.y + 0.47, spineZ + 0.04], 0.19, 0.075, [Math.PI / 2, 0, 0]);
  }
  b.on('Neck').limb(design.skin, [0, chest.y + 0.45, spineZ + 0.06], [0, chest.y + 0.66, spineZ + 0.12], 0.13);

  // Arms and hands.
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const shoulder = at(`UpperArm.${side}`);
    const elbow = at(`LowerArm.${side}`);
    const reach = side === 'L' ? at('Middle1.L') : at('Middle1.R');
    const wrist = elbow.clone().add(reach.sub(elbow).normalize().multiplyScalar(FOREARM));
    b.on(`UpperArm.${side}`).ball(top[0], [shoulder.x - sx * 0.02, shoulder.y - 0.02, shoulder.z], 0.19);
    banded(b, top, shoulder, elbow, 0.15, 0.125, design.stripe ? 3 : 1);
    b.on(`LowerArm.${side}`);
    const cuffAt = elbow.clone().lerp(wrist, 0.78);
    banded(b, top, elbow, cuffAt, 0.125, 0.11, design.stripe ? 2 : 1);
    b.limb(design.cuffs, cuffAt, wrist, 0.125, 0.125);
    const along = wrist.clone().sub(elbow).normalize();
    const palm = wrist.clone().addScaledVector(along, 0.14);
    b.ball(design.gloves, [palm.x, palm.y, palm.z], 0.165, 0.18, 0.15);
    b.ball(design.gloves, [palm.x - sx * 0.06, palm.y + 0.04, palm.z + 0.14], 0.07, 0.08, 0.07);
  }

  // Head.
  const neck = at('Head');
  const head: P = [0, neck.y + 0.36, spineZ + 0.16];
  const r = 0.45;
  const face = (x: number, y: number): P => {
    const dz = Math.sqrt(Math.max(0, r * r - x * x - y * y));
    return [head[0] + x, head[1] + y, head[2] + dz];
  };
  b.on('Head').ball(design.skin, head, r, r * 0.96, r, [0, 0, 0], true, 16);
  for (const sx of [-1, 1]) {
    const eye = face(sx * 0.17, design.mask ? 0.02 : -0.02);
    if (design.mask) b.ball('#ffffff', [eye[0], eye[1], eye[2] + 0.012], 0.085, 0.075, 0.03, [0, sx * 0.38, 0], false);
    b.ball('#1c2340', [eye[0] + sx * 0.005, eye[1], eye[2] + (design.mask ? 0.03 : 0.0)], 0.05, design.mask ? 0.055 : 0.085, 0.035, [0, sx * 0.38, 0], false);
    b.ball('#ffffff', [eye[0] + sx * 0.012, eye[1] + 0.035, eye[2] + (design.mask ? 0.055 : 0.03)], 0.018, 0.018, 0.012, [0, 0, 0], false);
    // Ears.
    b.ball(design.skin, [head[0] + sx * (r - 0.01), head[1] - 0.05, head[2] - 0.03], 0.06, 0.1, 0.08);
  }
  // A grin for the hero, a lopsided smirk for the thief.
  const mouth = face(design.mask ? 0.04 : 0, -0.17);
  b.ring('#7a2f2a', [mouth[0], mouth[1], mouth[2] - 0.012], 0.085, 0.017, [0.42, 0, Math.PI + (design.mask ? 0.5 : 0)], Math.PI * (design.mask ? 0.7 : 1), false);
  const nose = face(0, -0.1);
  b.ball(design.skin, [nose[0], nose[1], nose[2]], 0.045, 0.04, 0.05);
  if (design.mask) {
    // The mask: a band round the head at eye height, knotted behind, with two tails.
    const band = new CylinderGeometry(r + 0.012, r + 0.012, 0.19, 20, 1, true);
    band.translate(head[0], head[1] + 0.02, head[2]);
    b.add(band, design.mask);
    b.ball(design.mask, [0, head[1] + 0.02, head[2] - r - 0.04], 0.07);
    for (const sx of [-1, 1]) b.box(design.mask, [sx * 0.07, head[1] - 0.1, head[2] - r - 0.1], [0.07, 0.26, 0.03], [-0.5, 0, sx * 0.35]);
  }
  if (design.headgear === 'helmet') {
    // A courier's helmet with a brim, a crest stripe and round ear cups.
    b.dome(design.hat, [head[0], head[1] + 0.03, head[2] - 0.01], r + 0.045, Math.PI * 0.52, [-0.16, 0, 0]);
    b.ring(design.hatTrim, [head[0], head[1] + 0.03, head[2] - 0.01], r + 0.05, 0.045, [-0.16, Math.PI / 2, 0], Math.PI);
    b.ball(design.hat, [head[0], head[1] + 0.13, head[2] + r + 0.02], 0.3, 0.035, 0.2, [0.2, 0, 0]);
    for (const sx of [-1, 1]) {
      const cup = new CylinderGeometry(0.13, 0.13, 0.08, 14);
      cup.rotateZ(Math.PI / 2);
      cup.translate(head[0] + sx * (r + 0.02), head[1] - 0.04, head[2] - 0.03);
      b.add(cup, design.cuffs);
    }
    // A tuft of hair under the back of the helmet.
    b.ball('#5a3a2a', [head[0], head[1] - 0.16, head[2] - r + 0.06], 0.3, 0.16, 0.14);
  } else {
    // A beanie pulled low, with a turned-up rim and a bobble.
    b.dome(design.hat, [head[0], head[1] + 0.06, head[2] - 0.02], r + 0.04, Math.PI * 0.5, [-0.12, 0, 0], [1, 1.12, 1]);
    b.ring(design.hatTrim, [head[0], head[1] + 0.09, head[2] - 0.02], r + 0.03, 0.06, [Math.PI / 2 - 0.12, 0, 0]);
    b.ball('#fff4dd', [head[0], head[1] + r + 0.13, head[2] - 0.08], 0.1);
  }

  const { body, shell } = b.build();
  const skeleton = new Skeleton(bones);
  const paint = new MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const ink = new MeshBasicMaterial({ color: TOON.ink, side: BackSide });
  const bodyMesh = new SkinnedMesh(body, paint);
  const shellMesh = new SkinnedMesh(shell, ink);
  bodyMesh.name = 'character-body';
  shellMesh.name = 'character-outline';
  bodyMesh.castShadow = true;
  for (const mesh of [bodyMesh, shellMesh]) {
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton);
  }
}

import {
  BackSide, Bone, CapsuleGeometry, Color, CylinderGeometry, DirectionalLight, Euler, Float32BufferAttribute,
  HemisphereLight, Matrix4, MeshBasicMaterial, MeshToonMaterial, PerspectiveCamera, Quaternion, Scene, Skeleton,
  SkinnedMesh, SphereGeometry, Uint16BufferAttribute, Vector3, type BufferGeometry, type WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIM, TOON } from '../../balance';
import type { ChunkStreamer, RunState, Side } from '../../game/types';
import { PALETTE } from '../toon/palette';
import { makeRamp } from '../toon/ramp';
import type { View } from '../types';

/**
 * Layout of the first-person body in its own camera space (metres, the eye at the origin looking down −z, y up).
 * The limbs have real proportions; the arm and leg groups are then tilted forward about the eye so that the
 * hands and knees come into view, the usual view-model cheat. Framing numbers, not gameplay tuning.
 */
const LAYOUT = {
  /** Vertical field of view of the view-model camera, degrees, on a wide screen. */
  fov: 62,
  /** Narrow screens widen the view-model camera until it shows at least this half-angle across, degrees. */
  minHalfAcross: 25,
  /** The shoulders sit low and wide, out of frame: only the forearms and fists rise into view. */
  shoulder: { x: 0.26, y: -0.45, z: -0.07 },
  /** The elbows point this way (out, down, back) as the arms bend. */
  elbowPole: { x: 0.5, y: -1, z: 0.35 },
  upperArm: { length: 0.28, radius: 0.05 },
  forearm: { length: 0.26, radius: 0.044 },
  fist: 0.058,
  hip: { x: 0.11, y: -0.78, z: 0.04 },
  thigh: { length: 0.44, radius: 0.08 },
  shin: { length: 0.44, radius: 0.064 },
  /** Inverted-hull outline thickness, m. */
  outline: 0.007,
} as const;

/** One full stride (two steps) covers this many metres; the cadence is clamped to STRIDE_HZ, cycles/s. */
const STRIDE_LENGTH = 4.6;
const STRIDE_HZ = { min: 1.5, max: 2.7 } as const;
/** The limbs ease towards each frame's pose at this rate, 1/s. */
const POSE_RATE = 18;
/** Head bob at each step, m, and lean into a lane change, radians per m/s of sideways speed (capped at LEAN_MAX). */
const BOB = 0.016;
const LEAN = 0.012;
const LEAN_MAX = 0.12;
/** The body sinks this far below the frame while the camera is not at the eyes, m. */
const HIDE_DROP = 0.6;
/** While invulnerable the body blinks this many times a second (as the third-person hero does). */
const BLINK_RATE = 12;
/** Landing: the body drops LAND_DIP m per m/s of fall speed (at most LAND_DIP_MAX) on a spring of LAND_FREQ rad/s
 *  and damping LAND_DAMP, a little softer than the eye's so the limbs carry some weight. */
const LAND_DIP = 0.009;
const LAND_DIP_MAX = 0.13;
const LAND_FREQ = 12;
const LAND_DAMP = 0.45;
/** A stumble jerks the hands up and in (m at full flinch); the flinch fades at FLINCH_DECAY/s. */
const FLINCH = { up: 0.1, inward: 0.07 } as const;
const FLINCH_DECAY = 3.5;

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
/** Where the wrists rest while running, m from the eye (x to the hand's own side, y up, z back), and how far the
 *  pump carries them up, inward and ahead of that. */
const HAND_REST = { x: 0.3, y: -0.205, z: -0.45 } as const;
const PUMP = { up: 0.07, inward: 0.035, ahead: 0.045 } as const;
/** At full narrowness (a screen with no room for the hands at all) the body is set this far back and down, m. */
const NARROW = { back: 0.35, down: 0.16 } as const;

/** One side's pose. The wrist's place in the view (m from the eye: x to the right, y up, z back, so a hand in view
 *  has negative y and z); the arm is solved to reach it. Hip swings the thigh forward (+), knee folds the shin
 *  back, radians. */
export interface LimbPose { handX: number; handY: number; handZ: number; hip: number; knee: number }
/** Both sides (index 0 the left, side −1; index 1 the right) and the legs' forward tilt about the eye, radians. */
export interface BodyPose { limbs: [LimbPose, LimbPose]; legTilt: number }

/** A pose with every angle at zero. */
export function emptyPose(): BodyPose {
  return {
    limbs: [
      { handX: -HAND_REST.x, handY: HAND_REST.y, handZ: HAND_REST.z, hip: 0, knee: 0 },
      { handX: HAND_REST.x, handY: HAND_REST.y, handZ: HAND_REST.z, hip: 0, knee: 0 },
    ],
    legTilt: 0,
  };
}

/** Puts a hand `out` m to its own side of the centre line, `up` m above the eye (negative: below) and `ahead` m in front. */
function setHand(pose: LimbPose, side: Side, out: number, up: number, ahead: number): void {
  pose.handX = side * out;
  pose.handY = up;
  pose.handZ = -ahead;
}

function setLeg(pose: LimbPose, hip: number, knee: number): void {
  pose.hip = hip * DEG;
  pose.knee = knee * DEG;
}

/** The wall side the player is running on, else 0. */
function wallSide(run: RunState): Side | 0 {
  const mode = run.player.mode;
  return mode.kind === 'wallRun' || mode.kind === 'wallAttach' ? mode.side : 0;
}

/**
 * Pure. Writes the target pose for this frame into `out` and returns it: a sprinter's fists pumping and knee drive at
 * stride `phase` (radians; the right arm leads at π/2), a tuck for jumps, arms out for balance in the air and while
 * gliding, the lead leg stretched ahead on a slide, the wall-side hand reaching for the wall, forearms up to cover
 * the face on a crash.
 */
export function bodyPose(run: RunState, phase: number, out: BodyPose): BodyPose {
  const p = run.player;
  const mode = p.mode;
  const wall = wallSide(run);
  // While running the legs stay just under the frame; a jump's tuck and a slide bring them up into view.
  out.legTilt = (mode.kind === 'slide' ? 24 : mode.kind === 'run' || mode.kind === 'wallRun' || mode.kind === 'wallAttach' ? 30 : 42) * DEG;
  for (let i = 0; i < 2; i++) {
    const side: Side = i === 0 ? -1 : 1;
    const limb = out.limbs[i];
    // Each arm swings with the opposite leg.
    const arm = Math.sin(phase + (side > 0 ? 0 : Math.PI));
    const legPhase = phase + (side > 0 ? Math.PI : 0);
    if (p.gliding) {
      setHand(limb, side, 0.36, -0.15, 0.44);
      setLeg(limb, 20, 40);
    } else if (mode.kind === 'crash') {
      setHand(limb, side, 0.11, -0.04, 0.3);
      setLeg(limb, 40, 70);
    } else if (mode.kind === 'slide') {
      if (side > 0) {
        setHand(limb, side, 0.2, -0.2, 0.42);
        setLeg(limb, 82, 8);
      } else {
        setHand(limb, side, 0.38, -0.17, 0.3);
        setLeg(limb, 30, 120);
      }
    } else if (mode.kind === 'jump' || mode.kind === 'wallJump') {
      const tuck = Math.min(1, mode.t / 0.16);
      setHand(limb, side, 0.3 + 0.04 * tuck, -0.17 + 0.07 * tuck, 0.4);
      setLeg(limb, 30 + 55 * tuck, 50 + 60 * tuck);
    } else if (mode.kind === 'air' || mode.kind === 'fall') {
      setHand(limb, side, 0.37, -0.13, 0.38);
      setLeg(limb, 30 + 15 * Math.max(0, arm), 50);
    } else {
      // Running, on the floor or a wall: the pump and the knee drive. The knee folds most as the thigh swings
      // through (heel kick) and is nearly straight at toe-off.
      // A sprinter's pump: the fist rises, comes in and reaches forward, then drops back to the hip.
      setHand(limb, side, HAND_REST.x - PUMP.inward * arm, HAND_REST.y + PUMP.up * arm, -HAND_REST.z + PUMP.ahead * arm);
      setLeg(limb, 15 + 50 * Math.sin(legPhase), Math.max(10, 60 + 50 * Math.cos(legPhase) + 20 * Math.sin(legPhase)));
    }
    if (wall === side) setHand(limb, side, 0.43, -0.1, 0.4);
  }
  return out;
}

/** One rigid piece of the body: its geometry and outline shell, placed in its bone by `matrix`, in one colour. */
interface Piece { bone: Bone; geometry: BufferGeometry; shell: BufferGeometry | null; matrix: Matrix4; colour: string }

/** A placement in a bone: position, a turn about x (radians) and a scale. */
function place(x: number, y: number, z: number, turnX = 0, scale: readonly [number, number, number] = [1, 1, 1]): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(turnX, 0, 0)),
    new Vector3(scale[0], scale[1], scale[2]));
}

/**
 * Merges the pieces (or their shells) into one geometry in the bind pose, each vertex skinned rigidly to its
 * piece's bone, so the whole body is a single draw call. Bones must have up-to-date world matrices.
 */
function skinPieces(pieces: readonly Piece[], bones: readonly Bone[], shells: boolean): BufferGeometry {
  const colour = new Color();
  const parts: BufferGeometry[] = [];
  for (const piece of pieces) {
    const source = shells ? piece.shell : piece.geometry;
    if (!source) continue;
    const geometry = source.clone().applyMatrix4(piece.matrix).applyMatrix4(piece.bone.matrixWorld);
    const count = geometry.getAttribute('position').count;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    const colours = new Float32Array(count * 3);
    const bone = bones.indexOf(piece.bone);
    colour.set(piece.colour);
    for (let i = 0; i < count; i++) {
      skinIndex[i * 4] = bone;
      skinWeight[i * 4] = 1;
      colours[i * 3] = colour.r;
      colours[i * 3 + 1] = colour.g;
      colours[i * 3 + 2] = colour.b;
    }
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
    parts.push(geometry);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('FirstPersonBody: the pieces do not merge');
  return merged;
}

/** The joints of one arm and one leg. */
interface Limbs { shoulder: Bone; elbow: Bone; hip: Bone; knee: Bone }

/**
 * The hero's own arms and legs, seen from his eyes in the first-person view. Drawn in a scene of their own with a
 * camera of their own, after the world and over a cleared depth buffer, so the hands never sink into a wall or a
 * train. Procedural: capsules in the hero's teal and orange with ink outlines, merged into one skinned mesh (two
 * draw calls with the outline shell) and posed from the player's mode and a stride phase that follows the run speed.
 */
export class FirstPersonBody implements View {
  /** The view-model scene and camera. */
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(LAYOUT.fov, 1, 0.02, 10);
  /** 0 = hidden, 1 = fully in view; follows CameraRig.firstPersonAmount. */
  amount = 0;
  /** Stride phase, radians: the right arm is fully forward at π/2. */
  phase = 0;
  private readonly root = new Bone();
  private readonly arms = new Bone();
  private readonly legs = new Bone();
  private readonly limbs: [Limbs, Limbs];
  private readonly current = emptyPose();
  private readonly target = emptyPose();
  private readonly disposables: { dispose(): void }[] = [];
  private lean = 0;
  private blink = false;
  private posed = false;
  private dip = 0;
  private dipV = 0;
  private fallSpeed = 0;
  private wasAirborne = false;
  private flinch = 0;
  private lastStumbleT = 0;
  /** Hands are pulled in by this factor on screens too narrow to show them at full width. */
  private squeeze = 1;
  /** On a narrow screen the body stands this far further from the eye and this much lower, m. */
  private setBack = 0;
  private setDown = 0;
  private readonly reachTo = new Vector3();
  private readonly reachPole = new Vector3();
  private readonly reachElbow = new Vector3();
  private readonly reachWrist = new Vector3();
  private readonly reachX = new Vector3();
  private readonly reachY = new Vector3();
  private readonly reachZ = new Vector3();
  private readonly reachM = new Matrix4();
  private readonly reachQ = new Quaternion();

  constructor() {
    const pieces: Piece[] = [];
    const sources: BufferGeometry[] = [];
    const keep = <T extends BufferGeometry>(geometry: T): T => { sources.push(geometry); return geometry; };
    const capsule = (radius: number, length: number) => keep(new CapsuleGeometry(radius, length, 4, 10));
    const shellOf = (geometry: BufferGeometry, grow: number) => keep(geometry.clone().scale(grow, grow, grow));
    /** A capsule hanging down −y from the bone, outlined. */
    const limb = (bone: Bone, length: number, radius: number, colour: string) => {
      pieces.push({ bone, geometry: capsule(radius, length), shell: capsule(radius + LAYOUT.outline, length),
        matrix: place(0, -length / 2, 0), colour });
    };
    const fist = keep(new SphereGeometry(LAYOUT.fist, 14, 10));
    const fistShell = shellOf(fist, 1.12);
    const thumb = keep(new SphereGeometry(0.019, 10, 8));
    const knuckle = keep(new SphereGeometry(0.014, 8, 6));
    const band = keep(new CylinderGeometry(LAYOUT.forearm.radius + 0.004, LAYOUT.forearm.radius + 0.004, 0.03, 12));
    const cuffRadius = LAYOUT.forearm.radius + 0.006;
    const cuff = keep(new CylinderGeometry(cuffRadius, cuffRadius, 0.035, 12));
    const cuffShell = shellOf(cuff, 1.12);
    const pad = keep(new SphereGeometry(LAYOUT.thigh.radius * 0.95, 12, 8));
    const padShell = shellOf(pad, 1.1);
    const stripeRadius = LAYOUT.thigh.radius + 0.006;
    const stripe = keep(new CylinderGeometry(stripeRadius, stripeRadius, 0.05, 12));
    const shoe = keep(new CapsuleGeometry(0.068, 0.17, 4, 10));
    const shoeShell = shellOf(shoe, 1.1);
    const sole = keep(new CylinderGeometry(0.072, 0.072, 0.035, 12));
    const suit = PALETTE.teal;
    const suitDark = '#0f8a7e';

    const build = (side: Side): Limbs => {
      const shoulder = new Bone();
      shoulder.position.set(side * LAYOUT.shoulder.x, LAYOUT.shoulder.y, LAYOUT.shoulder.z);
      limb(shoulder, LAYOUT.upperArm.length, LAYOUT.upperArm.radius, suit);
      const elbow = new Bone();
      elbow.position.y = -LAYOUT.upperArm.length;
      limb(elbow, LAYOUT.forearm.length, LAYOUT.forearm.radius, suit);
      pieces.push({ bone: elbow, geometry: cuff, shell: cuffShell,
        matrix: place(0, -LAYOUT.forearm.length + 0.03, 0), colour: PALETTE.cream });
      // The glove: a fist with a thumb on its inner top side and a row of knuckles (the forearm's +z is its top).
      const fistY = -LAYOUT.forearm.length - LAYOUT.fist * 0.6;
      pieces.push({ bone: elbow, geometry: fist, shell: fistShell, matrix: place(0, fistY, 0, 0, [1, 1.15, 0.95]), colour: PALETTE.orange });
      pieces.push({ bone: elbow, geometry: thumb, shell: null,
        matrix: place(side * 0.05, fistY + 0.012, 0.024, 0, [1, 1.45, 1]), colour: PALETTE.orange });
      for (const x of [-0.036, -0.012, 0.012, 0.036]) {
        pieces.push({ bone: elbow, geometry: knuckle, shell: null, matrix: place(x, fistY - 0.052, 0.022), colour: '#ff9440' });
      }
      pieces.push({ bone: elbow, geometry: band, shell: null, matrix: place(0, -LAYOUT.forearm.length * 0.45, 0), colour: suitDark });
      shoulder.add(elbow);

      const hip = new Bone();
      hip.position.set(side * LAYOUT.hip.x, LAYOUT.hip.y, LAYOUT.hip.z);
      hip.rotation.z = side * 3 * DEG;
      limb(hip, LAYOUT.thigh.length, LAYOUT.thigh.radius, suitDark);
      pieces.push({ bone: hip, geometry: stripe, shell: null,
        matrix: place(0, -LAYOUT.thigh.length * 0.45, 0), colour: PALETTE.cream });
      const knee = new Bone();
      knee.position.y = -LAYOUT.thigh.length;
      pieces.push({ bone: knee, geometry: pad, shell: padShell, matrix: place(0, 0, -0.03), colour: PALETTE.cream });
      limb(knee, LAYOUT.shin.length, LAYOUT.shin.radius, suitDark);
      // The shoe lies forward along −z from the ankle, on a cream sole.
      pieces.push({ bone: knee, geometry: shoe, shell: shoeShell,
        matrix: place(0, -LAYOUT.shin.length - 0.03, -0.08, Math.PI / 2), colour: PALETTE.orange });
      pieces.push({ bone: knee, geometry: sole, shell: null,
        matrix: place(0, -LAYOUT.shin.length - 0.095, -0.08, 0, [1, 1, 2.8]), colour: PALETTE.cream });
      hip.add(knee);

      this.arms.add(shoulder);
      this.legs.add(hip);
      return { shoulder, elbow, hip, knee };
    };
    this.limbs = [build(-1), build(1)];
    this.root.add(this.arms, this.legs);

    // Bind in the rest pose (straight joints, no tilt), then pose freely.
    this.root.updateMatrixWorld(true);
    const bones: Bone[] = [this.root, this.arms, this.legs];
    for (const limbs of this.limbs) bones.push(limbs.shoulder, limbs.elbow, limbs.hip, limbs.knee);
    const skeleton = new Skeleton(bones);
    const ramp = makeRamp(TOON.ramp);
    const skin = new MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
    const ink = new MeshBasicMaterial({ color: TOON.ink, side: BackSide });
    const body = new SkinnedMesh(skinPieces(pieces, bones, false), skin);
    const outline = new SkinnedMesh(skinPieces(pieces, bones, true), ink);
    for (const mesh of [body, outline]) {
      mesh.frustumCulled = false;
      mesh.bind(skeleton);
      this.disposables.push(mesh.geometry);
    }
    for (const source of sources) source.dispose();
    this.disposables.push(ramp, skin, ink, skeleton);

    const hemi = new HemisphereLight('#fff4dd', '#5d6680', 1.9);
    const sun = new DirectionalLight('#fff1d6', 2.1);
    sun.position.set(-1, 2, 1.2);
    this.scene.add(hemi, sun, this.root, outline, body);
  }

  update(run: RunState, _track: ChunkStreamer | null, _alpha: number, dt: number): void {
    const p = run.player;
    const running = p.mode.kind === 'run' || p.mode.kind === 'wallRun' || p.mode.kind === 'wallAttach';
    const hz = Math.min(STRIDE_HZ.max, Math.max(STRIDE_HZ.min, run.v / STRIDE_LENGTH));
    if (run.phase !== 'over') this.phase = (this.phase + 2 * Math.PI * hz * dt) % (2 * Math.PI);
    bodyPose(run, this.phase, this.target);
    this.react(run, dt);
    // dt 0 (or the first frame) snaps straight to the pose.
    const k = dt > 0 && this.posed ? 1 - Math.exp(-POSE_RATE * dt) : 1;
    this.posed = true;
    const current = this.current;
    current.legTilt += (this.target.legTilt - current.legTilt) * k;
    this.legs.rotation.x = current.legTilt;
    for (let i = 0; i < 2; i++) {
      const c = current.limbs[i];
      const t = this.target.limbs[i];
      c.handX += (t.handX - c.handX) * k;
      c.handY += (t.handY - c.handY) * k;
      c.handZ += (t.handZ - c.handZ) * k;
      c.hip += (t.hip - c.hip) * k;
      c.knee += (t.knee - c.knee) * k;
      const side: Side = i === 0 ? -1 : 1;
      const limbs = this.limbs[i];
      // On a narrow screen the hands come in so they stay in frame.
      this.reach(limbs, side, c.handX * this.squeeze, c.handY, c.handZ);
      limbs.hip.rotation.x = c.hip;
      limbs.knee.rotation.x = -c.knee;
    }

    // Sideways speed over the last step leans the body into lane changes.
    const vx = (p.x - run.prev.x) / SIM.fixedDt;
    const lean = Math.max(-LEAN_MAX, Math.min(LEAN_MAX, -vx * LEAN));
    this.lean += (lean - this.lean) * k;
    const hidden = 1 - this.amount;
    this.root.position.y = (running ? -BOB * Math.abs(Math.sin(this.phase)) : 0) - HIDE_DROP * hidden * hidden + this.dip - this.setDown;
    this.root.position.z = -this.setBack;
    this.root.rotation.z = this.lean;
    this.blink = p.invulnT > 0 && Math.floor(run.time * BLINK_RATE) % 2 === 0;
  }

  /**
   * Two-bone reach: turns the shoulder and elbow so the wrist lands on (x, y, z) in the body's space, the elbow
   * bending towards LAYOUT.elbowPole. A target out of reach is pulled in to arm's length.
   */
  private reach(limbs: Limbs, side: Side, x: number, y: number, z: number): void {
    const upper = LAYOUT.upperArm.length;
    const fore = LAYOUT.forearm.length;
    const from = limbs.shoulder.position;
    const to = this.reachTo.set(x - from.x, y - from.y, z - from.z);
    const distance = Math.min(upper + fore - 1e-3, Math.max(Math.abs(upper - fore) + 1e-3, to.length()));
    to.normalize();
    // The elbow sits on the circle where the two bones' spheres meet, on the pole's side.
    const along = (upper * upper - fore * fore + distance * distance) / (2 * distance);
    const off = Math.sqrt(Math.max(0, upper * upper - along * along));
    const pole = this.reachPole.set(side * LAYOUT.elbowPole.x, LAYOUT.elbowPole.y, LAYOUT.elbowPole.z);
    pole.addScaledVector(to, -pole.dot(to)).normalize();
    const elbow = this.reachElbow.copy(to).multiplyScalar(along).addScaledVector(pole, off);
    const wrist = this.reachWrist.copy(to).multiplyScalar(distance).sub(elbow).normalize();
    limbs.shoulder.quaternion.setFromUnitVectors(DOWN, elbow.normalize());
    // The forearm keeps its top (+z) up, so the thumb and knuckles stay on top of the fist.
    const yAxis = this.reachY.copy(wrist).negate();
    const xAxis = this.reachX.crossVectors(yAxis, UP);
    if (xAxis.lengthSq() < 1e-6) xAxis.set(-1, 0, 0);
    xAxis.normalize();
    const zAxis = this.reachZ.crossVectors(xAxis, yAxis);
    this.reachQ.setFromRotationMatrix(this.reachM.makeBasis(xAxis, yAxis, zAxis));
    limbs.elbow.quaternion.copy(limbs.shoulder.quaternion).invert().multiply(this.reachQ);
  }

  /**
   * Reactions on top of the pose: springs the body down on a landing in proportion to the fall speed, and flinches
   * the arms up when a stumble starts (stumbleT jumps back up to its full time).
   */
  private react(run: RunState, dt: number): void {
    const p = run.player;
    const kind = p.mode.kind;
    const airborne = !p.gliding && (kind === 'jump' || kind === 'air' || kind === 'fall' || kind === 'wallJump');
    if (airborne) this.fallSpeed = Math.max(this.fallSpeed, -(p.y - run.prev.y) / SIM.fixedDt);
    else {
      if (this.wasAirborne && kind !== 'crash') this.dipV -= Math.min(LAND_DIP_MAX, this.fallSpeed * LAND_DIP) * LAND_FREQ * 1.8;
      this.fallSpeed = 0;
    }
    this.wasAirborne = airborne;
    const steps = Math.ceil(Math.max(0, dt) * 120);
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.dipV += (-LAND_FREQ * LAND_FREQ * this.dip - 2 * LAND_DAMP * LAND_FREQ * this.dipV) * h;
      this.dip += this.dipV * h;
    }
    if (p.stumbleT > this.lastStumbleT + 1e-6) this.flinch = 1;
    this.lastStumbleT = p.stumbleT;
    this.flinch = Math.max(0, this.flinch - FLINCH_DECAY * dt);
    if (this.flinch > 0) {
      const f = this.flinch * this.flinch;
      for (const limb of this.target.limbs) {
        limb.handY += FLINCH.up * f;
        limb.handX -= Math.sign(limb.handX) * FLINCH.inward * f;
      }
    }
  }

  /** Draws the body over the frame just rendered through `world` (matching its aspect). Call after the world pass. */
  render(renderer: WebGLRenderer, world: PerspectiveCamera): void {
    if (this.amount <= 0.01 || this.blink) return;
    const camera = this.camera;
    const aspect = Math.max(world.aspect, 0.01);
    const across = 2 * Math.atan(Math.tan(LAYOUT.minHalfAcross * DEG) / aspect) / DEG;
    const fov = Math.max(LAYOUT.fov, across);
    // The hands rest HAND_REST.x out at HAND_REST.z ahead: keep them inside 80% of the half-width there.
    // A narrow (portrait) screen also sets the whole body further off and lower, so the fists stay small in it.
    const span = Math.tan(fov * DEG / 2) * aspect;
    const narrow = 1 - Math.min(1, 0.8 * span * -HAND_REST.z / HAND_REST.x);
    this.setBack = NARROW.back * narrow;
    this.setDown = NARROW.down * narrow;
    this.squeeze = Math.min(1, 0.8 * span * (this.setBack - HAND_REST.z) / HAND_REST.x);
    if (camera.aspect !== aspect || camera.fov !== fov) {
      camera.aspect = aspect;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.scene.clear();
  }
}

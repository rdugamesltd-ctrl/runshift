import { WALL } from '../../balance';
import type { Side } from '../../game/types';
import type { CharacterRig } from './characterRig';

/**
 * What a character is doing, as far as its animation cares: running (on the floor), a jump it took, airborne
 * without one (off an edge), sliding, running a wall, crashed, falling for good, jet-gliding, or taunting.
 */
export type MotionState = 'run' | 'jump' | 'air' | 'slide' | 'wall' | 'crash' | 'fall' | 'glide' | 'taunt';

/** One frame of a character's motion: its state, interpolated position (m), forward speed (m/s), wall side. */
export interface MotionInput {
  state: MotionState;
  x: number;
  y: number;
  speed: number;
  /** The wall the body rolls onto: −1 left, 1 right, 0 upright. */
  roll: Side | 0;
}

/** Framing numbers for the procedural layer (visual only, not gameplay tuning). */
const MOTION = {
  /** The wall roll eases at this rate, 1/s (about 0.25 s to settle onto a wall). */
  rollRate: 12,
  /** Sideways speed is smoothed at this rate, 1/s. */
  sideRate: 14,
  /** Lean into a sideways move, radians per m/s, at most leanMax. */
  lean: 0.02,
  leanMax: 0.3,
  /** The body turns this share of the way towards its heading, at most headingMax radians. */
  heading: 0.55,
  headingMax: 0.42,
  /** Landing squash: per m/s of fall speed, at most squashMax; take-off stretch; the spring (rad/s, damping). */
  squash: 0.02,
  squashMax: 0.24,
  stretch: 0.1,
  springFreq: 15,
  springDamp: 0.42,
  /** The jump clip is played over this much of the rise, s; then the mid-air loop takes over. */
  jumpRise: 0.26,
  /** The landing clip is played over this long, s, before the run picks up again. */
  landTime: 0.2,
  /** A slide leans the body back this far, radians, pivoting at the feet, easing at tiltRate 1/s. */
  slideTilt: 0.95,
  tiltRate: 16,
} as const;

/** Peak of a damping-0.42 spring kicked at speed v0 is about v0 / (1.7·ω). */
const KICK = 1.7;
const SPRING_STEP = 1 / 120;

function smoothing(rate: number, dt: number): number {
  return dt > 0 ? 1 - Math.exp(-rate * dt) : 0;
}

function isAirborne(state: MotionState): boolean {
  return state === 'jump' || state === 'air';
}

/**
 * Drives a CharacterRig from the character's motion: picks and sequences its clips (the jump clip plays once over
 * the rise and hands over to the mid-air loop; a short landing clip on touchdown; the knock-down once on a crash)
 * and layers procedural motion on the root: the wall roll eased in and out (WALL.rootRollDeg), a lean and a turn
 * towards sideways moves, a backward lean into a slide, a stretch on take-off and a squash on landing in proportion
 * to the fall speed.
 */
export class CharacterMotion {
  private readonly rig: CharacterRig;
  private roll = 0;
  private tilt = 0;
  private sideVel = 0;
  private lastX = Number.NaN;
  private lastY = 0;
  private state: MotionState = 'run';
  private airT = 0;
  private landT = 0;
  private fallSpeed = 0;
  private lastVy = 0;
  private squash = 0;
  private squashV = 0;

  constructor(rig: CharacterRig) {
    this.rig = rig;
  }

  /** Advances the character by `dt` seconds of the frame. */
  update(input: MotionInput, dt: number): void {
    const rig = this.rig;
    const first = Number.isNaN(this.lastX) || dt <= 0;
    const vx = first ? 0 : (input.x - this.lastX) / dt;
    const vy = first ? 0 : (input.y - this.lastY) / dt;
    this.lastX = input.x;
    this.lastY = input.y;
    this.sideVel += (vx - this.sideVel) * smoothing(MOTION.sideRate, dt);

    const state = input.state;
    // A jump taken on the very step of a landing never shows a grounded frame: it shows as falling, then rising.
    const retakeOff = state === 'jump' && isAirborne(this.state) && this.lastVy < 0 && vy > 1;
    this.lastVy = vy;
    if (retakeOff) this.state = 'run';
    const wasAirborne = isAirborne(this.state);
    if (isAirborne(state)) {
      if (!wasAirborne) {
        this.airT = 0;
        this.fallSpeed = 0;
        if (state === 'jump') this.squashV += MOTION.stretch * MOTION.springFreq * KICK;
      }
      this.airT += dt;
      this.fallSpeed = Math.max(this.fallSpeed, -vy);
    } else if (wasAirborne && (state === 'run' || state === 'slide' || state === 'wall')) {
      const depth = Math.min(MOTION.squashMax, this.fallSpeed * MOTION.squash);
      this.squashV -= depth * MOTION.springFreq * KICK;
      this.landT = state === 'run' ? MOTION.landTime : 0;
    }
    if (state !== 'run') this.landT = 0;
    this.landT = Math.max(0, this.landT - dt);
    this.state = state;
    this.pickClip(state, dt);
    rig.update(dt, input.speed);

    // The procedural layer.
    const wallRoll = input.roll * WALL.rootRollDeg * Math.PI / 180;
    this.roll += (wallRoll - this.roll) * smoothing(MOTION.rollRate, dt);
    const upright = 1 - Math.min(1, Math.abs(this.roll) / (WALL.rootRollDeg * Math.PI / 180));
    // No lean onto a wall: the move there swings the feet onto it, which the roll already shows.
    const lean = state === 'wall' ? 0 : Math.max(-MOTION.leanMax, Math.min(MOTION.leanMax, -this.sideVel * MOTION.lean)) * upright;
    const turning = state === 'crash' || state === 'fall' ? 0 : upright;
    const heading = Math.max(-MOTION.headingMax, Math.min(MOTION.headingMax,
      -Math.atan2(this.sideVel, Math.max(1, input.speed)) * MOTION.heading)) * turning;
    const steps = Math.ceil(Math.max(0, dt) / SPRING_STEP);
    const w = MOTION.springFreq;
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.squashV += (-w * w * this.squash - 2 * MOTION.springDamp * w * this.squashV) * h;
      this.squash += this.squashV * h;
    }
    const s = Math.max(-0.35, Math.min(0.35, this.squash));
    this.tilt += ((state === 'slide' ? -MOTION.slideTilt : 0) - this.tilt) * smoothing(MOTION.tiltRate, dt);
    rig.root.rotation.set(this.tilt, heading, this.roll + lean);
    rig.root.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
  }

  private pickClip(state: MotionState, dt: number): void {
    const rig = this.rig;
    switch (state) {
      case 'jump':
        if (this.airT < MOTION.jumpRise) rig.play('jump', { once: true, fade: 0.06, rate: Math.max(1, rig.duration('jump') / MOTION.jumpRise) });
        else rig.play('fall', { fade: 0.18 });
        break;
      case 'air':
      case 'fall':
      case 'glide':
        rig.play('fall', { fade: 0.15 });
        break;
      case 'slide':
        rig.play('slide', { fade: 0.08, rate: 1.4 });
        break;
      case 'crash':
        rig.play('knockback', { once: true, fade: 0.08 });
        break;
      case 'taunt':
        rig.play('victory', { fade: 0.2 });
        break;
      case 'wall':
        rig.play('run', { fade: 0.1 });
        break;
      case 'run':
        if (this.landT > 0 && this.landT + dt >= MOTION.landTime) {
          rig.play('land', { once: true, fade: 0.05, rate: Math.max(1, rig.duration('land') / MOTION.landTime) });
        } else if (this.landT <= 0) rig.play('run', { fade: 0.14 });
        break;
    }
  }
}

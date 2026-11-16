import { Vector3, type PerspectiveCamera } from 'three';
import { CAMERA, SPEED } from '../balance';
import type { RunState } from '../game/types';
import { fitCamera } from './cameraFit';

/** How the camera frames the run, or the idle hero on the menu. */
export type CameraMode = 'firstPerson' | 'chase' | 'menu';

/** Trauma lost per second: a full knock (1) settles in about 0.6 s. */
const TRAUMA_DECAY = 1.6;
/** Camera offset at full trauma, m, and roll at full trauma, radians. Shake is trauma², so small knocks stay small. */
const SHAKE_OFFSET = 0.32;
const SHAKE_ROLL = 0.045;
/** Shake frequencies (sideways, up and down, roll), rad/s: unrelated, so the wobble never repeats visibly. */
const SHAKE_FREQ = [47, 53, 37] as const;
/** FOV kick lost per second (a kick of 1 is gone in about a third of a second). */
const KICK_DECAY = 3;
/** The field of view eases towards its target at this rate, 1/s. */
const FOV_RATE = 6;
/** The camera never follows a fall lower than this, m, so it stays above the street while the hero drops away. */
const FALL_FOLLOW_MIN = -2;
/** Menu framing, in front of the idle hero: distance and height of the camera, height it looks at, m. */
const MENU_DISTANCE = 4.4;
const MENU_HEIGHT = 1.45;
const MENU_LOOK_HEIGHT = 1.0;
/** The menu camera sways round the hero this far either side (radians) at this rate (rad/s). */
const MENU_SWAY = 0.32;
const MENU_SWAY_RATE = 0.22;
/** Swinging between the menu and the chase takes this long, s (inside the run's intro). */
const MENU_SWING_TIME = 0.9;
/** The landing kick's speed per m of wanted dip per rad/s of spring frequency: the peak of a spring with
 *  damping 0.5 kicked at speed v0 is about v0 / (1.83·ω). */
const DIP_KICK = 1.83;
/** Longest substep of the dip spring, s. */
const SPRING_STEP = 1 / 120;
/** The footstep bob fades in and out at this rate, 1/s. */
const BOB_FADE = 10;
const DEG = Math.PI / 180;

/** The body's motion at the eye for one frame (CameraRig.updateFeel). */
interface FeelOut { bob: number; sway: number; roll: number; motion: number }

/** Exponential smoothing for `rate` (1/s) over `dt` seconds: 1 − e^(−rate·dt), the same at any frame rate. */
export function smoothing(rate: number, dt: number): number {
  return dt > 0 ? 1 - Math.exp(-rate * dt) : 0;
}

/** Shake strength for a trauma level: trauma², clamped to [0, 1]. */
export function shakeAmount(trauma: number): number {
  const t = Math.min(1, Math.max(0, trauma));
  return t * t;
}

/** The extra field of view at speed v, degrees: none at SPEED.start, CAMERA.speedFov at the top speed. */
export function speedFov(v: number): number {
  const t = (v - SPEED.start) / SPEED.gain;
  return CAMERA.speedFov * Math.min(1, Math.max(0, t));
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * The chase camera (hero shooter's exponential follow and trauma shake). It keeps CAMERA.back behind and
 * CAMERA.height above the player, following CAMERA.followX of his x and followY of his y with smoothing
 * k = 1 − e^(−CAMERA.stiffness·dt), and looks CAMERA.lookAhead down the track. fitCamera() sets the field of view
 * for the screen's shape (pulling back on tall screens); speed widens it by up to CAMERA.speedFov and big moments
 * kick it by up to CAMERA.kickFov. On the menu it swings round in front of the idle hero.
 *
 * Hooks for WP-13: `roll` (radians about the view axis), `offsetX` (m, sideways) and `extraFov` (degrees) are added
 * on top every frame; the wall-run logic (CAMERA.wall, reducedMotionRoll) sets them.
 */
export class CameraRig {
  /** Eye-level view during play, chase view, or menu framing in front of the idle hero. */
  mode: CameraMode = 'chase';
  /** 0 on foot, easing to 1 while jet-gliding. */
  private glideBlend = 0;
  /** Roll about the view axis, radians (WP-13: toward the wall while wall-running). */
  roll = 0;
  /** Sideways offset of the camera and its aim, m (WP-13: away from the wall). */
  offsetX = 0;
  /** Extra field of view, degrees (WP-13: the wall-run FOV). */
  extraFov = 0;
  /** Reduced motion: no shake (and WP-13 halves the roll). */
  reducedMotion: boolean;

  private readonly camera: PerspectiveCamera;
  private readonly fit = { fov: 0, pullBack: 0, pullUp: 0 };
  private readonly chasePos = new Vector3();
  private readonly chaseLook = new Vector3();
  private readonly target = new Vector3();
  private readonly look = new Vector3();
  private readonly pos = new Vector3();
  private trauma = 0;
  private kickLevel = 0;
  private time = 0;
  private fov = 0;
  /** 0 = chase, 1 = menu; eased by smoothstep when used. */
  private menuBlend = 0;
  private initialised = false;
  private wallBlend = 0;
  private wallSide: -1 | 1 = 1;
  /** Stride phase of the drawn body, radians (FirstPersonBody.phase): footfalls at 0 and π. Set by the app. */
  stridePhase = 0;
  /** Eased eye height above the feet, m. */
  private eye = 0;
  /** Landing dip spring: offset, m, and its speed, m/s. */
  private dip = 0;
  private dipV = 0;
  /** Fastest fall since leaving the ground, m/s, and whether the player was airborne last frame. */
  private fallSpeed = 0;
  private wasAirborne = false;
  /** Smoothed sideways and vertical speed of the player, m/s, from the last frame's position. */
  private sideVel = 0;
  private upVel = 0;
  private lastPx = 0;
  private lastPy = 0;
  /** 0-1: how much of the footstep bob plays (eased in and out with the running). */
  private bobBlend = 0;
  /** 0-1: how much of the lean into sideways moves plays (none on and between walls, where the wall roll leads). */
  private leanBlend = 1;
  private readonly feelOut: FeelOut = { bob: 0, sway: 0, roll: 0, motion: 1 };

  constructor(camera: PerspectiveCamera, options: { reducedMotion?: boolean } = {}) {
    this.camera = camera;
    this.reducedMotion = options.reducedMotion ?? false;
  }

  /** Adds camera shake: about 0.2 for a hard landing, 0.5 for a stumble, 0.9 for a crash. Capped at 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** Adds a short field-of-view kick (0-1 of CAMERA.kickFov) for a burst of speed. */
  kick(amount: number): void {
    this.kickLevel = Math.min(1, this.kickLevel + Math.max(0, amount));
  }

  /** How far the view is at the hero's eyes: 1 in first person, falling to 0 as the camera swings to the menu. */
  get firstPersonAmount(): number {
    return this.mode === 'firstPerson' ? 1 - smoothstep(this.menuBlend) : 0;
  }

  /** Snaps to the framing on the next frame instead of easing there. */
  cut(): void {
    this.initialised = false;
  }

  /** Places the camera for this frame. `alpha` interpolates the run's last step; `dt` is the frame time, s. */
  update(run: RunState, alpha: number, dt: number): void {
    const wallMode = run.player.mode;
    const onWall = wallMode.kind === 'wallAttach' || wallMode.kind === 'wallRun';
    if (onWall) this.wallSide = wallMode.side;
    const targetBlend = onWall && this.mode !== 'menu' ? 1 : 0;
    const tau = targetBlend > this.wallBlend ? CAMERA.wall.tauIn : CAMERA.wall.tauOut;
    this.wallBlend += (targetBlend - this.wallBlend) * smoothing(1 / tau, dt);
    this.roll = this.wallSide * CAMERA.wall.rollDeg * Math.PI / 180 * this.wallBlend * (this.reducedMotion ? CAMERA.reducedMotionRoll : 1);
    this.offsetX = -this.wallSide * CAMERA.wall.offset * this.wallBlend;
    this.extraFov = CAMERA.wall.fov * this.wallBlend;
    const camera = this.camera;
    const fit = fitCamera(camera.aspect, this.fit);
    this.time += dt;
    const snap = !this.initialised;

    const p = run.player;
    const prev = run.prev;
    const px = prev.x + (p.x - prev.x) * alpha;
    const py = Math.max(FALL_FOLLOW_MIN, prev.y + (p.y - prev.y) * alpha);
    const firstPerson = this.mode === 'firstPerson';
    const feel = this.updateFeel(run, px, py, snap, dt);

    // The eye follows lane changes, jumps and slides exactly, plus the body's motion; menu/chase retain their
    // smooth framing (with a softer landing dip).
    if (firstPerson) {
      const eyeY = py + lerp(this.eye, CAMERA.firstPerson.wallEyeHeight, this.wallBlend) + this.dip - feel.bob;
      const eyeX = px + feel.sway;
      this.target.set(eyeX, eyeY, 0);
      this.look.set(eyeX + this.sideVel * CAMERA.feel.lookLead * feel.motion,
        eyeY - CAMERA.firstPerson.lookDown - this.dip * (1 - CAMERA.feel.landLook) + this.upVel * CAMERA.feel.jumpPitch * feel.motion,
        -CAMERA.firstPerson.lookAhead);
    } else {
      const followX = px * CAMERA.followX + this.offsetX;
      const followY = py * CAMERA.followY + this.dip * 0.5;
      this.glideBlend += ((p.gliding ? 1 : 0) - this.glideBlend) * smoothing(1 / CAMERA.glide.tau, dt);
      this.target.set(followX, CAMERA.height + fit.pullUp + followY + CAMERA.glide.up * this.glideBlend,
        CAMERA.back + fit.pullBack + CAMERA.glide.back * this.glideBlend);
      this.look.set(followX, CAMERA.lookHeight + followY, -CAMERA.lookAhead);
    }
    if (snap || firstPerson) {
      this.chasePos.copy(this.target);
      this.chaseLook.copy(this.look);
    } else {
      const k = smoothing(CAMERA.stiffness, dt);
      this.chasePos.lerp(this.target, k);
      this.chaseLook.lerp(this.look, k);
    }

    // Swing between the menu and the chase round the hero's side, never through him.
    const menuTarget = this.mode === 'menu' ? 1 : 0;
    if (snap) this.menuBlend = menuTarget;
    else if (this.menuBlend !== menuTarget) {
      const step = dt / MENU_SWING_TIME;
      this.menuBlend = menuTarget > this.menuBlend ? Math.min(1, this.menuBlend + step) : Math.max(0, this.menuBlend - step);
    }
    const m = smoothstep(this.menuBlend);
    if (m > 0) this.blendMenu(px, py, m);
    else {
      this.pos.copy(this.chasePos);
      this.look.copy(this.chaseLook);
    }

    // Shake: trauma² of an offset and a roll (none with reduced motion).
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    const shake = this.reducedMotion ? 0 : shakeAmount(this.trauma);
    const t = this.time;
    if (shake > 0) {
      this.pos.x += Math.sin(t * SHAKE_FREQ[0]) * SHAKE_OFFSET * shake;
      this.pos.y += Math.sin(t * SHAKE_FREQ[1] + 1) * SHAKE_OFFSET * shake;
    }
    camera.position.copy(this.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.look);
    const roll = (this.roll + feel.roll) * (1 - m) + (shake > 0 ? Math.sin(t * SHAKE_FREQ[2] + 3) * SHAKE_ROLL * shake : 0);
    if (roll !== 0) camera.rotateZ(roll);

    // Field of view: the fit, widened with speed and kicks while chasing.
    this.kickLevel = Math.max(0, this.kickLevel - KICK_DECAY * dt);
    const chaseFov = speedFov(run.v) + CAMERA.kickFov * this.kickLevel + this.extraFov;
    const firstPersonFit = CAMERA.firstPerson;
    const firstPersonFov = Math.min(firstPersonFit.maxFov, Math.max(firstPersonFit.minFov,
      2 * Math.atan(firstPersonFit.halfWidth / Math.max(camera.aspect, 0.01) / firstPersonFit.fitDistance) * 180 / Math.PI));
    const fov = (firstPerson ? firstPersonFov : fit.fov) + chaseFov * (1 - m);
    this.fov = snap ? fov : this.fov + (fov - this.fov) * smoothing(FOV_RATE, dt);
    if (Math.abs(camera.fov - this.fov) > 1e-3) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
    this.initialised = true;
  }

  /**
   * The body's motion at the eye for this frame (CAMERA.feel): eases the eye height between standing and sliding,
   * springs a dip on landing in proportion to the fall speed, and returns the footstep bob (m down), sway (m
   * sideways), the lean into sideways moves plus the footstep roll (radians, positive tilts the view's up to the
   * left like the wall roll) and `motion`, 0 with reduced motion. Reuses one object.
   */
  private updateFeel(run: RunState, px: number, py: number, snap: boolean, dt: number): FeelOut {
    const f = CAMERA.feel;
    const p = run.player;
    const kind = p.mode.kind;
    const out = this.feelOut;
    const motion = this.reducedMotion ? 0 : 1;
    out.motion = motion;
    const eyeTarget = p.height * CAMERA.firstPerson.eyeHeightRatio;
    if (snap || dt <= 0) {
      if (snap) {
        this.eye = eyeTarget;
        this.dip = 0;
        this.dipV = 0;
        this.sideVel = 0;
        this.upVel = 0;
        this.fallSpeed = 0;
        this.wasAirborne = false;
        this.bobBlend = 0;
        this.leanBlend = 1;
      }
    } else {
      this.eye += (eyeTarget - this.eye) * smoothing(f.crouchRate, dt);
      const vx = (px - this.lastPx) / dt;
      const vy = (py - this.lastPy) / dt;
      const k = smoothing(f.sideRate, dt);
      this.sideVel += (vx - this.sideVel) * k;
      this.upVel += (vy - this.upVel) * k;
      const airborne = !p.gliding && (kind === 'jump' || kind === 'air' || kind === 'fall' || kind === 'wallJump');
      if (airborne) this.fallSpeed = Math.max(this.fallSpeed, -vy);
      else {
        if (this.wasAirborne && kind !== 'crash') {
          const depth = Math.min(f.landDipMax, this.fallSpeed * f.landDip) * (this.reducedMotion ? 0.5 : 1);
          // A kick of this speed peaks at about `depth` for the spring's frequency and damping.
          this.dipV -= depth * f.springFreq * DIP_KICK;
        }
        this.fallSpeed = 0;
      }
      this.wasAirborne = airborne;
      // The dip spring, in substeps short enough to stay stable on a long frame.
      const steps = Math.ceil(dt / SPRING_STEP);
      const h = dt / steps;
      const w = f.springFreq;
      for (let i = 0; i < steps; i++) {
        this.dipV += (-w * w * this.dip - 2 * f.springDamp * w * this.dipV) * h;
        this.dip += this.dipV * h;
      }
      const running = run.phase === 'running' && !p.gliding && (kind === 'run' || kind === 'wallRun');
      this.bobBlend += ((running ? 1 : 0) - this.bobBlend) * smoothing(BOB_FADE, dt);
      const walls = kind === 'wallAttach' || kind === 'wallRun' || kind === 'wallJump' || kind === 'wallExit';
      this.leanBlend += ((walls ? 0 : 1) - this.leanBlend) * smoothing(BOB_FADE, dt);
    }
    this.lastPx = px;
    this.lastPy = py;
    // Footfalls (body lowest) at stride phases π/2 and 3π/2; the weight shifts towards the foot on the ground.
    const b = this.bobBlend * motion;
    const s = Math.sin(this.stridePhase);
    const c = Math.cos(this.stridePhase);
    out.bob = f.bob * b * s * s;
    out.sway = f.sway * b * c;
    const lean = Math.max(-f.laneRollMax, Math.min(f.laneRollMax, this.sideVel * f.laneRoll)) * motion * this.leanBlend;
    out.roll = -(lean + f.bobRoll * b * c) * DEG;
    return out;
  }

  /** Blends this.pos and this.look from the chase framing toward the menu framing by `m` (0-1). */
  private blendMenu(px: number, py: number, m: number): void {
    const hx = px;
    const hy = Math.max(0, py);
    // Cylindrical coordinates round the hero's vertical axis; angle 0 is behind him (+z), π in front.
    const cx = this.chasePos.x - hx;
    const cz = this.chasePos.z;
    const chaseR = Math.hypot(cx, cz);
    const chaseA = Math.atan2(cx, cz);
    const menuA = Math.PI + Math.sin(this.time * MENU_SWAY_RATE) * MENU_SWAY;
    const r = lerp(chaseR, MENU_DISTANCE, m);
    const a = lerp(chaseA, menuA, m);
    this.pos.set(hx + Math.sin(a) * r, lerp(this.chasePos.y, hy + MENU_HEIGHT, m), Math.cos(a) * r);
    this.look.set(lerp(this.chaseLook.x, hx, m), lerp(this.chaseLook.y, hy + MENU_LOOK_HEIGHT, m), lerp(this.chaseLook.z, 0, m));
  }
}

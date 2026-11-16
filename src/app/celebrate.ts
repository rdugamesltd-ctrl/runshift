import type { District, GameEvent, PowerUpKind } from '../game/types';

/** Everything an event can set off. Structural, so tests pass fakes; integrators add targets (sparks, coach). */
export interface CelebrateTargets {
  /** Plays the event's sound (GameAudio). */
  audio: { onEvent(event: GameEvent): void };
  /** Camera shake (trauma) and field-of-view kick (CameraRig). */
  camera: { shake(amount: number): void; kick(amount: number): void };
  /** A short message over the run (the HUD's toast). */
  toast(text: string): void;
}

/** Camera trauma per event (0-1; the shake is trauma², so these feel quadratically). */
const SHAKE = {
  bump: 0.15,
  hardLand: 0.25,
  stumble: 0.5,
  shieldBreak: 0.55,
  crash: 0.9,
  fall: 0.2,
} as const;

/** FOV kick per event (0-1 of CAMERA.kickFov): bursts of speed and big moves. */
const KICK = {
  fastFall: 0.2,
  wallAttach: 0.35,
  wallJump: 0.5,
  pickup: 0.3,
  glideSave: 0.6,
  tier: 0.45,
  newBest: 0.4,
} as const;

/** What a pickup toast says. */
const PICKUP_TOASTS: Readonly<Record<PowerUpKind, string>> = {
  magnet: 'MAGNET!',
  shield: 'SHIELD!',
  multiplier: 'DOUBLE SCORE!',
  glide: 'GLIDE!',
};

/** What arriving in a district says. */
const DISTRICT_TOASTS: Readonly<Record<District, string>> = {
  street: 'THE STREETS',
  rooftop: 'ROOFTOPS',
  subway: 'SUBWAY',
};

/**
 * Routes one game event to sound, camera and HUD. Called for every event, once per frame, after the frame's steps.
 * Every event gets its sound; impacts shake the camera (a hard landing a little, a stumble more, a crash most);
 * bursts of speed kick the field of view; milestones, tiers, new bests, districts and power-ups get a toast.
 * Integrators add sparks and the rest here.
 */
export function celebrate(event: GameEvent, targets: CelebrateTargets): void {
  targets.audio.onEvent(event);
  const { camera } = targets;
  switch (event.type) {
    case 'bump':
      camera.shake(SHAKE.bump);
      break;
    case 'land':
      if (event.hard) camera.shake(SHAKE.hardLand);
      break;
    case 'stumble':
      camera.shake(SHAKE.stumble);
      break;
    case 'crash':
      camera.shake(SHAKE.crash);
      break;
    case 'fall':
      camera.shake(SHAKE.fall);
      break;
    case 'shieldBreak':
      camera.shake(SHAKE.shieldBreak);
      targets.toast('SHIELD BROKEN!');
      break;
    case 'fastFall':
      camera.kick(KICK.fastFall);
      break;
    case 'wallAttach':
      camera.kick(KICK.wallAttach);
      break;
    case 'wallJump':
      camera.kick(KICK.wallJump);
      break;
    case 'glideSave':
      camera.kick(KICK.glideSave);
      targets.toast('SAVED!');
      break;
    case 'pickup':
      camera.kick(KICK.pickup);
      targets.toast(PICKUP_TOASTS[event.kind]);
      break;
    case 'tier':
      // Tier 0 is where every run starts: nothing to announce.
      if (event.tier > 0) {
        camera.kick(KICK.tier);
        targets.toast('FASTER!');
      }
      break;
    case 'milestone':
      targets.toast(`${event.metres} M`);
      break;
    case 'newBest':
      camera.kick(KICK.newBest);
      targets.toast('NEW BEST!');
      break;
    case 'district':
      targets.toast(DISTRICT_TOASTS[event.district]);
      break;
    default:
      break;
  }
}

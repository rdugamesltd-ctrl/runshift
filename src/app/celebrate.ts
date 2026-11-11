import type { GameAudio } from '../audio/audio';
import type { GameEvent } from '../game/types';
import type { CameraRig } from '../render/camera';
import type { Hud } from '../ui/hud';

/** Everything an event can set off. */
export interface CelebrateTargets {
  audio: GameAudio;
  camera: CameraRig;
  hud: Hud;
}

/**
 * Routes one game event to sound, camera and HUD. Called for every event, once per frame.
 * WP-00 stub: sound only. TODO WP-04: camera kicks and shake, HUD pulses, sparks; integrators add the rest.
 */
export function celebrate(event: GameEvent, targets: CelebrateTargets): void {
  targets.audio.onEvent(event);
}

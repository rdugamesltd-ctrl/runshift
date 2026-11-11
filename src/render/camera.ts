import type { PerspectiveCamera } from 'three';
import { CAMERA } from '../balance';
import type { RunState } from '../game/types';
import { fitCamera } from './cameraFit';

/**
 * The chase camera. WP-00 stub: fixed framing behind the player from fitCamera, no smoothing.
 * TODO WP-04: exponential follow (CAMERA.stiffness, followX/Y), trauma² shake, speed FOV and kick, menu framing;
 * WP-13: wall roll (CAMERA.wall), offset and reduced motion.
 */
export class CameraRig {
  private readonly camera: PerspectiveCamera;

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  /** Places the camera for this frame. */
  update(_run: RunState, _alpha: number, _dt: number): void {
    const camera = this.camera;
    const fit = fitCamera(camera.aspect);
    if (camera.fov !== fit.fov) {
      camera.fov = fit.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.set(0, CAMERA.height + fit.pullUp, CAMERA.back + fit.pullBack);
    camera.lookAt(0, CAMERA.lookHeight, -CAMERA.lookAhead);
  }
}

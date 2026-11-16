import { DirectionalLight, Fog, HemisphereLight, NeutralToneMapping, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CAMERA, FOG } from '../balance';
import { clampQuality, LOWEST_QUALITY, pixelRatioFor } from './quality';
import { applySky, HORIZON_COLOUR } from './world/sky';

/** How the stage starts. */
export interface StageOptions {
  /** Multisampling, on by default. ?quality=low turns it off: phones that need low quality lack the fill rate. */
  antialias?: boolean;
  /** The starting quality level, an index into QUALITY.scales (0, full resolution, by default). */
  quality?: number;
}

/** The renderer, scene, camera and lights. */
export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  /** A touch screen (coarse pointer): the pixel ratio is capped at QUALITY.dprTouch instead of dprDesktop. */
  readonly touch: boolean;
  /** The quality level: an index into QUALITY.scales, 0 = full resolution. */
  readonly quality: number;
  /** Matches the drawing buffer and camera to the window. */
  resize(): void;
  /** Draws at a lower resolution, for devices that cannot keep up. Returns false when there is nothing left to lower. */
  lowerResolution(): boolean;
  /** Sets the quality level (clamped to QUALITY.scales) and resizes. */
  setQuality(level: number): void;
  /** Draws a frame (renderer.info is reset first, so stats cover exactly this frame). */
  render(): void;
  /** Removes the listeners and frees the renderer. */
  dispose(): void;
}

/** The sun stands behind the player's left shoulder, so the faces he runs at are lit and shadows fall ahead. */
const SUN_DIRECTION = [-0.5, 0.75, 0.42] as const;
/** The shadow map covers the track from just behind the player to this far ahead, m, and this far either side. */
const SHADOW = { ahead: 62, behind: 10, across: 15, distance: 70, size: 2048, sizeTouch: 1024 } as const;
/** Quality levels from this one on draw no shadows. */
const SHADOWS_UNTIL_QUALITY = 2;
/** Phones report their new size late after a rotation, so it is measured again after this long, ms. */
const ROTATION_SETTLE_MS = 300;
/** Near clipping plane, m: the hero stands 6 m from the camera, nothing comes closer. */
const NEAR = 0.3;

/**
 * Builds the stage on the game canvas (Rail in the Air's scene.ts): antialiased WebGL, the pixel ratio capped per
 * device and scaled by the quality level, neutral tone mapping, one soft sun shadow map over the near track (off at
 * the two lowest quality levels), a painted sky that is also the reflection environment, distance fog
 * FOG.near-FOG.far in the horizon's colour, the far plane at CAMERA.far. The world moves and the player stays at the origin, so the sun
 * never moves. Resizes on window and visual-viewport resizes and on rotation (again ROTATION_SETTLE_MS later).
 */
export function createStage(canvas: HTMLCanvasElement, options: StageOptions = {}): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: options.antialias ?? true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Khronos neutral tone mapping keeps the cartoon colours saturated while rolling off the sunlit highlights.
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  // Stats cover exactly one frame: render() resets the counters itself.
  renderer.info.autoReset = false;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let level = clampQuality(options.quality ?? 0);

  const scene = new Scene();
  const sky = applySky(scene, renderer);
  scene.environmentIntensity = 0.9;
  scene.fog = new Fog(HORIZON_COLOUR, FOG.near, FOG.far);

  const camera = new PerspectiveCamera(CAMERA.fit.minFov, 1, NEAR, CAMERA.far);

  // Warm sunlight against cool sky light: lit faces glow, shadows turn blue rather than grey.
  const hemi = new HemisphereLight('#cfe6ff', '#8d8378', 1.55);
  const sun = new DirectionalLight('#fff0d2', 3.1);
  sun.target.position.set(0, 0, -(SHADOW.ahead - SHADOW.behind) / 2);
  sun.position.set(SUN_DIRECTION[0], SUN_DIRECTION[1], SUN_DIRECTION[2]).multiplyScalar(SHADOW.distance).add(sun.target.position);
  // One shadow map over the stretch of track the player reads. The world moves and the player does not, so the
  // light and its shadow frustum never move.
  const shadowSize = touch ? SHADOW.sizeTouch : SHADOW.size;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const half = (SHADOW.ahead + SHADOW.behind) / 2;
  sun.shadow.camera.left = -SHADOW.across;
  sun.shadow.camera.right = SHADOW.across;
  sun.shadow.camera.top = half;
  sun.shadow.camera.bottom = -half;
  // The shadow frustum's long side runs down the track.
  sun.shadow.camera.up.set(0, 0, -1);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SHADOW.distance * 2;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  sun.castShadow = level < SHADOWS_UNTIL_QUALITY;
  scene.add(hemi, sun, sun.target);

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if (!width || !height) return;
    const ratio = pixelRatioFor(window.devicePixelRatio, touch, level);
    if (ratio !== renderer.getPixelRatio()) renderer.setPixelRatio(ratio);
    // false: the canvas keeps its CSS size (100% of the page), only the drawing buffer changes.
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  let rotationTimer = 0;
  const rotated = () => {
    resize();
    clearTimeout(rotationTimer);
    rotationTimer = window.setTimeout(resize, ROTATION_SETTLE_MS);
  };
  window.addEventListener('resize', resize);
  // Phones report the new size late after a rotation, or only through the visual viewport.
  window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('orientationchange', rotated);
  resize();

  const setQuality = (value: number) => {
    level = clampQuality(value);
    sun.castShadow = level < SHADOWS_UNTIL_QUALITY;
    resize();
  };

  const lowerResolution = () => {
    if (level >= LOWEST_QUALITY) return false;
    setQuality(level + 1);
    return true;
  };

  const render = () => {
    renderer.info.reset();
    renderer.render(scene, camera);
  };

  const dispose = () => {
    window.removeEventListener('resize', resize);
    window.visualViewport?.removeEventListener('resize', resize);
    window.removeEventListener('orientationchange', rotated);
    clearTimeout(rotationTimer);
    sky.dispose();
    renderer.dispose();
  };

  return {
    renderer,
    scene,
    camera,
    sun,
    hemi,
    touch,
    get quality() {
      return level;
    },
    resize,
    lowerResolution,
    setQuality,
    render,
    dispose,
  };
}

import { Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CAMERA, FOG, QUALITY } from '../balance';

/** The renderer, scene, camera and lights. */
export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  /** Matches the drawing buffer and camera to the window. */
  resize(): void;
  /** Draws at a lower resolution, for devices that cannot keep up. Returns false when there is nothing left to lower. */
  lowerResolution(): boolean;
  /** Draws a frame (renderer.info is reset first, so stats cover exactly this frame). */
  render(): void;
}

/**
 * Builds the stage on the game canvas. World moves, player at the origin, so the sun is static.
 * WP-00 stub: plain sky colour and fog. TODO WP-04: gradient sky, Rail's resize details, quality hooks;
 * WP-23: the toon light preset.
 */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const touch = matchMedia('(pointer: coarse)').matches;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, touch ? QUALITY.dprTouch : QUALITY.dprDesktop);
  renderer.setPixelRatio(pixelRatio);
  renderer.info.autoReset = false;

  const scene = new Scene();
  const sky = new Color('#9ad6ee');
  scene.background = sky;
  scene.fog = new Fog(sky, FOG.near, FOG.far);

  const camera = new PerspectiveCamera(CAMERA.fit.minFov, 1, 0.3, CAMERA.far);

  const hemi = new HemisphereLight('#fff4dd', '#5d6680', 1.8);
  const sun = new DirectionalLight('#fff1d6', 2.2);
  sun.position.set(-30, 60, 20);
  scene.add(hemi, sun);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  // Phones report the new size late after a rotation, or only through the visual viewport.
  window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => {
    resize();
    setTimeout(resize, 300);
  });
  resize();

  const lowerResolution = () => {
    if (pixelRatio <= 1) return false;
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
    return true;
  };

  const render = () => {
    renderer.info.reset();
    renderer.render(scene, camera);
  };

  return { renderer, scene, camera, sun, hemi, resize, lowerResolution, render };
}

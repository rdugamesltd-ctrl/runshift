import { CanvasTexture, EquirectangularReflectionMapping, PMREMGenerator, SRGBColorSpace, type Scene, type Texture, type WebGLRenderer } from 'three';
import { makeRng } from '../../game/track/random';

/** The haze at the horizon: the fog takes this colour, so the far track melts into the sky. */
export const HORIZON_COLOUR = '#cfe9f6';

/** The sky from the zenith (0) to the horizon (1). */
const SKY_STOPS: readonly (readonly [number, string])[] = [
  [0, '#1560c4'],
  [0.45, '#2f8ae2'],
  [0.78, '#74bdf0'],
  [0.93, '#b4e0f6'],
  [1, HORIZON_COLOUR],
];
/** Below the horizon the panorama fades from the haze to the colour light bounces off the ground with. */
const GROUND_COLOUR = '#9c8f84';
/** Where the sun sits in the panorama: across (0-1; 0.25 is straight ahead, 0.75 behind) and degrees above the horizon. */
const SUN = { u: 0.86, elevation: 50 } as const;

/** A cumulus cloud: a flat-bottomed heap of discs, shaded underneath. */
function paintCloud(ctx: CanvasRenderingContext2D, rng: () => number, x: number, y: number, size: number): void {
  const puffs: [number, number, number][] = [];
  const count = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    // Taller in the middle, like a heap.
    const lift = Math.sin(t * Math.PI);
    const r = size * (0.28 + 0.3 * lift + 0.12 * rng());
    puffs.push([x + (t - 0.5) * size * 2.6, y - r * 0.55 - lift * size * 0.2 * rng(), r]);
  }
  const pass = (colour: string, dx: number, dy: number, grow: number) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (const [px, py, r] of puffs) {
      ctx.moveTo(px + dx + r * grow, py + dy);
      ctx.arc(px + dx, py + dy, r * grow, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  ctx.save();
  // Clip to above the cloud's flat base.
  ctx.beginPath();
  ctx.rect(x - size * 3, y - size * 3, size * 6, size * 3 + size * 0.08);
  ctx.clip();
  pass('#a9c9e6', 0, size * 0.1, 1.02);
  pass('#e3f0fb', 0, size * 0.03, 1);
  pass('#ffffff', -size * 0.04, -size * 0.06, 0.9);
  ctx.restore();
}

/** A hazy row of far towers standing on the horizon line. */
function paintSkyline(ctx: CanvasRenderingContext2D, rng: () => number, width: number, horizon: number, colour: string, tallest: number): void {
  ctx.fillStyle = colour;
  let x = 0;
  while (x < width) {
    const w = 10 + rng() * 26;
    const h = tallest * (0.25 + 0.75 * rng() * rng());
    ctx.fillRect(x, horizon - h, w, h + 2);
    // A stepped crown or a mast on some towers.
    if (rng() > 0.6) ctx.fillRect(x + w * 0.25, horizon - h - tallest * 0.12, w * 0.5, tallest * 0.12);
    if (rng() > 0.85) ctx.fillRect(x + w * 0.48, horizon - h - tallest * 0.4, 2, tallest * 0.4);
    x += w + rng() * 8;
  }
}

/**
 * Paints the sky once as an equirectangular panorama (no per-frame cost): a deep blue gradient, the sun's glow,
 * cartoon cumulus clouds, and two hazy rows of far towers on the horizon that give the city depth beyond the fog.
 * Straight ahead (−z) is a quarter of the way across.
 */
export function makeSkyTexture(width = 2048): CanvasTexture {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const horizon = height / 2;
  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    for (const [at, colour] of SKY_STOPS) sky.addColorStop(at, colour);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);
    const ground = ctx.createLinearGradient(0, horizon, 0, height);
    ground.addColorStop(0, HORIZON_COLOUR);
    ground.addColorStop(0.12, HORIZON_COLOUR);
    ground.addColorStop(0.5, GROUND_COLOUR);
    ground.addColorStop(1, GROUND_COLOUR);
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, width, height - horizon);

    // The sun: a wide warm glow and a white disc (drawn twice so it wraps the panorama's seam).
    const sunY = horizon * (1 - SUN.elevation / 90);
    for (const wrap of [-1, 0, 1]) {
      const sunX = (SUN.u + wrap) * width;
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, height * 0.42);
      glow.addColorStop(0, 'rgba(255, 250, 225, 0.95)');
      glow.addColorStop(0.05, 'rgba(255, 244, 200, 0.6)');
      glow.addColorStop(0.3, 'rgba(255, 240, 200, 0.16)');
      glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunX - height * 0.42, 0, height * 0.84, horizon);
      ctx.fillStyle = '#fffdf0';
      ctx.beginPath();
      ctx.arc(sunX, sunY, height * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }

    const rng = makeRng(20261115);
    // Clouds: small and many near the horizon, a few big ones higher up.
    for (let i = 0; i < 34; i++) {
      const elevation = 4 + 38 * rng() * rng();
      const size = height * (0.012 + 0.00075 * elevation + 0.012 * rng());
      const x = rng() * width;
      const y = horizon * (1 - elevation / 90);
      for (const wrap of [-width, 0, width]) {
        if (x + wrap > -size * 4 && x + wrap < width + size * 4) {
          const copy = makeRng(1000 + i);
          paintCloud(ctx, copy, x + wrap, y, size);
        }
      }
    }
    // Haze over the lowest clouds, then the far city.
    const haze = ctx.createLinearGradient(0, horizon * 0.86, 0, horizon);
    haze.addColorStop(0, 'rgba(207, 233, 246, 0)');
    haze.addColorStop(1, 'rgba(207, 233, 246, 0.85)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon * 0.86, width, horizon * 0.14);
    paintSkyline(ctx, rng, width, horizon, '#b3d6ec', height * 0.05);
    paintSkyline(ctx, rng, width, horizon, '#9cc6e2', height * 0.032);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.mapping = EquirectangularReflectionMapping;
  return texture;
}

/**
 * Sets the scene's sky and the light it reflects: the painted panorama as the background and, prefiltered, as the
 * environment that metal and paint (coins, rails, trains) mirror. Returns what to dispose of.
 */
export function applySky(scene: Scene, renderer?: WebGLRenderer): { dispose(): void } {
  const sky = makeSkyTexture();
  scene.background = sky;
  let environment: Texture | null = null;
  if (renderer) {
    const generator = new PMREMGenerator(renderer);
    environment = generator.fromEquirectangular(sky).texture;
    generator.dispose();
    scene.environment = environment;
  }
  return {
    dispose() {
      sky.dispose();
      environment?.dispose();
    },
  };
}

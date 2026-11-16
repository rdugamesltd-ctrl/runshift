import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Material } from 'three';
import { makeRng } from '../../game/track/random';

/**
 * Procedural surfaces for the track, painted once on canvases (no downloads), and the shader patches that lay them
 * out in track space, so a texture stays put on the ground while the world scrolls past the player.
 */

/** The scroll uniform wraps at this distance, m. Every tile and panel length must divide it. */
export const TRACK_PERIOD = 320;
/** The track distance of the render origin, wrapped to TRACK_PERIOD. The track view sets it every frame. */
export const trackScroll = { value: 0 };
/** Mural panels in the atlas, and the length of wall each one covers, m. */
export const MURAL_CELLS = 8;
export const MURAL_PANEL = 5;

/** Sets the scroll for this frame from the interpolated distance. */
export function setTrackScroll(d: number): void {
  trackScroll.value = ((d % TRACK_PERIOD) + TRACK_PERIOD) % TRACK_PERIOD;
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

function finish(canvas: HTMLCanvasElement, repeat: boolean): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

/** Loose stones: a base tone scattered with lighter and darker pebbles. Tiles seamlessly. Null without a DOM. */
export function gravelTexture(base: string, light: string, dark: string, seed = 7): CanvasTexture | null {
  const made = canvasOf(256, 256);
  if (!made) return null;
  const { canvas, ctx } = made;
  const rng = makeRng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const r = 0.9 + rng() * 2.1;
    ctx.fillStyle = rng() > 0.5 ? light : dark;
    ctx.globalAlpha = 0.2 + rng() * 0.4;
    // Draw each stone at its wrapped positions too, so the tile has no seam.
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      if (x + dx < -8 || x + dx > 264 || y + dy < -8 || y + dy > 264) continue;
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, r, r * (0.6 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return finish(canvas, true);
}

/** Cast concrete: soft mottling, a few pores and a formwork seam along one edge. Tiles. Null without a DOM. */
export function concreteTexture(base: string, seed = 11): CanvasTexture | null {
  const made = canvasOf(256, 256);
  if (!made) return null;
  const { canvas, ctx } = made;
  const rng = makeRng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = rng() * 256;
    const y = rng() * 256;
    const r = 14 + rng() * 40;
    const blot = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rng() > 0.5 ? '255, 255, 255' : '40, 36, 30';
    blot.addColorStop(0, `rgba(${tone}, 0.07)`);
    blot.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = blot;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
  }
  ctx.fillStyle = 'rgba(40, 36, 30, 0.35)';
  for (let i = 0; i < 160; i++) ctx.fillRect(rng() * 256, rng() * 256, 1.5, 1.5);
  ctx.fillStyle = 'rgba(40, 36, 30, 0.22)';
  ctx.fillRect(0, 0, 256, 3);
  ctx.fillRect(0, 0, 3, 256);
  return finish(canvas, true);
}

/** Timber grain running along v, for sleepers and hoardings. Tiles. Null without a DOM. */
export function timberTexture(base: string, grain: string, seed = 5): CanvasTexture | null {
  const made = canvasOf(128, 128);
  if (!made) return null;
  const { canvas, ctx } = made;
  const rng = makeRng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = grain;
  for (let i = 0; i < 46; i++) {
    ctx.globalAlpha = 0.12 + rng() * 0.3;
    ctx.lineWidth = 0.6 + rng() * 1.6;
    const y = rng() * 128;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(40, y + (rng() - 0.5) * 5, 88, y + (rng() - 0.5) * 5, 128, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(canvas, true);
}

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number) => void;

/** The eight murals: original abstract street art in the game's sunny palette. Each fills a w × h cell. */
const MURALS: readonly Painter[] = [
  // Diagonal ribbons.
  (ctx, w, h) => {
    const colours = ['#17b3a3', '#fff4dd', '#ff7a1f', '#ffbf2a', '#1d7fd1'];
    ctx.fillStyle = colours[0];
    ctx.fillRect(0, 0, w, h);
    const band = w / 7;
    for (let i = -3; i < 12; i++) {
      ctx.fillStyle = colours[((i % colours.length) + colours.length) % colours.length];
      ctx.beginPath();
      ctx.moveTo(i * band, h);
      ctx.lineTo(i * band + band, h);
      ctx.lineTo(i * band + band + h * 0.9, 0);
      ctx.lineTo(i * band + h * 0.9, 0);
      ctx.fill();
    }
  },
  // Rolling sea.
  (ctx, w, h) => {
    ctx.fillStyle = '#ffe9b8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff8a3c';
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.42, h * 0.26, 0, Math.PI * 2);
    ctx.fill();
    const tones = ['#7fd4e8', '#3db3dc', '#1d8fcf', '#1668ae'];
    tones.forEach((tone, i) => {
      const y = h * (0.42 + i * 0.15);
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, y);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin(x / w * Math.PI * 6 + i * 1.7) * h * 0.06);
      ctx.lineTo(w, h);
      ctx.fill();
    });
  },
  // Big dots.
  (ctx, w, h, rng) => {
    ctx.fillStyle = '#2a6fd6';
    ctx.fillRect(0, 0, w, h);
    const colours = ['#ffbf2a', '#fff4dd', '#ff5d73', '#3ed6c2'];
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = colours[i % colours.length];
      ctx.beginPath();
      ctx.arc(rng() * w, rng() * h, h * (0.08 + rng() * 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // Sunburst.
  (ctx, w, h) => {
    ctx.fillStyle = '#ffd35c';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 1.05;
    for (let i = 0; i < 18; i++) {
      const a0 = Math.PI + (i / 18) * Math.PI;
      const a1 = Math.PI + ((i + 0.5) / 18) * Math.PI;
      ctx.fillStyle = i % 2 ? '#ff8a3c' : '#ff5d4a';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w);
      ctx.lineTo(cx + Math.cos(a1) * w, cy + Math.sin(a1) * w);
      ctx.fill();
    }
    ctx.fillStyle = '#fff4dd';
    ctx.beginPath();
    ctx.arc(cx, cy, h * 0.42, 0, Math.PI * 2);
    ctx.fill();
  },
  // Zigzags.
  (ctx, w, h) => {
    const colours = ['#ff5d73', '#fff4dd', '#17b3a3', '#ffbf2a', '#1d2b53'];
    ctx.fillStyle = colours[4];
    ctx.fillRect(0, 0, w, h);
    const step = w / 10;
    colours.slice(0, 4).forEach((colour, row) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = h * 0.11;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      for (let i = -1; i <= 11; i++) {
        const y = h * (0.16 + row * 0.23) + (i % 2 ? -h * 0.09 : h * 0.09);
        if (i === -1) ctx.moveTo(i * step, y); else ctx.lineTo(i * step, y);
      }
      ctx.stroke();
    });
  },
  // Paper shapes.
  (ctx, w, h, rng) => {
    ctx.fillStyle = '#fff4dd';
    ctx.fillRect(0, 0, w, h);
    const colours = ['#17b3a3', '#ff7a1f', '#1d2b53', '#ffbf2a', '#ff5d73'];
    for (let i = 0; i < 13; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const s = h * (0.12 + rng() * 0.2);
      ctx.fillStyle = colours[i % colours.length];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI);
      const kind = i % 3;
      ctx.beginPath();
      if (kind === 0) ctx.arc(0, 0, s * 0.7, 0, Math.PI);
      else if (kind === 1) { ctx.moveTo(-s, s * 0.6); ctx.lineTo(0, -s * 0.8); ctx.lineTo(s, s * 0.6); }
      else ctx.rect(-s * 0.9, -s * 0.22, s * 1.8, s * 0.44);
      ctx.fill();
      ctx.restore();
    }
  },
  // Hills at dusk.
  (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#ff9d5c');
    sky.addColorStop(1, '#ffd98a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const tones = ['#3ed6a0', '#22b38a', '#158f76'];
    tones.forEach((tone, i) => {
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        ctx.lineTo(x, h * (0.55 + i * 0.14) - Math.abs(Math.sin(x / w * Math.PI * (2.2 + i) + i * 2)) * h * 0.22);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    });
  },
  // Checker and stripe.
  (ctx, w, h) => {
    ctx.fillStyle = '#17b3a3';
    ctx.fillRect(0, 0, w, h);
    const s = h / 4;
    ctx.fillStyle = '#fff4dd';
    for (let row = 0; row < 4; row++) for (let col = 0; col < Math.ceil(w / s); col++) {
      if ((row + col) % 2 === 0) ctx.fillRect(col * s, row * s, s, s);
    }
    ctx.fillStyle = '#ff7a1f';
    ctx.fillRect(0, h * 0.4, w, h * 0.2);
    ctx.fillStyle = '#1d2b53';
    ctx.fillRect(0, h * 0.38, w, h * 0.025);
    ctx.fillRect(0, h * 0.595, w, h * 0.025);
  },
];

/** Every mural side by side in one atlas, weathered a little so the paint sits on a wall. Null without a DOM. */
export function muralAtlas(): CanvasTexture | null {
  const cellW = 512;
  const cellH = 192;
  const made = canvasOf(cellW * MURAL_CELLS, cellH);
  if (!made) return null;
  const { canvas, ctx } = made;
  const rng = makeRng(42);
  MURALS.forEach((paint, i) => {
    ctx.save();
    ctx.translate(i * cellW, 0);
    ctx.beginPath();
    ctx.rect(0, 0, cellW, cellH);
    ctx.clip();
    paint(ctx, cellW, cellH, rng);
    ctx.restore();
  });
  // Weathering: sun-bleached top, grime rising from the ballast, faint speckle.
  const wear = ctx.createLinearGradient(0, 0, 0, cellH);
  wear.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  wear.addColorStop(0.25, 'rgba(255, 255, 255, 0)');
  wear.addColorStop(0.72, 'rgba(60, 46, 36, 0)');
  wear.addColorStop(1, 'rgba(60, 46, 36, 0.42)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, canvas.width, cellH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  for (let i = 0; i < 2600; i++) ctx.fillRect(rng() * canvas.width, rng() * cellH, 2, 2);
  return finish(canvas, false);
}

/** A wall-run surface: bright boards with forward chevrons along the running band. Tiles along u. Null without a DOM. */
export function wallRunTexture(): CanvasTexture | null {
  const made = canvasOf(256, 256);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  // Board joints.
  ctx.fillStyle = 'rgba(30, 30, 50, 0.16)';
  for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 3, 256);
  // Dark footing and cap (v = 0 is the bottom of the canvas for a flipped texture: draw both ends alike).
  ctx.fillStyle = 'rgba(30, 30, 50, 0.3)';
  ctx.fillRect(0, 0, 256, 14);
  ctx.fillRect(0, 242, 256, 14);
  // Two rows of chevrons in the middle, where the feet run.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.0)';
  ctx.fillStyle = 'rgba(30, 30, 50, 0.22)';
  for (const y of [128]) {
    for (let x = 0; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 10, y - 44);
      ctx.lineTo(x + 30, y - 44);
      ctx.lineTo(x + 54, y);
      ctx.lineTo(x + 30, y + 44);
      ctx.lineTo(x + 10, y + 44);
      ctx.lineTo(x + 34, y);
      ctx.fill();
    }
  }
  return finish(canvas, true);
}

const VERTEX_HEAD = '#include <common>\nuniform float uTrackD;';

function trackPosition(): string {
  return `
    vec4 trackPos = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      trackPos = instanceMatrix * trackPos;
    #endif
    trackPos = modelMatrix * trackPos;`;
}

/**
 * Lays the material's map out in track space instead of by the mesh's UVs: 'top' projects it down onto the ground
 * (x across, distance along), 'side' onto a wall (distance along, height up), one repeat every `tile` m. Scaled
 * instances therefore never stretch it, and it scrolls with the track. `tile` must divide TRACK_PERIOD.
 */
export function projectOnTrack<T extends Material>(material: T, tile: number, plane: 'top' | 'side'): T {
  const uv = plane === 'top' ? 'vec2(trackPos.x, uTrackD - trackPos.z)' : 'vec2(trackPos.z - uTrackD, trackPos.y)';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTrackD = trackScroll;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_HEAD)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
    #ifdef USE_MAP
    ${trackPosition()}
      vMapUv = ${uv} / ${tile.toFixed(4)};
    #endif`);
  };
  material.customProgramCacheKey = () => `track-${plane}-${tile}`;
  return material;
}

/**
 * For the yard wall's instanced panels (one box per MURAL_PANEL m): picks each panel's mural from the atlas by
 * where the panel stands on the track, so a wall keeps its paintings as it streams past. No per-instance data.
 */
export function muralMaterial<T extends Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTrackD = trackScroll;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_HEAD)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
    #if defined( USE_MAP ) && defined( USE_INSTANCING )
      float panel = mod(floor((uTrackD - instanceMatrix[3].z) / ${MURAL_PANEL.toFixed(1)}), ${(TRACK_PERIOD / MURAL_PANEL).toFixed(1)});
      float flank = instanceMatrix[3].x > 0.0 ? 3.0 : 0.0;
      float cell = mod(panel * 5.0 + floor(panel * 0.37) * 3.0 + flank, ${MURAL_CELLS.toFixed(1)});
      vMapUv = vec2((cell + 0.015 + uv.x * 0.97) / ${MURAL_CELLS.toFixed(1)}, uv.y);
    #endif`);
  };
  material.customProgramCacheKey = () => 'track-mural';
  return material;
}

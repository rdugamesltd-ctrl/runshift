import { DataTexture, NearestFilter, NoColorSpace, RedFormat, UnsignedByteType } from 'three';

/**
 * The light ramp a MeshToonMaterial steps through, one texel per step: makeRamp(TOON.ramp). Nearest filtering
 * keeps the steps hard. TODO WP-23: verify on the toon sheet.
 */
export function makeRamp(steps: readonly number[]): DataTexture {
  const data = new Uint8Array(steps.length);
  steps.forEach((step, i) => {
    data[i] = Math.round(Math.min(1, Math.max(0, step)) * 255);
  });
  const texture = new DataTexture(data, steps.length, 1, RedFormat, UnsignedByteType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

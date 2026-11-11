/**
 * URL of a file under public/assets, relative to the page, so the build also works in a portal's subfolder.
 * TODO WP-22: GLTFLoader with MeshoptDecoder, Float32 widening of quantised attributes.
 */
export function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/${file}`;
}

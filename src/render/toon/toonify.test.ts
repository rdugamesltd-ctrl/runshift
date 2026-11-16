import { expect, it } from 'vitest';
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, MeshToonMaterial, Texture } from 'three';
import { toonify } from './toonify';

it('keeps textures, alpha and shared source materials after toon conversion', () => {
  const map = new Texture();
  const alphaMap = new Texture();
  const ramp = new Texture();
  const source = new MeshStandardMaterial({
    color: new Color('#17b3a3'), map, alphaMap, emissive: new Color('#ff7a1f'),
    transparent: true, opacity: 0.6, alphaTest: 0.25, vertexColors: true,
  });
  const root = new Group();
  const first = new Mesh(new BoxGeometry(), source);
  const second = new Mesh(new BoxGeometry(), source);
  root.add(first, second);
  toonify(root, ramp);
  const toon = first.material as unknown as MeshToonMaterial;
  expect(second.material).toBe(toon);
  expect(toon.gradientMap).toBe(ramp);
  expect(toon.map).toBe(map);
  expect(toon.alphaMap).toBe(alphaMap);
  expect(toon.color.getHexString()).toBe('17b3a3');
  expect(toon.emissive.getHexString()).toBe('ff7a1f');
  expect(toon.transparent).toBe(true);
  expect(toon.opacity).toBe(0.6);
  expect(toon.alphaTest).toBe(0.25);
  expect(toon.vertexColors).toBe(true);
  expect(toon.userData.shared).toBe(true);
});

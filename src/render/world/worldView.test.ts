import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { expect, it } from 'vitest';
import type { ChunkStreamer, RunState } from '../../game/types';
import { createEmptyRegistry } from '../assets/registry';
import { buildingForLot, WorldView } from './worldView';

it('limits the heavy facades in every visible run of lots', () => {
  for (let start = -20; start <= 120; start++) {
    let heavy = 0;
    for (let lot = start; lot < start + 14; lot++) {
      for (const side of [-1, 1]) if (['building-a', 'building-b', 'building-c'].includes(buildingForLot(lot, side))) heavy++;
    }
    expect(heavy).toBe(2);
  }
});

it('keeps the same building in a lot when the streaming anchor advances', () => {
  const scene = new Scene();
  const template = new Group();
  template.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
  const assets = { ...createEmptyRegistry(), extras: (name: string) => name === 'building-a' ? { template } : {} };
  const view = new WorldView({ scene, camera: new PerspectiveCamera(), assets, motion: { reduced: false } });
  const building = scene.getObjectByName('city-building-a') as InstancedMesh;
  const street = scene.getObjectByName('city-infrastructure')!;
  const runAt = (d: number) => ({ d, prev: { d } }) as unknown as RunState;
  const positionOfLotZero = (d: number) => {
    view.update(runAt(d), {} as ChunkStreamer, 1, 0);
    const matrix = new Matrix4();
    for (let i = 0; i < building.count; i++) {
      building.getMatrixAt(i, matrix);
      const worldZ = matrix.elements[14] + street.position.z;
      if (Math.abs(matrix.elements[12] - 18) < 0.01 && Math.abs(worldZ - 26) < 1) return worldZ;
    }
    throw new Error('Building in lot zero disappeared');
  };
  const before = positionOfLotZero(19.9);
  const after = positionOfLotZero(20.1);
  expect(after - before).toBeCloseTo(0.2, 5);
  view.dispose();
});

it('uses models for both street rows when the building kit is complete', () => {
  const scene = new Scene();
  const template = new Group();
  template.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
  const names = new Set(['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g']);
  const assets = { ...createEmptyRegistry(), extras: (name: string) => names.has(name) ? { template } : {} };
  const view = new WorldView({ scene, camera: new PerspectiveCamera(), assets, motion: { reduced: false } });
  view.update({ d: 0, prev: { d: 0 } } as unknown as RunState, {} as ChunkStreamer, 1, 0);
  for (const name of ['city-buildings', 'city-roofs', 'city-windows']) {
    expect((scene.getObjectByName(name) as InstancedMesh).count, name).toBe(0);
  }
  let modelCount = 0;
  scene.traverse((object) => {
    if (object instanceof InstancedMesh && object.name.startsWith('city-building-')) modelCount += object.count;
  });
  expect(modelCount).toBeGreaterThan(40);
  view.dispose();
});

it('uses scenery models instead of block trees and lamps when available', () => {
  const scene = new Scene();
  const template = new Group();
  template.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
  const assets = { ...createEmptyRegistry(), extras: (name: string) => ['street-tree', 'street-lamp'].includes(name) ? { template } : {} };
  const view = new WorldView({ scene, camera: new PerspectiveCamera(), assets, motion: { reduced: false } });
  view.update({ d: 0, prev: { d: 0 } } as unknown as RunState, {} as ChunkStreamer, 1, 0);
  expect((scene.getObjectByName('city-street-tree') as InstancedMesh).count).toBeGreaterThan(0);
  expect((scene.getObjectByName('city-street-lamp') as InstancedMesh).count).toBeGreaterThan(0);
  for (const name of ['street-trees', 'street-lamp-posts', 'street-lamp-heads']) {
    expect((scene.getObjectByName(name) as InstancedMesh).count, name).toBe(0);
  }
  view.dispose();
});

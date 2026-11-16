import { describe, expect, it } from 'vitest';
import type { ObstacleKind } from '../../game/types';
import { obstacleGeometry, trainRampGeometry } from './obstacleModels';

const kinds: ObstacleKind[] = ['barrierLow', 'barrierHigh', 'blocker', 'car', 'metroCar', 'roofUnit', 'wallSignHigh', 'wallVentLow', 'wallPipeFull'];

describe('obstacle models', () => {
  it('keeps every visible model inside its collision box', () => {
    for (const kind of kinds) {
      const geometry = obstacleGeometry(kind);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      for (const value of [bounds.min.x, bounds.min.y, bounds.min.z]) expect(value, kind).toBeGreaterThanOrEqual(-0.51);
      for (const value of [bounds.max.x, bounds.max.y, bounds.max.z]) expect(value, kind).toBeLessThanOrEqual(0.51);
      expect(geometry.getIndex()?.count ?? 0, kind).toBeGreaterThan(0);
      geometry.dispose();
    }
  });
});

it('gives the train ramp a rising top within its collision bounds', () => {
  const geometry = trainRampGeometry();
  geometry.computeBoundingBox();
  expect(geometry.boundingBox?.min.y).toBe(-0.5);
  expect(geometry.boundingBox?.max.y).toBe(0.5);
  expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
  geometry.dispose();
});

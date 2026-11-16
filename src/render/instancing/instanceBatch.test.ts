import { BoxGeometry, Color, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstanceBatch } from './instanceBatch';

function makeBatch(capacity: number, colours = false): InstanceBatch {
  return new InstanceBatch(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), capacity, 'test', { colours });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstanceBatch', () => {
  it('draws exactly the copies pushed since begin()', () => {
    const batch = makeBatch(8);
    expect(batch.mesh.count).toBe(0);
    batch.begin();
    for (let i = 0; i < 5; i++) expect(batch.push(i, 0, -i)).toBe(true);
    batch.end();
    expect(batch.count).toBe(5);
    expect(batch.mesh.count).toBe(5);
    batch.begin();
    batch.push(1, 2, 3);
    batch.end();
    expect(batch.mesh.count).toBe(1);
    batch.begin();
    batch.end();
    expect(batch.mesh.count).toBe(0);
  });

  it('is never frustum-culled and uses dynamic buffers', () => {
    const batch = makeBatch(4, true);
    expect(batch.mesh.frustumCulled).toBe(false);
    expect(batch.mesh.instanceMatrix.usage).toBe(batch.mesh.instanceColor?.usage);
  });

  it('drops copies past capacity and warns only once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const batch = makeBatch(3);
    batch.begin();
    const pushed = [0, 1, 2, 3, 4, 5].map((i) => batch.push(i, 0, 0));
    batch.end();
    expect(pushed).toEqual([true, true, true, false, false, false]);
    expect(batch.mesh.count).toBe(3);
    batch.begin();
    for (let i = 0; i < 10; i++) batch.push(0, 0, 0);
    expect(batch.pushMatrix(new Matrix4())).toBe(false);
    batch.end();
    expect(batch.mesh.count).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('writes the same matrix as compose(position, rotation about y, scale)', () => {
    const batch = makeBatch(2);
    batch.begin();
    batch.push(1.5, -2, 7, 0.7, 2, 3, 4);
    batch.end();
    const expected = new Matrix4().compose(
      new Vector3(1.5, -2, 7),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7),
      new Vector3(2, 3, 4),
    );
    const actual = new Matrix4();
    batch.mesh.getMatrixAt(0, actual);
    for (let i = 0; i < 16; i++) expect(actual.elements[i]).toBeCloseTo(expected.elements[i], 5);
  });

  it('accepts whole matrices too, compacted after the other copies', () => {
    const batch = makeBatch(4);
    const m = new Matrix4().makeTranslation(3, 4, 5);
    batch.begin();
    batch.push(0, 0, 0);
    batch.pushMatrix(m);
    batch.end();
    const actual = new Matrix4();
    batch.mesh.getMatrixAt(1, actual);
    expect(actual.elements).toEqual(m.elements);
    expect(batch.mesh.count).toBe(2);
  });

  it('colours the copy pushed last and uploads only the used part', () => {
    const batch = makeBatch(4, true);
    batch.begin();
    batch.push(0, 0, 0);
    batch.color(new Color(1, 0, 0));
    batch.push(1, 0, 0);
    batch.color(new Color(0, 0, 1));
    batch.end();
    const colour = new Color();
    batch.mesh.getColorAt(0, colour);
    expect(colour.toArray()).toEqual([1, 0, 0]);
    batch.mesh.getColorAt(1, colour);
    expect(colour.toArray()).toEqual([0, 0, 1]);
    expect(batch.mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 32 }]);
    expect(batch.mesh.instanceColor?.updateRanges).toEqual([{ start: 0, count: 6 }]);
  });
});

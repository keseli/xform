import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameLines, guideSegments, snapRect, snapValue, axisTargets } from '../src/editor/snapping.js';

const lines = frameLines();
const other = { x: 100, y: 40, w: 80, h: 30 };

test('snapRect: sol kenar diğer bloğun sol kenarına', () => {
  const m = snapRect({ x: 101.4, y: 150, w: 60, h: 20 }, [other], lines, 2);
  assert.equal(m.x, 100);
  assert.ok(Math.abs(m.dx + 1.4) < 1e-9);
  assert.equal(m.y, null);
});

test('snapRect: merkezler ve frame çizgileri', () => {
  // genişlik 40 → merkez x+20; diğerinin merkezi 140
  assert.equal(snapRect({ x: 121, y: 120, w: 40, h: 20 }, [other], lines, 2).x, 140);
  // sağ sayfa iç kenar boşluğu: 192 + 12 = 204
  assert.equal(snapRect({ x: 205, y: 300, w: 40, h: 20 }, [], lines, 2).x, 204);
  // üst kenar boşluğu 20
  assert.equal(snapRect({ x: 50, y: 21, w: 40, h: 20 }, [], lines, 2).y, 20);
});

test('snapRect: eşik dışında yakalamaz', () => {
  const m = snapRect({ x: 104, y: 120, w: 60, h: 21 }, [other], lines, 2);
  assert.deepEqual([m.x, m.dx], [null, 0]);
});

test('snapValue: resize kenarı', () => {
  const t = axisTargets([other], lines, 'x');
  assert.deepEqual(snapValue(179, t, 2), { shift: 1, line: 180 });
});

test('guideSegments: hizalanan blokları kapsar; frame çizgisi tam boy', () => {
  const rect = { x: 100, y: 120, w: 60, h: 20 };
  assert.deepEqual(guideSegments(rect, [other], lines, { x: 100, y: null }), [{ axis: 'x', at: 100, from: 40, to: 140 }]);
  const onMargin = { x: 14, y: 50, w: 40, h: 20 };
  assert.deepEqual(guideSegments(onMargin, [], lines, { x: 14, y: null }), [{ axis: 'x', at: 14, from: 0, to: 256 }]);
});

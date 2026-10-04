import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverFit, imageRect, isCropped, panFocal } from '../src/editor/focal.js';

// 2:1 görsel, kare kutu: yatayda taşar.
const natural = { width: 2000, height: 1000 };
const box = { width: 200, height: 200 };

test('coverFit: kutuyu doldurur, tek eksende taşar', () => {
  assert.deepEqual(coverFit(box, natural), { width: 400, height: 200, overflowX: 200, overflowY: 0 });
});

test('imageRect: object-position ile aynı kayma', () => {
  assert.deepEqual(imageRect({ x: 0, y: 0.5 }, box, natural), { x: -0, y: -0, width: 400, height: 200 });
  assert.equal(imageRect({ x: 0.5, y: 0.5 }, box, natural).x, -100);
  assert.equal(imageRect({ x: 1, y: 0.5 }, box, natural).x, -200);
});

test('panFocal: görsel sola kayınca sağ taraf görünür', () => {
  assert.deepEqual(panFocal({ x: 0.5, y: 0.5 }, { x: -50, y: 0 }, box, natural), { x: 0.75, y: 0.5 });
  assert.deepEqual(panFocal({ x: 0.5, y: 0.5 }, { x: 50, y: 0 }, box, natural), { x: 0.25, y: 0.5 });
});

test('panFocal: sınırda durur, taşmayan eksen değişmez', () => {
  assert.deepEqual(panFocal({ x: 0.5, y: 0.3 }, { x: -1000, y: 400 }, box, natural), { x: 1, y: 0.3 });
  assert.deepEqual(panFocal({ x: 0.5, y: 0.3 }, { x: 1000, y: -400 }, box, natural), { x: 0, y: 0.3 });
});

test('panFocal: dikey taşmada y değişir', () => {
  const tall = { width: 1000, height: 3000 };
  assert.deepEqual(panFocal({ x: 0.5, y: 0.5 }, { x: 30, y: -100 }, box, tall), { x: 0.5, y: 0.75 });
});

test('isCropped: aynı oranda kırpma yok', () => {
  assert.ok(isCropped(box, natural));
  assert.ok(!isCropped({ width: 400, height: 200 }, natural));
});

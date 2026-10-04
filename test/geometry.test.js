import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveBox, resizeBox, snap, normalizeZ, heightForRatio } from '../src/editor/geometry.js';

test('snap: mutlak ızgaraya yuvarlar', () => {
  assert.equal(snap(101, 2), 102);
  assert.equal(snap(100.9, 2), 100);
  assert.equal(snap(101, 1), 101);
});

test('moveBox: adım 2 ve 1', () => {
  assert.deepEqual(moveBox({ x: 101, y: 34 }, { x: 3.2, y: -1.4 }, 2), { x: 104, y: 32 });
  assert.deepEqual(moveBox({ x: 101, y: 34 }, { x: 3.2, y: -1.4 }, 1), { x: 104, y: 33 });
});

test('resizeBox: metin yalnızca genişlik değiştirir', () => {
  const start = { x: 10, y: 10, w: 40, h: 20 };
  assert.deepEqual(resizeBox(start, { x: 1, y: 1 }, { x: 6, y: 30 }, { step: 2, widthOnly: true }), {
    x: 10, y: 10, w: 46, h: 20,
  });
  assert.deepEqual(resizeBox(start, { x: -1, y: 0 }, { x: 4, y: 0 }, { step: 2, widthOnly: true }), {
    x: 14, y: 10, w: 36, h: 20,
  });
});

test('resizeBox: en küçük boyutun altına inmez, karşı kenar sabit kalır', () => {
  const start = { x: 10, y: 10, w: 8, h: 8 };
  assert.deepEqual(resizeBox(start, { x: -1, y: -1 }, { x: 50, y: 50 }, { step: 2 }), {
    x: 16, y: 16, w: 2, h: 2,
  });
});

test('resizeBox: oran kilidi köşede oranı korur, karşı köşe sabit', () => {
  const start = { x: 0, y: 0, w: 80, h: 40 };
  const r = resizeBox(start, { x: -1, y: -1 }, { x: -20, y: -2 }, { step: 2, lock: true });
  assert.equal(r.w, 100);
  assert.equal(r.h, 50);
  assert.equal(r.x + r.w, 80);
  assert.equal(r.y + r.h, 40);
});

test('resizeBox: oran kilidi kenar tutamacında diğer boyutu türetir', () => {
  const start = { x: 0, y: 0, w: 80, h: 40 };
  assert.deepEqual(resizeBox(start, { x: 0, y: 1 }, { x: 0, y: 10 }, { step: 2, lock: true }), {
    x: 0, y: 0, w: 100, h: 50,
  });
});

test('resizeBox: kilit kapalıyken serbest', () => {
  const start = { x: 0, y: 0, w: 80, h: 40 };
  assert.deepEqual(resizeBox(start, { x: 1, y: 1 }, { x: 10, y: -10 }, { step: 2 }), {
    x: 0, y: 0, w: 90, h: 30,
  });
});

test('heightForRatio ve normalizeZ', () => {
  assert.equal(heightForRatio(80, 2), 40);
  const blocks = [{ z: 7 }, { z: -2 }, { z: 3 }];
  normalizeZ(blocks);
  assert.deepEqual(blocks.map((b) => b.z), [3, 1, 2]);
});

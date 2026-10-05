import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWarnings } from '../src/editor/warnings.js';

const spreads = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const block = (id, order, spread_id, extra = {}) => ({
  id, order, spread_id, x: 10, y: 10, w: 10, h: 10, z: 1, relates_to: [], ...extra,
});
const kinds = (w, id) => (w.get(id) ?? []).map((x) => x.kind);

test('sıra: büyük order önceki spread\'de ise uyarır', () => {
  const data = { spreads, blocks: [block('p1', 1, 'b'), block('p2', 2, 'a'), block('p3', 3, 'b')] };
  const w = computeWarnings(data);
  assert.deepEqual(kinds(w, 'p2'), ['order']);
  assert.equal(w.get('p2')[0].ref, 'p1');
  assert.deepEqual(kinds(w, 'p1'), []);
  assert.deepEqual(kinds(w, 'p3'), []);
});

test('sıra: aynı spread içinde konum sırası uyarı vermez, tepsidekiler sayılmaz', () => {
  const data = {
    spreads,
    blocks: [block('p2', 2, 'a', { y: 0 }), block('p1', 1, 'a', { y: 100 }), block('p0', 0, null)],
  };
  assert.equal(computeWarnings(data).size, 0);
});

test('ilişki: görsel, ilişkili paragraflarının hiçbirinin olmadığı spread\'de', () => {
  const data = {
    spreads,
    blocks: [
      block('p1', 1, 'a'),
      block('p2', 2, 'b'),
      block('img', 3, 'c', { type: 'image', relates_to: ['p1', 'p2'] }),
      block('img2', 4, 'c', { type: 'image', relates_to: ['p9'] }),
      block('ok', 5, 'b', { type: 'image', relates_to: ['p1', 'p2'] }),
    ],
  };
  const w = computeWarnings(data);
  const relation = (id) => kinds(w, id).includes('relation');
  assert.ok(relation('img'));
  assert.ok(relation('img2'));
  assert.ok(!relation('ok'));
});

test('ilişki: ilişkili paragraf tepsideyse de uyarır', () => {
  const data = {
    spreads,
    blocks: [block('p1', 1, null), block('img', 2, 'a', { relates_to: ['p1'] })],
  };
  assert.deepEqual(kinds(computeWarnings(data), 'img'), ['relation']);
});

test('taşma: frame dışına çıkan blok', () => {
  const data = {
    spreads,
    blocks: [
      block('in', 1, 'a', { x: 0, y: 0, w: 384, h: 256 }),
      block('left', 2, 'a', { x: -2 }),
      block('bottom', 3, 'a', { y: 250, h: 8 }),
    ],
  };
  const w = computeWarnings(data);
  assert.deepEqual(kinds(w, 'in'), []);
  assert.deepEqual(kinds(w, 'left'), ['overflow']);
  assert.deepEqual(kinds(w, 'bottom'), ['overflow']);
});

test('içerikte yok: içe aktarmanın koruduğu yerleşik blok', () => {
  const data = {
    spreads,
    blocks: [block('a', 1, 'a', { removed_from_content: true }), block('b', 2, null, { removed_from_content: true })],
  };
  const w = computeWarnings(data);
  assert.deepEqual(kinds(w, 'a'), ['removed']);
  assert.deepEqual(kinds(w, 'b'), []);
});

test('taşma: yığındaki blok için konum yığından hesaplanır', () => {
  const data = {
    spreads,
    stacks: [{ id: 'st', spread_id: 'a', direction: 'vertical', x: 10, y: 240, gap: 2 }],
    blocks: [
      // dosya biçimi: x/y null; ikinci blok yığından dolayı 240+10+2 = 252'de başlar, 256'yı aşar
      block('s1', 1, 'a', { x: null, y: null, w: 40, h: 10, stack_id: 'st', stack_index: 0 }),
      block('s2', 2, 'a', { x: null, y: null, w: 40, h: 10, stack_id: 'st', stack_index: 1 }),
    ],
  };
  const w = computeWarnings(data);
  assert.deepEqual(kinds(w, 's1'), []);
  assert.deepEqual(kinds(w, 's2'), ['overflow']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  childrenOf, createStack, insertIntoStack, insertionIndex, insertionMarker, layoutStacks,
  moveInStack, removeFromStack, removeStack, stackBounds,
} from '../src/stacks.js';

const blk = (id, order, x, y, w, h) => ({ id, order, spread_id: 's', x, y, w, h, z: 1 });
const column = () => ({
  spreads: [{ id: 's' }],
  blocks: [
    blk('a', 1, 101, 34, 79, 45),
    blk('b', 2, 102, 84, 79, 40),
    blk('c', 3, 100, 130, 79, 30),
    blk('t', 4, 10, 10, 40, 10),
    { id: 'u', order: 5, spread_id: null, x: null, y: null, w: null, h: null, z: null },
  ],
});
const ids = (data, sid) => childrenOf(data, sid).map((b) => b.id);
const pos = (data, id) => {
  const b = data.blocks.find((x) => x.id === id);
  return [b.x, b.y];
};

test('createStack: dikey sütun, sıra konumdan, ortalama boşluk, başa hizalama', () => {
  const data = column();
  const s = createStack(data, ['c', 'a', 'b']);
  assert.deepEqual([s.direction, s.x, s.y, s.gap], ['vertical', 100, 34, 6]); // (5 + 6) / 2 → 6
  assert.deepEqual(ids(data, s.id), ['a', 'b', 'c']);
  assert.deepEqual([pos(data, 'a'), pos(data, 'b'), pos(data, 'c')], [[100, 34], [100, 85], [100, 131]]);
  assert.deepEqual(stackBounds(data, s), { x: 100, y: 34, w: 79, h: 127 });
});

test('createStack: yan yana bloklar yatay yığın olur', () => {
  const data = { spreads: [], blocks: [blk('l', 1, 10, 20, 30, 40), blk('r', 2, 50, 22, 30, 20)] };
  const s = createStack(data, ['r', 'l']);
  assert.deepEqual([s.direction, s.gap], ['horizontal', 10]);
  assert.deepEqual([pos(data, 'l'), pos(data, 'r')], [[10, 20], [50, 20]]);
});

test('createStack: tepsideki, başka yığındaki ya da farklı spreaddeki bloklar', () => {
  const data = column();
  assert.equal(createStack(data, ['u']), null);
  data.blocks[3].spread_id = 'other';
  assert.equal(createStack(data, ['a', 't']), null);
  const s = createStack(data, ['a', 'b']);
  assert.equal(createStack(data, ['a']), null); // a artık yığında
  assert.ok(s);
});

test('layoutStacks: yükseklik değişince alttakiler kayar', () => {
  const data = column();
  const s = createStack(data, ['a', 'b', 'c']);
  data.blocks.find((b) => b.id === 'a').h = 60;
  layoutStacks(data);
  assert.deepEqual([pos(data, 'b'), pos(data, 'c')], [[100, 100], [100, 146]]);
  s.gap = 0;
  layoutStacks(data);
  assert.deepEqual(pos(data, 'c'), [100, 134]);
});

test('sıra değiştirme, ekleme, çıkarma', () => {
  const data = column();
  const s = createStack(data, ['a', 'b', 'c']);
  moveInStack(data, 'c', 0);
  assert.deepEqual(ids(data, s.id), ['c', 'a', 'b']);
  insertIntoStack(data, 't', s.id, 2);
  assert.deepEqual(ids(data, s.id), ['c', 'a', 't', 'b']);
  assert.equal(pos(data, 't')[0], 100);
  removeFromStack(data, 'a');
  assert.deepEqual(ids(data, s.id), ['c', 't', 'b']);
  assert.equal(data.blocks.find((b) => b.id === 'a').stack_id, undefined);
  assert.deepEqual(childrenOf(data, s.id).map((b) => b.stack_index), [0, 1, 2]);
});

test('son çocuk çıkınca yığın silinir; removeStack çocukları serbest bırakır', () => {
  const data = column();
  const s = createStack(data, ['a']);
  removeFromStack(data, 'a');
  assert.equal(data.stacks.length, 0);
  const s2 = createStack(data, ['a', 'b']);
  removeStack(data, s2.id);
  assert.equal(data.stacks.length, 0);
  assert.ok(data.blocks.every((b) => b.stack_id === undefined));
  assert.ok(s);
});

test('insertionIndex ve marker: orta noktalara göre', () => {
  const data = column();
  const s = createStack(data, ['a', 'b', 'c']); // a 34–79, b 85–125, c 131–161
  assert.equal(insertionIndex(data, s.id, { x: 120, y: 40 }, null), 0);
  assert.equal(insertionIndex(data, s.id, { x: 120, y: 60 }, null), 1);
  assert.equal(insertionIndex(data, s.id, { x: 120, y: 200 }, null), 3);
  assert.equal(insertionIndex(data, s.id, { x: 120, y: 200 }, 'c'), 2);
  assert.deepEqual(insertionMarker(data, s.id, 1, null), { x: 100, y: 82, w: 79, h: 0 });
});

test('stackPositions ve toFileForm: konum yalnız yığından', async () => {
  const { stackPositions, toFileForm } = await import('../src/stacks.js');
  const data = column();
  const s = createStack(data, ['a', 'b']);
  const file = toFileForm(data);
  const a = file.blocks.find((b) => b.id === 'a');
  assert.deepEqual([a.x, a.y, a.w, a.h, a.stack_id], [null, null, 79, 45, s.id]);
  assert.equal(data.blocks.find((b) => b.id === 'a').x, 101); // bellekteki veri değişmez
  assert.deepEqual(stackPositions(file).get('b'), { y: 84, x: 101 });
  layoutStacks(file);
  assert.deepEqual(pos(file, 'b'), [101, 84]);
});

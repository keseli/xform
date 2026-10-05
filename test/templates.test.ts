import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/model.ts';
import { childrenOf, createStack, insertIntoStack, layoutStacks, removeFromStack, stackBounds } from '../src/stacks.ts';
import {
  fillSlot, instantiateTemplate, removeSpreadSkeleton, slotAccepts, slotAt, templateFromSpread, templateKey,
  validateTemplate,
} from '../src/templates.ts';

const slot = (id, accepts, x, y, w, h, extra = {}) => ({ id, spread_id: 's', x, y, w, h, z: 3, tone: 'dark', accepts, ...extra });
const free = (id, type, variant, extra = {}) => ({
  id, type, variant, order: 1, relates_to: [], content: 'x', tone: 'dark',
  spread_id: null, x: null, y: null, w: null, h: null, z: null, ...extra,
});
const issue = () => ({
  issue: { title: 'X', month: 1, year: 2026, number: '001', first_page: 2 },
  spreads: [{ id: 's', section: '', chrome_left: 'full', chrome_right: 'none' }],
  blocks: [
    free('img', 'image', null, { source: 'a.jpg' }),
    free('title', 'heading', 'title'),
    free('kicker', 'heading', 'kicker'),
    free('p', 'text', 'body'),
  ],
  stacks: [],
  slots: [
    slot('slot-1', { type: 'image' }, 0, 0, 192, 256, { z: 1, tone: 'light' }),
    slot('slot-2', { type: 'heading', variant: 'title' }, 14, 180, 120, 32, { z: 2, tone: 'light' }),
  ],
});
const get = (data, id) => data.blocks.find((b) => b.id === id);

test('slotAccepts: tür eşleşmeli; variant yazıyorsa o da', () => {
  assert.equal(slotAccepts({ accepts: { type: 'image' } }, { type: 'image', variant: null }), true);
  assert.equal(slotAccepts({ accepts: { type: 'heading' } }, { type: 'heading', variant: 'kicker' }), true);
  assert.equal(slotAccepts({ accepts: { type: 'heading', variant: 'title' } }, { type: 'heading', variant: 'kicker' }), false);
  assert.equal(slotAccepts({ accepts: { type: 'text', variant: 'body' } }, { type: 'heading', variant: 'title' }), false);
});

test('slotAt: üstteki uygun slot; uymayan blok için null', () => {
  const data = issue();
  const p = { x: 20, y: 190 }; // görsel slotunun ve başlık slotunun içinde
  assert.equal(slotAt(data, 's', p, get(data, 'title')).id, 'slot-2');
  assert.equal(slotAt(data, 's', p, get(data, 'img')).id, 'slot-1'); // alttaki ama uygun olan
  assert.equal(slotAt(data, 's', p, get(data, 'kicker')), null);
  assert.equal(slotAt(data, 's', p).id, 'slot-2'); // blok verilmezse en üstteki
  assert.equal(slotAt(data, 's', { x: 300, y: 10 }, get(data, 'img')), null);
});

test('fillSlot: görsel konum, genişlik, yükseklik, z ve tone alır; slot silinir', () => {
  const data = issue();
  assert.equal(fillSlot(data, 'slot-1', 'img'), true);
  const b = get(data, 'img');
  assert.deepEqual([b.spread_id, b.x, b.y, b.w, b.h, b.z, b.tone], ['s', 0, 0, 192, 256, 1, 'light']);
  assert.deepEqual(data.slots.map((s) => s.id), ['slot-2']);
  assert.deepEqual(validate(data), []);
});

test('fillSlot: tuvaldeki metin bloğunun yüksekliği kendi ölçüsü (önbellek) kalır', () => {
  const data = issue();
  Object.assign(get(data, 'title'), { spread_id: 's', x: 200, y: 20, w: 60, h: 16, z: 7 });
  fillSlot(data, 'slot-2', 'title');
  const b = get(data, 'title');
  assert.deepEqual([b.x, b.y, b.w, b.h, b.z, b.tone], [14, 180, 120, 16, 2, 'light']);
});

test('fillSlot: uymayan blok yerleşmez, slot kalır', () => {
  const data = issue();
  assert.equal(fillSlot(data, 'slot-2', 'kicker'), false);
  assert.equal(get(data, 'kicker').spread_id, null);
  assert.equal(data.slots.length, 2);
});

test('fillSlot: yığındaki blok önce yığından çıkar', () => {
  const data = issue();
  Object.assign(get(data, 'title'), { spread_id: 's', x: 200, y: 20, w: 60, h: 16, z: 5 });
  Object.assign(get(data, 'p'), { spread_id: 's', x: 200, y: 40, w: 60, h: 10, z: 6 });
  const st = createStack(data, ['title', 'p']);
  fillSlot(data, 'slot-2', 'title');
  const b = get(data, 'title');
  assert.equal(b.stack_id, undefined);
  assert.deepEqual([b.x, b.y], [14, 180]);
  assert.deepEqual(childrenOf(data, st.id).map((x) => x.id), ['p']);
});

test('yer tutucu yığın: boşalınca kalır, alanı korunur; giren metin sütun genişliğini alır', () => {
  const data = {
    blocks: [
      free('p', 'text', 'body', { spread_id: 's', x: 0, y: 0, w: 40, h: 10, z: 1 }),
      free('q', 'text', 'body', { spread_id: 's', x: 0, y: 20, w: 50, h: 10, z: 2 }),
      free('i', 'image', null, { spread_id: 's', x: 0, y: 40, w: 30, h: 20, z: 3 }),
    ],
    stacks: [],
  };
  data.stacks.push({ id: 'col', spread_id: 's', direction: 'vertical', x: 204, y: 28, gap: 5, w: 79, h: 200 });
  assert.deepEqual(stackBounds(data, data.stacks[0]), { x: 204, y: 28, w: 79, h: 200 });
  insertIntoStack(data, 'p', 'col', 0);
  assert.deepEqual([get(data, 'p').x, get(data, 'p').y, get(data, 'p').w], [204, 28, 79]);
  insertIntoStack(data, 'q', 'col', 1);
  insertIntoStack(data, 'i', 'col', 2);
  // Art arda gövde paragrafları arasında boşluk yok (src/style.ts gapBetween).
  assert.deepEqual([get(data, 'q').y, get(data, 'q').w], [38, 79], 'ikinci metin de sütun genişliğinde');
  assert.equal(get(data, 'i').w, 30, 'görselin genişliği korunur');
  removeFromStack(data, 'i');
  removeFromStack(data, 'q');
  removeFromStack(data, 'p');
  assert.equal(data.stacks.length, 1, 'yer tutuculu yığın silinmez');
});

test('yer tutucusuz yığın boşalınca eskisi gibi silinir', () => {
  const data = { blocks: [free('a', 'text', 'body', { spread_id: 's', x: 0, y: 0, w: 40, h: 10, z: 1 })], stacks: [] };
  createStack(data, ['a']);
  removeFromStack(data, 'a');
  assert.equal(data.stacks.length, 0);
});

test('instantiateTemplate: yeni kimliklerle slotlar ve boş yığınlar', () => {
  const data = issue();
  const t = {
    name: 'Okuma',
    chrome_left: 'full',
    chrome_right: 'full',
    slots: [{ x: 14, y: 20, w: 79, h: 5, z: 1, tone: 'dark', accepts: { type: 'heading', variant: 'subhead' } }],
    stacks: [{ direction: 'vertical', x: 14, y: 28, gap: 5, w: 79, h: 208 }],
  };
  data.spreads.push({ id: 's2', section: '', chrome_left: 'full', chrome_right: 'full' });
  const made = instantiateTemplate(data, t, 's2');
  assert.deepEqual(made.slots, ['slot-3']);
  assert.equal(data.slots.at(-1).spread_id, 's2');
  assert.equal(data.stacks.at(-1).spread_id, 's2');
  assert.equal(data.stacks.at(-1).w, 79);
  // Şablon nesnesi paylaşılmaz.
  data.slots.at(-1).x = 99;
  assert.equal(t.slots[0].x, 14);
  assert.deepEqual(validate(data), []);
});

test('templateFromSpread: serbest bloklar slota, yığınlar boş yığına; gidiş-dönüş', () => {
  const data = issue();
  fillSlot(data, 'slot-1', 'img');
  Object.assign(get(data, 'p'), { spread_id: 's', x: 204, y: 28, w: 79, h: 10, z: 4 });
  Object.assign(get(data, 'kicker'), { spread_id: 's', x: 204, y: 50, w: 79, h: 4, z: 5 });
  createStack(data, ['p', 'kicker']);
  layoutStacks(data);
  const t = templateFromSpread(data, 's', 'Deneme');
  assert.deepEqual(validateTemplate(t), []);
  assert.deepEqual([t.name, t.chrome_left, t.chrome_right], ['Deneme', 'full', 'none']);
  assert.deepEqual(
    t.slots.map((s) => [s.accepts.type, s.accepts.variant ?? null, s.x, s.y, s.w, s.h, s.z]),
    [
      ['image', null, 0, 0, 192, 256, 1],
      ['heading', 'title', 14, 180, 120, 32, 2], // spread'de kalan slot
    ],
  );
  assert.equal(t.stacks.length, 1);
  assert.deepEqual([t.stacks[0].x, t.stacks[0].y, t.stacks[0].w], [204, 28, 79]);
  // Veriye dokunmaz.
  assert.equal(get(data, 'img').spread_id, 's');

  const fresh = issue();
  fresh.slots = [];
  fresh.spreads.push({ id: 's2', section: '', chrome_left: t.chrome_left, chrome_right: t.chrome_right });
  instantiateTemplate(fresh, t, 's2');
  const back = templateFromSpread(fresh, 's2', 'Deneme');
  assert.deepEqual(back, t);
});

test('templateKey: dosya adı', () => {
  assert.equal(templateKey('Tam görselli açılış'), 'tam-gorselli-acilis');
  assert.equal(templateKey('  Okuma Sayfası #2 '), 'okuma-sayfasi-2');
});

test('validateTemplate ve validate: hatalı slot', () => {
  const bad = { name: '', chrome_left: 'full', chrome_right: 'x', slots: [{ x: 0, y: 0, w: 0, h: 5, z: 1, tone: 'dark', accepts: { type: 'heading', variant: 'body' } }], stacks: [] };
  const p = validateTemplate(bad);
  assert.equal(p.length, 4, p.join('\n'));
  const data = issue();
  data.slots.push(slot('slot-9', { type: 'video' }, 0, 0, 10, 10, { spread_id: 'yok' }));
  assert.equal(validate(data).length, 2);
});

test('removeSpreadSkeleton: spread\'in slotları ve boş yığınları gider', () => {
  const data = issue();
  data.stacks.push({ id: 'col', spread_id: 's', direction: 'vertical', x: 0, y: 0, gap: 4, w: 10, h: 10 });
  removeSpreadSkeleton(data, 's');
  assert.deepEqual([data.slots.length, data.stacks.length], [0, 0]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIncoming, mergeIssue } from '../src/content/merge.ts';
import { validate, unplacedBlocks } from '../src/model.ts';
import { createStack, layoutStacks } from '../src/stacks.ts';
import {
  creditsByBlock, DEFAULT_PALETTE, duotoneTables, gapBetween, indentedParagraphs, paletteOf, sideOf, SUBHEAD_AFTER,
  SUBHEAD_BEFORE, themeOf, uncreditedImages,
} from '../src/style.ts';
import { createBox, instantiateTemplate, templateFromSpread, validateTemplate } from '../src/templates.ts';

const blk = (id, type, variant, order, extra = {}) => ({
  id, type, variant, order, content: 'x', relates_to: [], tone: 'dark',
  spread_id: null, x: null, y: null, w: null, h: null, z: null, ...extra,
});
const issue = (blocks = [], extra = {}) => ({
  issue: { title: 'X', month: 1, year: 2026, number: '001', first_page: 2 },
  spreads: [{ id: 's', section: '', chrome_left: 'full', chrome_right: 'full' }],
  blocks,
  ...extra,
});

test('palet: eksik adlar varsayılandan; validate hex ve ad denetler', () => {
  const p = paletteOf({ palette: { accent: '#2f5d8a' } });
  assert.equal(p.accent, '#2f5d8a');
  assert.equal(p.paper, DEFAULT_PALETTE.paper);
  assert.deepEqual(validate(issue([], { palette: { accent: '#2f5d8a' } })), []);
  assert.equal(validate(issue([], { palette: { accent: 'blue', pink: '#ffffff' } })).length, 2);
});

test('tema: sayfa sol kenara göre, yoksa paper', () => {
  assert.deepEqual([sideOf(0), sideOf(191), sideOf(192)], ['left', 'left', 'right']);
  const s = { theme_left: 'accent' };
  assert.deepEqual([themeOf(s, 'left'), themeOf(s, 'right')], ['accent', 'paper']);
  assert.equal(validate(issue([], { spreads: [{ id: 's', section: '', chrome_left: 'full', chrome_right: 'full', theme_right: 'neon' }] })).length, 1);
});

test('gapBetween: gövde → gövde 0, ara başlık üstü/altı, gerisi gap', () => {
  const body = { type: 'text', variant: 'body' };
  const sub = { type: 'heading', variant: 'subhead' };
  const cap = { type: 'text', variant: 'caption' };
  assert.equal(gapBetween(body, body, 5), 0);
  assert.equal(gapBetween(body, sub, 5), SUBHEAD_BEFORE);
  assert.equal(gapBetween(sub, body, 5), SUBHEAD_AFTER);
  assert.equal(gapBetween(body, cap, 5), 5);
});

test('yığın dizgi kurallarını uygular', () => {
  const data = {
    blocks: [
      blk('a/p1', 'text', 'body', 1, { spread_id: 's', x: 0, y: 0, w: 79, h: 20, z: 1 }),
      blk('a/p2', 'text', 'body', 2, { spread_id: 's', x: 0, y: 40, w: 79, h: 12, z: 2 }),
      blk('a/sub', 'heading', 'subhead', 3, { spread_id: 's', x: 0, y: 80, w: 79, h: 5, z: 3 }),
      blk('a/p3', 'text', 'body', 4, { spread_id: 's', x: 0, y: 120, w: 79, h: 8, z: 4 }),
    ],
    stacks: [],
  };
  createStack(data, ['a/p1', 'a/p2', 'a/sub', 'a/p3']);
  layoutStacks(data);
  const y = (id) => data.blocks.find((b) => b.id === id).y;
  assert.deepEqual([y('a/p1'), y('a/p2'), y('a/sub'), y('a/p3')], [0, 20, 32 + SUBHEAD_BEFORE, 32 + SUBHEAD_BEFORE + 5 + SUBHEAD_AFTER]);
});

test('indentedParagraphs: önceki metni gövde olan paragraf girintili', () => {
  const blocks = [
    blk('a/title', 'heading', 'title', 1),
    blk('a/deck', 'text', 'deck', 2),
    blk('a/p1', 'text', 'body', 3),
    blk('a/img', 'image', null, 4),
    blk('a/cap', 'text', 'caption', 5),
    blk('a/p2', 'text', 'body', 6), // görsel ve caption atlanır → girintili
    blk('a/sub', 'heading', 'subhead', 7),
    blk('a/p3', 'text', 'body', 8), // ara başlıktan sonra → girintisiz
    blk('a/p4', 'text', 'body', 9, { drop_cap: true }), // büyük baş harf → girintisiz
    blk('b/p1', 'text', 'body', 10), // başka parça → girintisiz
    blk('b/p2', 'text', 'body', 11),
  ];
  assert.deepEqual([...indentedParagraphs(blocks)].sort(), ['a/p2', 'b/p2']);
});

test('künye caption sonunda; caption yoksa bağlı notta; hiçbiri yoksa uyarı', () => {
  const blocks = [
    blk('a/img1', 'image', null, 1, { credit: 'NIST' }),
    blk('a/cap1', 'text', 'caption', 2, { relates_to: ['a/img1'] }),
    blk('a/note', 'note', null, 3),
    blk('a/img2', 'image', null, 4, { credit: 'Rama / CC BY-SA 3.0', relates_to: ['a/note'] }),
    blk('a/img3', 'image', null, 5, { credit: 'Kimse' }),
  ];
  const c = creditsByBlock(blocks);
  assert.deepEqual([c.get('a/cap1'), c.get('a/note')], [['NIST'], ['Rama / CC BY-SA 3.0']]);
  assert.deepEqual(uncreditedImages(blocks), ['a/img3']);
});

test('duotone tablosu: siyah → ink, beyaz → paper', () => {
  const t = duotoneTables({ ...DEFAULT_PALETTE, ink: '#000000', paper: '#ffffff' });
  assert.deepEqual(t, { r: '0.0000 1.0000', g: '0.0000 1.0000', b: '0.0000 1.0000' });
});

test('kutu: yerleşik, palet adlı dolgu; tepsiye düşmez; validate denetler', () => {
  const data = issue([]);
  const box = createBox(data, 's', { x: 320, y: 16, w: 54, h: 220, z: 1, fill: 'accent-soft', opacity: 0.8 });
  assert.equal(box.id, 'box-1');
  assert.deepEqual(validate(data), []);
  assert.deepEqual(unplacedBlocks(data.blocks), []);
  box.fill = 'pink';
  box.opacity = 2;
  assert.equal(validate(data).length, 2);
});

test('validate: color, drop_cap ve treatment alanları', () => {
  const data = issue([
    blk('a/p', 'text', 'body', 1, { color: 'accent', drop_cap: true }),
    blk('a/r', 'divider', null, 2, { color: 'muted', content: null }),
    blk('a/k', 'heading', 'kicker', 3, { drop_cap: true }),
    blk('a/i', 'image', null, 4, { treatment: 'sepia', content: null }),
  ]);
  assert.equal(validate(data).length, 3, validate(data).join('\n'));
});

test('içe aktarma: kutular ve editöre ait alanlar korunur', () => {
  const assetPath = (slug, file) => `assets/i/${slug}/${file}`;
  const pkg = { slug: 'a', blocks: [
    { key: 'p', type: 'text', variant: 'body', content: 'Bir.' },
    { key: 'img', type: 'image', file: 'a.jpg' },
  ] };
  const first = mergeIssue({ blocks: [] }, buildIncoming([pkg], { assetPath }).blocks).data;
  Object.assign(first.blocks[0], { spread_id: 's', x: 0, y: 0, w: 79, h: 5, z: 1, color: 'muted', drop_cap: true });
  Object.assign(first.blocks[1], { spread_id: 's', x: 0, y: 10, w: 79, h: 40, z: 2, treatment: 'duotone' });
  createBox(first, 's', { x: 0, y: 0, w: 10, h: 10, z: 3, fill: 'accent' });
  const { data, report } = mergeIssue(first, buildIncoming([pkg], { assetPath }).blocks);
  assert.equal(report.kept.length, 0, 'kutu "içerikte yok" sayılmaz');
  assert.equal(report.unchanged, 2);
  const by = (id) => data.blocks.find((b) => b.id === id);
  assert.deepEqual([by('a/p').color, by('a/p').drop_cap, by('a/img').treatment], ['muted', true, 'duotone']);
  assert.equal(by('box-1').fill, 'accent');
  assert.equal(by('box-1').removed_from_content, undefined);
});

test('şablon: temalar ve kutular gidiş-dönüş; kutu slota çevrilmez', () => {
  const data = issue([blk('a/p', 'text', 'body', 1, { spread_id: 's', x: 14, y: 20, w: 79, h: 10, z: 2 })], {
    spreads: [{ id: 's', section: '', chrome_left: 'none', chrome_right: 'full', theme_left: 'accent' }],
    stacks: [],
    slots: [],
  });
  createBox(data, 's', { x: 320, y: 16, w: 54, h: 220, z: 1, fill: 'accent-soft' });
  const t = templateFromSpread(data, 's', 'Renkli');
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.theme_left, 'accent');
  assert.equal(t.theme_right, undefined);
  assert.deepEqual(t.boxes, [{ x: 320, y: 16, w: 54, h: 220, z: 1, fill: 'accent-soft' }]);
  assert.deepEqual(t.slots.map((s) => s.accepts.type), ['text']);

  const fresh = issue([], { stacks: [], slots: [], spreads: [{ id: 's2', section: '', chrome_left: 'none', chrome_right: 'full', theme_left: 'accent' }] });
  const made = instantiateTemplate(fresh, t, 's2');
  assert.deepEqual(made.boxes, ['box-1']);
  assert.deepEqual(templateFromSpread(fresh, 's2', 'Renkli'), t);
});

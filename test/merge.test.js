import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIncoming, mergeIssue } from '../src/content/merge.js';

const assetPath = (slug, file) => `assets/i/${slug}/${file}`;
const build = (articles) => buildIncoming(articles, { assetPath });
const placed = { spread_id: 's-1', x: 10, y: 10, w: 40, h: 20, z: 1 };

const article = {
  slug: 'paper',
  blocks: [
    { key: 'p1', type: 'text', variant: 'body', content: 'Bir.' },
    { key: 'img', type: 'image', file: 'a.jpg', alt: 'A', relates_to: ['p1'] },
    { key: 'cap', type: 'text', variant: 'caption', label: '01', content: 'Alt yazı.', relates_to: ['img'] },
  ],
};

test('buildIncoming: id, order, relates_to çözümü, görsel yolu', () => {
  const { blocks, files, errors } = build([article, { slug: 'other', blocks: [
    { key: 'p1', type: 'text', variant: 'body', content: 'İki.', relates_to: ['paper/p1'] },
  ] }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(blocks.map((b) => [b.id, b.order]), [
    ['paper/p1', 1], ['paper/img', 2], ['paper/cap', 3], ['other/p1', 4],
  ]);
  assert.deepEqual(blocks[1].relates_to, ['paper/p1']);
  assert.equal(blocks[1].source, 'assets/i/paper/a.jpg');
  assert.deepEqual(blocks[3].relates_to, ['paper/p1']);
  assert.deepEqual(files, [{ slug: 'paper', file: 'a.jpg' }]);
});

test('buildIncoming: hatalar toplanır', () => {
  const { errors } = build([{ slug: 'x', blocks: [
    { key: 'p1', type: 'text', variant: 'body', content: 'a' },
    { key: 'p1', type: 'text', variant: 'body', content: 'b' },
    { key: 'Bad Key', type: 'text', variant: 'body', content: 'c' },
    { key: 'h', type: 'heading', variant: 'body', content: 'd' },
    { key: 'e', type: 'text', variant: 'body', content: '  ' },
    { key: 'i', type: 'image', file: '../etc/passwd' },
    { key: 'r', type: 'note', content: 'n', relates_to: ['yok'] },
  ] }]);
  assert.equal(errors.length, 6, errors.join('\n'));
});

test('mergeIssue: yeni bloklar tepsiye düşer', () => {
  const { blocks } = build([article]);
  const { data, report } = mergeIssue({ spreads: [], blocks: [] }, blocks);
  assert.deepEqual(report.added, ['paper/p1', 'paper/img', 'paper/cap']);
  assert.ok(data.blocks.every((b) => b.spread_id === null && b.x === null && b.tone === 'dark'));
});

test('mergeIssue: yerleşim, tone ve focal_point korunur; içerik güncellenir', () => {
  const first = mergeIssue({ spreads: [], blocks: [] }, build([article]).blocks).data;
  for (const b of first.blocks) Object.assign(b, placed, { tone: 'light' });
  first.blocks[1].focal_point = { x: 0.2, y: 0.8 };

  const changed = structuredClone(article);
  changed.blocks[0].content = 'Bir, uzadı.';
  changed.blocks[1].focal_point = { x: 0.9, y: 0.9 };
  changed.blocks[1].alt = 'Yeni alt';
  const { data, report } = mergeIssue(first, build([changed]).blocks);

  assert.deepEqual(report.updated, ['paper/p1', 'paper/img']);
  assert.deepEqual(report.reflow, ['paper/p1']);
  assert.equal(report.unchanged, 1);
  const [p1, img] = data.blocks;
  assert.equal(p1.content, 'Bir, uzadı.');
  assert.deepEqual([p1.spread_id, p1.x, p1.w, p1.tone], ['s-1', 10, 40, 'light']);
  assert.deepEqual(img.focal_point, { x: 0.2, y: 0.8 });
  assert.equal(img.alt, 'Yeni alt');
});

test('mergeIssue: aynı içerik ikinci kez değişiklik üretmez', () => {
  const once = mergeIssue({ spreads: [], blocks: [] }, build([article]).blocks).data;
  const { data, report } = mergeIssue(once, build([article]).blocks);
  assert.equal(report.unchanged, 3);
  assert.equal(JSON.stringify(data.blocks), JSON.stringify(once.blocks));
});

test('mergeIssue: paketten çıkan blok — tepsideyse silinir, yerleşikse işaretlenip korunur', () => {
  const first = mergeIssue({ spreads: [], blocks: [] }, build([article]).blocks).data;
  Object.assign(first.blocks[1], placed); // img yerleşik, cap tepside
  const smaller = { slug: 'paper', blocks: [article.blocks[0]] };
  const { data, report } = mergeIssue(first, build([smaller]).blocks);

  assert.deepEqual(report.kept, ['paper/img']);
  assert.deepEqual(report.deleted, ['paper/cap']);
  assert.deepEqual(data.blocks.map((b) => [b.id, b.order]), [['paper/p1', 1], ['paper/img', 2]]);
  assert.equal(data.blocks[1].removed_from_content, true);

  // Geri gelirse işaret kalkar.
  const again = mergeIssue(data, build([article]).blocks).data;
  assert.equal(again.blocks.find((b) => b.id === 'paper/img').removed_from_content, undefined);
});

test('mergeIssue: makale sırası değişince order baştan hesaplanır', () => {
  const other = { slug: 'other', blocks: [{ key: 'p1', type: 'text', variant: 'body', content: 'x' }] };
  const first = mergeIssue({ spreads: [], blocks: [] }, build([article, other]).blocks).data;
  const { data, report } = mergeIssue(first, build([other, article]).blocks);
  assert.deepEqual(data.blocks.map((b) => [b.id, b.order]), [
    ['other/p1', 1], ['paper/p1', 2], ['paper/img', 3], ['paper/cap', 4],
  ]);
  assert.deepEqual(report.reordered, ['other/p1', 'paper/p1', 'paper/img', 'paper/cap']);
  assert.deepEqual(report.updated, []);
});

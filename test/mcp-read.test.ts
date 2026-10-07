// MCP okuma araçları: işleyiciler (gerçek data/ salt okunur) ve SDK bağlantısı
// (bellek içi taşıma, sahte çizici; tarayıcı açılmaz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { COLS, MARGINS, ROWS } from '../src/config.ts';
import { formatJson } from '../mcp/format.ts';
import { guide } from '../mcp/guide.ts';
import { imageSize } from '../mcp/imagesize.ts';
import { readIssue, ROOT, ToolError } from '../mcp/issues.ts';
import { getIssue, getSpread, listTemplates, listTray, renderSpread } from '../mcp/read.ts';
import { createServer } from '../mcp/server.ts';

/** Sahte çizici: veriyi aynen döner, verilen yükseklikleri yazar. */
const fakeRenderer = (heights = {}) => ({
  calls: [],
  async render(req) {
    this.calls.push(req);
    for (const b of req.data.blocks) if (b.id in heights) b.h = heights[b.id];
    return { png: Buffer.from('png'), pxPerCell: 3.125, data: req.data };
  },
});

test('kılavuz: ölçüler koddan, variant ve şablonlar listede', () => {
  const g = guide(ROOT, readIssue(ROOT, 'issue-sample'));
  assert.match(g, new RegExp(`grid ${COLS}×${ROWS} cells`));
  assert.match(g, new RegExp(`top ${MARGINS.top}, bottom ${MARGINS.bottom}`));
  assert.match(g, /\| text\/body \| .* \| 12\/16 \| 4 \| 80 \|/);
  assert.match(g, /quote: \(none\), pull/);
  assert.match(g, /accent #2f5d8a/, 'sayının paleti');
  assert.match(g, /okuma-sayfasi \(Okuma sayfası\)/);
});

test('get_issue: spread özeti, parçalar, tepsi ve doğrulama', () => {
  const r = getIssue(ROOT, { issue: 'issue-sample' });
  assert.deepEqual(r.spreads.map((s) => s.id), ['s-1', 's-2', 's-3', 's-4']);
  assert.deepEqual(r.spreads[1].pages, [4, 5]);
  assert.deepEqual(r.spreads[3].theme, ['accent', 'paper']);
  assert.equal(r.spreads[0].boxes, 1);
  assert.equal(r.tray, 0);
  assert.deepEqual(r.problems, [], 'yığın konumları doğrulamadan önce dosya biçimine döner');
  assert.ok(r.articles.some((a) => a.slug === 'kilogram' && a.placed === 8));
});

test('hata mesajı bilinen adları söyler', () => {
  assert.throws(() => getIssue(ROOT, { issue: 'yok' }), (e) => e instanceof ToolError && /Known: .*issue-sample/.test(e.message));
  assert.throws(() => getIssue(ROOT, { issue: '../x' }), /Invalid issue name/);
  assert.throws(() => getSpread(ROOT, { issue: 'issue-sample', spread_id: 's-9' }), /Spreads: s-1, s-2, s-3, s-4/);
  assert.throws(() => listTemplates(ROOT, { key: 'yok' }), /Keys: .*okuma-sayfasi/);
  assert.throws(() => listTray(ROOT, { issue: 'issue-001', slug: 'yok' }), /Articles: /);
});

test('list_tray: order sırası, metnin başı, görsel boyutu', () => {
  const r = listTray(ROOT, { issue: 'issue-001' });
  assert.equal(r.count, r.blocks.length);
  const orders = r.blocks.map((b) => b.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  const img = r.blocks.find((b) => b.kind === 'image');
  assert.ok(img.image.width > 0 && img.image.ratio > 0, JSON.stringify(img));
  assert.ok(r.blocks.every((b) => b.text.length <= 100));
  const one = listTray(ROOT, { issue: 'issue-001', slug: 'strange-document' });
  assert.ok(one.blocks.every((b) => b.id.startsWith('strange-document/')));
});

test('get_spread: bloklar, yığınlar, slotlar, uyarılar', () => {
  const r = getSpread(ROOT, { issue: 'issue-sample', spread_id: 's-2' });
  assert.equal(r.spread.chrome_left, 'none');
  const st = r.stacks.find((s) => s.children.includes('allowance-for-error/p1'));
  assert.deepEqual(st.children.slice(0, 3), ['allowance-for-error/p1', 'allowance-for-error/p2', 'allowance-for-error/p3']);
  const p1 = r.blocks.find((b) => b.id === 'allowance-for-error/p1');
  assert.equal(p1.stack, st.id);
  assert.equal(p1.drop_cap, true);
  assert.deepEqual([p1.x, p1.y], [st.x, st.y], 'yığın çocuğunun konumu yığından');
  assert.ok(Array.isArray(r.warnings) && Array.isArray(r.slots));
});

test('list_templates: özet ve key ile tam şablon', () => {
  const all = listTemplates(ROOT, {});
  const reading = all.templates.find((t) => t.key === 'okuma-sayfasi');
  assert.ok(reading.stacks.some((s) => s.startsWith('vertical column @14,28 79×208')));
  assert.ok(reading.slots.some((s) => s.startsWith('heading/subhead @14,20')));
  assert.equal(listTemplates(ROOT, { key: 'okuma-sayfasi' }).template.name, 'Okuma sayfası');
});

test('render_spread: bölge denetimi, ölçülen yükseklik farkı', async () => {
  const r = fakeRenderer({ 'allowance-for-error/p1': 40 });
  const out = await renderSpread(ROOT, r, { issue: 'issue-sample', spread_id: 's-2' });
  assert.deepEqual(r.calls[0].region, { x: 0, y: 0, w: COLS, h: ROWS });
  assert.equal(r.calls[0].width, 1200);
  assert.deepEqual(out.info.heights_changed, ['allowance-for-error/p1: 36 → 40']);
  assert.ok(out.info.blocks.some((b) => b.id === 'allowance-for-error/p1' && b.h === 40));
  await assert.rejects(
    renderSpread(ROOT, r, { issue: 'issue-sample', spread_id: 's-2', region: { x: 300, y: 0, w: 100, h: 10 } }),
    /outside the frame/,
  );
  await assert.rejects(renderSpread(ROOT, r, { issue: 'issue-sample', spread_id: 's-2', width: 5000 }), /width must be/);
});

test('imageSize: PNG, JPEG, SVG başlığı', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xform-img-'));
  const png = Buffer.alloc(24);
  png.writeUInt8(0x89, 0);
  png.write('PNG', 1, 'ascii');
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  writeFileSync(join(dir, 'a.png'), png);
  writeFileSync(join(dir, 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"></svg>');
  assert.deepEqual(imageSize(join(dir, 'a.png')), { width: 640, height: 480 });
  assert.deepEqual(imageSize(join(dir, 'a.svg')), { width: 300, height: 200 });
  assert.deepEqual(imageSize(join(ROOT, 'assets/issue-sample/kilogram/kilogram-k4-k20.jpg'))?.width > 0, true);
  assert.equal(imageSize(join(dir, 'yok.jpg')), null);
});

test('formatJson: kısa nesne tek satırda, uzun liste satır satır', () => {
  assert.equal(formatJson({ a: 1, b: [1, 2] }), '{"a":1,"b":[1,2]}');
  const long = formatJson({ list: Array.from({ length: 30 }, (_, i) => ({ id: `block-${i}`, x: i })) });
  assert.match(long, /^\{\n "list": \[\n  \{"id":"block-0","x":0\},\n/);
});

test('sunucu: araçlar listelenir, hata isError ile döner, görüntü PNG', async () => {
  const renderer = fakeRenderer();
  const server = createServer(ROOT, renderer);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ['get_guide', 'get_issue', 'list_tray', 'get_spread', 'list_templates', 'render_spread']);
  assert.ok(tools.every((t) => t.description.length > 40 && t.annotations?.readOnlyHint));

  const ok = await client.callTool({ name: 'get_issue', arguments: { issue: 'issue-sample' } });
  assert.equal(ok.isError, undefined);
  assert.equal(JSON.parse(ok.content[0].text).spreads.length, 4);
  const bad = await client.callTool({ name: 'get_spread', arguments: { issue: 'issue-sample', spread_id: 'x' } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /Spreads: s-1/);
  const img = await client.callTool({ name: 'render_spread', arguments: { issue: 'issue-sample', spread_id: 's-1' } });
  assert.deepEqual([img.content[0].type, img.content[0].mimeType], ['image', 'image/png']);
  assert.equal(JSON.parse(img.content[1].text).px_per_cell, 3.125);
  await client.close();
});

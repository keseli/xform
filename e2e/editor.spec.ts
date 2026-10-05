// Editör: seçim ve ilişki vurgusu, taşıma ve snap, geri alma, resize ve oran
// kilidi, taşma ve frame sınırı, öne/arkaya, yeni spread, tepsiden bırakma,
// uyarılar, tepsiye gönderme, kayıt, okuma görünümü.
import { check, editorState, expect, issueCopy, openEditor, test } from './fixtures.ts';

const issue = issueCopy('e2e-editor');
test.beforeAll(() => issue.create());
test.afterAll(() => issue.remove());

test('editör', async ({ page, errors }) => {
  await openEditor(page, issue.name);
  const st = () => editorState(page);
  const blk = async (id: string) => (await st()).data.blocks.find((b: any) => b.id === id);
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  async function dragBy(sel: string, dx: number, dy: number, opts: { ox?: number; oy?: number; alt?: boolean; ctrl?: boolean } = {}) {
    const b = await box(sel);
    const x = b.x + (opts.ox ?? b.width / 2);
    const y = b.y + (opts.oy ?? b.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (opts.alt) await page.keyboard.down('Alt');
    if (opts.ctrl) await page.keyboard.down('Control');
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
    await page.mouse.up();
    if (opts.alt) await page.keyboard.up('Alt');
    if (opts.ctrl) await page.keyboard.up('Control');
    await page.waitForTimeout(50);
  }
  async function dragTo(sel: string, tx: number, ty: number) {
    const b = await box(sel);
    const x = b.x + b.width / 2;
    const y = b.y + 10;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + ((tx - x) * i) / 10, y + ((ty - y) * i) / 10);
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  const designToScreen = async (ux: number, uy: number) => {
    const f = await box('.frame');
    const s = f.width / 1536;
    return [f.x + ux * s, f.y + uy * s];
  };

  check('başlangıçta uyarı yok', (await page.locator('.badge--warn').count()) === 0);
  check('tepsi 21 blok', (await page.locator('.tray-item').count()) === 21);

  // Seçim + ilişki vurgusu
  await page.locator('.block[data-id="empire-of-paper/img-tablet"]').click();
  const related = await page.locator('.block.is-related').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
  check('görsel seçilince ilişkili paragraflar vurgulanır', related.sort().join() === 'empire-of-paper/p1,empire-of-paper/p2', related.join());

  // Taşıma: snap 2 (kılavuzlar kapalı: Ctrl)
  const p4 = await blk('empire-of-paper/p4');
  await dragBy('.block[data-id="empire-of-paper/p4"]', 23, 9, { ctrl: true });
  const p4b = await blk('empire-of-paper/p4');
  check('taşıma 2 hücreye snap', p4b.x % 2 === 0 && p4b.y % 2 === 0 && (p4b.x !== p4.x || p4b.y !== p4.y), `${p4.x},${p4.y} → ${p4b.x},${p4b.y}`);
  await dragBy('.block[data-id="empire-of-paper/p4"]', 3, 0, { alt: true, ctrl: true });
  const p4c = await blk('empire-of-paper/p4');
  check('Alt ile 1 hücre', p4c.x !== p4b.x && Math.abs(p4c.x - p4b.x) <= 2, `${p4b.x} → ${p4c.x}`);
  await page.keyboard.press('Control+z');
  check('undo: son taşıma geri alınır (tek adım)', (await blk('empire-of-paper/p4')).x === p4b.x && (await blk('empire-of-paper/p4')).y === p4b.y);
  await page.keyboard.press('Control+z');
  check('undo: ilk taşıma da geri alınır', (await blk('empire-of-paper/p4')).x === p4.x && (await blk('empire-of-paper/p4')).y === p4.y);
  await page.keyboard.press('Control+Shift+z');
  check('redo', (await blk('empire-of-paper/p4')).x === p4b.x);
  await page.keyboard.press('Control+Shift+z');
  check('redo 2', (await blk('empire-of-paper/p4')).x === p4c.x);
  check('undo düğmesi aktif', await page.locator('[data-cmd="undo"]').isEnabled());
  await page.waitForTimeout(700);
  check('undo/redo sonrası diske kaydedildi', issue.read().blocks.find((b: any) => b.id === 'empire-of-paper/p4').x === p4c.x);

  // Resize metin: sadece genişlik, yükseklik içerikten
  const before = await blk('empire-of-paper/p4');
  const eh = await box('.selection .handle--e');
  await page.mouse.move(eh.x + eh.width / 2, eh.y + eh.height / 2);
  await page.mouse.down();
  await page.mouse.move(eh.x - 60, eh.y + 80, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const after = await blk('empire-of-paper/p4');
  check('metin resize: genişlik azaldı, yükseklik arttı, y sabit', after.w < before.w && after.h > before.h && after.y === before.y, `w ${before.w}→${after.w} h ${before.h}→${after.h}`);
  check('metinde yalnız 2 tutamaç', (await page.locator('.selection .handle').count()) === 2);

  // Görsel resize, oran kilidi
  await page.locator('.block[data-id="empire-of-paper/img-archive"]').click();
  check('görselde 8 tutamaç', (await page.locator('.selection .handle').count()) === 8);
  const a0 = await blk('empire-of-paper/img-archive');
  const se = await box('.selection .handle--se');
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x - 40, se.y - 10, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const a1 = await blk('empire-of-paper/img-archive');
  check('oran kilidi korunur', Math.abs(a1.w / a1.h - a0.w / a0.h) < 0.05, `${a0.w}x${a0.h} → ${a1.w}x${a1.h}`);
  await page.keyboard.press('l');
  const se2 = await box('.selection .handle--se');
  await page.mouse.move(se2.x + se2.width / 2, se2.y + se2.height / 2);
  await page.mouse.down();
  await page.mouse.move(se2.x + se2.width / 2, se2.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const a2 = await blk('empire-of-paper/img-archive');
  check('kilit kapalı: yalnız yükseklik', a2.w === a1.w && a2.h > a1.h, `${a1.w}x${a1.h} → ${a2.w}x${a2.h}`);
  await page.keyboard.press('l');

  // Taşma ve frame sınırı
  await dragBy('.block[data-id="empire-of-paper/img-archive"]', 260, 0);
  check('frame dışına taşma uyarısı', (await page.locator('.block.is-overflow[data-id="empire-of-paper/img-archive"]').count()) === 1);
  await dragBy('.block[data-id="empire-of-paper/img-archive"]', 900, 380, { ox: 30, oy: 30 });
  const ax = await blk('empire-of-paper/img-archive');
  check('tamamen dışarı çıkamaz (8 hücre kalır)', ax.x === 384 - 8 && ax.y === 256 - 8, `${ax.x},${ax.y}`);
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  check('ok tuşuyla da çıkamaz', (await blk('empire-of-paper/img-archive')).x === 376);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  check('undo ile görsel eski yerinde', (await blk('empire-of-paper/img-archive')).x === 291, String((await blk('empire-of-paper/img-archive')).x));

  // Öne / arkaya
  await page.keyboard.press(']');
  const z1 = await blk('empire-of-paper/img-archive');
  const maxZ = Math.max(...(await st()).data.blocks.filter((b: any) => b.spread_id === 's-tablets').map((b: any) => b.z));
  check('öne getir', z1.z === maxZ);
  await page.keyboard.press('[');
  check('arkaya gönder', (await blk('empire-of-paper/img-archive')).z === 1);

  // Yeni spread + tepsiden bırakma
  await page.click('[data-cmd="add-spread"]');
  check('yeni spread', (await st()).data.spreads.length === 2 && (await st()).spreadIndex === 1);
  let [tx, ty] = await designToScreen(56, 140);
  await dragTo('.tray-item[data-id="strange-document/title"]', tx, ty);
  const it = await blk('strange-document/title');
  check('tepsiden bırakma', it.spread_id === 's-2' && it.x % 2 === 0 && it.y % 2 === 0 && it.w === 80, JSON.stringify([it.x, it.y, it.w, it.h]));
  [tx, ty] = await designToScreen(420, 120);
  await dragTo('.tray-item[data-id="strange-document/img-petition"]', tx, ty);
  await page.keyboard.press('Control+z');
  check('undo: tepsiden bırakma geri alınır', (await blk('strange-document/img-petition')).spread_id === null);
  await page.keyboard.press('Control+Shift+z');
  const ip = await blk('strange-document/img-petition');
  check('görsel doğal oranla yerleşir', Math.abs(ip.w / ip.h - 0.57) < 0.03, `${ip.w}x${ip.h}`);
  const ipw = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.badge--warn')].map((b) => b.dataset.id));
  check('ilişki uyarısı (paragraf tepside)', ipw.includes('strange-document/img-petition'), ipw.join());

  // Sıra uyarısı: büyük order'lı blok önceki spread'e
  await page.click('.tab[data-tab="0"]');
  [tx, ty] = await designToScreen(1240, 820);
  await dragTo('.tray-item[data-id="strange-document/p1"]', tx, ty);
  const w0 = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.badge--warn')].map((b) => b.dataset.id));
  check('sıra uyarısı', w0.includes('strange-document/p1'), w0.join());
  await page.locator('.block[data-id="strange-document/p1"]').click();
  // Delete → tepsiye döner
  await page.keyboard.press('Delete');
  const ip1 = await blk('strange-document/p1');
  check('Delete ile tepsiye', ip1.spread_id === null && ip1.x === null && ip1.z === null);

  // Kayıt
  await page.waitForTimeout(800);
  const saved = issue.read();
  check('diske kaydedildi', saved.spreads.length === 2 && saved.blocks.find((b: any) => b.id === 'strange-document/title').spread_id === 's-2');
  check('kayıt durumu', (await page.locator('.save').textContent()) === 'Kaydedildi');

  // Okuma görünümü: rozet/ızgara/tutamaç yok
  await page.goto(`index.html?issue=${issue.name}&spread=s-2`);
  await page.waitForSelector('body[data-ready]');
  check('okuma görünümünde rozet/ızgara/tutamaç yok', (await page.locator('.badge, .guides, .handle, .overlay').count()) === 0);

  expect(errors).toEqual([]);
});

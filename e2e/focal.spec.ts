// Odak noktası: odak moduna giriş/çıkış, görseli kutu içinde kaydırma, sınır,
// geri alma, Ortala, "kırpma yok" notu, kayıt.
import { check, expect, issueCopy, openEditor, test } from './fixtures.ts';

const issue = issueCopy('e2e-focal');
test.beforeAll(() => issue.create());
test.afterAll(() => issue.remove());

const ID = 'empire-of-paper/img-tablet';
const sel = `.blocks > .block[data-id="${ID}"]`;

test('odak noktası', async ({ page, errors }) => {
  await openEditor(page, issue.name);
  const blk = () => page.evaluate((id) => (window as any).__xform.state.data.blocks.find((b: any) => b.id === id), ID);
  const focalId = () => page.evaluate(() => (window as any).__xform.state.focalId);
  async function drag(dx: number, dy: number, at = 0.5) {
    const b = (await page.locator(sel).boundingBox())!;
    const x = b.x + b.width * at;
    const y = b.y + b.height * at;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
    await page.mouse.up();
    await page.waitForTimeout(60);
  }

  const b0 = await blk();
  await page.locator(sel).dblclick();
  check('çift tıkla odak modu', (await focalId()) === ID && (await page.locator('.focal-ghost').count()) === 1);
  check('odak modunda tutamaç yok', (await page.locator('.handle').count()) === 0);
  await drag(40, -12);
  const b1 = await blk();
  check('dikey taşmada y değişti, x aynı', b1.focal_point.y > b0.focal_point.y && b1.focal_point.x === b0.focal_point.x, JSON.stringify(b1.focal_point));
  check('blok yerinde kaldı', b1.x === b0.x && b1.y === b0.y);
  const pos = await page.locator(`${sel} img`).evaluate((img) => (img as HTMLElement).style.objectPosition);
  check('görsel object-position güncellendi', pos.includes(`${b1.focal_point.y * 100}%`), pos);
  await drag(0, -2000);
  check('sınırda durur', (await blk()).focal_point.y === 1);

  await page.keyboard.press('Control+z');
  check('undo tek adım (son sürükleme)', (await blk()).focal_point.y === b1.focal_point.y);
  await page.keyboard.press('Control+z');
  check('undo ilk sürükleme', (await blk()).focal_point.y === b0.focal_point.y);
  check('undo sonrası mod sürüyor', (await focalId()) === ID);

  await page.keyboard.press('Escape');
  check('Esc moddan çıkar, seçim kalır', (await focalId()) === null && (await page.evaluate(() => (window as any).__xform.state.selectedId)) === ID);
  await drag(40, 0);
  check('mod dışında sürükleme bloğu taşır', (await blk()).x !== b0.x);
  await page.keyboard.press('Control+z');

  await page.keyboard.press('f');
  check('F ile mod açılır', (await focalId()) === ID);
  await drag(0, 60);
  await page.click('[data-action="focal-center"]');
  const c = (await blk()).focal_point;
  check('Ortala', c.x === 0.5 && c.y === 0.5);
  await page.keyboard.press('f');
  check('F ile mod kapanır', (await focalId()) === null);

  // Aynı oranda kutu: kırpma yok notu
  await page.keyboard.press('f');
  await page.evaluate((id) => {
    const { store } = (window as any).__xform;
    store.commit((s: any) => {
      const b = s.data.blocks.find((x: any) => x.id === id);
      b.w = 68;
      b.h = 100;
    });
  }, ID);
  check('aynı oranda "kırpma yok" notu', (await page.locator('#inspector').textContent())!.includes('kırpma yok'));
  await page.locator('.block[data-id="empire-of-paper/p1"]').click({ position: { x: 20, y: 20 } });
  check('başka bloğa tıklayınca mod kapanır', (await focalId()) === null);

  await page.waitForTimeout(700);
  check('kaydedildi', issue.read().blocks.find((b: any) => b.id === ID).focal_point.x === 0.5);

  expect(errors).toEqual([]);
});

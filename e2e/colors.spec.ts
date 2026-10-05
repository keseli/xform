// Renk ve dizgi: palet düzenleme, sayfa teması, metin rengi, büyük baş harf,
// görsel işleme, kutu ekleme/taşıma/boyutlama/silme, okuma görünümü, şablonda
// tema ve kutu.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { check, editorState, expect, issueCopy, openEditor, ROOT, test } from './fixtures.ts';

const issue = issueCopy('e2e-colors');
const SAVED = `${ROOT}data/templates/e2e-renk.json`;
test.beforeAll(() => issue.create());
test.afterAll(() => {
  issue.remove();
  rmSync(SAVED, { force: true });
});

test('renk sistemi ve kutu', async ({ page, errors }) => {
  await openEditor(page, issue.name);
  const st = () => editorState(page);
  const blk = async (id: string) => (await st()).data.blocks.find((b: any) => b.id === id);
  const css = (sel: string, prop: string) =>
    page.locator(sel).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop);
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  const designToScreen = async (cx: number, cy: number) => {
    const f = (await page.locator('.frame').boundingBox())!;
    const s = f.width / 1536;
    return [f.x + cx * 4 * s, f.y + cy * 4 * s] as const;
  };
  /** Öğeyi sağ alt çeyreğinden tutup sürükle (ortadaki sıra rozetlerinden uzak). */
  async function dragBy(sel: string, dx: number, dy: number) {
    const b = (await page.locator(sel).boundingBox())!;
    const x = b.x + b.width * 0.8;
    const y = b.y + b.height * 0.8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
    await page.mouse.up();
    await page.waitForTimeout(80);
  }

  // Varsayılan: kicker ve etiketler accent.
  const accent0 = await css('.frame', '--accent');
  check('kicker varsayılan olarak accent', (await css('.block--heading-kicker', 'color')) === rgb(accent0), accent0);
  check('caption etiketi accent', (await css('.caption-label', 'color')) === rgb(accent0));

  // Palet: accent değişince frame değişkeni ve kicker rengi değişir.
  await page.keyboard.press('Escape');
  await page.locator('[data-action="palette-accent"]').fill('#2f5d8a');
  await page.waitForTimeout(100);
  check('palet sayıya yazıldı', (await st()).data.palette?.accent === '#2f5d8a');
  check('kicker yeni accent', (await css('.block--heading-kicker', 'color')) === rgb('#2f5d8a'));

  // Tema: sol sayfa accent; zemin accent, yazı açık, chrome da temada.
  await page.selectOption('[data-action="theme-left"]', 'accent');
  check('spread teması yazıldı', (await st()).data.spreads[0].theme_left === 'accent');
  check('sol sayfa zemini accent', (await css('.page--left', 'background-color')) === rgb('#2f5d8a'));
  check('sağ sayfa kâğıt kaldı', (await css('.page--right', 'background-color')) === rgb('#eeeadf'));
  check('sol sayfadaki başlık açık renk', (await css('.block[data-id="empire-of-paper/title"]', 'color')) === rgb('#eeeadf'));
  check('sol chrome temada', (await page.locator('.chrome--left.theme--accent').count()) === 1);
  await page.selectOption('[data-action="theme-left"]', 'paper');

  // Metin rengi: deck → soluk.
  await page.locator('.block[data-id="empire-of-paper/deck"]').click();
  await page.selectOption('[data-action="color"]', 'muted');
  check('color alanı', (await blk('empire-of-paper/deck')).color === 'muted');
  check('deck soluk', (await css('.block[data-id="empire-of-paper/deck"]', 'color')) === (await css('.frame', '--muted')).replace(/^#.*/, (h) => rgb(h)));
  await page.selectOption('[data-action="color"]', 'default');
  check('varsayılana dönünce alan silinir', (await blk('empire-of-paper/deck')).color === undefined);

  // Büyük baş harf (yığındaki paragraf: çift tıkla içine gir).
  await page.locator('.block[data-id="empire-of-paper/p1"]').dblclick();
  await page.locator('[data-action="drop-cap"]').check();
  check('drop_cap', (await blk('empire-of-paper/p1')).drop_cap === true);
  check('drop-cap sınıfı', (await page.locator('.block[data-id="empire-of-paper/p1"].drop-cap').count()) === 1);

  // Görsel işleme.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.block[data-id="empire-of-paper/img-tablet"]').click();
  await page.selectOption('[data-action="treatment"]', 'duotone');
  check('treatment', (await blk('empire-of-paper/img-tablet')).treatment === 'duotone');
  check('duotone filtresi', (await css('.block[data-id="empire-of-paper/img-tablet"] img', 'filter')).includes('xform-duotone'));

  // Kutu: ekle, taşı, boyutla, dolgu ve saydamlık.
  await page.click('[data-cmd="add-box"]');
  const box0 = await blk('box-1');
  check('kutu eklendi ve seçildi', box0?.type === 'box' && (await st()).selectedIds.join() === 'box-1');
  check('kutunun rozeti yok', (await page.locator('.badge[data-id="box-1"]').count()) === 0);
  check('kutu tepsiye düşmez', (await page.locator('.tray-item[data-id="box-1"]').count()) === 0);
  await dragBy('.block[data-id="box-1"]', 60, 30);
  const box1 = await blk('box-1');
  check('kutu taşındı', box1.x !== box0.x && box1.y !== box0.y, JSON.stringify([box0.x, box0.y, box1.x, box1.y]));
  const se = (await page.locator('.selection .handle--se').boundingBox())!;
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + 60, se.y + 40, { steps: 6 });
  await page.mouse.up();
  const box2 = await blk('box-1');
  check('kutu iki eksende boyutlandı', box2.w > box1.w && box2.h > box1.h, JSON.stringify([box1.w, box1.h, box2.w, box2.h]));
  await page.selectOption('[data-action="fill"]', 'accent');
  await page.locator('[data-action="opacity"]').fill('50');
  await page.locator('[data-action="opacity"]').press('Enter');
  const box3 = await blk('box-1');
  check('dolgu ve saydamlık', box3.fill === 'accent' && box3.opacity === 0.5, JSON.stringify([box3.fill, box3.opacity]));
  check('kutu accent ile boyandı', (await css('.block[data-id="box-1"]', 'background-color')) === rgb('#2f5d8a'));

  // Şablon: tema ve kutu saklanır.
  await page.keyboard.press('Escape');
  await page.selectOption('[data-action="theme-right"]', 'soft');
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'E2E Renk' : undefined));
  await page.click('[data-action="save-template"]');
  await expect.poll(() => existsSync(SAVED)).toBe(true);
  const t = JSON.parse(readFileSync(SAVED, 'utf8'));
  check('şablonda tema ve kutu', t.theme_right === 'soft' && t.boxes?.length === 1 && t.boxes[0].fill === 'accent', JSON.stringify([t.theme_right, t.boxes]));
  await page.click('[data-cmd="add-spread"]');
  await page.click('.spread-menu [data-template="e2e-renk"]');
  const made = await st();
  const fresh = made.data.spreads.at(-1);
  check('şablondan spread: tema ve kutu gelir', fresh.theme_right === 'soft' &&
    made.data.blocks.some((b: any) => b.type === 'box' && b.spread_id === fresh.id), JSON.stringify(fresh));
  await page.keyboard.press('Control+z');
  check('geri al: şablon spread\'i kalktı', (await st()).data.spreads.length === made.data.spreads.length - 1);

  // Okuma görünümü: tema, kutu ve renkler; rozet yok.
  await page.waitForTimeout(700);
  await page.goto(`index.html?issue=${issue.name}`);
  await page.waitForSelector('body[data-ready]');
  check('okumada sağ sayfa soft', (await css('.page--right', 'background-color')) !== rgb('#eeeadf'));
  check('okumada kutu', (await page.locator('.block--box').count()) === 1);
  check('okumada büyük baş harf', (await page.locator('.drop-cap').count()) === 1);

  // Kutu silinir (tepsiye gitmez).
  await openEditor(page, issue.name);
  await page.locator('.block[data-id="box-1"]').click();
  await page.keyboard.press('Delete');
  check('kutu silindi', !(await blk('box-1')));

  expect(errors).toEqual([]);
});

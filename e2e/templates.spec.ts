// Şablonlar ve slotlar: "+ Spread" menüsü, şablondan spread, tepsiden ve
// tuvalden slota bırakma, uymayan blok, geri alma, boş yığın (metin sütunu),
// slot seçme/silme, okuma görünümü, şablon olarak kaydetme.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { check, editorState, expect, issueCopy, openEditor, ROOT, test } from './fixtures.ts';

const issue = issueCopy('e2e-templates');
const SAVED = `${ROOT}data/templates/e2e-deneme.json`;
test.beforeAll(() => issue.create());
test.afterAll(() => {
  issue.remove();
  rmSync(SAVED, { force: true });
});

test('şablonlar ve slotlar', async ({ page, errors }) => {
  await openEditor(page, issue.name);
  const st = () => editorState(page);
  const blk = async (id: string) => (await st()).data.blocks.find((b: any) => b.id === id);
  const slotsHere = async () => {
    const s = await st();
    return (s.data.slots ?? []).filter((x: any) => x.spread_id === s.data.spreads[s.spreadIndex].id);
  };
  const designToScreen = async (ux: number, uy: number) => {
    const f = (await page.locator('.frame').boundingBox())!;
    const s = f.width / 1536;
    return [f.x + ux * 4 * s, f.y + uy * 4 * s] as const; // hücre → ekran
  };
  /** Tepsideki ya da tuvaldeki öğeyi hücre koordinatına sürükle. */
  async function dragTo(sel: string, cx: number, cy: number, { hold }: { hold?: () => Promise<void> } = {}) {
    const el = page.locator(sel);
    await el.scrollIntoViewIfNeeded();
    const b = (await el.boundingBox())!;
    const [tx, ty] = await designToScreen(cx, cy);
    const x = b.x + Math.min(b.width / 2, 40);
    const y = b.y + Math.min(b.height / 2, 10);
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + ((tx - x) * i) / 10, y + ((ty - y) * i) / 10);
    await hold?.();
    await page.mouse.up();
    await page.waitForTimeout(120);
  }
  async function addSpread(key: string) {
    await page.click('[data-cmd="add-spread"]');
    await page.click(`.spread-menu [data-template="${key}"]`);
    await page.waitForTimeout(150);
  }

  // Menü: boş spread ve dört başlangıç şablonu.
  await page.click('[data-cmd="add-spread"]');
  const items = await page.locator('.spread-menu [role="menuitem"]').allTextContents();
  check('menüde boş spread + 4 şablon', items.length === 5 && items[0] === 'Boş spread', items.join(' | '));
  await page.keyboard.press('Escape');
  check('Esc menüyü kapatır', (await page.locator('.spread-menu').count()) === 0);

  // Tam görselli açılış: chrome kapalı, 4 slot.
  await addSpread('tam-gorselli-acilis');
  let s = await st();
  const opener = s.data.spreads[s.spreadIndex];
  check('şablondan spread, chrome ayarı şablondan', opener.chrome_left === 'none' && opener.chrome_right === 'none');
  check('slotlar editörde çizildi', (await page.locator('.slots .slot').count()) === 4);

  // Tepsiden görseli görsel slotuna: sürüklerken slot vurgulanır.
  let highlighted = false;
  await dragTo('.tray-item[data-id="strange-document/img-salonica"]', 300, 60, {
    hold: async () => {
      highlighted = (await page.locator('.slot.slot--image.is-target').count()) === 1;
    },
  });
  check('sürüklerken uygun slot vurgulu', highlighted);
  const img = await blk('strange-document/img-salonica');
  check(
    'görsel slotun konum, ölçü, z ve tone değerini aldı',
    [img.spread_id, img.x, img.y, img.w, img.h, img.z, img.tone].join() === `${opener.id},0,0,384,256,1,light`,
    JSON.stringify([img.x, img.y, img.w, img.h, img.z, img.tone]),
  );
  check('dolan slot kalktı', (await slotsHere()).length === 3);

  // Uymayan blok (paragraf) başlık slotuna: serbest yerleşir, slot kalır.
  await dragTo('.tray-item[data-id="strange-document/p1"]', 40, 190);
  const p1 = await blk('strange-document/p1');
  check('uymayan blok serbest yerleşti', p1.spread_id === opener.id && p1.w !== 166, JSON.stringify([p1.x, p1.y, p1.w]));
  check('uymayan blokta slot kalır', (await slotsHere()).length === 3);
  await page.keyboard.press('Control+z');
  check('undo: paragraf tepside', (await blk('strange-document/p1')).spread_id === null);

  // Başlık slotu: genişlik, z ve tone alır; yükseklik içerikten ölçülür.
  await dragTo('.tray-item[data-id="strange-document/title"]', 40, 190);
  const title = await blk('strange-document/title');
  check(
    'başlık slotu doldu',
    [title.x, title.y, title.w, title.z, title.tone].join() === '14,178,166,2,light',
    JSON.stringify([title.x, title.y, title.w, title.z, title.tone]),
  );
  check('başlık metni açık tonla çizildi', (await page.locator('.block[data-id="strange-document/title"].tone--light').count()) === 1);
  await page.keyboard.press('Control+z');
  check('undo: slot geri geldi, başlık tepside', (await slotsHere()).length === 3 && (await blk('strange-document/title')).spread_id === null);
  await page.keyboard.press('Control+Shift+z');
  check('redo: başlık slotta', (await blk('strange-document/title')).x === 14 && (await slotsHere()).length === 2);

  // Tuvalden: önce serbest bırak (görselin dışında), sonra kicker slotuna taşı.
  await dragTo('.tray-item[data-id="strange-document/kicker"]', 250, 40);
  const k0 = await blk('strange-document/kicker');
  check('kicker serbest yerleşti', k0.spread_id === opener.id && k0.x !== 14, JSON.stringify([k0.x, k0.y]));
  await dragTo('.blocks > .block[data-id="strange-document/kicker"]', 30, 174);
  const k1 = await blk('strange-document/kicker');
  check('tuvalden taşınan blok slotu doldurdu', [k1.x, k1.y, k1.w, k1.tone].join() === '14,172,100,light', JSON.stringify([k1.x, k1.y, k1.w, k1.tone]));
  check('kalan tek slot deck', (await slotsHere()).map((x: any) => x.accepts.variant).join() === 'deck');

  // Okuma görünümü: slot ve yığın çerçevesi çizilmez.
  const readUrl = `index.html?issue=${issue.name}&spread=${opener.id}`;

  // Şablon olarak kaydet: bloklar slota döner (deck slotu da kalır).
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700); // kayıt
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    if (d.type() === 'prompt') await d.accept('E2E Deneme');
    else await d.accept();
  });
  await page.click('[data-action="save-template"]');
  await expect.poll(() => existsSync(SAVED)).toBe(true);
  const saved = JSON.parse(readFileSync(SAVED, 'utf8'));
  check('kaydedilen şablon: 4 slot, chrome kapalı', saved.name === 'E2E Deneme' && saved.slots.length === 4 && saved.chrome_left === 'none');
  check(
    'blok slota döndü: görsel tam spread',
    saved.slots.some((x: any) => x.accepts.type === 'image' && x.w === 384 && x.h === 256 && x.tone === 'light'),
  );
  await page.waitForTimeout(200);
  await page.click('[data-cmd="add-spread"]');
  check('yeni şablon menüde', (await page.locator('.spread-menu [data-template="e2e-deneme"]').count()) === 1);
  await page.keyboard.press('Escape');
  await page.click('[data-action="save-template"]');
  await page.waitForTimeout(300);
  check('aynı ad: üzerine yazma onayı soruldu', dialogs.join() === 'prompt,prompt,confirm', dialogs.join());

  // Okuma sayfası: boş metin sütunları görünür.
  await addSpread('okuma-sayfasi');
  check('boş yığınlar görünür', (await page.locator('.stack-outline--empty').count()) === 4);
  await dragTo('.tray-item[data-id="strange-document/p2"]', 40, 100);
  const p2 = await blk('strange-document/p2');
  check('metin boş sütuna girdi, sütun genişliğini aldı', p2.stack_id != null && [p2.x, p2.y, p2.w].join() === '14,28,79', JSON.stringify([p2.x, p2.y, p2.w]));
  check('dolu sütun artık boş değil', (await page.locator('.stack-outline--empty').count()) === 3);
  await dragTo('.tray-item[data-id="strange-document/p1"]', 40, 180);
  const p1b = await blk('strange-document/p1');
  check('ikinci paragraf da sütunda, sütun genişliğinde', p1b.stack_id === p2.stack_id && p1b.w === 79 && p1b.y > p2.y, JSON.stringify([p1b.y, p1b.w]));
  for (const id of ['strange-document/p1', 'strange-document/p2']) {
    await page.locator(`.block[data-id="${id}"]`).dblclick();
    await page.keyboard.press('Delete');
  }
  check(
    'bloklar tepsiye döndü, sütun boş kaldı',
    (await blk('strange-document/p2')).spread_id === null && (await page.locator('.stack-outline--empty').count()) === 4,
  );

  // Slot seç ve sil.
  const [nx, ny] = await designToScreen(330, 223);
  await page.mouse.click(nx, ny);
  check('slot tıklanınca seçildi', (await page.locator('#inspector .panel-head').first().textContent())!.startsWith('Slot'));
  const before = (await slotsHere()).length;
  await page.keyboard.press('Delete');
  check('Delete slotu siler', (await slotsHere()).length === before - 1);

  // Boş sütun tıklanınca seçilir ve taşınabilir.
  const [cx, cy] = await designToScreen(240, 150);
  await page.mouse.click(cx, cy);
  const sel = (await st()).selectedIds;
  check('boş sütun seçildi', sel.length === 1 && sel[0].startsWith('stack-'), sel.join());

  await page.waitForTimeout(700);
  await page.goto(readUrl);
  await page.waitForSelector('body[data-ready]');
  check('okuma görünümünde slot/yığın çerçevesi yok', (await page.locator('.slot, .slots, .stack-outline').count()) === 0);
  check('okuma görünümünde dolan bloklar var', (await page.locator('.block[data-id="strange-document/title"]').count()) === 1);

  expect(errors).toEqual([]);
});

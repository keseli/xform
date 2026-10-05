// Akıllı kılavuzlar, çoklu seçim ve Auto Layout: kılavuza yakalama, Shift+tık,
// alan seçimi, Shift+A, yığına giriş/çıkış, uzayan metin, sıralama, boşluk,
// yığın genişliği, yığına bırakma, kaldırma, kayıt ve okuma görünümü.
import { validate } from '../src/model.ts';
import { check, editorState, expect, issueCopy, openEditor, test } from './fixtures.ts';

const issue = issueCopy('e2e-layout');
test.beforeAll(() => issue.create());
test.afterAll(() => issue.remove());

const E = (k: string) => `empire-of-paper/${k}`;
const sel = (id: string) => `.blocks > .block[data-id="${id}"]`;

test('kılavuzlar, çoklu seçim ve auto layout', async ({ page, errors }) => {
  await openEditor(page, issue.name);
  const st = () => editorState(page);
  const blk = async (id: string) => (await st()).data.blocks.find((b: any) => b.id === id);
  const box = async (s: string) => (await page.locator(s).boundingBox())!;
  const stackOrder = async (stackId: string, short = true) =>
    (await st()).data.blocks
      .filter((b: any) => b.stack_id === stackId)
      .sort((a: any, b: any) => a.stack_index - b.stack_index)
      .map((b: any) => (short ? b.id.split('/')[1] : b.id));
  async function press(id: string, { at = [0.5, 0.5], shift = false } = {}) {
    const b = await box(sel(id));
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(b.x + b.width * at[0], b.y + b.height * at[1]);
    if (shift) await page.keyboard.up('Shift');
  }
  async function dragFrom(x: number, y: number, dx: number, dy: number, { hold, keys = [] }: { hold?: () => Promise<void>; keys?: string[] } = {}) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const k of keys) await page.keyboard.down(k);
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
    if (hold) await hold();
    await page.mouse.up();
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(60);
  }
  const dragBlock = async (id: string, dx: number, dy: number, opts?: Parameters<typeof dragFrom>[4]) => {
    const b = await box(sel(id));
    return dragFrom(b.x + b.width / 2, b.y + b.height / 2, dx, dy, opts);
  };
  const toScreen = async (cx: number, cy: number) => {
    const f = await box('.frame');
    const s = f.width / 1536;
    return [f.x + cx * 4 * s, f.y + cy * 4 * s];
  };

  // 1. Akıllı kılavuz: p4 hafifçe oynatılınca p3'ün sol kenarına (101) yakalanır.
  let guideCount = 0;
  await dragBlock(E('p4'), 3, 31, {
    hold: async () => {
      guideCount = await page.locator('.guide-line').count();
    },
  });
  const p4 = await blk(E('p4'));
  check('kılavuz: p4 sol kenarı p3 ile hizalı kaldı', p4.x === 101, `x=${p4.x} y=${p4.y}`);
  check('kılavuz çizgisi sürüklerken görünür', guideCount > 0, String(guideCount));
  check('bıraktıktan sonra kılavuz kalmaz', (await page.locator('.guide-line').count()) === 0);
  await page.keyboard.press('Control+z');

  // 2. Shift+tık çoklu seçim, birlikte taşıma.
  await press(E('p3'));
  await press(E('p4'), { shift: true });
  check('Shift+tık iki öğe', (await st()).selectedIds.length === 2);
  const [a3, a4] = [await blk(E('p3')), await blk(E('p4'))];
  await dragBlock(E('p4'), 0, 40, { keys: ['Control'] });
  const [b3, b4] = [await blk(E('p3')), await blk(E('p4'))];
  check('birlikte taşındı, aynı fark', b3.y - a3.y === b4.y - a4.y && b3.y !== a3.y, `${b3.y - a3.y}`);
  await page.keyboard.press('Control+z');

  // 3. Alan seçimi: sol sayfanın üstündeki boşluktan başlayıp p1 ve p2'yi kapsa.
  const [mx, my] = await toScreen(190, 30);
  const [nx, ny] = await toScreen(186, 120);
  await dragFrom(mx, my, nx - mx - 300, ny - my);
  const marq = (await st()).selectedIds;
  check('alan seçimi', marq.includes(E('p1')) && marq.includes(E('p2')), marq.join(','));
  await page.keyboard.press('Escape');

  // 4. Shift+A: ara başlık + p3 + p4 → dikey yığın.
  await press(E('sub-materiality'));
  await press(E('p3'), { shift: true });
  await press(E('p4'), { shift: true });
  await page.keyboard.press('Shift+A');
  let s = await st();
  const stack = s.data.stacks?.[0];
  check('Shift+A yığın kurdu', stack && stack.direction === 'vertical' && s.selectedIds[0] === stack.id, JSON.stringify(stack));
  check('sıra konumdan', (await stackOrder(stack.id, false)).join() === [E('sub-materiality'), E('p3'), E('p4')].join());
  const p3s = await blk(E('p3'));
  const p4s = await blk(E('p4'));
  check('aralıklar eşit (gap)', p4s.y - (p3s.y + p3s.h) === stack.gap, `gap=${stack.gap}`);

  // 5. Tık yığını, çift tık içteki bloğu seçer.
  await page.keyboard.press('Escape');
  await press(E('p3'));
  check('tık yığını seçer', (await st()).selectedId === stack.id);
  await page.locator(sel(E('p3'))).dblclick();
  check('çift tık içteki bloğu seçer', (await st()).selectedId === E('p3'));
  check('içteki metinde yalnız sağ tutamaç', (await page.locator('.selection .handle').count()) === 1);

  // 6. Metin uzayınca alttakiler kayar (içe aktarma ya da düzenleme gibi).
  const before = await blk(E('p4'));
  await page.evaluate(
    (id) =>
      (window as any).__xform.store.commit((s: any) => {
        s.data.blocks.find((b: any) => b.id === id).content +=
          ' And then some more words to make this paragraph clearly longer than before, so it wraps.';
      }),
    E('p3'),
  );
  const after = await blk(E('p4'));
  check('üstteki uzayınca p4 kaydı', after.y > before.y, `${before.y} → ${after.y}`);

  // 7. Sürükleyerek sıra: p4'ü seç, p3'ün üstüne sürükle.
  await page.locator(sel(E('p4'))).dblclick();
  const pb = await box(sel(E('p3')));
  const qb = await box(sel(E('p4')));
  let markerSeen = false;
  await dragFrom(qb.x + 40, qb.y + 10, 0, pb.y + 5 - (qb.y + 10), {
    hold: async () => {
      markerSeen = (await page.locator('.insert-marker').count()) === 1;
    },
  });
  check('ekleme çizgisi görünür', markerSeen);
  check('sürükleyerek sıra değişti', (await stackOrder(stack.id)).join() === 'sub-materiality,p4,p3');

  // 8. Ok tuşuyla sıra.
  await page.keyboard.press('ArrowDown');
  check('ok tuşuyla sıra', (await stackOrder(stack.id)).join() === 'sub-materiality,p3,p4');

  // 9. Esc içteki bloktan yığına çıkar; boşluk paneli.
  await page.keyboard.press('Escape');
  check('Esc içteki bloktan yığına çıkar', (await st()).selectedId === stack.id);
  await page.fill('[data-action="stack-gap"]', '2');
  await page.locator('[data-action="stack-gap"]').dispatchEvent('change');
  const g = await st();
  const k3 = g.data.blocks.find((b: any) => b.id === E('p3'));
  const k4 = g.data.blocks.find((b: any) => b.id === E('p4'));
  check('boşluk paneli', g.data.stacks[0].gap === 2 && k4.y - (k3.y + k3.h) === 2);

  // 9b. Yığın genişliği: sağ tutamaç tüm metinleri birlikte daraltır; sol tutamaç x'i kaydırır.
  const texts = async () =>
    (await st()).data.blocks.filter((b: any) => b.stack_id === stack.id).map((b: any) => [b.id.split('/')[1], b.x, b.w, b.h]);
  const t0 = await texts();
  let hb = await box('.selection--handles .handle--e');
  await dragFrom(hb.x + hb.width / 2, hb.y + hb.height / 2, -60, 0, { keys: ['Control'] });
  const t1 = await texts();
  check('sağ tutamaç: hepsi aynı, daha dar genişlik', new Set(t1.map((t: any) => t[2])).size === 1 && t1[0][2] < t0[0][2], JSON.stringify(t1));
  check('daralınca metin uzadı', t1.some((t: any, i: number) => t[3] > t0[i][3]));
  hb = await box('.selection--handles .handle--w');
  const right1 = t1[0][1] + t1[0][2];
  await dragFrom(hb.x + hb.width / 2, hb.y + hb.height / 2, 30, 0, { keys: ['Control'] });
  const t2 = await texts();
  check('sol tutamaç: x kaydı, sağ kenar sabit', t2[0][1] > t1[0][1] && t2.every((t: any) => t[1] + t[2] === right1), JSON.stringify(t2));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  check('undo genişliği geri aldı', JSON.stringify(await texts()) === JSON.stringify(t0));

  // 10. Tepsiden yığına bırakma.
  const target = await box(sel(E('p3')));
  await page.locator('.tray-item[data-id="strange-document/p2"]').scrollIntoViewIfNeeded();
  const tray = await box('.tray-item[data-id="strange-document/p2"]');
  await dragFrom(tray.x + 40, tray.y + 20, target.x + 60 - (tray.x + 40), target.y + target.height - 4 - (tray.y + 20));
  check('tepsiden yığına ekleme', (await stackOrder(stack.id, false)).includes('strange-document/p2'));

  // 11. İçteki bloğu dışarı sürükle.
  await page.locator(sel('strange-document/p2')).dblclick();
  const ob = await box(sel('strange-document/p2'));
  await dragFrom(ob.x + 30, ob.y + 10, 0, -400);
  const out = await blk('strange-document/p2');
  check('dışarı sürükleyince yığından çıktı', out.stack_id === undefined && out.spread_id === 's-tablets', `${out.x},${out.y}`);

  // 12. Alt+Shift+A kaldırır; undo geri getirir.
  await press(E('p3'));
  await page.keyboard.press('Alt+Shift+A');
  check('Alt+Shift+A kaldırdı', ((await st()).data.stacks ?? []).length === 0 && (await st()).selectedIds.length === 3);
  await page.keyboard.press('Control+z');
  check('undo yığını geri getirdi', (await st()).data.stacks.length === 1);

  // 13. Yığın seçiliyken Delete: çocuklar tepsiye.
  await press(E('p3'));
  await page.keyboard.press('Delete');
  s = await st();
  check(
    'Delete yığını tepsiye gönderdi',
    s.data.stacks.length === 0 && [E('p3'), E('p4')].every((id) => s.data.blocks.find((b: any) => b.id === id).spread_id === null),
  );
  await page.keyboard.press('Control+z');

  // 14. Kayıt ve okuma görünümü.
  await page.waitForTimeout(700);
  const saved = issue.read();
  check('kaydedilen dosya geçerli', validate(saved).length === 0, validate(saved).join('; '));
  const stackedInFile = saved.blocks.filter((b: any) => b.stack_id);
  check('dosyada yığın çocuklarının x/y değeri yok', stackedInFile.length > 0 && stackedInFile.every((b: any) => b.x === null && b.y === null), String(stackedInFile.length));
  const ed = await page.evaluate(() =>
    (window as any).__xform.state.data.blocks.filter((b: any) => b.stack_id).map((b: any) => [b.id, b.x, b.y]),
  );
  await page.goto(`index.html?issue=${issue.name}`);
  await page.waitForSelector('body[data-ready]');
  const rd = await page.evaluate(() =>
    (window as any).__xform.data.blocks.filter((b: any) => b.stack_id).map((b: any) => [b.id, b.x, b.y]),
  );
  check('okuma görünümünde aynı yığın yerleşimi', JSON.stringify(ed) === JSON.stringify(rd));
  check('okuma görünümünde yığın/kılavuz çizgisi yok', (await page.locator('.stack-outline, .guide-line, .insert-marker').count()) === 0);

  expect(errors).toEqual([]);
});

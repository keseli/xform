// İçe aktarma ve revizyon: editör açıkken içerik değişip aktarılır (dış değişiklik
// algılanır, yerleşim korunur, yeni/silinen/korunan bloklar), sonra kaydedilmemiş
// yerel değişiklik varken aktarma yazar (çakışma), ardından normal kayıt sürer.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, expect, issueCopy, openEditor, ROOT, test } from './fixtures.ts';

const issue = issueCopy('e2e-import');
let content = '';

test.beforeAll(() => {
  issue.create();
  // İçerik paketlerinin kopyası; manifest bu senaryonun sayısını hedefler.
  content = mkdtempSync(join(tmpdir(), 'xform-e2e-'));
  cpSync(`${ROOT}content`, content, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(content, 'issue-001.json'), 'utf8'));
  writeFileSync(join(content, `${issue.name}.json`), JSON.stringify({ ...manifest, issue: issue.name }, null, 2));
});
test.afterAll(() => {
  issue.remove();
  rmSync(content, { recursive: true, force: true });
  rmSync(`${ROOT}assets/${issue.name}`, { recursive: true, force: true });
});

test('içe aktarma ve revizyon', async ({ page, errors }) => {
  const edit = (slug: string, fn: (a: any) => void) => {
    const file = join(content, slug, 'article.json');
    const a = JSON.parse(readFileSync(file, 'utf8'));
    fn(a);
    writeFileSync(file, JSON.stringify(a, null, 2));
  };
  const runImport = () =>
    execFileSync('node', ['scripts/import.mjs', join(content, `${issue.name}.json`)], { cwd: ROOT, encoding: 'utf8' });
  const st = () =>
    page.evaluate(() => {
      const x = (window as any).__xform;
      return JSON.parse(JSON.stringify({ s: x.state, u: x.store.canUndo }));
    });
  const blk = async (id: string) => (await st()).s.data.blocks.find((b: any) => b.id === id);
  const waitRevision = (r: number, saved = false, timeout = 8000) =>
    page.waitForFunction(
      ([r, saved]) => {
        const s = (window as any).__xform.state;
        return s.revision === r && (!saved || s.saveStatus === 'saved');
      },
      [r, saved] as const,
      { timeout },
    );

  const r0 = issue.read().revision;
  await openEditor(page, issue.name);

  // Editörde geri alınabilir bir değişiklik yap ve kaydedilsin.
  await page.locator('.block[data-id="empire-of-paper/p4"]').click();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(700);
  check('başlangıç kaydı', (await st()).s.revision === r0 + 1, String((await st()).s.revision));

  // İçerik değişir, aktarılır.
  edit('empire-of-paper', (a) => {
    a.blocks.find((b: any) => b.key === 'p1').content = 'In the beginning, there was no bureaucracy — only people.';
    a.blocks = a.blocks.filter((b: any) => b.key !== 'cap-tablet');
  });
  edit('strange-document', (a) => {
    a.blocks = a.blocks.filter((b: any) => b.key !== 'readtime');
    a.blocks.push({ key: 'p3', type: 'text', variant: 'body', content: 'A new closing paragraph.', relates_to: ['p2'] });
  });
  runImport();
  await waitRevision(r0 + 2);
  check('bildirim gösterildi', (await page.locator('.save--notice').count()) === 1);
  check('geri alma geçmişi sıfırlandı', (await st()).u === false);
  check('yeni blok tepside', (await page.locator('.tray-item[data-id="strange-document/p3"]').count()) === 1);
  check('tepsideki silinen blok gitti', !(await blk('strange-document/readtime')));
  const cap = await blk('empire-of-paper/cap-tablet');
  check('yerleşik silinen blok korundu ve işaretlendi', cap?.spread_id === 's-tablets' && cap.removed_from_content === true);
  check('"içerikte yok" uyarısı', (await page.locator('.badge--warn[data-id="empire-of-paper/cap-tablet"]').count()) === 1);
  const p1 = await page.locator('.block[data-id="empire-of-paper/p1"]').textContent();
  check('yerleşik paragrafın metni güncellendi', p1!.includes('only people'));
  check('yerleşim korundu', (await blk('empire-of-paper/p4')).y === 179, String((await blk('empire-of-paper/p4')).y));

  // Çakışma: bekleyen yerel değişiklik varken içe aktarma yazar.
  edit('empire-of-paper', (a) => {
    a.blocks.find((b: any) => b.key === 'p2').content += ' (revised)';
  });
  runImport();
  await page.keyboard.press('ArrowDown'); // p4 hâlâ seçili → 400 ms sonra kayıt 409 alır
  await waitRevision(r0 + 3, true);
  const note = (await page.locator('.save').textContent()) ?? '';
  check('çakışmada güncel sürüm yüklendi, bildirim', note.includes('kaydedilmedi'), note);
  check('yerel değişiklik dosyaya yazılmadı', issue.read().blocks.find((b: any) => b.id === 'empire-of-paper/p4').y === 179);
  check('içe aktarmanın değişikliği duruyor', (await blk('empire-of-paper/p2')).content.endsWith('(revised)'));

  // Sonra normal düzenleme yine kaydedilir.
  await page.keyboard.press('ArrowDown');
  await waitRevision(r0 + 4, false, 4000);
  check('sonraki düzenleme kaydedildi', issue.read().revision === r0 + 4);

  // 409, çakışma adımının kasıtlı sonucu; başka hata olmamalı.
  expect(errors.filter((e) => !e.includes('409 (Conflict)'))).toEqual([]);
});

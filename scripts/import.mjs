// İçerik hattının çıktısını sayıya aktarır. Bağımlılık yok.
//
//   npm run import -- content/issue-001.json [--dry-run]
//
// Manifest: { issue, meta?, articles: [slug, …] }
// Makale:   <manifest klasörü>/<slug>/article.json, görseller aynı klasörde.
// Görseller assets/<issue>/<slug>/ altına kopyalanır; sayı data/<issue>.json'a yazılır.
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { buildIncoming, emptyIssue, mergeIssue } from '../src/content/merge.js';
import { validate } from '../src/model.js';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const manifestPath = args.find((a) => !a.startsWith('--'));

function fail(lines) {
  for (const line of [].concat(lines)) console.error(`  ✗ ${line}`);
  process.exit(1);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw new Error(`${path}: ${err.message}`);
  }
}

async function sameBytes(a, b) {
  try {
    const [x, y] = await Promise.all([readFile(a), readFile(b)]);
    return x.equals(y);
  } catch {
    return false;
  }
}

async function writeAtomic(path, text) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, path);
}

async function main() {
  if (!manifestPath) {
    console.error('Kullanım: npm run import -- content/<issue>.json [--dry-run]');
    process.exit(1);
  }
  const manifest = await readJson(resolve(manifestPath));
  if (!manifest) fail(`${manifestPath} bulunamadı`);
  if (!/^[a-z0-9-]+$/.test(manifest.issue ?? '')) fail('manifest.issue geçersiz (ör. "issue-001")');
  if (!Array.isArray(manifest.articles) || !manifest.articles.length) fail('manifest.articles boş');

  const contentDir = dirname(resolve(manifestPath));
  const articles = [];
  for (const slug of manifest.articles) {
    const article = await readJson(join(contentDir, slug, 'article.json'));
    if (!article) fail(`${slug}/article.json bulunamadı`);
    if (article.slug !== slug) fail(`${slug}/article.json: slug "${article.slug}" klasör adıyla aynı olmalı`);
    articles.push(article);
  }

  const issue = manifest.issue;
  const { blocks, files, errors } = buildIncoming(articles, {
    assetPath: (slug, file) => `assets/${issue}/${slug}/${file}`,
  });
  for (const { slug, file } of files) {
    if ((await readFile(join(contentDir, slug, file)).catch(() => null)) === null) {
      errors.push(`${slug}: görsel dosyası yok: ${file}`);
    }
  }
  if (errors.length) fail(errors);

  const dataPath = join(ROOT, 'data', `${issue}.json`);
  const existing = (await readJson(dataPath)) ?? emptyIssue(manifest, articles[0].section);
  const { data, report } = mergeIssue(existing, blocks);
  const problems = validate(data);
  if (problems.length) fail(problems);

  const copies = [];
  for (const { slug, file } of files) {
    const from = join(contentDir, slug, file);
    const to = join(ROOT, 'assets', issue, slug, file);
    if (!(await sameBytes(from, to))) copies.push({ from, to, name: `${slug}/${file}` });
  }

  const changed = JSON.stringify(data.blocks) !== JSON.stringify(existing.blocks);
  const list = (ids) => (ids.length > 6 ? `${ids.slice(0, 6).join(', ')} … (+${ids.length - 6})` : ids.join(', '));
  console.log(`${issue} ← ${manifestPath} (${articles.length} makale, ${blocks.length} blok)`);
  const rows = [
    ['yeni, tepsiye düştü', report.added],
    ['güncellendi', report.updated],
    ['yalnız sırası kaydı', report.reordered],
    ['  yerleşik, görünümü değişebilir', report.reflow],
    ['silindi (tepsideydi)', report.deleted],
    ['içerikte yok, yerleşik olduğu için korundu', report.kept],
    ['yeni ya da değişen görsel', copies.map((c) => c.name)],
  ];
  for (const [label, ids] of rows) if (ids.length) console.log(`  ${label}: ${ids.length}  ${list(ids)}`);
  console.log(`  değişmedi: ${report.unchanged}`);

  if (!changed && !copies.length) return console.log('  Değişiklik yok, dosya yazılmadı.');
  if (dryRun) return console.log('  --dry-run: hiçbir şey yazılmadı.');

  for (const c of copies) {
    await mkdir(dirname(c.to), { recursive: true });
    await copyFile(c.from, c.to);
  }
  // Bu arada editör kaydettiyse üzerine yazma.
  const now = await readJson(dataPath);
  if ((now?.revision ?? 0) !== (existing.revision ?? 0)) {
    fail('Sayı dosyası içe aktarma sırasında değişti (editör kaydetmiş olabilir). Tekrar çalıştır.');
  }
  const revision = (existing.revision ?? 0) + 1;
  const { revision: _, ...rest } = data;
  await mkdir(dirname(dataPath), { recursive: true });
  await writeAtomic(dataPath, JSON.stringify({ revision, ...rest }, null, 2) + '\n');
  console.log(`  Yazıldı: data/${issue}.json (revision ${existing.revision ?? 0} → ${revision})`);
}

main().catch((err) => fail(err.message));

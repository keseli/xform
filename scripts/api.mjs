// Editörün kayıt uçları; Vite dev sunucusu (vite.config.ts) bunları kullanır.
//   PUT /api/data/<issue>      { revision, ...issue }  →  data/<issue>.json
//   GET /api/revision/<issue>  →  { revision }
// Kayıt yalnız gönderilen revision dosyadakiyle aynıysa yazılır (yoksa 409);
// böylece editör, içe aktarmanın ya da başka bir sekmenin yazdığını ezemez.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MAX_BODY = 5 * 1024 * 1024;
const NAME = /^[a-z0-9-]+$/;

const dataFile = (name) => join(ROOT, 'data', `${name}.json`);

async function currentRevision(name) {
  try {
    return JSON.parse(await readFile(dataFile(name), 'utf8')).revision ?? 0;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Yazmalar sırayla: oku-karşılaştır-yaz adımları birbirine karışmasın.
let writes = Promise.resolve();

async function saveIssue(req, res, name) {
  const body = await readBody(req);
  if (body === null) return json(res, 413, { error: 'çok büyük' });
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return json(res, 400, { error: 'JSON okunamadı' });
  }
  if (!data || !Array.isArray(data.spreads) || !Array.isArray(data.blocks) || !data.issue) {
    return json(res, 400, { error: 'Beklenen yapı: { revision, issue, spreads, blocks }' });
  }
  const run = writes.then(async () => {
    const current = await currentRevision(name);
    if (data.revision !== current) return json(res, 409, { revision: current });
    const { revision: _, ...rest } = data;
    const revision = current + 1;
    const tmp = `${dataFile(name)}.tmp`;
    await writeFile(tmp, JSON.stringify({ revision, ...rest }, null, 2) + '\n');
    await rename(tmp, dataFile(name));
    json(res, 200, { revision });
  });
  writes = run.catch(() => {});
  return run;
}

async function api(req, res, url) {
  const [, , kind, name] = url.pathname.split('/');
  if (!NAME.test(name ?? '')) return json(res, 400, { error: 'Geçersiz ad' });
  if (kind === 'data' && req.method === 'PUT') return saveIssue(req, res, name);
  if (kind === 'revision' && req.method === 'GET') return json(res, 200, { revision: await currentRevision(name) });
  return json(res, 405, { error: 'desteklenmiyor' });
}

/** /api/ altındaki isteği işler; başka yolsa false döner. */
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  await api(req, res, url).catch((err) => {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'sunucu hatası' });
  });
  return true;
}

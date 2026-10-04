// Bağımlılıksız geliştirme sunucusu. ES modülleri ve fetch() file:// altında
// çalışmadığı için gerekli. Editör için iki uç:
//   PUT /api/data/<issue>      { revision, ...issue }  →  data/<issue>.json
//   GET /api/revision/<issue>  →  { revision }
// Kayıt yalnız gönderilen revision dosyadakiyle aynıysa yazılır (yoksa 409);
// böylece editör, içe aktarmanın ya da başka bir sekmenin yazdığını ezemez.
import { createServer } from 'node:http';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

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

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    await api(req, res, url).catch((err) => {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'sunucu hatası' });
    });
    return;
  }
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => {
  console.log(`XFORM → http://localhost:${PORT}`);
});

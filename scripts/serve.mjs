// Bağımlılıksız geliştirme sunucusu. ES modülleri ve fetch() file:// altında
// çalışmadığı için gerekli. Editör kayıtları için tek bir yazma ucu var:
//   PUT /api/data/<issue>  →  data/<issue>.json
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

async function saveIssue(req, res, name) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    res.writeHead(400).end('Geçersiz ad');
    return;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(chunk);
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    res.writeHead(400).end('JSON okunamadı');
    return;
  }
  if (!data || !Array.isArray(data.spreads) || !Array.isArray(data.blocks) || !data.issue) {
    res.writeHead(400).end('Beklenen yapı: { issue, spreads, blocks }');
    return;
  }
  const file = join(ROOT, 'data', `${name}.json`);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await rename(tmp, file);
  res.writeHead(204).end();
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/data/')) {
    if (req.method !== 'PUT') {
      res.writeHead(405).end();
      return;
    }
    await saveIssue(req, res, url.pathname.slice('/api/data/'.length)).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end();
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

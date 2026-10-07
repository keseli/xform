// MCP sunucusu: bir istemci gibi stdio üzerinden bağlanır (node mcp/server.ts),
// okuma araçlarını ve gerçek çizimi (Vite + Chromium) dener.
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { check, ROOT } from './fixtures.ts';

const pngSize = (b64: string) => {
  const buf = Buffer.from(b64, 'base64');
  return { png: buf.toString('ascii', 1, 4) === 'PNG', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

test('MCP: okuma araçları ve çizim', async () => {
  const client = new Client({ name: 'e2e', version: '1' });
  await client.connect(
    new StdioClientTransport({ command: 'node', args: ['mcp/server.ts'], cwd: ROOT, env: process.env as Record<string, string>, stderr: 'inherit' }),
  );
  try {
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: any[]; isError?: boolean };
      expect(r.isError, `${name}: ${r.content[0]?.text}`).toBeFalsy();
      return r.content;
    };

    const [g] = await call('get_guide', {});
    check('kılavuz', g.text.includes('grid 384×256 cells'));
    const issue = JSON.parse((await call('get_issue', { issue: 'issue-sample' }))[0].text);
    check('sayı özeti', issue.spreads.length === 4 && issue.problems.length === 0, JSON.stringify(issue.problems));

    // Okuma görünümü: varsayılan 1200 px, 3:2.
    const [img, info] = await call('render_spread', { issue: 'issue-sample', spread_id: 's-2' });
    const size = pngSize(img.data);
    check('PNG 1200×800', size.png && size.width === 1200 && size.height === 800, JSON.stringify(size));
    const meta = JSON.parse(info.text);
    check('hücre başına piksel', meta.px_per_cell === 3.125, String(meta.px_per_cell));
    const p1 = meta.blocks.find((b: any) => b.id === 'allowance-for-error/p1');
    check('ölçülen yükseklik', p1?.h > 0 && meta.heights_changed === undefined, JSON.stringify([p1, meta.heights_changed]));
    check('uyarılar dizi', Array.isArray(meta.warnings));

    // Bölge: 100×60 hücre, 1000 px → 10 px/hücre.
    const [zoom, zinfo] = await call('render_spread', {
      issue: 'issue-sample',
      spread_id: 's-2',
      region: { x: 200, y: 100, w: 100, h: 60 },
      width: 1000,
    });
    const zs = pngSize(zoom.data);
    check('yakın çizim', zs.width === 1000 && zs.height === 600 && JSON.parse(zinfo.text).px_per_cell === 10, JSON.stringify(zs));

    // Editör görünümü: ızgara ve rozetlerle, dosyaya yazmadan.
    const before = JSON.parse((await call('get_issue', { issue: 'issue-sample' }))[0].text).revision;
    const [ed] = await call('render_spread', { issue: 'issue-sample', spread_id: 's-1', view: 'editor', width: 800 });
    check('editör görünümü', pngSize(ed.data).width === 800);
    const after = JSON.parse((await call('get_issue', { issue: 'issue-sample' }))[0].text).revision;
    check('çizim dosyaya yazmaz', before === after, `${before} → ${after}`);

    const bad = (await client.callTool({ name: 'render_spread', arguments: { issue: 'issue-sample', spread_id: 's-7' } })) as any;
    check('hatalı spread', bad.isError && /Spreads: s-1/.test(bad.content[0].text));
  } finally {
    await client.close();
  }
});

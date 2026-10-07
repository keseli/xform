// XFORM MCP sunucusu (stdio): bir modelin editörü arayüzsüz kullanması için
// araçlar. İşleyiciler mcp/read.ts'te; burası yalnız araç tanımları.
// Çalıştırma: npm run --silent mcp  (ya da node mcp/server.ts)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as z from 'zod';
import { COLS, ROWS } from '../src/config.ts';
import { formatJson } from './format.ts';
import { guide } from './guide.ts';
import { readIssue, ROOT, ToolError } from './issues.ts';
import { getIssue, getSpread, listTemplates, listTray, MAX_WIDTH, renderSpread, type SpreadRenderer } from './read.ts';
import { Renderer } from './render.ts';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type Result = { content: Content[]; isError?: boolean };

const text = (value: unknown): Content => ({
  type: 'text',
  text: typeof value === 'string' ? value : formatJson(value),
});

/** ToolError ve beklenmeyen hatalar modelin okuyacağı bir mesajla döner. */
async function run(fn: () => Promise<Result> | Result): Promise<Result> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof ToolError ? err.message : `Internal error: ${(err as Error).message}`;
    return { isError: true, content: [text(message)] };
  }
}

const issueArg = z
  .string()
  .describe('Issue or draft name, e.g. "issue-sample" or a draft like "issue-sample--s2" (see get_guide).');
const READ = { readOnlyHint: true, openWorldHint: false } as const;

export function createServer(root = ROOT, renderer: SpreadRenderer = new Renderer(root)) {
  const server = new McpServer({ name: 'xform', version: '1.0.0' });

  server.registerTool(
    'get_guide',
    {
      description:
        'Read first when starting cold: grid size, margins, content areas, styles and their sizes, palette, layout rules, issues and templates. All positions are in cells.',
      inputSchema: { issue: issueArg.optional().describe('Include this issue’s palette.') },
      annotations: READ,
    },
    ({ issue }) => run(() => ({ content: [text(guide(root, issue ? readIssue(root, issue) : undefined))] })),
  );

  server.registerTool(
    'get_issue',
    {
      description:
        'Get an overview of an issue before planning: spreads (pages, section, chrome, theme, counts), articles, tray size and validation problems.',
      inputSchema: { issue: issueArg },
      annotations: READ,
    },
    (args) => run(() => ({ content: [text(getIssue(root, args))] })),
  );

  server.registerTool(
    'list_tray',
    {
      description:
        'List unplaced blocks in reading order to choose what to place: id, kind, opening text, relates_to; images with pixel size and ratio.',
      inputSchema: { issue: issueArg, slug: z.string().optional().describe('Only this article (block ids are "<slug>/<key>").') },
      annotations: READ,
    },
    (args) => run(() => ({ content: [text(listTray(root, args))] })),
  );

  server.registerTool(
    'get_spread',
    {
      description:
        'Get everything on one spread before editing it: spread settings, blocks with positions and appearance, stacks, slots and warnings.',
      inputSchema: { issue: issueArg, spread_id: z.string().describe('Spread id, e.g. "s-2".') },
      annotations: READ,
    },
    (args) => run(() => ({ content: [text(getSpread(root, args))] })),
  );

  server.registerTool(
    'list_templates',
    {
      description:
        'List spread templates to pick a starting skeleton (slots, empty text columns, boxes). Pass key to get one template in full.',
      inputSchema: { key: z.string().optional().describe('Template key from the list, e.g. "okuma-sayfasi".') },
      annotations: READ,
    },
    (args) => run(() => ({ content: [text(listTemplates(root, args))] })),
  );

  server.registerTool(
    'render_spread',
    {
      description:
        'See a spread: a PNG of the reading view (or the editor view with grid, order badges, slots and stacks) plus freshly measured text heights, block positions and warnings. Use after edits; zoom into a region (cells) to check details.',
      inputSchema: {
        issue: issueArg,
        spread_id: z.string(),
        view: z.enum(['read', 'editor']).optional().describe('read (default): as printed. editor: grid, badges, slots and stack outlines.'),
        region: z
          .object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int() })
          .optional()
          .describe(`Area to draw, in cells (frame ${COLS}×${ROWS}). Default: the whole spread.`),
        width: z.number().int().optional().describe(`Image width in px, 200–${MAX_WIDTH} (default 1200).`),
      },
      annotations: READ,
    },
    (args) =>
      run(async () => {
        const { png, info } = await renderSpread(root, renderer, args);
        return { content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }, text(info)] };
      }),
  );

  return server;
}

// Doğrudan çalıştırıldığında stdio'ya bağlan.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  // stdout yalnız protokole ait: kütüphanelerin logları stderr'e.
  console.log = console.error;
  console.info = console.error;
  const renderer = new Renderer(ROOT);
  const server = createServer(ROOT, renderer);
  const close = async () => {
    await renderer.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  process.stdin.on('close', close);
  await server.connect(new StdioServerTransport());
}

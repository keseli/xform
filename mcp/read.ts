// Okuma araçlarının işleyicileri: SDK'dan bağımsız, düz nesne döner.
// Sayıyı her çağrıda dosyadan taze okur.
import { join } from 'node:path';
import { COLS, FLOW_TYPES, ROWS } from '../src/config.ts';
import { LAYOUT_ONLY, blocksOnSpread, pageNumbers, unplacedBlocks, validate } from '../src/model.ts';
import { childrenOf, stackBounds, toFileForm } from '../src/stacks.ts';
import { paletteOf } from '../src/style.ts';
import { slotsOn } from '../src/templates.ts';
import { snippet } from '../src/editor/labels.ts';
import { computeWarnings } from '../src/editor/warnings.ts';
import type { Block, Issue, Template } from '../src/types.ts';
import { imageSize } from './imagesize.ts';
import { readIssue, readTemplates, ToolError } from './issues.ts';

const slugOf = (id: string) => (id.includes('/') ? id.slice(0, id.indexOf('/')) : null);
const kind = (b: Pick<Block, 'type' | 'variant'>) => (b.variant ? `${b.type}/${b.variant}` : b.type);

export function findSpread(data: Issue, spreadId: string) {
  const index = data.spreads.findIndex((s) => s.id === spreadId);
  if (index < 0) {
    throw new ToolError(`Spread "${spreadId}" not found. Spreads: ${data.spreads.map((s) => s.id).join(', ')}.`);
  }
  return { spread: data.spreads[index], index };
}

/** Bir spread'in uyarıları: blok başına { block, kind, message }. */
export function spreadWarnings(data: Issue, spreadId: string) {
  const onSpread = new Set(blocksOnSpread(data.blocks, spreadId).map((b) => b.id));
  return [...computeWarnings(data)]
    .filter(([id]) => onSpread.has(id))
    .flatMap(([id, list]) => list.map((w) => ({ block: id, kind: w.kind, message: w.message })));
}

export function getIssue(root: string, args: { issue: string }) {
  const data = readIssue(root, args.issue);
  const articles = new Map<string, { slug: string; blocks: number; placed: number; in_tray: number }>();
  for (const b of data.blocks) {
    const slug = slugOf(b.id);
    if (!slug) continue;
    const a = articles.get(slug) ?? { slug, blocks: 0, placed: 0, in_tray: 0 };
    a.blocks++;
    if (b.spread_id != null) a.placed++;
    else a.in_tray++;
    articles.set(slug, a);
  }
  return {
    issue: args.issue,
    revision: data.revision ?? 0,
    meta: data.issue,
    palette: paletteOf(data),
    spreads: data.spreads.map((s, i) => {
      const blocks = blocksOnSpread(data.blocks, s.id);
      return {
        id: s.id,
        pages: Object.values(pageNumbers(data.issue, i)),
        section: s.section,
        chrome: [s.chrome_left, s.chrome_right],
        theme: [s.theme_left ?? 'paper', s.theme_right ?? 'paper'],
        blocks: blocks.filter((b) => !LAYOUT_ONLY.has(b.type)).length,
        boxes: blocks.filter((b) => b.type === 'box').length,
        stacks: (data.stacks ?? []).filter((x) => x.spread_id === s.id).length,
        slots: slotsOn(data, s.id).length,
      };
    }),
    articles: [...articles.values()],
    tray: unplacedBlocks(data.blocks).length,
    problems: validate(toFileForm(data)),
  };
}

export function listTray(root: string, args: { issue: string; slug?: string }) {
  const data = readIssue(root, args.issue);
  const blocks = unplacedBlocks(data.blocks).filter((b) => !args.slug || slugOf(b.id) === args.slug);
  if (args.slug && !blocks.length && !data.blocks.some((b) => slugOf(b.id) === args.slug)) {
    const slugs = [...new Set(data.blocks.map((b) => slugOf(b.id)).filter(Boolean))];
    throw new ToolError(`Article "${args.slug}" not found. Articles: ${slugs.join(', ')}.`);
  }
  return {
    count: blocks.length,
    blocks: blocks.map((b) => {
      const size = b.type === 'image' && b.source ? imageSize(join(root, b.source)) : null;
      return {
        id: b.id,
        order: b.order,
        kind: kind(b),
        ...(b.label ? { label: b.label } : {}),
        text: snippet(b, 100),
        relates_to: b.relates_to,
        ...(b.type === 'image'
          ? {
              image: size
                ? { file: b.source, width: size.width, height: size.height, ratio: +(size.width / size.height).toFixed(3) }
                : { file: b.source ?? null },
            }
          : {}),
      };
    }),
  };
}

export function getSpread(root: string, args: { issue: string; spread_id: string }) {
  const data = readIssue(root, args.issue);
  const { spread, index } = findSpread(data, args.spread_id);
  const stacks = (data.stacks ?? []).filter((s) => s.spread_id === spread.id);
  return {
    spread: {
      ...spread,
      theme_left: spread.theme_left ?? 'paper',
      theme_right: spread.theme_right ?? 'paper',
      index,
      pages: Object.values(pageNumbers(data.issue, index)),
    },
    blocks: blocksOnSpread(data.blocks, spread.id).map((b) => ({
      id: b.id,
      kind: kind(b),
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      z: b.z,
      ...(b.stack_id != null ? { stack: b.stack_id, stack_index: b.stack_index } : {}),
      tone: b.tone,
      ...pick(b, ['color', 'drop_cap', 'treatment', 'focal_point', 'fill', 'opacity']),
      ...(b.type === 'box' ? {} : { text: snippet(b, 60) }),
    })),
    stacks: stacks.map((s) => ({
      ...s,
      bounds: stackBounds(data, s),
      children: childrenOf(data, s.id).map((b) => b.id),
    })),
    slots: slotsOn(data, spread.id),
    warnings: spreadWarnings(data, spread.id),
    note: 'Text heights are the last measured values; render_spread measures them fresh.',
  };
}

function pick<T extends object>(o: T, keys: (keyof T)[]) {
  return Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));
}

const rect = (r: { x: number; y: number; w: number; h: number }) => `@${r.x},${r.y} ${r.w}×${r.h}`;

function templateSummary(key: string, t: Template) {
  return {
    key,
    name: t.name,
    chrome: [t.chrome_left, t.chrome_right],
    theme: [t.theme_left ?? 'paper', t.theme_right ?? 'paper'],
    slots: t.slots.map((s) => `${kind({ type: s.accepts.type, variant: s.accepts.variant ?? null })} ${rect(s)}`),
    stacks: t.stacks.map((s) => `${s.direction} column ${rect(s)} gap ${s.gap}`),
    boxes: (t.boxes ?? []).map((b) => `${b.fill} ${rect(b)}`),
  };
}

export function listTemplates(root: string, args: { key?: string }) {
  const all = readTemplates(root);
  if (args.key == null) return { templates: all.map(({ key, template }) => templateSummary(key, template)) };
  const found = all.find((t) => t.key === args.key);
  if (!found) throw new ToolError(`Template "${args.key}" not found. Keys: ${all.map((t) => t.key).join(', ')}.`);
  return { key: found.key, template: found.template };
}

// ---------- render_spread ----------

/** Çizici arayüzü (mcp/render.ts); testler sahtesini verir. */
export interface SpreadRenderer {
  render(req: {
    name: string;
    data: Issue;
    spreadId: string;
    view: 'read' | 'editor';
    region: { x: number; y: number; w: number; h: number };
    width: number;
  }): Promise<{ png: Buffer; pxPerCell: number; data: Issue }>;
}

export interface RenderArgs {
  issue: string;
  spread_id: string;
  view?: 'read' | 'editor';
  region?: { x: number; y: number; w: number; h: number };
  width?: number;
}

export const MAX_WIDTH = 2000;

export async function renderSpread(root: string, renderer: SpreadRenderer, args: RenderArgs) {
  const data = readIssue(root, args.issue);
  const { spread } = findSpread(data, args.spread_id);
  const region = args.region ?? { x: 0, y: 0, w: COLS, h: ROWS };
  const { x, y, w, h } = region;
  if (![x, y, w, h].every(Number.isInteger) || w < 1 || h < 1 || x < 0 || y < 0 || x + w > COLS || y + h > ROWS) {
    throw new ToolError(
      `Region ${JSON.stringify(region)} is outside the frame: use whole cells with 0 ≤ x, x + w ≤ ${COLS}, 0 ≤ y, y + h ≤ ${ROWS}.`,
    );
  }
  const width = args.width ?? 1200;
  if (!Number.isInteger(width) || width < 200 || width > MAX_WIDTH) {
    throw new ToolError(`width must be an integer between 200 and ${MAX_WIDTH} px (got ${args.width}).`);
  }
  const before = new Map(data.blocks.map((b) => [b.id, b.h]));
  const out = await renderer.render({ name: args.issue, data, spreadId: spread.id, view: args.view ?? 'read', region, width });
  const placed = blocksOnSpread(out.data.blocks, spread.id);
  const heights = Object.fromEntries(placed.filter((b) => FLOW_TYPES.has(b.type)).map((b) => [b.id, b.h]));
  const changed = Object.keys(heights).filter((id) => before.get(id) !== heights[id]);
  return {
    png: out.png,
    info: {
      spread_id: spread.id,
      view: args.view ?? 'read',
      region,
      px_per_cell: +out.pxPerCell.toFixed(3),
      ...(changed.length ? { heights_changed: changed.map((id) => `${id}: ${before.get(id)} → ${heights[id]}`) } : {}),
      // Ölçümden sonraki konumlar; akış bloklarının h'si taze ölçüm.
      blocks: placed.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
      warnings: spreadWarnings(out.data, spread.id),
    },
  };
}

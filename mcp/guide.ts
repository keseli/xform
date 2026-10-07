// get_guide: soğuk başlayan bir modelin önce okuduğu kılavuz. Ölçüler koddan
// (src/config.ts, src/model.ts, src/style.ts, geometri) ve styles/main.css
// token'larından üretilir; elle yazılmış sayı yok.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CELL, COLS, FRAME, KEEP_IN_FRAME, MARGINS, PAGE_COLS, ROWS } from '../src/config.ts';
import { defaultWidth } from '../src/editor/geometry.ts';
import { VARIANTS } from '../src/model.ts';
import { colorsFor, paletteOf, SUBHEAD_AFTER, SUBHEAD_BEFORE, THEMES, TREATMENTS } from '../src/style.ts';
import type { BlockType, Issue, Variant } from '../src/types.ts';
import { listIssues, readTemplates } from './issues.ts';

/** Variant → font ve CSS token adı (styles/main.css :root). */
const STYLES: { type: BlockType; variant: Variant | null; token: string; font: string }[] = [
  { type: 'heading', variant: 'title', token: 'title', font: 'Literata, tight tracking' },
  { type: 'heading', variant: 'kicker', token: 'kicker', font: 'Geist, uppercase, wide tracking; accent color' },
  { type: 'heading', variant: 'subhead', token: 'subhead', font: 'Geist semibold, uppercase, tracked' },
  { type: 'text', variant: 'deck', token: 'deck', font: 'Literata italic' },
  { type: 'text', variant: 'body', token: 'body', font: 'Literata, ragged right, old-style figures, 1em first-line indent' },
  { type: 'text', variant: 'caption', token: 'caption', font: 'Literata; label above in accent; image credit appended' },
  { type: 'quote', variant: null, token: 'quote', font: 'Literata italic, hanging quote mark' },
  { type: 'quote', variant: 'pull', token: 'pull', font: 'Literata italic, large; place between columns' },
  { type: 'note', variant: null, token: 'note', font: 'Literata; label hangs left in accent' },
];

function cssTokens(root: string): Record<string, string> {
  const css = readFileSync(join(root, 'styles', 'main.css'), 'utf8');
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const px = (v: string | undefined) => (v ? parseFloat(v) : NaN);

export function guide(root: string, data?: Issue): string {
  const t = cssTokens(root);
  const palette = paletteOf(data ?? {});
  const contentLeft = { x: MARGINS.outer, w: PAGE_COLS - MARGINS.outer - MARGINS.inner };
  const contentRight = { x: PAGE_COLS + MARGINS.inner, w: PAGE_COLS - MARGINS.inner - MARGINS.outer };
  const top = MARGINS.top;
  const bottom = ROWS - MARGINS.bottom;
  const issues = listIssues(root);
  const drafts = issues.filter((n) => n.includes('--'));

  const styleRows = STYLES.map(({ type, variant, token, font }) => {
    const size = px(t[`size-${token}`]);
    const lh = px(t[`lh-${token}`]);
    return `| ${type}${variant ? `/${variant}` : ''} | ${font} | ${size}/${lh} | ${lh / CELL} | ${defaultWidth({ type, variant })} |`;
  });
  const variantRows = (Object.keys(VARIANTS) as BlockType[]).map(
    (type) => `- ${type}: ${VARIANTS[type].map((v) => v ?? '(none)').join(', ')}`,
  );
  const templates = readTemplates(root).map(({ key, template }) => `${key} (${template.name})`);

  return `# XFORM layout guide

Read this first. All positions and sizes are in **cells**; x counts from the spread's left edge.

## Grid
- Frame ${FRAME.width}×${FRAME.height} design px (two pages side by side); cell = ${CELL} px → grid ${COLS}×${ROWS} cells.
- Left page x 0–${PAGE_COLS - 1}, right page x ${PAGE_COLS}–${COLS - 1}; the fold is at x ${PAGE_COLS}.
- Margins per page (cells): top ${MARGINS.top}, bottom ${MARGINS.bottom}, outer ${MARGINS.outer}, inner (fold side) ${MARGINS.inner}. They are guides, not limits.
- Content area: left page x ${contentLeft.x}–${contentLeft.x + contentLeft.w} (w ${contentLeft.w}), right page x ${contentRight.x}–${contentRight.x + contentRight.w} (w ${contentRight.w}); y ${top}–${bottom} (h ${bottom - top}).
- Full-bleed: an image may cover a whole page (0,0,${PAGE_COLS},${ROWS}) or the spread; turn that page's chrome off.
- A block may overhang the frame, but at least ${KEEP_IN_FRAME} cells of it stay inside on each axis.
- Chrome (running header) sits in the top margin at y 8–14 when chrome_left/right is "full"; "none" hides it.
- Text heights are measured from content (rounded up to whole cells); stored h is a cache. render_spread returns fresh heights.

## Styles
Sizes are design px (font/line). Rows per line = line height in cells. Default width = width given when placing without w.

| type/variant | font | size/line | cells per line | default w |
| --- | --- | --- | --- | --- |
${styleRows.join('\n')}

Body text: a ${contentLeft.w}-cell page fits two ${(contentLeft.w - 8) / 2}-cell columns with an 8-cell gutter (about 50 characters per line).

Variants per type (variant is part of appearance and may be changed):
${variantRows.join('\n')}
- box: a colored rectangle (layout only, never in the tray).

## Color
- Palette (read-only): ${Object.entries(palette).map(([k, v]) => `${k} ${v}`).join(', ')}.
- Page themes (theme_left / theme_right): ${THEMES.join(', ')}. A block takes the theme of the page its left edge is on.
- Text color: ${colorsFor('text').join(', ')} (divider: ${colorsFor('divider').join(', ')}). Kicker, caption and note labels default to accent.
- tone: dark | light. Use light for text placed over a dark image.
- Image treatment: ${TREATMENTS.join(', ')} (duotone maps to palette ink and paper; multiply blends a light background into the paper).
- Box fill: a palette name; opacity 0–1.

## Layout rules
- Stacks (auto layout) position their blocks: one after another along the direction, aligned to the stack's start on the cross axis. A stack is anchored at its top-left (x, y).
- In a vertical stack: body → body has no gap; a subhead gets ${SUBHEAD_BEFORE} cells above and ${SUBHEAD_AFTER} below; other pairs use the stack's gap.
- A body paragraph is indented when the previous prose block of the same article (images, captions, notes and quotes skipped) is a body paragraph; the first paragraph after a title, deck or subhead is not. drop_cap (body only) gives a three-line initial and no indent.
- An image's credit is printed at the end of its caption (or the note in its relates_to); place captions near their image.
- A stack with a placeholder area (w, h) is a text column: it stays when empty and a text block entering it takes its width.
- Slots (from templates) accept one type/variant; a block filling a slot takes its position, width, z and tone (images also its height).
- Warnings never block: order (a later block on an earlier spread), relation (none of relates_to on the same spread), overflow (outside the frame), removed (gone from content).
- Read-only: text, image files, order, relates_to. Only layout and appearance fields can change.

## Data
- Issues: ${issues.filter((n) => !n.includes('--')).join(', ') || '—'}${drafts.length ? `; drafts: ${drafts.join(', ')}` : ''}.
- Templates: ${templates.join(', ') || '—'}.
- Block ids are "<article slug>/<key>". Spread ids look like "s-2".

## Workflow
1. get_issue → list_tray → list_templates.
2. get_spread to see what is on a spread; render_spread to see it.
3. Read the rendered image and the measured heights before adjusting; zoom with region when details matter.
`;
}

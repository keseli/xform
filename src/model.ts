// Veri modeli. Dosya biçimi: data/<issue>.json — tipler src/types.ts'te.
//
// {
//   revision: number                                   // her yazmada +1 (scripts/api.mjs, scripts/import.mjs)
//   issue:   { title, month, year, number, first_page }
//   spreads: [{ id, section, chrome_left, chrome_right }]   // dizideki sıra = spread sırası
//   blocks:  [Block]
//   stacks:  [{ id, spread_id, direction, x, y, gap, w?, h? }]  // auto layout (src/stacks.ts), isteğe bağlı
//   slots:   [{ id, spread_id, x, y, w, h, z, tone, accepts: { type, variant? } }]  // src/templates.ts, isteğe bağlı
//   palette: { paper, ink, muted, accent, accent-soft }      // hex; src/style.ts, isteğe bağlı
// }
import { colorsFor, isHex, PALETTE_NAMES, THEMES, TREATMENTS } from './style.ts';
import type { Block, BlockType, Issue, IssueMeta, PlacedBlock, Slot, Stack, Variant } from './types.ts';

export const VARIANTS: Record<BlockType, (Variant | null)[]> = {
  heading: ['title', 'subhead', 'kicker'],
  text: ['body', 'deck', 'caption'],
  image: [null],
  quote: [null, 'pull'],
  note: [null],
  divider: [null],
  box: [null],
};

/** Editörde oluşturulan, içerik paketinden gelmeyen blok tipleri (tepsiye gitmez). */
export const LAYOUT_ONLY = new Set<BlockType>(['box']);

const POSITION_KEYS = ['spread_id', 'x', 'y', 'w', 'h', 'z'] as const;

export function isPlaced(block: Block): block is PlacedBlock {
  return block.spread_id != null;
}

export function blocksOnSpread(blocks: Block[], spreadId: string | null): PlacedBlock[] {
  return (blocks.filter((b) => b.spread_id === spreadId) as PlacedBlock[]).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

export function unplacedBlocks(blocks: Block[]): Block[] {
  return blocks.filter((b) => !isPlaced(b) && !LAYOUT_ONLY.has(b.type)).sort((a, b) => a.order - b.order);
}

export function pageNumbers(issue: IssueMeta, spreadIndex: number) {
  const left = issue.first_page + spreadIndex * 2;
  return { left, right: left + 1 };
}

const isSize = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

/** Slot alanlarının denetimi (sayı dosyasında ve şablonda ortak). */
export function slotProblems(s: Omit<Slot, 'id' | 'spread_id'>, where: string): string[] {
  const out: string[] = [];
  if (![s.x, s.y, s.z].every(Number.isInteger) || !isSize(s.w) || !isSize(s.h)) {
    out.push(`${where}: x, y, z tam sayı; w, h pozitif tam sayı olmalı`);
  }
  if (!['dark', 'light'].includes(s.tone)) out.push(`${where}: tone geçersiz`);
  const type = s.accepts?.type as BlockType;
  if (!(type in VARIANTS)) out.push(`${where}: bilinmeyen tür ${type}`);
  else if (s.accepts.variant != null && !VARIANTS[type].includes(s.accepts.variant)) {
    out.push(`${where}: ${type} için geçersiz variant ${s.accepts.variant}`);
  }
  return out;
}

/** Veri tutarlılığını kontrol eder; engellemez, sorun listesi döner. */
export function validate(data: Issue): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const spreadIds = new Set(data.spreads.map((s) => s.id));

  for (const s of data.spreads) {
    for (const key of ['chrome_left', 'chrome_right'] as const) {
      if (!['full', 'none'].includes(s[key])) problems.push(`spread ${s.id}: ${key} geçersiz`);
    }
    for (const key of ['theme_left', 'theme_right'] as const) {
      if (s[key] != null && !THEMES.includes(s[key])) problems.push(`spread ${s.id}: ${key} geçersiz (${s[key]})`);
    }
  }
  for (const [name, value] of Object.entries(data.palette ?? {})) {
    if (!PALETTE_NAMES.includes(name as never)) problems.push(`palette: bilinmeyen ad ${name}`);
    else if (!isHex(value)) problems.push(`palette.${name}: #rrggbb olmalı (${value})`);
  }

  for (const b of data.blocks) {
    if (ids.has(b.id)) problems.push(`yinelenen id: ${b.id}`);
    ids.add(b.id);

    if (!(b.type in VARIANTS)) {
      problems.push(`${b.id}: bilinmeyen tip ${b.type}`);
      continue;
    }
    if (!VARIANTS[b.type].includes(b.variant ?? null)) {
      problems.push(`${b.id}: ${b.type} için geçersiz variant ${b.variant}`);
    }
    if (!['dark', 'light'].includes(b.tone)) problems.push(`${b.id}: tone geçersiz`);
    if (b.color != null && !colorsFor(b.type).includes(b.color)) problems.push(`${b.id}: ${b.type} için geçersiz color ${b.color}`);
    if (b.drop_cap && !(b.type === 'text' && b.variant === 'body')) problems.push(`${b.id}: drop_cap yalnız gövde paragrafında`);
    if (b.treatment != null && (b.type !== 'image' || !TREATMENTS.includes(b.treatment))) {
      problems.push(`${b.id}: treatment geçersiz (${b.treatment})`);
    }
    if (b.type === 'box') {
      if (!PALETTE_NAMES.includes(b.fill as never)) problems.push(`${b.id}: kutunun fill'i palet adı olmalı (${b.fill})`);
      if (b.opacity != null && !(b.opacity >= 0 && b.opacity <= 1)) problems.push(`${b.id}: opacity 0–1 olmalı`);
      if (b.spread_id == null) problems.push(`${b.id}: kutu yerleşik olmalı (tepsiye gitmez)`);
    }

    // Yığındaki bloğun x/y'si yığından türetilir ve dosyada saklanmaz.
    const keys = b.stack_id != null ? POSITION_KEYS.filter((k) => k !== 'x' && k !== 'y') : POSITION_KEYS;
    const set = keys.filter((k) => b[k] != null);
    if (set.length && set.length !== keys.length) {
      problems.push(`${b.id}: konum alanları kısmen dolu (${set.join(', ')})`);
    }
    if (b.stack_id != null && (b.x != null || b.y != null)) {
      problems.push(`${b.id}: yığındaki bloğun x/y'si dosyada olmamalı (yığından türetilir)`);
    }
    if (b.spread_id != null && !spreadIds.has(b.spread_id)) {
      problems.push(`${b.id}: bilinmeyen spread ${b.spread_id}`);
    }
  }

  const stacks = new Map<string, Stack>((data.stacks ?? []).map((s) => [s.id, s]));
  for (const s of stacks.values()) {
    if (!spreadIds.has(s.spread_id)) problems.push(`yığın ${s.id}: bilinmeyen spread ${s.spread_id}`);
    if (!['vertical', 'horizontal'].includes(s.direction)) problems.push(`yığın ${s.id}: direction geçersiz`);
    if (!Number.isInteger(s.gap) || s.gap < 0) problems.push(`yığın ${s.id}: gap 0 ya da pozitif tam sayı olmalı`);
    if ((s.w != null || s.h != null) && !(isSize(s.w) && isSize(s.h))) {
      problems.push(`yığın ${s.id}: yer tutucu w ve h birlikte, pozitif tam sayı olmalı`);
    }
  }

  const slotIds = new Set<string>();
  for (const s of data.slots ?? []) {
    if (slotIds.has(s.id) || ids.has(s.id)) problems.push(`yinelenen id: ${s.id}`);
    slotIds.add(s.id);
    if (!spreadIds.has(s.spread_id)) problems.push(`slot ${s.id}: bilinmeyen spread ${s.spread_id}`);
    problems.push(...slotProblems(s, `slot ${s.id}`));
  }
  for (const b of data.blocks) {
    if (b.stack_id == null) continue;
    const s = stacks.get(b.stack_id);
    if (!s) problems.push(`${b.id}: bilinmeyen yığın ${b.stack_id}`);
    else if (b.spread_id !== s.spread_id) problems.push(`${b.id}: yığınıyla aynı spread'de değil`);
    if (!Number.isInteger(b.stack_index)) problems.push(`${b.id}: stack_index eksik`);
  }

  const byId = new Map(data.blocks.map((b) => [b.id, b]));
  for (const b of data.blocks) {
    for (const rel of b.relates_to ?? []) {
      if (!byId.has(rel)) problems.push(`${b.id}: relates_to bilinmeyen id ${rel}`);
    }
    if (b.type === 'text' && b.variant === 'caption') {
      const images = (b.relates_to ?? []).filter((id) => byId.get(id)?.type === 'image');
      if (!images.length) problems.push(`${b.id}: caption bir görsele bağlı değil`);
    }
  }

  return problems;
}

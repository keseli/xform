// İçerik paketlerini sayının blok listesiyle birleştirir. Dosya sistemine
// dokunmaz; okuma/yazma ve görsel kopyalama scripts/import.mjs'te.
//
// Kurallar:
// - id = "<slug>/<key>"; relates_to key'leri aynı makaleye göre çözülür,
//   "/" içeren değerler tam id kabul edilir.
// - order baştan hesaplanır: manifest'teki makale sırası, sonra makale içindeki sıra.
// - Hattan gelen alanlar güncellenir; yerleşim alanları (yığın üyeliği dahil) ve
//   tone editöre aittir.
//   focal_point yalnız yeni görsellerde hattan alınır.
// - Paketten çıkan blok tepsideyse silinir; yerleşikse korunur ve
//   removed_from_content ile işaretlenir.
import { VARIANTS } from '../model.ts';
import type { Block, BlockType, FocalPoint, Issue, IssueMeta, Variant } from '../types.ts';

const KEY = /^[a-z0-9][a-z0-9-]*$/;
const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const LAYOUT_KEYS = ['spread_id', 'x', 'y', 'w', 'h', 'z'] as const;
const IMAGE_KEYS = ['source', 'credit', 'alt'] as const;
const DEFAULT_FOCAL: FocalPoint = { x: 0.5, y: 0.5 };

/** Paketteki blok (article.json). */
export interface PackageBlock {
  key?: string;
  type: BlockType;
  variant?: Variant | null;
  content?: string;
  label?: string | null;
  relates_to?: string[];
  file?: string | null;
  alt?: string | null;
  credit?: string | null;
  focal_point?: FocalPoint;
}

export interface Article {
  slug: string;
  section?: string;
  blocks: PackageBlock[];
}

export interface Manifest {
  issue: string;
  meta?: IssueMeta;
  articles: string[];
}

/** Paketten gelen, henüz yerleşim alanı olmayan blok. */
export type IncomingBlock = Pick<Block, 'id' | 'type' | 'variant' | 'content' | 'order' | 'relates_to'> &
  Pick<Block, 'label' | 'focal_point' | 'source' | 'credit' | 'alt'>;

export interface MergeReport {
  added: string[];
  updated: string[];
  reordered: string[];
  reflow: string[];
  deleted: string[];
  kept: string[];
  unchanged: number;
}

/**
 * Manifest sırasındaki makalelerden gelen blokları üretir.
 */
export function buildIncoming(
  articles: Article[],
  { assetPath }: { assetPath: (slug: string, file: string) => string },
): { blocks: IncomingBlock[]; files: { slug: string; file: string }[]; errors: string[] } {
  const errors: string[] = [];
  const blocks: IncomingBlock[] = [];
  const files: { slug: string; file: string }[] = [];
  const ids = new Set<string>();
  let order = 0;

  for (const article of articles) {
    if (!KEY.test(article.slug ?? '')) {
      errors.push(`geçersiz slug: ${article.slug}`);
      continue;
    }
    if (!Array.isArray(article.blocks)) {
      errors.push(`${article.slug}: blocks dizisi yok`);
      continue;
    }
    article.blocks.forEach((src, i) => {
      const where = `${article.slug} #${i + 1} (${src.key ?? 'key yok'})`;
      if (!KEY.test(src.key ?? '')) return errors.push(`${where}: key yalnız küçük harf, rakam ve - içerebilir`);
      const id = `${article.slug}/${src.key}`;
      if (ids.has(id)) return errors.push(`${where}: yinelenen key`);
      ids.add(id);
      if (!(src.type in VARIANTS)) return errors.push(`${where}: bilinmeyen tip ${src.type}`);
      const variant = src.variant ?? null;
      if (!VARIANTS[src.type].includes(variant)) {
        return errors.push(`${where}: ${src.type} için geçersiz variant ${variant}`);
      }

      const block: IncomingBlock = {
        id,
        type: src.type,
        variant,
        content: null,
        order: ++order,
        relates_to: (src.relates_to ?? []).map((r) => (r.includes('/') ? r : `${article.slug}/${r}`)),
        label: src.label ?? null,
      };
      if (src.type === 'image') {
        if (src.file != null && !FILE.test(src.file)) return errors.push(`${where}: geçersiz dosya adı ${src.file}`);
        block.focal_point = src.focal_point ?? DEFAULT_FOCAL;
        block.source = src.file ? assetPath(article.slug, src.file) : null;
        block.credit = src.credit ?? null;
        block.alt = src.alt ?? null;
        if (src.file) files.push({ slug: article.slug, file: src.file });
      } else if (src.type !== 'divider') {
        if (typeof src.content !== 'string' || !src.content.trim()) return errors.push(`${where}: content boş`);
        block.content = src.content;
      }
      blocks.push(block);
    });
  }

  for (const b of blocks) {
    for (const r of b.relates_to) {
      if (!ids.has(r)) errors.push(`${b.id}: relates_to çözülemedi: ${r}`);
      if (r === b.id) errors.push(`${b.id}: kendisiyle ilişkili olamaz`);
    }
  }
  return { blocks, files, errors };
}

/** Bloğu sabit alan sırasıyla yeniden kurar (dosyada okunur, karşılaştırılabilir kalsın). */
export function normalizeBlock(b: Partial<Block> & IncomingBlock): Block {
  const out = {
    id: b.id,
    type: b.type,
    variant: b.variant ?? null,
    content: b.type === 'image' ? null : (b.content ?? null),
    order: b.order,
    relates_to: b.relates_to ?? [],
  } as Block;
  for (const k of LAYOUT_KEYS) (out as unknown as Record<string, unknown>)[k] = b[k] ?? null;
  if (b.stack_id != null) {
    out.stack_id = b.stack_id;
    out.stack_index = b.stack_index;
  }
  out.tone = b.tone ?? 'dark';
  if (b.label != null) out.label = b.label;
  if (b.type === 'image') {
    out.focal_point = b.focal_point ?? DEFAULT_FOCAL;
    for (const k of IMAGE_KEYS) out[k] = b[k] ?? null;
  }
  if (b.removed_from_content) out.removed_from_content = true;
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Gelen blokları mevcut sayıyla birleştirir. data değiştirilmez.
 */
export function mergeIssue<T extends Pick<Issue, 'blocks'>>(
  data: T,
  incoming: IncomingBlock[],
): { data: T; report: MergeReport } {
  const report: MergeReport = { added: [], updated: [], reordered: [], reflow: [], deleted: [], kept: [], unchanged: 0 };
  const existing = new Map(data.blocks.map((b) => [b.id, b]));
  const incomingIds = new Set(incoming.map((b) => b.id));
  const blocks: Block[] = [];

  for (const inc of incoming) {
    const cur = existing.get(inc.id);
    if (!cur) {
      blocks.push(normalizeBlock(inc));
      report.added.push(inc.id);
      continue;
    }
    const before = normalizeBlock(cur);
    const next = normalizeBlock({
      ...cur,
      type: inc.type,
      variant: inc.variant,
      content: inc.content,
      order: inc.order,
      relates_to: inc.relates_to,
      label: inc.label,
      ...(inc.type === 'image'
        ? { source: inc.source, credit: inc.credit, alt: inc.alt, focal_point: cur.focal_point ?? inc.focal_point }
        : {}),
      removed_from_content: false,
    });
    if (same(before, next)) {
      report.unchanged++;
    } else if (same({ ...before, order: 0 }, { ...next, order: 0 })) {
      // Yalnız sırası kaydı (başka bir blok eklendi/çıktı).
      report.reordered.push(inc.id);
    } else {
      report.updated.push(inc.id);
      // Yerleşik blokta metin ya da tip değiştiyse yükseklik/görünüm değişebilir.
      const looks = (['type', 'variant', 'content', 'label'] as const).some((k) => !same(before[k], next[k]));
      if (cur.spread_id != null && looks) report.reflow.push(inc.id);
    }
    blocks.push(next);
  }

  // Paketten çıkan bloklar, eski sıralarıyla gelenlerin arkasına.
  let order = incoming.length;
  const gone = data.blocks.filter((b) => !incomingIds.has(b.id)).sort((a, b) => a.order - b.order);
  for (const cur of gone) {
    if (cur.spread_id == null) {
      report.deleted.push(cur.id);
      continue;
    }
    report.kept.push(cur.id);
    blocks.push(normalizeBlock({ ...cur, order: ++order, removed_from_content: true }));
  }

  // Silinen bloklara işaret eden ilişkiler düşer.
  const finalIds = new Set(blocks.map((b) => b.id));
  for (const b of blocks) b.relates_to = b.relates_to.filter((r) => finalIds.has(r));

  return { data: { ...data, blocks }, report };
}

/** Sayı dosyası yoksa manifest'ten boş bir sayı kurar. */
export function emptyIssue(manifest: Manifest, firstSection: string | undefined): Issue {
  if (!manifest.meta) throw new Error('data dosyası yok; manifest.meta (title, month, year, number, first_page) gerekli');
  return {
    revision: 0,
    issue: manifest.meta,
    spreads: [{ id: 's-1', section: firstSection ?? '', chrome_left: 'full', chrome_right: 'full' }],
    blocks: [],
  };
}

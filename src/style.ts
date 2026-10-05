// Renk ve dizgi kuralları. DOM'a dokunmaz; okuma görünümü ve editör ortak.
//
// - Palet: sayı düzeyinde beş adlandırılmış renk; bloklar renk kodu değil ad
//   taşır. Frame'e CSS değişkeni olarak bağlanır (--paper, --ink, …).
// - Tema: her sayfanın zemini ve metin/çizgi/chrome renkleri (styles/main.css
//   .theme--*). Blok, sol kenarının düştüğü sayfanın temasını alır.
// - Paragraf: yığında art arda gelen gövde paragrafları arasında boşluk yok;
//   önceki metni gövde olan paragraf girintili, başlıktan sonraki girintisiz.
// - Ara başlık: üstünde daha çok, altında daha az boşluk (toplam dört gövde satırı).
// - Künye: görselin üstünde değil, ona bağlı caption'ın (yoksa notun) sonunda.
import { PAGE_COLS } from './config.ts';
import type { Block, BlockType, Issue, Palette, PaletteName, Spread, TextColor, Theme, Treatment } from './types.ts';

export const PALETTE_NAMES: PaletteName[] = ['paper', 'ink', 'muted', 'accent', 'accent-soft'];
export const THEMES: Theme[] = ['paper', 'ink', 'soft', 'accent'];
export const TEXT_COLORS: TextColor[] = ['default', 'accent', 'muted'];
export const TREATMENTS: Treatment[] = ['none', 'mono', 'duotone', 'multiply'];

/** Paletsiz sayı için; paper, ink ve muted bugünkü renkler. */
export const DEFAULT_PALETTE: Palette = {
  paper: '#eeeadf',
  ink: '#2a241e',
  muted: '#6d675d',
  accent: '#a6452e',
  'accent-soft': '#ecd8ce',
};

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

/** Sayının paleti, eksik adlar varsayılanla. */
export function paletteOf(data: Pick<Issue, 'palette'>): Palette {
  return { ...DEFAULT_PALETTE, ...(data.palette ?? {}) };
}

/** Frame'e bağlanan CSS değişkenleri. */
export function paletteVars(palette: Palette): Record<string, string> {
  return Object.fromEntries(PALETTE_NAMES.map((n) => [`--${n}`, palette[n]]));
}

/** Bloğun (sol kenarına göre) bulunduğu sayfa. */
export const sideOf = (x: number): 'left' | 'right' => (x < PAGE_COLS ? 'left' : 'right');

export function themeOf(spread: Pick<Spread, 'theme_left' | 'theme_right'>, side: 'left' | 'right'): Theme {
  return (side === 'left' ? spread.theme_left : spread.theme_right) ?? 'paper';
}

/** color alanı alabilen tipler; çizgi yalnız default | accent. */
export const COLOR_TYPES = new Set<BlockType>(['text', 'heading', 'quote', 'note', 'divider']);
export function colorsFor(type: BlockType): TextColor[] {
  if (type === 'divider') return ['default', 'accent'];
  return COLOR_TYPES.has(type) ? TEXT_COLORS : [];
}

// ---------- Paragraf ve yığın aralıkları ----------

/** Ara başlığın üstü ve altı (hücre); 8 + 5 (satır) + 3 = dört gövde satırı. */
export const SUBHEAD_BEFORE = 8;
export const SUBHEAD_AFTER = 3;

const isBody = (b: Pick<Block, 'type' | 'variant'>) => b.type === 'text' && b.variant === 'body';
const isSubhead = (b: Pick<Block, 'type' | 'variant'>) => b.type === 'heading' && b.variant === 'subhead';

/**
 * Dikey yığında iki komşu blok arasındaki boşluk (hücre). Gövde → gövde 0;
 * ara başlığın üstü SUBHEAD_BEFORE, altı SUBHEAD_AFTER; gerisi yığının gap'i.
 */
export function gapBetween(
  prev: Pick<Block, 'type' | 'variant'>,
  next: Pick<Block, 'type' | 'variant'>,
  gap: number,
): number {
  if (isBody(prev) && isBody(next)) return 0;
  if (isSubhead(next)) return SUBHEAD_BEFORE;
  if (isSubhead(prev)) return SUBHEAD_AFTER;
  return gap;
}

const slugOf = (id: string) => id.slice(0, id.indexOf('/'));

/**
 * Girintili gövde paragrafları: okuma sırasında (aynı parça içinde, görsel,
 * caption, not, alıntı ve çizgiler atlanarak) önceki metin bloğu gövde olanlar.
 * Başlık, ara başlık ya da deck'ten sonraki ilk paragraf ve büyük baş harfli
 * paragraf girintisiz.
 */
export function indentedParagraphs(blocks: Block[]): Set<string> {
  const out = new Set<string>();
  const prose = blocks
    .filter((b) => b.id.includes('/') && (b.type === 'heading' || (b.type === 'text' && b.variant !== 'caption')))
    .sort((a, b) => a.order - b.order);
  prose.forEach((b, i) => {
    const prev = prose[i - 1];
    if (isBody(b) && !b.drop_cap && prev && slugOf(prev.id) === slugOf(b.id) && isBody(prev)) out.add(b.id);
  });
  return out;
}

/**
 * Künyeler: görselin credit'i ona bağlı caption'ın sonunda; caption yoksa
 * görselin relates_to'sundaki notun sonunda. Blok id → künye listesi.
 */
export function creditsByBlock(blocks: Block[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, credit: string) => out.set(id, [...(out.get(id) ?? []), credit]);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const img of blocks) {
    if (img.type !== 'image' || !img.credit) continue;
    const caption = blocks.find((b) => b.type === 'text' && b.variant === 'caption' && b.relates_to.includes(img.id));
    const note = img.relates_to.map((id) => byId.get(id)).find((b) => b?.type === 'note');
    const target = caption ?? note;
    if (target) add(target.id, img.credit);
  }
  return out;
}

/** Künyesi gösterilecek bir caption ya da notu olmayan görseller (uyarı için). */
export function uncreditedImages(blocks: Block[]): string[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return blocks
    .filter((img) => img.type === 'image' && img.credit)
    .filter(
      (img) =>
        !blocks.some((b) => b.type === 'text' && b.variant === 'caption' && b.relates_to.includes(img.id)) &&
        !img.relates_to.some((id) => byId.get(id)?.type === 'note'),
    )
    .map((img) => img.id);
}

// ---------- Duotone ----------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** feComponentTransfer tablosu: siyah → ink, beyaz → paper (0–1, kanal başına). */
export function duotoneTables(palette: Palette): { r: string; g: string; b: string } {
  const dark = rgb(palette.ink);
  const light = rgb(palette.paper);
  const t = (i: number) => `${(dark[i] / 255).toFixed(4)} ${(light[i] / 255).toFixed(4)}`;
  return { r: t(0), g: t(1), b: t(2) };
}

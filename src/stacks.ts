// Auto layout yığınları. DOM'a dokunmaz; tüm değerler hücre cinsinden.
//
// Yığın: { id, spread_id, direction: 'vertical'|'horizontal', x, y, gap }.
// Çocuk bloklar stack_id ve stack_index taşır; x/y'leri yığından türetilir
// (yön boyunca art arda, aralarında gap; çapraz eksende yığının başına hizalı).
//
// Tek kaynak yığındır: dosyada çocukların x/y'si null yazılır (toFileForm),
// yüklenince ve her yükseklik ölçümünden sonra layoutStacks() ile hesaplanır.
//
// Yer tutucu (w, h): şablondan gelen metin sütunu. Alanı her zaman yığının
// alanına katılır, yığın boşalınca silinmez; giren metin bloğu w'yi alır.
import { FLOW_TYPES } from './config.ts';
import { gapBetween } from './style.ts';
import type { Block, Direction, Issue, PlacedBlock, Point, Rect, Stack } from './types.ts';

/** Yığın işlemlerinin ihtiyaç duyduğu kısım (testler kısmi veriyle çağırır). */
type Layout = Pick<Issue, 'blocks' | 'stacks'>;
type Axis = 'x' | 'y';
type Size = 'w' | 'h';

export const stackById = (data: Layout, id: string | null | undefined): Stack | undefined =>
  (data.stacks ?? []).find((s) => s.id === id);

export function childrenOf(data: Layout, stackId: string): PlacedBlock[] {
  return (data.blocks.filter((b) => b.stack_id === stackId) as PlacedBlock[]).sort(
    (a, b) => (a.stack_index as number) - (b.stack_index as number),
  );
}

const along = (s: { direction: Direction }): { pos: Axis; size: Size } =>
  s.direction === 'horizontal' ? { pos: 'x', size: 'w' } : { pos: 'y', size: 'h' };

/**
 * İki komşu çocuk arasındaki boşluk. Dikey yığında dizgi kuralları
 * (src/style.ts gapBetween: gövde → gövde 0, ara başlık üstü/altı); yatayda gap.
 */
const spacing = (s: Stack, prev: Block | undefined, next: Block) =>
  !prev ? 0 : s.direction === 'vertical' ? gapBetween(prev, next, s.gap) : s.gap;

/** Yığın çocuklarının hesaplanan konumları; veriyi değiştirmez. */
export function stackPositions(data: Layout): Map<string, Partial<Point>> {
  const out = new Map<string, Partial<Point>>();
  for (const s of data.stacks ?? []) {
    const { pos, size } = along(s);
    const cross: Axis = pos === 'x' ? 'y' : 'x';
    let cursor = s[pos];
    let prev: Block | undefined;
    for (const b of childrenOf(data, s.id)) {
      cursor += spacing(s, prev, b);
      out.set(b.id, { [pos]: cursor, [cross]: s[cross] });
      cursor += b[size] ?? 0;
      prev = b;
    }
  }
  return out;
}

/** Bir yığının çocuklarını dizer ve stack_index'leri 0..n-1'e sıkıştırır. */
export function layoutStack(data: Layout, s: Stack): void {
  const { pos, size } = along(s);
  const cross: Axis = pos === 'x' ? 'y' : 'x';
  let cursor = s[pos];
  let prev: Block | undefined;
  childrenOf(data, s.id).forEach((b, i) => {
    cursor += spacing(s, prev, b);
    b.stack_index = i;
    b.spread_id = s.spread_id;
    b[pos] = cursor;
    b[cross] = s[cross];
    cursor += b[size] ?? 0;
    prev = b;
  });
}

/** Dosyaya yazılacak biçim: yığın çocuklarının türetilen x/y'si saklanmaz. */
export function toFileForm<T extends Layout>(data: T): T {
  return {
    ...data,
    blocks: data.blocks.map((b) => (b.stack_id != null ? { ...b, x: null, y: null } : b)),
  };
}

export function layoutStacks(data: Layout): void {
  for (const s of data.stacks ?? []) layoutStack(data, s);
}

/** Boşalınca silinmeyen yığın: yer tutucu alanı var. */
export const hasPlaceholder = (s: Stack): boolean => s.w != null && s.h != null;

/** Yığının kapladığı alan: çocukların ve varsa yer tutucunun birleşimi. */
export function stackBounds(data: Layout, s: Stack): Rect {
  const kids = childrenOf(data, s.id);
  const right = Math.max(s.x + (s.w ?? 0), ...kids.map((b) => b.x + b.w));
  const bottom = Math.max(s.y + (s.h ?? 0), ...kids.map((b) => b.y + (b.h ?? 0)));
  return { x: s.x, y: s.y, w: right - s.x, h: bottom - s.y };
}

/** Son çocuğu çıkan yığın: yer tutucusu yoksa silinir, varsa boş kalır. */
function dropIfEmpty(data: Layout, s: Stack): void {
  if (childrenOf(data, s.id).length) layoutStack(data, s);
  else if (!hasPlaceholder(s)) data.stacks = (data.stacks ?? []).filter((x) => x.id !== s.id);
}

/** Dizilişten yön: merkezler yatayda daha çok yayılıyorsa yatay. */
export function inferDirection(blocks: Rect[]): Direction {
  if (blocks.length < 2) return 'vertical';
  const range = (values: number[]) => Math.max(...values) - Math.min(...values);
  const cx = blocks.map((b) => b.x + b.w / 2);
  const cy = blocks.map((b) => b.y + b.h / 2);
  return range(cx) > range(cy) ? 'horizontal' : 'vertical';
}

export function nextStackId(data: Layout): string {
  const ids = new Set((data.stacks ?? []).map((s) => s.id));
  let n = ids.size + 1;
  while (ids.has(`stack-${n}`)) n++;
  return `stack-${n}`;
}

/**
 * Serbest, yerleşik ve aynı spread'deki bloklardan yığın kurar (Shift+A).
 * Sıra konumdan, boşluk mevcut aralıkların ortalamasından gelir.
 * Kurulamazsa null döner.
 */
export function createStack(data: Layout, ids: string[]): Stack | null {
  const blocks = ids
    .map((id) => data.blocks.find((b) => b.id === id))
    .filter((b): b is PlacedBlock => !!b && b.spread_id != null && b.stack_id == null);
  if (!blocks.length || blocks.some((b) => b.spread_id !== blocks[0].spread_id)) return null;

  const direction = inferDirection(blocks);
  const { pos, size } = along({ direction });
  const sorted = [...blocks].sort((a, b) => a[pos] - b[pos] || a.order - b.order);
  const gaps = sorted.slice(1).map((b, i) => b[pos] - (sorted[i][pos] + sorted[i][size]));
  const gap = gaps.length ? Math.max(0, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)) : 0;

  const stack: Stack = {
    id: nextStackId(data),
    spread_id: blocks[0].spread_id,
    direction,
    x: Math.min(...blocks.map((b) => b.x)),
    y: Math.min(...blocks.map((b) => b.y)),
    gap,
  };
  (data.stacks ??= []).push(stack);
  sorted.forEach((b, i) => {
    b.stack_id = stack.id;
    b.stack_index = i;
  });
  layoutStack(data, stack);
  return stack;
}

/** Yığını kaldırır; çocuklar o anki konumlarında serbest kalır. */
export function removeStack(data: Layout, stackId: string): void {
  for (const b of data.blocks) {
    if (b.stack_id === stackId) {
      delete b.stack_id;
      delete b.stack_index;
    }
  }
  data.stacks = (data.stacks ?? []).filter((s) => s.id !== stackId);
}

/** Bloğu yığından çıkarır; yığın boşalırsa (yer tutucusu yoksa) silinir. */
export function removeFromStack(data: Layout, blockId: string): void {
  const b = data.blocks.find((x) => x.id === blockId);
  const s = b && stackById(data, b.stack_id);
  if (!b || !s) return;
  delete b.stack_id;
  delete b.stack_index;
  dropIfEmpty(data, s);
}

/**
 * Bloğu yığına index konumunda ekler (zaten içindeyse sırasını değiştirir).
 * Yer tutucu yığına (metin sütunu) giren metin bloğu sütunun genişliğini alır.
 */
export function insertIntoStack(data: Layout, blockId: string, stackId: string, index: number): void {
  const s = stackById(data, stackId);
  const b = data.blocks.find((x) => x.id === blockId);
  if (!s || !b) return;
  const old = b.stack_id && b.stack_id !== stackId ? b.stack_id : null;
  const siblings: Block[] = childrenOf(data, stackId).filter((x) => x.id !== blockId);
  if (s.w != null && FLOW_TYPES.has(b.type)) b.w = s.w;
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, b);
  b.stack_id = stackId;
  siblings.forEach((x, i) => (x.stack_index = i));
  layoutStack(data, s);
  if (old) dropIfEmpty(data, stackById(data, old) as Stack);
}

export function moveInStack(data: Layout, blockId: string, index: number): void {
  const b = data.blocks.find((x) => x.id === blockId);
  if (b?.stack_id) insertIntoStack(data, blockId, b.stack_id, index);
}

/** Bir noktaya bırakılınca bloğun gireceği sıra (taşınan blok hariç). */
export function insertionIndex(data: Layout, stackId: string, point: Point, excludeId: string | null): number {
  const s = stackById(data, stackId) as Stack;
  const { pos, size } = along(s);
  return childrenOf(data, stackId)
    .filter((b) => b.id !== excludeId)
    .filter((b) => b[pos] + b[size] / 2 < point[pos]).length;
}

/** Ekleme çizgisi: yığın ekseninde konum ve çapraz eksende uzunluk (hücre). */
export function insertionMarker(data: Layout, stackId: string, index: number, excludeId: string | null): Rect {
  const s = stackById(data, stackId) as Stack;
  const { pos, size } = along(s);
  const siblings = childrenOf(data, stackId).filter((b) => b.id !== excludeId);
  const bounds = stackBounds(data, s);
  let at: number;
  if (!siblings.length) at = s[pos];
  else if (index === 0) at = siblings[0][pos] - Math.min(s.gap, 4) / 2;
  else {
    const prev = siblings[index - 1];
    at = prev[pos] + prev[size] + s.gap / 2;
  }
  return pos === 'y'
    ? { x: bounds.x, y: at, w: Math.max(bounds.w, 8), h: 0 }
    : { x: at, y: bounds.y, w: 0, h: Math.max(bounds.h, 8) };
}

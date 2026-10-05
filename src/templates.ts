// Spread şablonları ve slotlar. DOM'a dokunmaz; tüm değerler hücre cinsinden.
//
// Slot: spread üzerinde boş kutu ({ x, y, w, h, z, tone, accepts }). Kabul
// ettiği blok bırakılınca blok slotun konumunu, genişliğini, z ve tone'unu
// (görselde yüksekliğini de) alır, slot silinir. Uymayan blok slotu görmez.
//
// Şablon: slotlar, boş yığınlar (yer tutucu alanlı metin sütunları) ve chrome
// ayarlarından oluşan spread iskeleti; data/templates/<ad>.json. Kimlikler
// spread kurulurken verilir.
import { slotProblems } from './model.ts';
import { childrenOf, nextStackId, removeFromStack, stackBounds } from './stacks.ts';
import type { Block, Issue, PlacedBlock, Point, Slot, Stack, Template } from './types.ts';

/** Şablon işlemlerinin ihtiyaç duyduğu kısım (testler kısmi veriyle çağırır). */
type Layout = Pick<Issue, 'blocks' | 'stacks' | 'slots'>;

export const slotById = (data: Layout, id: string | null | undefined): Slot | undefined =>
  (data.slots ?? []).find((s) => s.id === id);

/** Spread'deki slotlar, z sırasıyla (üstteki sonda). */
export function slotsOn(data: Layout, spreadId: string): Slot[] {
  return (data.slots ?? []).filter((s) => s.spread_id === spreadId).sort((a, b) => a.z - b.z);
}

/** Tür aynı olmalı; slotta variant yazıyorsa o da. */
export function slotAccepts(slot: Pick<Slot, 'accepts'>, block: Pick<Block, 'type' | 'variant'>): boolean {
  const { type, variant } = slot.accepts;
  return block.type === type && (variant == null || block.variant === variant);
}

const inside = (s: Slot, p: Point) => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h;

/**
 * Noktanın altındaki slot (üstteki önce). Blok verilirse yalnız onu kabul eden
 * slot döner; uymayan blok için null (serbest yerleştirme).
 */
export function slotAt(data: Layout, spreadId: string, p: Point, block?: Pick<Block, 'type' | 'variant'>): Slot | null {
  const hits = slotsOn(data, spreadId)
    .filter((s) => inside(s, p))
    .reverse();
  return (block ? hits.find((s) => slotAccepts(s, block)) : hits[0]) ?? null;
}

export function removeSlot(data: Layout, slotId: string): void {
  data.slots = (data.slots ?? []).filter((s) => s.id !== slotId);
}

/**
 * Bloğu slota yerleştirir ve slotu siler. Blok bir yığındaysa önce çıkar.
 * Akış tiplerinde h önbellektir (ölçüm düzeltir); yoksa slotun h'si yazılır.
 * Slot bloğu kabul etmiyorsa hiçbir şey yapmaz ve false döner.
 */
export function fillSlot(data: Layout, slotId: string, blockId: string): boolean {
  const slot = slotById(data, slotId);
  const b = data.blocks.find((x) => x.id === blockId);
  if (!slot || !b || !slotAccepts(slot, b)) return false;
  if (b.stack_id != null) removeFromStack(data, b.id);
  Object.assign(b, {
    spread_id: slot.spread_id,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: b.type === 'image' || b.h == null ? slot.h : b.h,
    z: slot.z,
    tone: slot.tone,
  });
  removeSlot(data, slotId);
  return true;
}

function nextSlotId(data: Layout): string {
  const ids = new Set((data.slots ?? []).map((s) => s.id));
  let n = ids.size + 1;
  while (ids.has(`slot-${n}`)) n++;
  return `slot-${n}`;
}

/** Şablonun slotlarını ve boş yığınlarını spread'e yeni kimliklerle koyar. */
export function instantiateTemplate(data: Layout, template: Template, spreadId: string): { slots: string[]; stacks: string[] } {
  const out = { slots: [] as string[], stacks: [] as string[] };
  for (const t of template.slots) {
    const slot: Slot = { ...structuredClone(t), id: nextSlotId(data), spread_id: spreadId };
    (data.slots ??= []).push(slot);
    out.slots.push(slot.id);
  }
  for (const t of template.stacks) {
    const stack: Stack = { ...structuredClone(t), id: nextStackId(data), spread_id: spreadId };
    (data.stacks ??= []).push(stack);
    out.stacks.push(stack.id);
  }
  return out;
}

/**
 * Spread'den şablon: yığında olmayan yerleşik bloklar slota (tür ve variant
 * bloktan), yığınlar boş yığına (alanı o anki alanı) çevrilir; spread'deki
 * slotlar olduğu gibi kalır. Veriyi değiştirmez.
 */
export function templateFromSpread(
  data: Layout & Pick<Issue, 'spreads'>,
  spreadId: string,
  name: string,
): Template {
  const spread = data.spreads.find((s) => s.id === spreadId);
  if (!spread) throw new Error(`bilinmeyen spread ${spreadId}`);
  const free = (data.blocks.filter((b) => b.spread_id === spreadId && b.stack_id == null) as PlacedBlock[]).map(
    (b) => ({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      z: b.z,
      tone: b.tone,
      accepts: { type: b.type, variant: b.variant },
    }),
  );
  const kept = slotsOn(data, spreadId).map(({ id: _, spread_id: __, ...rest }) => structuredClone(rest));
  const stacks = (data.stacks ?? [])
    .filter((s) => s.spread_id === spreadId)
    .map((s) => {
      const r = stackBounds(data, s);
      return { direction: s.direction, x: s.x, y: s.y, gap: s.gap, w: r.w, h: r.h };
    });
  return {
    name,
    chrome_left: spread.chrome_left,
    chrome_right: spread.chrome_right,
    slots: [...kept, ...free].sort((a, b) => a.z - b.z),
    stacks,
  };
}

/** Dosya adı: küçük harf, Türkçe harfler sadeleşir, boşluk → tire. */
export function templateKey(name: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return name
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (c) => map[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isSize = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

/** Şablon dosyasının denetimi; sorun listesi döner. */
export function validateTemplate(t: Template): string[] {
  const out: string[] = [];
  if (typeof t?.name !== 'string' || !t.name.trim()) out.push('name boş olmamalı');
  for (const key of ['chrome_left', 'chrome_right'] as const) {
    if (!['full', 'none'].includes(t?.[key])) out.push(`${key} geçersiz`);
  }
  if (!Array.isArray(t?.slots) || !Array.isArray(t?.stacks)) return [...out, 'slots ve stacks dizi olmalı'];
  t.slots.forEach((s, i) => out.push(...slotProblems(s, `slot ${i + 1}`)));
  t.stacks.forEach((s, i) => {
    if (!['vertical', 'horizontal'].includes(s.direction)) out.push(`yığın ${i + 1}: direction geçersiz`);
    if (![s.x, s.y].every(Number.isInteger) || !isCount(s.gap) || !isSize(s.w) || !isSize(s.h)) {
      out.push(`yığın ${i + 1}: x, y tam sayı; gap ≥ 0; w, h pozitif tam sayı olmalı`);
    }
  });
  return out;
}

/** Spread'i siler; slotları ve boş yığınları da gider (bloklu spread silinmez). */
export function removeSpreadSkeleton(data: Layout, spreadId: string): void {
  data.slots = (data.slots ?? []).filter((s) => s.spread_id !== spreadId);
  data.stacks = (data.stacks ?? []).filter((s) => s.spread_id !== spreadId || childrenOf(data, s.id).length > 0);
}

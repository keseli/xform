// Auto layout yığınları. DOM'a dokunmaz; tüm değerler hücre cinsinden.
//
// Yığın: { id, spread_id, direction: 'vertical'|'horizontal', x, y, gap }.
// Çocuk bloklar stack_id ve stack_index taşır; x/y'leri yığından türetilir
// (yön boyunca art arda, aralarında gap; çapraz eksende yığının başına hizalı).
// Akış bloklarının yüksekliği ölçümle değişince layoutStacks() yeniden çağrılır.

export const stackById = (data, id) => (data.stacks ?? []).find((s) => s.id === id);

export function childrenOf(data, stackId) {
  return data.blocks.filter((b) => b.stack_id === stackId).sort((a, b) => a.stack_index - b.stack_index);
}

const along = (s) => (s.direction === 'horizontal' ? { pos: 'x', size: 'w' } : { pos: 'y', size: 'h' });

/** Bir yığının çocuklarını dizer ve stack_index'leri 0..n-1'e sıkıştırır. */
export function layoutStack(data, s) {
  const { pos, size } = along(s);
  const cross = pos === 'x' ? 'y' : 'x';
  let cursor = s[pos];
  childrenOf(data, s.id).forEach((b, i) => {
    b.stack_index = i;
    b.spread_id = s.spread_id;
    b[pos] = cursor;
    b[cross] = s[cross];
    cursor += (b[size] ?? 0) + s.gap;
  });
}

export function layoutStacks(data) {
  for (const s of data.stacks ?? []) layoutStack(data, s);
}

/** Yığının kapladığı alan (çocukların birleşimi). */
export function stackBounds(data, s) {
  const kids = childrenOf(data, s.id);
  if (!kids.length) return { x: s.x, y: s.y, w: 0, h: 0 };
  const right = Math.max(...kids.map((b) => b.x + b.w));
  const bottom = Math.max(...kids.map((b) => b.y + (b.h ?? 0)));
  return { x: s.x, y: s.y, w: right - s.x, h: bottom - s.y };
}

/** Dizilişten yön: merkezler yatayda daha çok yayılıyorsa yatay. */
export function inferDirection(blocks) {
  if (blocks.length < 2) return 'vertical';
  const range = (values) => Math.max(...values) - Math.min(...values);
  const cx = blocks.map((b) => b.x + b.w / 2);
  const cy = blocks.map((b) => b.y + b.h / 2);
  return range(cx) > range(cy) ? 'horizontal' : 'vertical';
}

export function nextStackId(data) {
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
export function createStack(data, ids) {
  const blocks = ids
    .map((id) => data.blocks.find((b) => b.id === id))
    .filter((b) => b && b.spread_id != null && b.stack_id == null);
  if (!blocks.length || blocks.some((b) => b.spread_id !== blocks[0].spread_id)) return null;

  const direction = inferDirection(blocks);
  const { pos, size } = along({ direction });
  const sorted = [...blocks].sort((a, b) => a[pos] - b[pos] || a.order - b.order);
  const gaps = sorted.slice(1).map((b, i) => b[pos] - (sorted[i][pos] + sorted[i][size]));
  const gap = gaps.length ? Math.max(0, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)) : 0;

  const stack = {
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
export function removeStack(data, stackId) {
  for (const b of data.blocks) {
    if (b.stack_id === stackId) {
      delete b.stack_id;
      delete b.stack_index;
    }
  }
  data.stacks = (data.stacks ?? []).filter((s) => s.id !== stackId);
}

/** Bloğu yığından çıkarır; yığın boşalırsa silinir. */
export function removeFromStack(data, blockId) {
  const b = data.blocks.find((x) => x.id === blockId);
  const s = b && stackById(data, b.stack_id);
  if (!s) return;
  delete b.stack_id;
  delete b.stack_index;
  if (childrenOf(data, s.id).length) layoutStack(data, s);
  else data.stacks = data.stacks.filter((x) => x.id !== s.id);
}

/** Bloğu yığına index konumunda ekler (zaten içindeyse sırasını değiştirir). */
export function insertIntoStack(data, blockId, stackId, index) {
  const s = stackById(data, stackId);
  const b = data.blocks.find((x) => x.id === blockId);
  if (!s || !b) return;
  const old = b.stack_id && b.stack_id !== stackId ? b.stack_id : null;
  const siblings = childrenOf(data, stackId).filter((x) => x.id !== blockId);
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, b);
  b.stack_id = stackId;
  siblings.forEach((x, i) => (x.stack_index = i));
  layoutStack(data, s);
  if (old) {
    const prev = stackById(data, old);
    if (childrenOf(data, old).length) layoutStack(data, prev);
    else data.stacks = data.stacks.filter((x) => x.id !== old);
  }
}

export function moveInStack(data, blockId, index) {
  const b = data.blocks.find((x) => x.id === blockId);
  if (b?.stack_id) insertIntoStack(data, blockId, b.stack_id, index);
}

/** Bir noktaya bırakılınca bloğun gireceği sıra (taşınan blok hariç). */
export function insertionIndex(data, stackId, point, excludeId) {
  const s = stackById(data, stackId);
  const { pos, size } = along(s);
  return childrenOf(data, stackId)
    .filter((b) => b.id !== excludeId)
    .filter((b) => b[pos] + b[size] / 2 < point[pos]).length;
}

/** Ekleme çizgisi: yığın ekseninde konum ve çapraz eksende uzunluk (hücre). */
export function insertionMarker(data, stackId, index, excludeId) {
  const s = stackById(data, stackId);
  const { pos, size } = along(s);
  const siblings = childrenOf(data, stackId).filter((b) => b.id !== excludeId);
  const bounds = stackBounds(data, s);
  let at;
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

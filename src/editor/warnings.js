// Editör uyarıları. Yalnızca gösterilir, hiçbir işlemi engellemez.
// DOM'a dokunmaz; akış bloklarında saklanan h (son ölçüm) kullanılır.
import { COLS, ROWS } from '../config.js';
import { isPlaced } from '../model.js';

/**
 * @returns {Map<string, {kind: 'order'|'relation'|'overflow', message: string, ref?: string}[]>}
 */
export function computeWarnings(data) {
  const out = new Map();
  const add = (block, warning) => {
    if (!out.has(block.id)) out.set(block.id, []);
    out.get(block.id).push(warning);
  };

  const spreadIndex = new Map(data.spreads.map((s, i) => [s.id, i]));
  const byId = new Map(data.blocks.map((b) => [b.id, b]));
  const placed = data.blocks.filter((b) => isPlaced(b) && spreadIndex.has(b.spread_id));

  // Sıra: daha büyük order'lı blok, daha küçük order'lı bir bloktan önceki spread'de.
  // laterMin[i] = i ve sonraki spread'lerdeki en küçük order'lı blok.
  const n = data.spreads.length;
  const laterMin = new Array(n + 1).fill(null);
  for (const b of placed) {
    const i = spreadIndex.get(b.spread_id);
    if (!laterMin[i] || b.order < laterMin[i].order) laterMin[i] = b;
  }
  for (let i = n - 1; i >= 0; i--) {
    const next = laterMin[i + 1];
    if (next && (!laterMin[i] || next.order < laterMin[i].order)) laterMin[i] = next;
  }
  for (const b of placed) {
    const later = laterMin[spreadIndex.get(b.spread_id) + 1];
    if (later && later.order < b.order) {
      add(b, {
        kind: 'order',
        message: `Sıra ${b.order}, ama sıra ${later.order} olan “${later.id}” sonraki bir spread'de.`,
        ref: later.id,
      });
    }
  }

  // İlişki: relates_to'daki blokların hiçbiri bu spread'de değil.
  for (const b of placed) {
    const related = b.relates_to ?? [];
    if (!related.length) continue;
    if (!related.some((id) => byId.get(id)?.spread_id === b.spread_id)) {
      add(b, {
        kind: 'relation',
        message: `İlişkili blokların hiçbiri bu spread'de değil (${related.join(', ')}).`,
        ref: related[0],
      });
    }
  }

  // Frame dışına taşma.
  for (const b of placed) {
    if (b.x < 0 || b.y < 0 || b.x + b.w > COLS || b.y + b.h > ROWS) {
      add(b, { kind: 'overflow', message: 'Frame dışına taşıyor.' });
    }
  }

  return out;
}

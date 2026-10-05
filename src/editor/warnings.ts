// Editör uyarıları. Yalnızca gösterilir, hiçbir işlemi engellemez.
// DOM'a dokunmaz; akış bloklarında saklanan h (son ölçüm) kullanılır.
// Yığındaki blokların konumu her zaman yığından hesaplanır (saklanan x/y'ye bakılmaz).
import { COLS, ROWS } from '../config.ts';
import { isPlaced, LAYOUT_ONLY } from '../model.ts';
import { stackPositions } from '../stacks.ts';
import type { Block, Issue, PlacedBlock } from '../types.ts';

export type WarningKind = 'order' | 'relation' | 'overflow' | 'removed';
export interface Warning {
  kind: WarningKind;
  message: string;
  ref?: string;
}

export function computeWarnings(data: Pick<Issue, 'spreads' | 'blocks' | 'stacks'>): Map<string, Warning[]> {
  const out = new Map<string, Warning[]>();
  const add = (block: Block, warning: Warning) => {
    if (!out.has(block.id)) out.set(block.id, []);
    out.get(block.id)!.push(warning);
  };

  const spreadIndex = new Map(data.spreads.map((s, i) => [s.id, i]));
  const byId = new Map(data.blocks.map((b) => [b.id, b]));
  // Kutular içerik değildir: sıra ve ilişki uyarılarına girmez.
  const placed = data.blocks.filter(
    (b): b is PlacedBlock => isPlaced(b) && spreadIndex.has(b.spread_id) && !LAYOUT_ONLY.has(b.type),
  );

  // Sıra: daha büyük order'lı blok, daha küçük order'lı bir bloktan önceki spread'de.
  // laterMin[i] = i ve sonraki spread'lerdeki en küçük order'lı blok.
  const n = data.spreads.length;
  const laterMin: (Block | null)[] = new Array(n + 1).fill(null);
  for (const b of placed) {
    const i = spreadIndex.get(b.spread_id)!;
    if (!laterMin[i] || b.order < laterMin[i].order) laterMin[i] = b;
  }
  for (let i = n - 1; i >= 0; i--) {
    const next = laterMin[i + 1];
    if (next && (!laterMin[i] || next.order < laterMin[i]!.order)) laterMin[i] = next;
  }
  for (const b of placed) {
    const later = laterMin[spreadIndex.get(b.spread_id)! + 1];
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

  // İçerik paketinden çıkarılmış ama yerleşik (içe aktarma korudu).
  for (const b of placed) {
    if (b.removed_from_content) {
      add(b, {
        kind: 'removed',
        message: 'İçerik paketinde artık yok. Tepsiye gönderirsen bir sonraki içe aktarmada silinir.',
      });
    }
  }

  // Frame dışına taşma.
  const derived = stackPositions(data);
  for (const p of placed) {
    const b = { ...p, ...derived.get(p.id) };
    if (b.x < 0 || b.y < 0 || b.x + b.w > COLS || b.y + b.h > ROWS) {
      add(b, { kind: 'overflow', message: 'Frame dışına taşıyor.' });
    }
  }

  return out;
}

// Akış bloklarının yükseklik ölçümü (DOM). Bileşenler veriden çizer; ölçüm
// çizimden sonra yapılır, sonuç veriye (h) yazılır ve yığınlar yeniden dizilir.
import { CELL } from '../config.ts';
import { layoutStacks } from '../stacks.ts';
import type { Issue } from '../types.ts';

const px = (cells: number) => `${cells * CELL}px`;

/**
 * Akış tiplerinin yüksekliğini içerikten ölçer ve bir üst hücreye yuvarlar.
 * Fontlar yüklendikten sonra, eleman DOM'dayken çağrılmalı. Ölçüm transform'dan
 * etkilenmez (offsetHeight ölçeklenmemiş yerleşim değeridir).
 * Hücre cinsinden yükseklikleri { id: h } olarak döner.
 */
export function settleHeights(root: HTMLElement): Record<string, number> {
  const heights: Record<string, number> = {};
  for (const el of root.querySelectorAll<HTMLElement>('.blocks > .block[data-flow]')) {
    heights[el.dataset.id as string] = settleHeight(el);
  }
  return heights;
}

/** Tek bir akış bloğunu ölçer, yüksekliğini hücreye yuvarlar ve hücre sayısını döner. */
export function settleHeight(el: HTMLElement): number {
  el.style.height = '';
  const rows = Math.max(1, Math.ceil(el.offsetHeight / CELL - 1e-6));
  el.style.height = px(rows);
  return rows;
}

/**
 * Frame'deki akış bloklarını ölçer, yükseklikleri veriye yazar ve yığınları
 * yeniden dizer. Bir şey değiştiyse true döner (görünüm yeniden çizilmeli).
 */
export function measureLayout(
  frame: HTMLElement,
  data: Pick<Issue, 'blocks' | 'stacks'>,
): { changed: boolean; heights: Record<string, number> } {
  const heights = settleHeights(frame);
  let changed = false;
  for (const b of data.blocks) {
    if (b.id in heights && b.h !== heights[b.id]) {
      b.h = heights[b.id];
      changed = true;
    }
  }
  const positions = () => JSON.stringify(data.blocks.filter((b) => b.stack_id != null).map((b) => [b.x, b.y]));
  const before = positions();
  layoutStacks(data);
  if (positions() !== before) changed = true;
  return { changed, heights };
}

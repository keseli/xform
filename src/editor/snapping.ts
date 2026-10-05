// Akıllı hizalama (smart guides). DOM'a dokunmaz; değerler hücre cinsinden.
//
// Hareket eden dikdörtgenin sol/orta/sağ (üst/orta/alt) çizgileri; diğer
// dikdörtgenlerin aynı çizgilerine ve frame çizgilerine (kenarlar, kenar boşluğu
// kılavuzları, sayfa ortaları, kat) eşik içindeyse yakalanır.
import { COLS, ROWS, PAGE_COLS, MARGINS } from '../config.ts';
import type { Rect } from '../types.ts';

type Axis = 'x' | 'y';
export interface Lines {
  x: number[];
  y: number[];
}
export interface Snap {
  shift: number;
  line: number;
}
export interface GuideSegment {
  axis: Axis;
  at: number;
  from: number;
  to: number;
}

export function frameLines(): Lines {
  return {
    x: [
      0,
      MARGINS.outer,
      PAGE_COLS / 2,
      PAGE_COLS - MARGINS.inner,
      PAGE_COLS,
      PAGE_COLS + MARGINS.inner,
      PAGE_COLS * 1.5,
      COLS - MARGINS.outer,
      COLS,
    ],
    y: [0, MARGINS.top, ROWS / 2, ROWS - MARGINS.bottom, ROWS],
  };
}

const marks = (pos: number, size: number) => [pos, pos + size / 2, pos + size];

export function axisTargets(rects: Rect[], lines: Lines, axis: Axis): number[] {
  const [pos, size] = axis === 'x' ? (['x', 'w'] as const) : (['y', 'h'] as const);
  return [...lines[axis], ...rects.flatMap((r) => marks(r[pos], r[size]))];
}

/** Değerlerden hangisi hangi hedefe en yakınsa; eşik dışındaysa null. */
function nearest(values: number[], targets: number[], threshold: number): Snap | null {
  let best: Snap | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, line: t };
    }
  }
  return best;
}

/** Tek bir kenar (resize). */
export function snapValue(value: number, targets: number[], threshold: number): Snap | null {
  return nearest([value], targets, threshold);
}

/**
 * Dikdörtgeni yakalar. Dönen dx/dy eklenecek kayma; x/y yakalanan çizgi (yoksa null).
 */
export function snapRect(rect: Rect, rects: Rect[], lines: Lines, threshold: number) {
  const mx = nearest(marks(rect.x, rect.w), axisTargets(rects, lines, 'x'), threshold);
  const my = nearest(marks(rect.y, rect.h), axisTargets(rects, lines, 'y'), threshold);
  return { dx: mx?.shift ?? 0, dy: my?.shift ?? 0, x: mx?.line ?? null, y: my?.line ?? null };
}

/**
 * Çizilecek kılavuz parçaları. Frame çizgisi tam boy; diğerleri o çizgide
 * hizalanan tüm dikdörtgenleri kapsar. Yuvarlama payı yarım hücre.
 */
export function guideSegments(
  rect: Rect,
  rects: Rect[],
  lines: Lines,
  matched: { x: number | null; y: number | null },
): GuideSegment[] {
  const out: GuideSegment[] = [];
  for (const axis of ['x', 'y'] as const) {
    const line = matched[axis];
    if (line == null) continue;
    const [pos, size, other, otherSize, full] =
      axis === 'x' ? (['x', 'w', 'y', 'h', ROWS] as const) : (['y', 'h', 'x', 'w', COLS] as const);
    const hits = [rect, ...rects].filter((r) => marks(r[pos], r[size]).some((v) => Math.abs(v - line) <= 0.5));
    if (!hits.includes(rect)) continue;
    const onFrame = lines[axis].includes(line);
    out.push({
      axis,
      at: line,
      from: onFrame ? 0 : Math.min(...hits.map((r) => r[other])),
      to: onFrame ? full : Math.max(...hits.map((r) => r[other] + r[otherSize])),
    });
  }
  return out;
}

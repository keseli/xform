// Editörün hücre hesapları. DOM'a dokunmaz; tüm değerler hücre cinsinden.
import { COLS, ROWS, KEEP_IN_FRAME } from '../config.js';

export const MIN_SIZE = 2;

export const snap = (value, step) => Math.round(value / step) * step;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Konumu, kutunun her eksende en az KEEP_IN_FRAME hücresi (kutu daha küçükse
 * tamamı) frame içinde kalacak şekilde sınırlar. Kenar boyunca kaydırır.
 */
export function keepInFrame({ x, y, w, h }) {
  const kx = Math.min(KEEP_IN_FRAME, w);
  const ky = Math.min(KEEP_IN_FRAME, h);
  return { x: clamp(x, kx - w, COLS - kx), y: clamp(y, ky - h, ROWS - ky) };
}

/** Kutunun frame içinde yeterince kalıp kalmadığı (resize adımlarını süzmek için). */
export function staysInFrame(box) {
  const kept = keepInFrame(box);
  return kept.x === box.x && kept.y === box.y;
}

/** Taşıma: başlangıç kutusu + işaretçi farkı, mutlak ızgaraya snap, frame sınırı. */
export function moveBox(start, delta, step) {
  const x = snap(start.x + delta.x, step);
  const y = snap(start.y + delta.y, step);
  return keepInFrame({ x, y, w: start.w, h: start.h });
}

/**
 * Resize. dir: tutamaç yönü, { x: -1|0|1, y: -1|0|1 }.
 * step: sayı ya da eksen başına { x, y } (kılavuza yakalanan kenar 1 hücreyle gelir).
 * widthOnly: akış tipleri ve divider (yükseklik içerikten/sabit).
 * lock: oran kilidi; başlangıç kutusunun oranı korunur, karşı köşe sabit kalır.
 */
export function resizeBox(start, dir, delta, { step, lock = false, widthOnly = false }) {
  const sx = typeof step === 'object' ? step.x : step;
  const sy = typeof step === 'object' ? step.y : step;
  let { x, y, w, h } = start;
  const right = start.x + start.w;
  const bottom = start.y + start.h;

  if (dir.x === 1) w = Math.max(MIN_SIZE, snap(right + delta.x, sx) - start.x);
  if (dir.x === -1) {
    x = Math.min(snap(start.x + delta.x, sx), right - MIN_SIZE);
    w = right - x;
  }
  if (widthOnly) return { x, y: start.y, w, h: start.h };

  if (dir.y === 1) h = Math.max(MIN_SIZE, snap(bottom + delta.y, sy) - start.y);
  if (dir.y === -1) {
    y = Math.min(snap(start.y + delta.y, sy), bottom - MIN_SIZE);
    h = bottom - y;
  }

  if (lock) {
    const ratio = start.w / start.h;
    // Köşede hangi kenar oransal olarak daha çok değiştiyse o belirler.
    const byWidth =
      dir.x !== 0 && (dir.y === 0 || Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1));
    if (byWidth) h = Math.max(MIN_SIZE, Math.round(w / ratio));
    else w = Math.max(MIN_SIZE, Math.round(h * ratio));
    x = dir.x === -1 ? right - w : start.x;
    y = dir.y === -1 ? bottom - h : start.y;
  }
  return { x, y, w, h };
}

// Tepsiden bırakılan bloğun başlangıç genişliği (hücre).
const DEFAULT_WIDTH = {
  'heading/title': 80,
  'heading/subhead': 80,
  'heading/kicker': 72,
  'text/body': 80,
  'text/deck': 74,
  'text/caption': 60,
  quote: 56,
  note: 80,
  divider: 32,
  image: 80,
};

export function defaultWidth(block) {
  return DEFAULT_WIDTH[`${block.type}/${block.variant}`] ?? DEFAULT_WIDTH[block.type] ?? 80;
}

/** Görselin genişliğinden, doğal oranına göre yükseklik. */
export function heightForRatio(w, ratio) {
  return Math.max(MIN_SIZE, Math.round(w / (ratio || 4 / 3)));
}

/** z değerlerini 1..n'e sıkıştırır; öne/arkaya göndermeden sonra çağrılır. */
export function normalizeZ(blocks) {
  [...blocks].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)).forEach((b, i) => (b.z = i + 1));
}

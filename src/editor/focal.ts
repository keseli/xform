// Görsel kırpma hesabı. DOM'a dokunmaz; ölçüler tasarım birimindedir.
//
// Görsel kutuyu "cover" ile doldurur ve yalnız bir eksende taşar. focal_point
// CSS object-position yüzdesiyle aynı tanımdır: f = 0 taşan kısmın başı, f = 1
// sonu görünür. Görsel kayması: offset = -taşma × f.
import type { FocalPoint, Point } from '../types.ts';

export interface Size {
  width: number;
  height: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Kutuyu dolduran görselin boyutu ve kutudan taşan kısım. */
export function coverFit(box: Size, natural: Size) {
  const scale = Math.max(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    width,
    height,
    overflowX: Math.max(0, width - box.width),
    overflowY: Math.max(0, height - box.height),
  };
}

/** Görselin kutuya göre sol üst köşesi (≤ 0) ve görüntülenen boyutu. */
export function imageRect(focal: FocalPoint, box: Size, natural: Size) {
  const fit = coverFit(box, natural);
  return {
    x: -fit.overflowX * focal.x,
    y: -fit.overflowY * focal.y,
    width: fit.width,
    height: fit.height,
  };
}

/**
 * Görseli kutu içinde delta kadar sürüklemenin yeni focal_point'i.
 * Görsel sola kayarsa sağ tarafı görünür (x artar). Taşmayan eksen değişmez.
 */
export function panFocal(start: FocalPoint, delta: Point, box: Size, natural: Size): FocalPoint {
  const { overflowX, overflowY } = coverFit(box, natural);
  // Yarım birimden az taşma kaydırılamaz sayılır (yuvarlama gürültüsü).
  return {
    x: overflowX > 0.5 ? round3(clamp01(start.x - delta.x / overflowX)) : start.x,
    y: overflowY > 0.5 ? round3(clamp01(start.y - delta.y / overflowY)) : start.y,
  };
}

/** Kutunun görselden kırpıp kırpmadığı (odak ayarı anlamlı mı). */
export function isCropped(box: Size, natural: Size): boolean {
  const { overflowX, overflowY } = coverFit(box, natural);
  return overflowX > 0.5 || overflowY > 0.5;
}

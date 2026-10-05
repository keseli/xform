import { FRAME } from '../config.js';

/**
 * Frame'i kapsayıcıya bütün olarak sığdırır (reflow yok). Ölçeği döner ve
 * ölçekten bağımsız kalması gereken çizgi/rozet boyutları için --scale ve
 * --hairline değişkenlerini günceller.
 */
export function fitFrame(holder, container, pad) {
  const s = Math.min(
    (container.clientWidth - pad * 2) / FRAME.width,
    (container.clientHeight - pad * 2) / FRAME.height,
  );
  holder.style.width = `${FRAME.width * s}px`;
  holder.style.height = `${FRAME.height * s}px`;
  holder.firstChild.style.transform = `scale(${s})`;
  const root = document.documentElement;
  root.style.setProperty('--scale', String(s));
  // İnce çizgiler ölçeklenince 1 ekran pikselinin altına düşüp kaybolmasın.
  root.style.setProperty('--hairline', `${Math.max(1, 1 / s)}px`);
  return s;
}

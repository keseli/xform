// Blok elemanının ortak sınıf ve konumu: sınıf sırası, satır içi
// left/top/width/z-index/height. Tema, renk, girinti ve görsel işleme sınıfları
// (styles/main.css) burada eklenir.
import type { CSSProperties } from 'react';
import { CELL, DIVIDER_ROWS, FLOW_TYPES } from '../../config.ts';
import type { PlacedBlock, Theme } from '../../types.ts';

export interface BlockViewProps {
  block: PlacedBlock;
  /** Bloğun bulunduğu sayfanın teması (Spread hesaplar); yoksa paper. */
  theme?: Theme;
  /** Girintili gövde paragrafı (src/style.ts indentedParagraphs). */
  indent?: boolean;
  /** Bu caption ya da notun sonunda gösterilecek künyeler (src/style.ts creditsByBlock). */
  credits?: string[];
  /** Çizimi kullanan tarafın eklediği sınıf (ör. editör vurguları); bileşen anlamını bilmez. */
  className?: string;
  /** Çizimi kullanan tarafın eklediği stil (ör. sürükleme kayması). */
  style?: CSSProperties;
}

const px = (cells: number) => `${cells * CELL}px`;

export function shell({ block: b, className, style, theme, indent }: BlockViewProps) {
  const classes = ['block', `block--${b.type}`];
  if (b.variant) classes.push(`block--${b.type}-${b.variant}`);
  classes.push(`tone--${b.tone ?? 'dark'}`);
  if (theme && theme !== 'paper') classes.push(`theme--${theme}`);
  if (b.color && b.color !== 'default') classes.push(`color--${b.color}`);
  if (indent) classes.push('para--indent');
  if (b.drop_cap) classes.push('drop-cap');
  if (b.treatment && b.treatment !== 'none') classes.push(`treat--${b.treatment}`);
  if (className) classes.push(className);

  const flow = FLOW_TYPES.has(b.type);
  // Akış tiplerinde yükseklik ölçümden gelir (src/render/measure.ts); saklanan h önbellektir.
  const height = b.type === 'divider' ? px(DIVIDER_ROWS) : b.h != null ? px(b.h) : undefined;
  return {
    className: classes.join(' '),
    'data-id': b.id,
    ...(flow ? { 'data-flow': '' } : {}),
    style: { left: px(b.x), top: px(b.y), width: px(b.w), zIndex: b.z ?? 0, height, ...style },
  };
}

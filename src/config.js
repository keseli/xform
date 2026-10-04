// Spread geometrisinin tek kaynağı. Frame oranı veya hücre boyu değişecekse
// yalnızca burası değişir; sayfa ölçüsü, hücre sayısı ve CSS değişkenleri
// buradan türetilir.

export const FRAME = {
  width: 1536, // tasarım birimi, iki sayfa yan yana
  height: 1024,
  cell: 4, // ızgara hücresi, iki yönde aynı
};

if (FRAME.width % FRAME.cell || FRAME.height % FRAME.cell || (FRAME.width / 2) % FRAME.cell) {
  throw new Error('FRAME ölçüleri ve sayfa genişliği hücrenin tam katı olmalı');
}

export const CELL = FRAME.cell;
export const COLS = FRAME.width / CELL; // 384
export const ROWS = FRAME.height / CELL; // 256
export const PAGE_COLS = COLS / 2; // 192

// Kenar boşlukları kılavuzdur, kısıt değil. Hücre cinsinden, sayfa başına.
// outer: sayfanın dış kenarı, inner: ortadaki kat tarafı.
export const MARGINS = { top: 20, bottom: 20, outer: 14, inner: 12 };

// Editörde taşıma/resize snap adımı (hücre). fine: değiştirici tuşla.
export const SNAP = { step: 2, fine: 1 };

// Yüksekliği içerikten türeyen tipler (resize'da yalnızca genişlik değişir).
export const FLOW_TYPES = new Set(['text', 'heading', 'quote', 'note']);

// Divider yüksekliği sabittir.
export const DIVIDER_ROWS = 1;

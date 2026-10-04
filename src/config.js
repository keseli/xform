// Spread geometrisinin tek kaynağı. Frame oranı veya hücre boyu değişecekse
// yalnızca burası değişir; sayfa ölçüsü, hücre sayısı ve CSS değişkenleri
// buradan türetilir.

export const FRAME = {
  width: 1536, // tasarım birimi, iki sayfa yan yana
  height: 1024,
  cell: 8, // ızgara hücresi, iki yönde aynı
};

if (FRAME.width % FRAME.cell || FRAME.height % FRAME.cell || (FRAME.width / 2) % FRAME.cell) {
  throw new Error('FRAME ölçüleri ve sayfa genişliği hücrenin tam katı olmalı');
}

export const CELL = FRAME.cell;
export const COLS = FRAME.width / CELL; // 192
export const ROWS = FRAME.height / CELL; // 128
export const PAGE_COLS = COLS / 2; // 96

// Kenar boşlukları kılavuzdur, kısıt değil. Hücre cinsinden, sayfa başına.
// outer: sayfanın dış kenarı, inner: ortadaki kat tarafı.
export const MARGINS = { top: 10, bottom: 10, outer: 7, inner: 6 };

// Görsel altyazısının blok kutusuna göre yerleşimi (hücre).
// Altyazı görsel kutusunun dışında durur; x, y, w, h her zaman görselin kendisidir.
export const CAPTION = {
  gap: 2, // görselle altyazı arası
  rightWidth: 15, // caption_position: right için sabit genişlik
};

// Yüksekliği içerikten türeyen tipler (resize'da yalnızca genişlik değişir).
export const FLOW_TYPES = new Set(['text', 'heading', 'quote', 'note']);

// Divider yüksekliği sabittir.
export const DIVIDER_ROWS = 1;

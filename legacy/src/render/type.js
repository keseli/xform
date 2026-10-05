import { CELL } from '../config.js';

/** Satır yükseklikleri (styles/main.css'teki --lh-* token'ları) hücrenin tam katı olmalı. */
export function checkLineHeights() {
  const style = getComputedStyle(document.documentElement);
  for (const name of ['title', 'deck', 'body', 'quote', 'subhead', 'small']) {
    const value = parseFloat(style.getPropertyValue(`--lh-${name}`));
    if (!(value > 0) || value % CELL) {
      console.warn(`[xform] --lh-${name} (${value}) hücrenin (${CELL}) tam katı değil`);
    }
  }
}

// Ölçümde kullanılan kesitler (styles/main.css). Tarayıcı fontu ancak bir metin
// onu kullanınca indirir; document.fonts.ready o ana kadar beklemez. Bu yüzden
// ilk ölçümden önce açıkça yüklenir.
const FACES = [
  '400 16px Newsreader',
  'italic 400 16px Newsreader',
  '500 16px Newsreader',
  '400 12px Inter',
  '600 12px Inter',
];
const FONT_TIMEOUT = 3000;

/** Fontları yükler; ağ yavaşsa en fazla FONT_TIMEOUT bekler (sonra onFontsChanged düzeltir). */
export function loadFonts() {
  const all = Promise.allSettled(FACES.map((f) => document.fonts.load(f)));
  return Promise.race([all, new Promise((r) => setTimeout(r, FONT_TIMEOUT))]);
}

/**
 * Bir font sonradan yüklendiğinde (yavaş ağ, ilk kez kullanılan kesit) çağrılır;
 * yükseklikler yeniden ölçülüp yığınlar yeniden dizilmelidir.
 */
export function onFontsChanged(fn) {
  document.fonts.addEventListener('loadingdone', () => fn());
}

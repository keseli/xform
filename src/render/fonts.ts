import { CELL } from '../config.ts';

/** Satır yükseklikleri (styles/main.css'teki --lh-* token'ları) hücrenin tam katı olmalı. */
export function checkLineHeights(): void {
  const style = getComputedStyle(document.documentElement);
  for (const name of ['title', 'deck', 'body', 'quote', 'caption', 'note', 'subhead', 'kicker', 'chrome']) {
    const value = parseFloat(style.getPropertyValue(`--lh-${name}`));
    if (!(value > 0) || value % CELL) {
      console.warn(`[xform] --lh-${name} (${value}) hücrenin (${CELL}) tam katı değil`);
    }
  }
}

// Ölçümde kullanılan kesitler (styles/main.css, styles/fonts/). Tarayıcı fontu
// ancak bir metin onu kullanınca indirir; document.fonts.ready o ana kadar
// beklemez. Bu yüzden ilk ölçümden önce açıkça yüklenir. Fontlar değişken:
// her dosya tüm kalınlıkları kapsar, liste dosya başına bir kesit yeter.
const FACES = [
  '400 16px Newsreader', // gövde, başlık, caption, note
  'italic 400 16px Newsreader', // deck, quote
  '400 16px Geist', // kicker, subhead (600)
  '400 16px "Geist Mono"', // chrome, etiketler
];
const FONT_TIMEOUT = 3000;

/** Fontları yükler; ağ yavaşsa en fazla FONT_TIMEOUT bekler (sonra onFontsChanged düzeltir). */
export function loadFonts(): Promise<unknown> {
  const all = Promise.allSettled(FACES.map((f) => document.fonts.load(f)));
  return Promise.race([all, new Promise((r) => setTimeout(r, FONT_TIMEOUT))]);
}

/**
 * Bir font sonradan yüklendiğinde (yavaş ağ, ilk kez kullanılan kesit) çağrılır;
 * yükseklikler yeniden ölçülüp yığınlar yeniden dizilmelidir. Aboneliği bırakan
 * fonksiyon döner.
 */
export function onFontsChanged(fn: () => void): () => void {
  const handler = () => fn();
  document.fonts.addEventListener('loadingdone', handler);
  return () => document.fonts.removeEventListener('loadingdone', handler);
}

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

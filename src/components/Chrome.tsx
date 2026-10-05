// Header: kodda sabit, blok değil. Sol: XFORM, ay/yıl, sayı no. Sağ: bölüm adı ve
// sayfa numarası. Görünürlük sayfa bazında spread verisinden (chrome_left/right).
import { CELL, MARGINS, PAGE_COLS } from '../config.ts';
import { pageNumbers } from '../model.ts';
import { themeOf } from '../style.ts';
import type { IssueMeta, Spread } from '../types.ts';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface ChromeProps {
  side: 'left' | 'right';
  issue: IssueMeta;
  spread: Spread;
  index: number;
}

export function Chrome({ side, issue, spread, index }: ChromeProps) {
  const pageLeft = side === 'left' ? 0 : PAGE_COLS;
  const leftMargin = side === 'left' ? MARGINS.outer : MARGINS.inner;
  const rightMargin = side === 'left' ? MARGINS.inner : MARGINS.outer;
  const style = {
    left: `${(pageLeft + leftMargin) * CELL}px`,
    width: `${(PAGE_COLS - leftMargin - rightMargin) * CELL}px`,
  };
  if (side === 'left') {
    return (
      <header className={`chrome chrome--left theme--${themeOf(spread, 'left')}`} style={style}>
        <span className="chrome-mast">{issue.title}</span>
        <span className="chrome-meta">
          {`${MONTHS[issue.month - 1]} ${issue.year}`}
          <span className="chrome-sep">/</span>
          {`Issue ${issue.number}`}
        </span>
      </header>
    );
  }
  return (
    <header className={`chrome chrome--right theme--${themeOf(spread, 'right')}`} style={style}>
      <span></span>
      <span className="chrome-section">{spread.section ?? ''}</span>
      <span className="chrome-folio">{String(pageNumbers(issue, index).right).padStart(3, '0')}</span>
    </header>
  );
}

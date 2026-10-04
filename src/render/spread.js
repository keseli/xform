import { FRAME, CELL, MARGINS, PAGE_COLS } from '../config.js';
import { blocksOnSpread, pageNumbers } from '../model.js';
import { escapeHtml } from '../inline.js';
import { renderBlock } from './blocks.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Bir spread'in frame'ini çizer (ölçeklenmemiş, tasarım biriminde).
 * options.guides: ızgara ve kenar boşluğu kılavuzlarını göster.
 */
export function renderSpread(data, spreadId, { guides = false } = {}) {
  const index = data.spreads.findIndex((s) => s.id === spreadId);
  const spread = data.spreads[index];
  if (!spread) throw new Error(`spread bulunamadı: ${spreadId}`);

  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.style.width = `${FRAME.width}px`;
  frame.style.height = `${FRAME.height}px`;
  frame.dataset.spread = spread.id;

  if (guides) frame.append(renderGuides());

  const layer = document.createElement('div');
  layer.className = 'blocks';
  for (const block of blocksOnSpread(data.blocks, spread.id)) layer.append(renderBlock(block));
  frame.append(layer);

  frame.append(gutterShade());
  frame.append(...renderChrome(data.issue, spread, index));
  return frame;
}

function renderChrome(issue, spread, index) {
  const pages = pageNumbers(issue, index);
  const out = [];

  if (spread.chrome_left === 'full') {
    out.push(
      chromeHeader('left', [
        `<span class="chrome-mast">${escapeHtml(issue.title)}</span>`,
        `<span class="chrome-meta">${MONTHS[issue.month - 1]} ${issue.year}` +
          `<span class="chrome-sep">/</span>Issue ${escapeHtml(issue.number)}</span>`,
      ]),
    );
  }
  if (spread.chrome_right === 'full') {
    out.push(
      chromeHeader('right', [
        '<span></span>',
        `<span class="chrome-section">${escapeHtml(spread.section ?? '')}</span>`,
        `<span class="chrome-folio">${String(pages.right).padStart(3, '0')}</span>`,
      ]),
    );
  }
  return out;
}

function chromeHeader(side, parts) {
  const el = document.createElement('header');
  el.className = `chrome chrome--${side}`;
  const pageLeft = side === 'left' ? 0 : PAGE_COLS;
  const leftMargin = side === 'left' ? MARGINS.outer : MARGINS.inner;
  const rightMargin = side === 'left' ? MARGINS.inner : MARGINS.outer;
  el.style.left = `${(pageLeft + leftMargin) * CELL}px`;
  el.style.width = `${(PAGE_COLS - leftMargin - rightMargin) * CELL}px`;
  el.innerHTML = parts.join('');
  return el;
}

function renderGuides() {
  const el = document.createElement('div');
  el.className = 'guides';
  for (const side of ['left', 'right']) {
    const m = document.createElement('div');
    m.className = 'guides-margin';
    const pageLeft = side === 'left' ? 0 : PAGE_COLS;
    const l = side === 'left' ? MARGINS.outer : MARGINS.inner;
    const r = side === 'left' ? MARGINS.inner : MARGINS.outer;
    m.style.left = `${(pageLeft + l) * CELL}px`;
    m.style.top = `${MARGINS.top * CELL}px`;
    m.style.width = `${(PAGE_COLS - l - r) * CELL}px`;
    m.style.height = `${FRAME.height - (MARGINS.top + MARGINS.bottom) * CELL}px`;
    el.append(m);
  }
  return el;
}

function gutterShade() {
  const el = document.createElement('div');
  el.className = 'gutter';
  return el;
}

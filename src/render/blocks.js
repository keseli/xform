import { CELL, DIVIDER_ROWS, FLOW_TYPES } from '../config.js';
import { escapeHtml, inlineHtml } from '../inline.js';

const px = (cells) => `${cells * CELL}px`;

/** Tek bir bloğun DOM düğümü. Konum hücreden tasarım birimine çevrilir. */
export function renderBlock(block) {
  const el = document.createElement('div');
  el.className = `block block--${block.type}`;
  if (block.variant) el.classList.add(`block--${block.type}-${block.variant}`);
  el.classList.add(`tone--${block.tone ?? 'dark'}`);
  el.dataset.id = block.id;

  el.style.left = px(block.x);
  el.style.top = px(block.y);
  el.style.width = px(block.w);
  el.style.zIndex = String(block.z ?? 0);

  if (FLOW_TYPES.has(block.type)) {
    // Yükseklik ölçümden sonra settleHeights() ile hücreye yuvarlanır.
    el.dataset.flow = '';
  } else if (block.type === 'divider') {
    el.style.height = px(DIVIDER_ROWS);
  } else {
    el.style.height = px(block.h);
  }

  RENDERERS[block.type](el, block);
  return el;
}

const RENDERERS = {
  heading(el, b) {
    el.innerHTML = `<div class="flow">${inlineHtml(b.content)}</div>`;
  },

  text(el, b) {
    const label =
      b.variant === 'caption' && b.label ? `<span class="caption-label">${escapeHtml(b.label)}</span>` : '';
    el.innerHTML = `<p class="flow">${label}${inlineHtml(b.content)}</p>`;
  },

  quote(el, b) {
    el.innerHTML = `<blockquote class="flow">${inlineHtml(b.content)}</blockquote>`;
  },

  note(el, b) {
    const label = b.label ? `<span class="note-label">${escapeHtml(b.label)}</span>` : '';
    el.innerHTML = `<div class="flow">${label}<span class="note-body">${inlineHtml(b.content)}</span></div>`;
  },

  divider(el) {
    el.innerHTML = '<div class="rule"></div>';
  },

  image(el, b) {
    const frame = document.createElement('div');
    frame.className = 'image-frame';
    if (b.source) {
      const img = document.createElement('img');
      img.src = b.source;
      img.alt = b.alt ?? '';
      img.draggable = false;
      // Kutu oranı görselden farklıysa focal_point'e göre kırpılır.
      const fx = (b.focal_point?.x ?? 0.5) * 100;
      const fy = (b.focal_point?.y ?? 0.5) * 100;
      img.style.objectPosition = `${fx}% ${fy}%`;
      frame.append(img);
    }
    el.append(frame);
    if (b.credit) {
      const credit = document.createElement('span');
      credit.className = 'image-credit';
      credit.innerHTML = inlineHtml(b.credit);
      el.append(credit);
    }
  },
};

/**
 * Akış tiplerinin yüksekliğini içerikten ölçer ve bir üst hücreye yuvarlar.
 * Fontlar yüklendikten sonra, eleman DOM'dayken çağrılmalı. Ölçüm transform'dan
 * etkilenmez (offsetHeight ölçeklenmemiş yerleşim değeridir).
 * Hücre cinsinden yükseklikleri { id: h } olarak döner.
 */
export function settleHeights(root) {
  const heights = {};
  for (const el of root.querySelectorAll('.block[data-flow]')) {
    el.style.height = '';
    const rows = Math.max(1, Math.ceil(el.offsetHeight / CELL - 1e-6));
    el.style.height = px(rows);
    heights[el.dataset.id] = rows;
  }
  return heights;
}

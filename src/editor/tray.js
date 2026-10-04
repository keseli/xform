// Tepsi: yerleştirilmemiş bloklar, order sırasıyla.
import { unplacedBlocks } from '../model.js';
import { escapeHtml } from '../inline.js';
import { kindLabel, snippet } from './labels.js';

export function createTray(el, store, canvas) {
  const { state } = store;

  function render() {
    const items = unplacedBlocks(state.data.blocks);
    const selected = state.data.blocks.find((b) => b.id === state.selectedId);
    const related = new Set(selected?.relates_to ?? []);

    const list = items
      .map((b) => {
        const cls = ['tray-item'];
        if (b.id === state.selectedId) cls.push('is-selected');
        if (related.has(b.id)) cls.push('is-related');
        const thumb =
          b.type === 'image' && b.source
            ? `<img src="${escapeHtml(b.source)}" alt="" draggable="false">`
            : '';
        return `<li class="${cls.join(' ')}" data-id="${escapeHtml(b.id)}">
          <div class="tray-meta"><span class="tray-order">${b.order}</span>${escapeHtml(kindLabel(b))}${
            b.label ? ` <span class="tray-label">${escapeHtml(b.label)}</span>` : ''
          }</div>
          ${thumb}
          <div class="tray-text">${escapeHtml(snippet(b))}</div>
        </li>`;
      })
      .join('');

    const scroll = el.querySelector('.tray-list')?.scrollTop ?? 0;
    el.innerHTML = `
      <div class="panel-head">Tepsi <span class="count">${items.length}</span></div>
      ${
        items.length
          ? `<ol class="tray-list">${list}</ol>`
          : '<p class="empty">Tepsi boş. Bir bloğu geri göndermek için seçip Delete’e bas.</p>'
      }`;
    const listEl = el.querySelector('.tray-list');
    if (listEl) listEl.scrollTop = scroll;
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const item = e.target.closest('.tray-item');
    if (!item) return;
    const block = state.data.blocks.find((b) => b.id === item.dataset.id);
    const img = item.querySelector('img');
    const ratio = img?.naturalWidth ? img.naturalWidth / img.naturalHeight : undefined;
    canvas.beginPlace(block, e, { ratio, onClick: () => store.select(block.id) });
  });

  return { render };
}

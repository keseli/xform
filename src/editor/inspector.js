// Sağ panel: seçili bloğun bilgileri ve işlemleri; seçim yoksa spread ayarları.
// Altta her zaman bu spread'in uyarıları.
import { isPlaced, blocksOnSpread } from '../model.js';
import { escapeHtml as esc } from '../inline.js';
import { computeWarnings } from './warnings.js';
import { kindLabel, pageLabel, snippet } from './labels.js';

export function createInspector(el, store, actions) {
  const { state } = store;

  function render() {
    const { data } = state;
    const warnings = computeWarnings(data);
    const selected = data.blocks.find((b) => b.id === state.selectedId);
    el.innerHTML = (selected ? blockPanel(selected, warnings) : spreadPanel()) + warningsPanel(warnings);
  }

  function spreadName(spreadId) {
    const i = state.data.spreads.findIndex((s) => s.id === spreadId);
    return i < 0 ? 'tepsi' : `spread ${i + 1}`;
  }

  function blockPanel(b, warnings) {
    const spreadId = state.data.spreads[state.spreadIndex].id;
    const placed = isPlaced(b);
    const metrics = placed
      ? `<dl class="metrics">${['x', 'y', 'w', 'h', 'z']
          .map((k) => `<div><dt>${k}</dt><dd>${b[k]}</dd></div>`)
          .join('')}</dl>`
      : '<p class="muted">Tepside. Yerleştirmek için tepsiden spread’e sürükle.</p>';

    const spreadSelect = placed
      ? `<label class="field">Spread
          <select data-action="move-spread">${state.data.spreads
            .map(
              (s, i) =>
                `<option value="${esc(s.id)}"${s.id === b.spread_id ? ' selected' : ''}>${i + 1} · ${pageLabel(
                  state.data.issue,
                  i,
                )} · ${esc(s.section ?? '')}</option>`,
            )
            .join('')}</select>
        </label>`
      : '';

    const relations = (b.relates_to ?? []).length
      ? `<div class="field">İlişkili<div class="chips">${b.relates_to
          .map((id) => {
            const r = state.data.blocks.find((x) => x.id === id);
            const where = r?.spread_id === spreadId ? 'bu spread' : spreadName(r?.spread_id);
            return `<button class="chip${r?.spread_id === spreadId ? ' chip--here' : ''}" data-action="select" data-id="${esc(
              id,
            )}">${esc(id)} <span>${esc(where)}</span></button>`;
          })
          .join('')}</div></div>`
      : '';

    const lock =
      b.type === 'image'
        ? `<label class="check"><input type="checkbox" data-action="lock"${
            state.lockAspect ? ' checked' : ''
          }> Oran kilidi <kbd>L</kbd> <span class="muted">(Shift ile geçici ters)</span></label>`
        : '';

    const own = warnings.get(b.id) ?? [];
    return `<section class="panel">
      <div class="panel-head">${esc(kindLabel(b))} <span class="count">sıra ${b.order}</span></div>
      <div class="block-id">${esc(b.id)}</div>
      <p class="snippet">${esc(snippet(b, 140))}</p>
      ${metrics}
      ${spreadSelect}
      ${relations}
      ${lock}
      <div class="buttons">
        <button data-action="front"${placed ? '' : ' disabled'}>Öne getir <kbd>]</kbd></button>
        <button data-action="back"${placed ? '' : ' disabled'}>Arkaya gönder <kbd>[</kbd></button>
        <button data-action="unplace" class="danger"${placed ? '' : ' disabled'}>Tepsiye gönder <kbd>Del</kbd></button>
      </div>
      ${own.length ? `<ul class="warnings">${own.map((w) => `<li class="warn--${w.kind}">${esc(w.message)}</li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function spreadPanel() {
    const i = state.spreadIndex;
    const s = state.data.spreads[i];
    const empty = blocksOnSpread(state.data.blocks, s.id).length === 0;
    const only = state.data.spreads.length === 1;
    return `<section class="panel">
      <div class="panel-head">Spread ${i + 1} <span class="count">sayfa ${pageLabel(state.data.issue, i)}</span></div>
      <label class="field">Bölüm adı
        <input type="text" data-action="section" value="${esc(s.section ?? '')}">
      </label>
      <label class="check"><input type="checkbox" data-action="chrome-left"${
        s.chrome_left === 'full' ? ' checked' : ''
      }> Sol sayfada chrome</label>
      <label class="check"><input type="checkbox" data-action="chrome-right"${
        s.chrome_right === 'full' ? ' checked' : ''
      }> Sağ sayfada chrome</label>
      <div class="buttons">
        <button data-action="remove-spread" class="danger"${empty && !only ? '' : ' disabled'} title="${
          only ? 'Son spread silinemez' : empty ? '' : 'Yalnız boş spread silinebilir'
        }">Spread’i sil</button>
      </div>
    </section>`;
  }

  function warningsPanel(warnings) {
    const spreadId = state.data.spreads[state.spreadIndex].id;
    const rows = [];
    let elsewhere = 0;
    for (const [id, list] of warnings) {
      const b = state.data.blocks.find((x) => x.id === id);
      if (b.spread_id !== spreadId) {
        elsewhere += list.length;
        continue;
      }
      for (const w of list) rows.push({ b, w });
    }
    rows.sort((a, z) => a.b.order - z.b.order);
    return `<section class="panel panel--warnings">
      <div class="panel-head">Uyarılar <span class="count">${rows.length}</span></div>
      ${
        rows.length
          ? `<ul class="warning-list">${rows
              .map(
                ({ b, w }) => `<li><button class="warn--${w.kind}" data-action="select" data-id="${esc(b.id)}">
                  <span class="warning-who">${b.order} · ${esc(b.id)}</span>${esc(w.message)}</button></li>`,
              )
              .join('')}</ul>`
          : '<p class="muted">Bu spread’de uyarı yok.</p>'
      }
      ${elsewhere ? `<p class="muted">Diğer spread’lerde ${elsewhere} uyarı.</p>` : ''}
    </section>`;
  }

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const id = state.selectedId;
    switch (btn.dataset.action) {
      case 'select':
        return actions.reveal(btn.dataset.id);
      case 'front':
        return actions.front(id);
      case 'back':
        return actions.back(id);
      case 'unplace':
        return actions.unplace(id);
      case 'remove-spread':
        return actions.removeSpread();
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target;
    switch (t.dataset.action) {
      case 'move-spread':
        return actions.moveToSpread(state.selectedId, t.value);
      case 'lock':
        return actions.setLock(t.checked);
      case 'section':
        return actions.updateSpread({ section: t.value.trim() });
      case 'chrome-left':
        return actions.updateSpread({ chrome_left: t.checked ? 'full' : 'none' });
      case 'chrome-right':
        return actions.updateSpread({ chrome_right: t.checked ? 'full' : 'none' });
    }
  });

  return { render };
}

// Sağ panel: seçili bloğun, yığının ya da çoklu seçimin bilgileri ve
// işlemleri; seçim yoksa spread ayarları. Altta her zaman bu spread'in uyarıları.
import { isPlaced, blocksOnSpread } from '../model.js';
import { escapeHtml as esc } from '../inline.js';
import { computeWarnings } from './warnings.js';
import { kindLabel, pageLabel, snippet } from './labels.js';
import { isCropped } from './focal.js';
import { CELL } from '../config.js';
import { childrenOf, stackBounds, stackById } from '../stacks.js';

export function createInspector(el, store, actions) {
  const { state } = store;

  function render() {
    const { data } = state;
    const warnings = computeWarnings(data);
    const spreadId = data.spreads[state.spreadIndex].id;
    const ids = state.selectedIds;
    const stack = ids.length === 1 ? stackById(data, ids[0]) : null;
    const selected = ids.length === 1 ? data.blocks.find((b) => b.id === ids[0]) : null;
    let panel;
    if (ids.length > 1) panel = multiPanel(ids, spreadId);
    else if (stack) panel = stackPanel(stack);
    else if (selected) panel = blockPanel(selected, warnings);
    else panel = spreadPanel();
    el.innerHTML = panel + warningsPanel(warnings);
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

    const stack = b.stack_id ? stackById(state.data, b.stack_id) : null;
    const inStack = stack
      ? `<div class="field">Auto layout
          <div class="focal-row">
            <span class="focal-values">${stack.direction === 'vertical' ? 'Dikey' : 'Yatay'} yığında ${b.stack_index + 1}. sırada</span>
            <button data-action="select" data-id="${esc(stack.id)}">Yığını seç</button>
            <button data-action="detach">Çıkar</button>
          </div>
          <span class="muted">Konum yığından gelir. Sürükleyerek ya da ok tuşlarıyla sırasını değiştir.</span>
        </div>`
      : '';

    const spreadSelect = placed && !stack
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

    const focal = b.type === 'image' && placed && b.source ? focalPanel(b) : '';

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
      ${inStack}
      ${spreadSelect}
      ${relations}
      ${lock}
      ${focal}
      <div class="buttons">
        <button data-action="front"${placed ? '' : ' disabled'}>Öne getir <kbd>]</kbd></button>
        <button data-action="back"${placed ? '' : ' disabled'}>Arkaya gönder <kbd>[</kbd></button>
        <button data-action="unplace" class="danger"${placed ? '' : ' disabled'}>Tepsiye gönder <kbd>Del</kbd></button>
      </div>
      ${own.length ? `<ul class="warnings">${own.map((w) => `<li class="warn--${w.kind}">${esc(w.message)}</li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function spreadOptions(selectedId) {
    return state.data.spreads
      .map(
        (s, i) =>
          `<option value="${esc(s.id)}"${s.id === selectedId ? ' selected' : ''}>${i + 1} · ${pageLabel(
            state.data.issue,
            i,
          )} · ${esc(s.section ?? '')}</option>`,
      )
      .join('');
  }

  function stackPanel(st) {
    const kids = childrenOf(state.data, st.id);
    const r = stackBounds(state.data, st);
    return `<section class="panel">
      <div class="panel-head">Auto layout <span class="count">${kids.length} blok</span></div>
      <dl class="metrics">${[['x', r.x], ['y', r.y], ['w', r.w], ['h', r.h], ['gap', st.gap]]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
        .join('')}</dl>
      <div class="field-row">
        <label class="field">Yön
          <select data-action="stack-direction">
            <option value="vertical"${st.direction === 'vertical' ? ' selected' : ''}>Dikey ↓</option>
            <option value="horizontal"${st.direction === 'horizontal' ? ' selected' : ''}>Yatay →</option>
          </select>
        </label>
        <label class="field">Boşluk (hücre)
          <input type="number" min="0" step="1" data-action="stack-gap" value="${st.gap}">
        </label>
      </div>
      <label class="field">Spread
        <select data-action="move-spread">${spreadOptions(st.spread_id)}</select>
      </label>
      <div class="field">Sıra
        <ol class="stack-list">${kids
          .map(
            (b) => `<li><button data-action="select" data-id="${esc(b.id)}"><span class="tray-order">${b.order}</span>
              ${esc(kindLabel(b))} <span class="muted">${esc(snippet(b, 40))}</span></button></li>`,
          )
          .join('')}</ol>
        <span class="muted">Çift tık ya da listeden seç: içindeki bloğa gir.</span>
      </div>
      <div class="buttons">
        <button data-action="remove-stack">Auto layout’u kaldır <kbd>Alt⇧A</kbd></button>
        <button data-action="unplace" class="danger">Tepsiye gönder <kbd>Del</kbd></button>
      </div>
    </section>`;
  }

  function multiPanel(ids, spreadId) {
    const here = ids.filter((id) => (stackById(state.data, id) ?? state.data.blocks.find((b) => b.id === id))?.spread_id === spreadId);
    const free = here.filter((id) => state.data.blocks.find((b) => b.id === id)?.stack_id == null && !stackById(state.data, id));
    return `<section class="panel">
      <div class="panel-head">Çoklu seçim <span class="count">${here.length} öğe</span></div>
      <p class="muted">Birlikte taşı (sürükle ya da ok tuşları). Shift+tık seçime ekler ya da çıkarır.</p>
      <div class="buttons">
        <button data-action="auto-layout"${free.length ? '' : ' disabled'}>Auto layout <kbd>⇧A</kbd></button>
        <button data-action="unplace-all" class="danger">Tepsiye gönder <kbd>Del</kbd></button>
      </div>
    </section>`;
  }

  function focalPanel(b) {
    const f = b.focal_point ?? { x: 0.5, y: 0.5 };
    const natural = actions.naturalSize(b.id);
    const cropped = natural ? isCropped({ width: b.w * CELL, height: b.h * CELL }, natural) : true;
    const on = state.focalId === b.id;
    return `<div class="field">Odak noktası
      <div class="focal-row">
        <span class="focal-values">x ${f.x.toFixed(2)} · y ${f.y.toFixed(2)}</span>
        <button data-action="focal-mode" aria-pressed="${on}">Kaydır <kbd>F</kbd></button>
        <button data-action="focal-center"${f.x === 0.5 && f.y === 0.5 ? ' disabled' : ''}>Ortala</button>
      </div>
      <span class="muted">${
        !cropped
          ? 'Kutu görselle aynı oranda; kırpma yok.'
          : on
            ? 'Görseli kutu içinde sürükle. Esc ya da kutu dışına tıkla: çık.'
            : 'Çift tık ya da F: görseli kutu içinde kaydır.'
      }</span>
    </div>`;
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
      case 'detach':
        return actions.detachFromStack(id);
      case 'remove-stack':
        return actions.removeAutoLayout();
      case 'auto-layout':
        return actions.autoLayout();
      case 'unplace-all':
        return actions.unplace(state.selectedIds);
      case 'focal-mode':
        return actions.toggleFocal(id);
      case 'focal-center':
        return actions.setFocal(id, { x: 0.5, y: 0.5 });
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target;
    switch (t.dataset.action) {
      case 'move-spread':
        return actions.moveToSpread(state.selectedId, t.value);
      case 'lock':
        return actions.setLock(t.checked);
      case 'stack-direction':
        return actions.updateStack(state.selectedId, { direction: t.value });
      case 'stack-gap': {
        const gap = Math.max(0, Math.round(Number(t.value)));
        return Number.isFinite(gap) ? actions.updateStack(state.selectedId, { gap }) : render();
      }
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

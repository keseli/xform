// Editör girişi: durum, işlemler, üst çubuk ve klavye kısayolları.
import { FRAME, CELL, SNAP } from '../config.js';
import { blocksOnSpread } from '../model.js';
import { loadIssue, saveIssue } from '../data.js';
import { escapeHtml as esc } from '../inline.js';
import { checkLineHeights } from '../render/type.js';
import { createStore } from './store.js';
import { createCanvas } from './canvas.js';
import { createTray } from './tray.js';
import { createInspector } from './inspector.js';
import { computeWarnings } from './warnings.js';
import { keepInFrame, normalizeZ } from './geometry.js';
import { pageLabel } from './labels.js';

const params = new URLSearchParams(location.search);
const ISSUE = params.get('issue') ?? 'issue-001';
const POSITION_KEYS = ['spread_id', 'x', 'y', 'w', 'h', 'z'];

const root = document.documentElement;
root.style.setProperty('--cell', `${CELL}px`);
root.style.setProperty('--frame-w', `${FRAME.width}px`);
root.style.setProperty('--frame-h', `${FRAME.height}px`);

// Görünüm tercihleri yalnız bu tarayıcıda tutulur; yoksa varsayılan kullanılır.
function pref(key, fallback) {
  try {
    const v = localStorage.getItem(`xform.${key}`);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function setPref(key, value) {
  try {
    localStorage.setItem(`xform.${key}`, value ? '1' : '0');
  } catch {}
}

async function boot() {
  const data = await loadIssue(ISSUE);
  const wanted = params.get('spread');
  const state = {
    data,
    spreadIndex: Math.max(0, data.spreads.findIndex((s) => s.id === wanted)),
    selectedId: null,
    showGrid: pref('grid', true),
    lockAspect: pref('lock', true),
    saveStatus: 'saved',
  };
  const store = createStore(state, (d) => saveIssue(ISSUE, d));

  checkLineHeights();
  await document.fonts.ready;

  const block = (id) => state.data.blocks.find((b) => b.id === id);
  const currentSpread = () => state.data.spreads[state.spreadIndex];

  const actions = {
    /** Bloğu seç; başka bir spread'deyse oraya geç. */
    reveal(id) {
      const b = block(id);
      if (!b) return;
      const i = state.data.spreads.findIndex((s) => s.id === b.spread_id);
      if (i >= 0 && i !== state.spreadIndex) {
        store.view((s) => {
          s.spreadIndex = i;
          s.selectedId = id;
        });
      } else {
        store.select(id);
      }
    },
    unplace(id) {
      store.commit(() => {
        for (const k of POSITION_KEYS) block(id)[k] = null;
      });
    },
    front(id) {
      store.commit(() => {
        const b = block(id);
        const others = blocksOnSpread(state.data.blocks, b.spread_id);
        b.z = Math.max(...others.map((o) => o.z ?? 0)) + 1;
        normalizeZ(others);
      });
    },
    back(id) {
      store.commit(() => {
        const b = block(id);
        const others = blocksOnSpread(state.data.blocks, b.spread_id);
        b.z = Math.min(...others.map((o) => o.z ?? 0)) - 1;
        normalizeZ(others);
      });
    },
    nudge(id, dx, dy) {
      store.commit(() => {
        const b = block(id);
        Object.assign(b, keepInFrame({ ...b, x: b.x + dx, y: b.y + dy }));
      });
    },
    moveToSpread(id, spreadId) {
      store.commit((s) => {
        const b = block(id);
        const others = blocksOnSpread(s.data.blocks, spreadId);
        b.spread_id = spreadId;
        b.z = Math.max(0, ...others.map((o) => o.z ?? 0)) + 1;
        s.spreadIndex = s.data.spreads.findIndex((x) => x.id === spreadId);
      });
    },
    addSpread() {
      store.commit((s) => {
        const ids = new Set(s.data.spreads.map((x) => x.id));
        let n = s.data.spreads.length + 1;
        while (ids.has(`s-${n}`)) n++;
        s.data.spreads.push({
          id: `s-${n}`,
          section: currentSpread().section ?? '',
          chrome_left: 'full',
          chrome_right: 'full',
        });
        s.spreadIndex = s.data.spreads.length - 1;
        s.selectedId = null;
      });
    },
    removeSpread() {
      const s = currentSpread();
      if (state.data.spreads.length === 1 || blocksOnSpread(state.data.blocks, s.id).length) return;
      store.commit((st) => {
        st.data.spreads.splice(st.spreadIndex, 1);
        st.spreadIndex = Math.max(0, st.spreadIndex - 1);
      });
    },
    updateSpread(patch) {
      store.commit(() => Object.assign(currentSpread(), patch));
    },
    goToSpread(i) {
      if (i === state.spreadIndex) return;
      store.view((s) => {
        s.spreadIndex = i;
        const b = block(s.selectedId);
        if (b?.spread_id && b.spread_id !== s.data.spreads[i].id) s.selectedId = null;
      });
    },
    setLock(on) {
      setPref('lock', on);
      store.view((s) => (s.lockAspect = on));
    },
    toggleGrid() {
      setPref('grid', !state.showGrid);
      store.view((s) => (s.showGrid = !s.showGrid));
    },
  };

  const canvas = createCanvas(document.getElementById('canvas'), store);
  const tray = createTray(document.getElementById('tray'), store, canvas);
  const inspector = createInspector(document.getElementById('inspector'), store, actions);
  const topbar = document.getElementById('topbar');

  function renderTopbar() {
    const warnings = computeWarnings(state.data);
    const perSpread = new Map();
    for (const [id, list] of warnings) {
      const sid = block(id).spread_id;
      perSpread.set(sid, (perSpread.get(sid) ?? 0) + list.length);
    }
    const tabs = state.data.spreads
      .map((s, i) => {
        const n = perSpread.get(s.id);
        return `<button class="tab${i === state.spreadIndex ? ' is-active' : ''}" data-tab="${i}" title="${esc(
          s.section ?? '',
        )}">${i + 1} <span class="tab-pages">${pageLabel(state.data.issue, i)}</span>${
          n ? `<span class="tab-warn">${n}</span>` : ''
        }</button>`;
      })
      .join('');
    topbar.innerHTML = `
      <div class="brand">XFORM <span>editör</span></div>
      <div class="history">
        <button data-cmd="undo"${store.canUndo ? '' : ' disabled'} title="Geri al (Ctrl+Z)">↶</button>
        <button data-cmd="redo"${store.canRedo ? '' : ' disabled'} title="Yinele (Ctrl+Shift+Z)">↷</button>
      </div>
      <nav class="tabs">${tabs}<button class="tab tab--add" data-cmd="add-spread" title="Yeni spread">+ Spread</button></nav>
      <div class="tools">
        <button class="toggle" data-cmd="grid" aria-pressed="${state.showGrid}">Izgara <kbd>G</kbd></button>
        <button class="toggle" data-cmd="lock" aria-pressed="${state.lockAspect}">Oran kilidi <kbd>L</kbd></button>
        <span class="hint">snap ${SNAP.step} hücre · <kbd>Alt</kbd> ${SNAP.fine}</span>
        <span class="save save--${state.saveStatus}"></span>
        <a class="read-link" href="index.html?issue=${encodeURIComponent(ISSUE)}&spread=${encodeURIComponent(
          currentSpread().id,
        )}" target="_blank">Okuma görünümü ↗</a>
      </div>`;
    renderSave();
  }

  const SAVE_TEXT = {
    saved: 'Kaydedildi',
    pending: 'Değişiklik var…',
    saving: 'Kaydediliyor…',
    error: 'Kaydedilemedi — npm run dev ile mi açtın?',
  };
  function renderSave() {
    const el = topbar.querySelector('.save');
    if (!el) return;
    el.className = `save save--${state.saveStatus}`;
    el.textContent = SAVE_TEXT[state.saveStatus];
  }

  topbar.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) return actions.goToSpread(Number(tab.dataset.tab));
    const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
    if (cmd === 'undo') store.undo();
    if (cmd === 'redo') store.redo();
    if (cmd === 'add-spread') actions.addSpread();
    if (cmd === 'grid') actions.toggleGrid();
    if (cmd === 'lock') actions.setLock(!state.lockAspect);
  });

  store.subscribe((reason) => {
    if (reason === 'save') return renderSave();
    if (reason === 'selection') canvas.drawOverlay();
    else canvas.render();
    tray.render();
    inspector.render();
    renderTopbar();
    const url = new URL(location.href);
    url.searchParams.set('spread', currentSpread().id);
    history.replaceState(null, '', url);
  });

  addEventListener('resize', () => canvas.fit());
  addEventListener('keydown', (e) => {
    // Metin alanında tarayıcının kendi geri alması çalışsın.
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) store.undo();
      else if ((key === 'z' && e.shiftKey) || key === 'y') store.redo();
      else return;
      e.preventDefault();
      return;
    }
    const id = state.selectedId;
    const placed = id && block(id)?.spread_id === currentSpread().id;
    const step = e.altKey ? SNAP.fine : SNAP.step;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };

    if (e.key === 'g') actions.toggleGrid();
    else if (e.key === 'l') actions.setLock(!state.lockAspect);
    else if (e.key === 'Escape') store.select(null);
    else if (!placed) return;
    else if (e.key === 'Delete' || e.key === 'Backspace') actions.unplace(id);
    else if (e.key === ']') actions.front(id);
    else if (e.key === '[') actions.back(id);
    else if (e.key in arrows) actions.nudge(id, ...arrows[e.key]);
    else return;
    e.preventDefault();
  });

  store.emit('all');
  document.body.dataset.ready = '';
  window.__xform = { state, store, actions };
}

boot().catch((err) => {
  document.getElementById('canvas').textContent = `Yüklenemedi: ${err.message}`;
  console.error(err);
});

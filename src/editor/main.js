// Editör girişi: durum, işlemler, üst çubuk ve klavye kısayolları.
import { FRAME, CELL, SNAP } from '../config.js';
import { blocksOnSpread } from '../model.js';
import { ConflictError, fetchRevision, loadIssue, saveIssue } from '../data.js';
import { escapeHtml as esc } from '../inline.js';
import { checkLineHeights, loadFonts, onFontsChanged } from '../render/type.js';
import { createStore } from './store.js';
import { createCanvas } from './canvas.js';
import { createTray } from './tray.js';
import { createInspector } from './inspector.js';
import { computeWarnings } from './warnings.js';
import { keepInFrame, normalizeZ } from './geometry.js';
import {
  childrenOf, createStack, layoutStack, layoutStacks, moveInStack, removeFromStack, removeStack,
  stackBounds, stackById,
} from '../stacks.js';
import { pageLabel } from './labels.js';

const params = new URLSearchParams(location.search);
const ISSUE = params.get('issue') ?? 'issue-001';
const POSITION_KEYS = ['spread_id', 'x', 'y', 'w', 'h', 'z'];
const POLL_MS = 4000;
const NOTICE_MS = 8000;

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
  // revision yalnız kayıt protokolüne ait; geri alma kopyalarına girmesin.
  const revision = data.revision ?? 0;
  delete data.revision;
  const wanted = params.get('spread');
  const state = {
    data,
    revision,
    notice: null,
    spreadIndex: Math.max(0, data.spreads.findIndex((s) => s.id === wanted)),
    selectedIds: [], // blok ve yığın id'leri; son eleman birincil seçim
    focalId: null, // odak modundaki görsel (yalnız arayüz durumu)
    showGrid: pref('grid', true),
    lockAspect: pref('lock', true),
    saveStatus: 'saved',
  };
  // Tek seçim kullanan kod için kısayol: birincil seçim.
  Object.defineProperty(state, 'selectedId', {
    get() {
      return this.selectedIds.at(-1) ?? null;
    },
    set(id) {
      this.selectedIds = id ? [id] : [];
    },
  });
  const store = createStore(state, async (d) => {
    try {
      state.revision = await saveIssue(ISSUE, d, state.revision);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      await reload('Dosya dışarıda değişti; son değişikliğin kaydedilmedi, güncel sürüm yüklendi.');
    }
  });

  let noticeTimer = null;
  function notify(text) {
    state.notice = text;
    renderSave();
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      state.notice = null;
      renderSave();
    }, NOTICE_MS);
  }

  /** Dosyayı yeniden okur; geri alma geçmişi sıfırlanır. */
  async function reload(message) {
    const fresh = await loadIssue(ISSUE);
    state.revision = fresh.revision ?? 0;
    delete fresh.revision;
    store.replace(fresh);
    notify(message);
  }

  // İçe aktarma ya da başka bir sekme dosyayı değiştirdiyse, bekleyen yerel
  // değişiklik yokken sessizce yenile. Bekleyen değişiklik varsa kayıt 409 alır
  // ve yukarıdaki yol işler.
  let checking = false;
  async function checkExternal() {
    if (checking || document.hidden || state.saveStatus !== 'saved') return;
    checking = true;
    try {
      const latest = await fetchRevision(ISSUE);
      if (latest !== state.revision && state.saveStatus === 'saved') {
        await reload('İçerik dışarıda güncellendi, yeniden yüklendi. Geri alma geçmişi sıfırlandı.');
      }
    } catch (err) {
      console.warn('[xform]', err.message);
    } finally {
      checking = false;
    }
  }
  setInterval(checkExternal, POLL_MS);
  addEventListener('focus', checkExternal);
  document.addEventListener('visibilitychange', checkExternal);

  checkLineHeights();
  await loadFonts();

  const block = (id) => state.data.blocks.find((b) => b.id === id);
  const currentSpread = () => state.data.spreads[state.spreadIndex];
  const onSpread = (id, spreadId = currentSpread().id) =>
    (stackById(state.data, id) ?? block(id))?.spread_id === spreadId;
  const isUnit = (id) => stackById(state.data, id) || (block(id) && block(id).stack_id == null);
  const unitRect = (id) => {
    const st = stackById(state.data, id);
    if (st) return stackBounds(state.data, st);
    const b = block(id);
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  };

  const actions = {
    /** Bloğu ya da yığını seç; başka bir spread'deyse oraya geç. */
    reveal(id) {
      const b = stackById(state.data, id) ?? block(id);
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
    /** Bloklar ve yığınlar tepsiye; yığın kalkar, çocukları tepsiye gider. */
    unplace(ids) {
      store.commit((s) => {
        for (const id of [].concat(ids)) {
          const st = stackById(s.data, id);
          const targets = st ? childrenOf(s.data, id).map((b) => b.id) : [id];
          if (st) removeStack(s.data, id);
          for (const bid of targets) {
            removeFromStack(s.data, bid);
            for (const k of POSITION_KEYS) block(bid)[k] = null;
          }
        }
        s.selectedIds = s.selectedIds.filter((id) => block(id) || stackById(s.data, id));
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
    /** Seçili birimleri (serbest blok, yığın) kaydır. */
    nudge(ids, dx, dy) {
      const units = ids.filter(isUnit);
      if (!units.length) return;
      store.commit((s) => {
        for (const id of units) {
          const r = unitRect(id);
          const kept = keepInFrame({ ...r, x: r.x + dx, y: r.y + dy });
          const o = stackById(s.data, id) ?? block(id);
          o.x += kept.x - r.x;
          o.y += kept.y - r.y;
        }
        layoutStacks(s.data);
      });
    },
    /** Yığın içindeki bloğun sırasını bir öne/arkaya al. */
    reorderChild(id, delta) {
      const b = block(id);
      const n = childrenOf(state.data, b.stack_id).length;
      const index = Math.max(0, Math.min(n - 1, b.stack_index + delta));
      if (index !== b.stack_index) store.commit((s) => moveInStack(s.data, id, index));
    },
    moveToSpread(id, spreadId) {
      store.commit((s) => {
        const others = blocksOnSpread(s.data.blocks, spreadId);
        let z = Math.max(0, ...others.map((o) => o.z ?? 0));
        const st = stackById(s.data, id);
        if (st) {
          st.spread_id = spreadId;
          for (const b of childrenOf(s.data, id)) b.z = ++z;
          layoutStack(s.data, st);
        } else {
          const b = block(id);
          b.spread_id = spreadId;
          b.z = z + 1;
        }
        s.spreadIndex = s.data.spreads.findIndex((x) => x.id === spreadId);
      });
    },
    /** Shift+A: seçili serbest bloklardan yığın. */
    autoLayout() {
      const ids = state.selectedIds.filter((id) => block(id)?.stack_id == null && onSpread(id));
      if (!ids.length) {
        notify('Auto layout için serbest blok seç (tık, Shift+tık ya da alan seçimi).');
        return;
      }
      store.commit((s) => {
        const st = createStack(s.data, ids);
        if (st) s.selectedIds = [st.id];
      });
    },
    /** Alt+Shift+A: seçili yığını (ya da seçili bloğun yığınını) kaldır. */
    removeAutoLayout() {
      const id = state.selectedId;
      const stackId = stackById(state.data, id) ? id : block(id)?.stack_id;
      if (!stackId) return;
      store.commit((s) => {
        const kids = childrenOf(s.data, stackId).map((b) => b.id);
        removeStack(s.data, stackId);
        s.selectedIds = kids;
      });
    },
    updateStack(id, patch) {
      store.commit((s) => {
        const st = stackById(s.data, id);
        Object.assign(st, patch);
        layoutStack(s.data, st);
      });
    },
    detachFromStack(id) {
      store.commit(() => removeFromStack(state.data, id));
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
        // Tepsideki seçim kalır; başka spread'de kalan seçim düşer.
        s.selectedIds = s.selectedIds.filter((id) => block(id)?.spread_id == null || onSpread(id, s.data.spreads[i].id));
        s.focalId = null;
      });
    },
    setFocal(id, focal) {
      store.commit(() => (block(id).focal_point = focal));
    },
    toggleFocal(id) {
      canvas.toggleFocal(id);
    },
    naturalSize(id) {
      return canvas.naturalSize(id);
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
    el.className = `save save--${state.notice ? 'notice' : state.saveStatus}`;
    el.textContent = state.notice ?? SAVE_TEXT[state.saveStatus];
    el.title = state.notice ?? '';
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
  // Bir font sonradan gelirse (yavaş ağ) yükseklikler ve yığınlar yeniden.
  onFontsChanged(() => canvas.remeasure());
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
    const ids = state.selectedIds.filter((id) => onSpread(id));
    const b = ids.length === 1 ? block(ids[0]) : null; // tek blok (yığın değil)
    const child = b?.stack_id != null ? b : null;
    const step = e.altKey ? SNAP.fine : SNAP.step;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };

    if (e.code === 'KeyA' && e.shiftKey && e.altKey) actions.removeAutoLayout();
    else if (e.code === 'KeyA' && e.shiftKey) actions.autoLayout();
    else if (e.key === 'g') actions.toggleGrid();
    else if (e.key === 'l') actions.setLock(!state.lockAspect);
    else if (e.key === 'Escape') {
      // Odak modu → çık; yığın içindeki blok → yığını seç; aksi halde seçimi bırak.
      if (state.focalId) canvas.exitFocal();
      else store.select(child ? child.stack_id : null);
    }
    else if (!ids.length) return;
    else if (e.key === 'f' && b?.type === 'image') actions.toggleFocal(b.id);
    else if (state.focalId) return; // odak modunda taşıma/silme kısayolları kapalı
    else if (e.key === 'Delete' || e.key === 'Backspace') actions.unplace(ids);
    else if (e.key === ']' && b) actions.front(b.id);
    else if (e.key === '[' && b) actions.back(b.id);
    else if (e.key in arrows && child) {
      // Yığın içinde ok tuşları sırayı değiştirir (yığın yönünde).
      const vertical = stackById(state.data, child.stack_id).direction === 'vertical';
      const delta = { ArrowUp: vertical ? -1 : 0, ArrowDown: vertical ? 1 : 0, ArrowLeft: vertical ? 0 : -1, ArrowRight: vertical ? 0 : 1 }[e.key];
      if (delta) actions.reorderChild(child.id, delta);
    } else if (e.key in arrows) actions.nudge(ids, ...arrows[e.key]);
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

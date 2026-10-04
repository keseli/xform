// Editör tuvali: spread'i çizer, üstüne rozet/seçim katmanı koyar, taşıma,
// resize ve tepsiden bırakma etkileşimlerini yönetir.
import { CELL, DIVIDER_ROWS, FLOW_TYPES, SNAP } from '../config.js';
import { blocksOnSpread } from '../model.js';
import { renderSpread } from '../render/spread.js';
import { renderBlock, settleHeight, settleHeights } from '../render/blocks.js';
import { fitFrame } from '../render/fit.js';
import { computeWarnings } from './warnings.js';
import { defaultWidth, heightForRatio, keepInFrame, moveBox, resizeBox, snap, staysInFrame } from './geometry.js';
import { kindLabel } from './labels.js';

const DRAG_THRESHOLD = 3; // ekran pikseli
const PAD = 56;

const DIRS = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

const px = (cells) => `${cells * CELL}px`;
const stepOf = (e) => (e.altKey ? SNAP.fine : SNAP.step);

export function createCanvas(container, store) {
  const { state } = store;
  let frame = null;
  let overlay = null;

  const spread = () => state.data.spreads[state.spreadIndex];
  const blockById = (id) => state.data.blocks.find((b) => b.id === id);
  const elementOf = (id) => frame?.querySelector(`.blocks > .block[data-id="${CSS.escape(id)}"]`);

  function render() {
    frame = renderSpread(state.data, spread().id, { guides: state.showGrid, editor: true });
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    frame.append(overlay);

    const holder = document.createElement('div');
    holder.className = 'frame-holder';
    holder.append(frame);
    container.replaceChildren(holder);

    // Akış bloklarının yüksekliği her çizimde içerikten yeniden türetilir.
    for (const [id, h] of Object.entries(settleHeights(frame))) blockById(id).h = h;
    fit();
    drawOverlay();
  }

  function fit() {
    const holder = container.querySelector('.frame-holder');
    if (holder) fitFrame(holder, container, PAD);
  }

  /** Rozetler, uyarılar, ilişki vurgusu ve seçim kutusu. Frame'i yeniden çizmez. */
  function drawOverlay() {
    if (!overlay) return;
    const warnings = computeWarnings(state.data);
    const selected = state.selectedId ? blockById(state.selectedId) : null;
    const related = new Set(selected?.relates_to ?? []);
    overlay.replaceChildren();

    for (const b of blocksOnSpread(state.data.blocks, spread().id)) {
      const list = warnings.get(b.id) ?? [];
      const el = elementOf(b.id);
      el?.classList.toggle('is-related', related.has(b.id));
      el?.classList.toggle('is-overflow', list.some((w) => w.kind === 'overflow'));

      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.dataset.id = b.id;
      badge.textContent = String(b.order);
      if (list.length) {
        badge.classList.add('badge--warn');
        badge.title = list.map((w) => w.message).join('\n');
      } else {
        badge.title = `${kindLabel(b)} · ${b.id}`;
      }
      badge.style.left = px(b.x);
      badge.style.top = px(b.y);
      overlay.append(badge);
    }

    if (selected?.spread_id === spread().id) overlay.append(selectionBox(selected));
  }

  function selectionBox(b) {
    const box = document.createElement('div');
    box.className = 'selection';
    box.style.left = px(b.x);
    box.style.top = px(b.y);
    box.style.width = px(b.w);
    box.style.height = px(b.type === 'divider' ? DIVIDER_ROWS : b.h);
    const dirs = b.type === 'image' ? Object.keys(DIRS) : ['w', 'e'];
    if (b.type !== 'image') box.classList.add('selection--sides');
    for (const dir of dirs) {
      const handle = document.createElement('div');
      handle.className = `handle handle--${dir}`;
      handle.dataset.dir = dir;
      box.append(handle);
    }
    return box;
  }

  /** Bloğun DOM düğümünü veri ile eşitler (sürükleme sırasında, tam çizim olmadan). */
  function applyBox(b) {
    const el = elementOf(b.id);
    if (!el) return;
    el.style.left = px(b.x);
    el.style.top = px(b.y);
    el.style.width = px(b.w);
    if (b.type === 'image') el.style.height = px(b.h);
    if (FLOW_TYPES.has(b.type)) b.h = settleHeight(el);
  }

  /** İşaretçi konumu, frame'in sol üst köşesinden hücre cinsinden (kesirli). */
  function toCells(e) {
    const r = frame.getBoundingClientRect();
    const s = r.width / frame.offsetWidth;
    return { x: (e.clientX - r.left) / s / CELL, y: (e.clientY - r.top) / s / CELL };
  }

  function isOverCanvas(e) {
    const r = container.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !frame) return;
    document.activeElement?.blur?.();
    const handle = e.target.closest('.handle');
    if (handle) return startResize(e, handle.dataset.dir);
    const target = e.target.closest('[data-id]');
    if (target && frame.contains(target)) return startMove(e, target.dataset.id);
    store.select(null);
  });

  function startMove(e, id) {
    const b = blockById(id);
    store.select(id);
    const start = { x: b.x, y: b.y, w: b.w, h: b.h };
    const p0 = toCells(e);
    let moved = false;
    drag(e, {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        if (!moved) store.checkpoint();
        moved = true;
        const p = toCells(ev);
        Object.assign(b, moveBox(start, { x: p.x - p0.x, y: p.y - p0.y }, stepOf(ev)));
        applyBox(b);
        drawOverlay();
      },
      end() {
        if (moved) store.commit();
      },
      cancel() {
        store.discard();
        Object.assign(b, start);
        applyBox(b);
        drawOverlay();
      },
    });
  }

  function startResize(e, dir) {
    const b = blockById(state.selectedId);
    if (!b) return;
    const start = { x: b.x, y: b.y, w: b.w, h: b.h };
    const p0 = toCells(e);
    store.checkpoint();
    drag(e, {
      move(ev) {
        const p = toCells(ev);
        const box = resizeBox(start, DIRS[dir], { x: p.x - p0.x, y: p.y - p0.y }, {
          step: stepOf(ev),
          // Shift, oran kilidini geçici olarak tersine çevirir.
          lock: b.type === 'image' && state.lockAspect !== ev.shiftKey,
          widthOnly: b.type !== 'image',
        });
        // Bloğu frame dışına çıkaracak adım uygulanmaz; son geçerli kutu kalır.
        if (!staysInFrame(box)) return;
        Object.assign(b, box);
        applyBox(b);
        drawOverlay();
      },
      end() {
        store.commit();
      },
      cancel() {
        store.discard();
        Object.assign(b, start);
        applyBox(b);
        drawOverlay();
      },
    });
  }

  /**
   * Tepsiden sürükleme. İşaretçi tuval üzerindeyken blok gerçek boyutunda,
   * snap'li konumda önizlenir; dışarıdaysa küçük bir etiket işaretçiyi izler.
   * Sürüklemeden bırakılırsa onClick çağrılır.
   */
  function beginPlace(block, e, { ratio, onClick } = {}) {
    const w = defaultWidth(block);
    const temp = {
      ...block,
      x: 0,
      y: 0,
      w,
      h: block.type === 'image' ? heightForRatio(w, ratio) : DIVIDER_ROWS,
      z: 100000,
    };
    let started = false;
    let preview = null;
    let ghost = null;
    let target = null;

    const cleanup = () => {
      preview?.remove();
      ghost?.remove();
    };

    drag(e, {
      move(ev) {
        if (!started) {
          if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
          started = true;
          ghost = document.createElement('div');
          ghost.className = 'place-ghost';
          ghost.textContent = `${block.order} · ${kindLabel(block)}`;
          document.body.append(ghost);
          preview = renderBlock(temp);
          preview.classList.add('is-preview');
          frame.querySelector('.blocks').append(preview);
          if (FLOW_TYPES.has(temp.type)) temp.h = settleHeight(preview);
        }
        const over = isOverCanvas(ev);
        preview.hidden = !over;
        ghost.hidden = over;
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        if (over) {
          const p = toCells(ev);
          const step = stepOf(ev);
          Object.assign(temp, keepInFrame({ x: snap(p.x, step), y: snap(p.y, step), w: temp.w, h: temp.h }));
          preview.style.left = px(temp.x);
          preview.style.top = px(temp.y);
          target = { x: temp.x, y: temp.y };
        } else {
          target = null;
        }
      },
      end() {
        cleanup();
        if (!started) return onClick?.();
        if (!target) return;
        store.commit((s) => {
          const others = blocksOnSpread(s.data.blocks, spread().id);
          const z = Math.max(0, ...others.map((o) => o.z ?? 0)) + 1;
          Object.assign(block, { spread_id: spread().id, ...target, w, h: temp.h, z });
          s.selectedId = block.id;
        });
      },
      cancel: cleanup,
    });
  }

  return { render, drawOverlay, fit, beginPlace };
}

/** Pencere düzeyinde sürükleme; Escape iptal eder. */
function drag(e, { move, end, cancel }) {
  e.preventDefault();
  const onMove = (ev) => move(ev);
  const onUp = (ev) => {
    done();
    end(ev);
  };
  const onKey = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    done();
    cancel?.();
  };
  function done() {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('keydown', onKey, true);
  }
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('keydown', onKey, true);
}

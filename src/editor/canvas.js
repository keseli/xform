// Editör tuvali: spread'i çizer, üstüne rozet/seçim katmanı koyar ve
// etkileşimleri yönetir:
// - taşıma (çoklu seçim dahil), resize, tepsiden bırakma — akıllı kılavuzlarla
// - alan seçimi ve Shift+tık
// - auto layout: yığın taşıma, içindeki bloğu sıralama/çıkarma, yığına bırakma
// - görsel odak modu (state.focalId): kutu içinde sürüklemek görseli kaydırır
//
// Taşınabilir birim: serbest blok ya da yığın. Yığın içindeki blok tek başına
// taşınmaz; seçiliyken sürüklemek sırasını değiştirir ya da yığından çıkarır.
import { CELL, DIVIDER_ROWS, FLOW_TYPES, FRAME, SNAP } from '../config.js';
import { blocksOnSpread } from '../model.js';
import { renderSpread } from '../render/spread.js';
import { placeElement, renderBlock, settleHeight, settleHeights } from '../render/blocks.js';
import { fitFrame } from '../render/fit.js';
import {
  childrenOf, insertIntoStack, insertionIndex, insertionMarker, layoutStacks, moveInStack,
  removeFromStack, stackBounds, stackById,
} from '../stacks.js';
import { computeWarnings } from './warnings.js';
import { defaultWidth, heightForRatio, keepInFrame, resizeBox, snap, staysInFrame } from './geometry.js';
import { axisTargets, frameLines, guideSegments, snapRect, snapValue } from './snapping.js';
import { kindLabel } from './labels.js';
import { imageRect, panFocal } from './focal.js';

const DEFAULT_FOCAL = { x: 0.5, y: 0.5 };
const DRAG_THRESHOLD = 3; // ekran pikseli
const SNAP_PX = 5; // akıllı kılavuz yakalama mesafesi, ekran pikseli
const LEAVE_STACK = 6; // hücre: içteki blok yığından bu kadar uzaklaşınca dışarı çıkar
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
const noSnap = (e) => e.ctrlKey || e.metaKey; // Ctrl/⌘: kılavuz ve yığına bırakma kapalı
const union = (rects) => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  };
};
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (r, p, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

export function createCanvas(container, store) {
  const { state } = store;
  let frame = null;
  let overlay = null;
  // Sürükleme sırasında katmana çizilenler.
  let guides = [];
  let marker = null;
  let marquee = null;
  let draggingId = null;

  const data = () => state.data;
  const spread = () => data().spreads[state.spreadIndex];
  const blockById = (id) => data().blocks.find((b) => b.id === id);
  const elementOf = (id) => frame?.querySelector(`.blocks > .block[data-id="${CSS.escape(id)}"]`);
  const boxOf = (b) => ({ width: b.w * CELL, height: b.h * CELL });
  const stacksHere = () => (data().stacks ?? []).filter((s) => s.spread_id === spread().id);
  const blockRect = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.type === 'divider' ? DIVIDER_ROWS : b.h });

  /** Birimin (serbest blok ya da yığın) kapladığı alan. */
  function unitRect(id) {
    const s = stackById(data(), id);
    return s ? stackBounds(data(), s) : blockRect(blockById(id));
  }

  function unitsOnSpread() {
    return [
      ...blocksOnSpread(data().blocks, spread().id)
        .filter((b) => b.stack_id == null)
        .map((b) => b.id),
      ...stacksHere().map((s) => s.id),
    ];
  }

  /** Seçimdeki, bu spread'deki taşınabilir birimler. */
  function selectedUnits() {
    return state.selectedIds.filter((id) => {
      const s = stackById(data(), id);
      if (s) return s.spread_id === spread().id;
      const b = blockById(id);
      return b?.spread_id === spread().id && b.stack_id == null;
    });
  }

  const posOf = (id) => stackById(data(), id) ?? blockById(id);

  // ---------- Görsel ölçüleri ve odak modu ----------

  // Görsellerin doğal boyutu, kaynağa göre. Yeniden çizimde yeni <img> henüz
  // yüklenmemiş olabilir; ölçü buradan okunur.
  const naturals = new Map();

  function rememberNatural(img) {
    const src = img.getAttribute('src');
    if (naturals.has(src)) return;
    const onLoad = () => {
      naturals.set(src, { width: img.naturalWidth, height: img.naturalHeight });
      // Seçili görselin ölçüsü ilk kez geldiyse panel ve katman güncellensin.
      if (blockById(state.selectedId)?.source === src) store.emit('selection');
    };
    if (img.complete && img.naturalWidth) naturals.set(src, { width: img.naturalWidth, height: img.naturalHeight });
    else img.addEventListener('load', onLoad, { once: true });
  }

  /** Görselin doğal boyutu; henüz yüklenmediyse null. */
  function naturalSize(id) {
    const b = blockById(id);
    return (b?.source && naturals.get(b.source)) || null;
  }

  /** Odak modundaki görsel, bu spread'de ve çizilebilir durumdaysa. */
  function focalBlock() {
    const b = state.focalId ? blockById(state.focalId) : null;
    return b?.type === 'image' && b.source && b.spread_id === spread().id ? b : null;
  }

  function setFocalMode(id) {
    const b = id ? blockById(id) : null;
    const ok = b?.type === 'image' && b.source && b.spread_id === spread().id;
    if (ok) state.selectedIds = [id];
    state.focalId = ok ? id : null;
    store.emit('selection');
  }

  // ---------- Çizim ----------

  function render() {
    frame = renderSpread(data(), spread().id, { guides: state.showGrid, editor: true });
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    frame.append(overlay);

    const holder = document.createElement('div');
    holder.className = 'frame-holder';
    holder.append(frame);
    container.replaceChildren(holder);

    // Akış bloklarının yüksekliği her çizimde içerikten yeniden türetilir;
    // yığınlar bu yüksekliklerle yeniden dizilir.
    for (const [id, h] of Object.entries(settleHeights(frame))) blockById(id).h = h;
    relayout();
    for (const img of frame.querySelectorAll('.blocks > .block--image img')) rememberNatural(img);
    fit();
    drawOverlay();
  }

  function fit() {
    const holder = container.querySelector('.frame-holder');
    if (holder) fitFrame(holder, container, PAD);
  }

  /** Yığınları diz ve bu spread'deki yığın çocuklarının elemanlarını yerleştir. */
  function relayout() {
    layoutStacks(data());
    for (const s of stacksHere()) {
      for (const b of childrenOf(data(), s.id)) {
        const el = elementOf(b.id);
        if (el) placeElement(el, b);
      }
    }
  }

  /** Bloğun DOM düğümünü veri ile eşitler (sürükleme sırasında, tam çizim olmadan). */
  function applyBox(b) {
    const el = elementOf(b.id);
    if (!el) return;
    placeElement(el, b);
    if (b.type === 'image') el.style.height = px(b.h);
    if (FLOW_TYPES.has(b.type)) b.h = settleHeight(el);
  }

  function rectEl(cls, r) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.left = px(r.x);
    el.style.top = px(r.y);
    el.style.width = px(r.w);
    el.style.height = px(r.h);
    return el;
  }

  /** Rozetler, uyarılar, vurgular, seçim, kılavuzlar. Frame'i yeniden çizmez. */
  function drawOverlay() {
    if (!overlay) return;
    const warnings = computeWarnings(data());
    const primary = state.selectedId ? blockById(state.selectedId) : null;
    const related = new Set(primary?.relates_to ?? []);
    overlay.replaceChildren();

    for (const s of stacksHere()) overlay.append(rectEl('stack-outline', stackBounds(data(), s)));

    for (const b of blocksOnSpread(data().blocks, spread().id)) {
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

    const focal = focalBlock();
    for (const el of frame.querySelectorAll('.block.is-focal')) el.classList.remove('is-focal');
    if (focal) {
      elementOf(focal.id)?.classList.add('is-focal');
      overlay.append(focalLayer(focal));
    } else {
      drawSelection();
    }

    for (const g of guides) {
      const el = document.createElement('div');
      el.className = `guide-line guide-line--${g.axis}`;
      if (g.axis === 'x') Object.assign(el.style, { left: px(g.at), top: px(g.from), height: px(g.to - g.from) });
      else Object.assign(el.style, { top: px(g.at), left: px(g.from), width: px(g.to - g.from) });
      overlay.append(el);
    }
    if (marker) overlay.append(rectEl(`insert-marker insert-marker--${marker.h === 0 ? 'h' : 'v'}`, marker));
    if (marquee) overlay.append(rectEl('marquee', marquee));
  }

  function drawSelection() {
    const ids = state.selectedIds.filter((id) => {
      const s = stackById(data(), id);
      return s ? s.spread_id === spread().id : blockById(id)?.spread_id === spread().id;
    });
    if (!ids.length) return;
    if (ids.length > 1) {
      const rects = ids.map(unitRect);
      for (const r of rects) overlay.append(rectEl('selection selection--member', r));
      overlay.append(rectEl('selection selection--group', union(rects)));
      return;
    }
    const id = ids[0];
    if (id === draggingId) return;
    const s = stackById(data(), id);
    if (s) return overlay.append(rectEl('selection selection--stack', stackBounds(data(), s)));

    const b = blockById(id);
    const box = rectEl('selection', blockRect(b));
    let dirs;
    if (b.stack_id != null) {
      // Yığın içinde konum yığından gelir: yalnız sağ/alt kenar.
      dirs = b.type === 'image' ? ['e', 's', 'se'] : ['e'];
      box.classList.add('selection--child');
    } else {
      dirs = b.type === 'image' ? Object.keys(DIRS) : ['w', 'e'];
    }
    if (b.type !== 'image') box.classList.add('selection--sides');
    for (const dir of dirs) {
      const handle = document.createElement('div');
      handle.className = `handle handle--${dir}`;
      handle.dataset.dir = dir;
      box.append(handle);
    }
    overlay.append(box);
  }

  /** Kırpılan kısmın soluk önizlemesi, odak işareti ve kesikli çerçeve. */
  function focalLayer(b) {
    const wrap = rectEl('focal', blockRect(b));
    const natural = naturalSize(b.id);
    if (natural) {
      const focal = b.focal_point ?? DEFAULT_FOCAL;
      const r = imageRect(focal, boxOf(b), natural);
      const ghost = document.createElement('img');
      ghost.className = 'focal-ghost';
      ghost.src = b.source;
      ghost.alt = '';
      Object.assign(ghost.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      const mark = document.createElement('div');
      mark.className = 'focal-mark';
      mark.style.left = `${focal.x * 100}%`;
      mark.style.top = `${focal.y * 100}%`;
      wrap.append(ghost, mark);
    }
    const outline = document.createElement('div');
    outline.className = 'selection selection--focal';
    wrap.append(outline);
    return wrap;
  }

  function applyFocal(b) {
    const img = elementOf(b.id)?.querySelector('img');
    const f = b.focal_point ?? DEFAULT_FOCAL;
    if (img) img.style.objectPosition = `${f.x * 100}% ${f.y * 100}%`;
  }

  // ---------- Koordinatlar ve yakalama ----------

  /** İşaretçi konumu, frame'in sol üst köşesinden hücre cinsinden (kesirli). */
  function toCells(e) {
    const r = frame.getBoundingClientRect();
    const s = r.width / frame.offsetWidth;
    return { x: (e.clientX - r.left) / s / CELL, y: (e.clientY - r.top) / s / CELL };
  }

  /** Kılavuz eşiği, hücre cinsinden (ekranda sabit piksel). */
  function threshold() {
    const s = frame.getBoundingClientRect().width / FRAME.width;
    return SNAP_PX / (s * CELL);
  }

  function isOverCanvas(e) {
    const r = container.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  /**
   * Taşınan alanın yeni sol üst köşesi: kılavuza yakınsa ona, değilse ızgaraya
   * snap; frame sınırı uygulanır. guides güncellenir.
   */
  function placeRect(rect, delta, others, ev) {
    const step = stepOf(ev);
    const raw = { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
    let x = snap(raw.x, step);
    let y = snap(raw.y, step);
    let matched = { x: null, y: null };
    if (!noSnap(ev)) {
      const m = snapRect(raw, others, frameLines(), threshold());
      if (m.x != null) x = Math.round(raw.x + m.dx);
      if (m.y != null) y = Math.round(raw.y + m.dy);
      matched = m;
    }
    const final = keepInFrame({ ...rect, x, y });
    guides = noSnap(ev)
      ? []
      : guideSegments({ ...rect, ...final }, others, frameLines(), {
          x: final.x === x ? matched.x : null,
          y: final.y === y ? matched.y : null,
        });
    return final;
  }

  /** İşaretçinin altındaki yığın ve ekleme sırası (taşınan blok hariç). */
  function stackUnder(p, excludeBlockId, excludeStackId) {
    for (const s of stacksHere()) {
      if (s.id === excludeStackId) continue;
      if (contains(stackBounds(data(), s), p)) {
        return { stackId: s.id, index: insertionIndex(data(), s.id, p, excludeBlockId) };
      }
    }
    return null;
  }

  // ---------- Etkileşimler ----------

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !frame) return;
    document.activeElement?.blur?.();
    const focal = focalBlock();
    if (focal) {
      const hit = e.target.closest('.blocks > .block[data-id]');
      if (hit?.dataset.id === focal.id) return startFocal(e, focal);
      // Kutu dışına tıklama odak modundan çıkar ve normal işler.
      state.focalId = null;
      store.emit('selection');
    }
    const handle = e.target.closest('.handle');
    if (handle) return startResize(e, handle.dataset.dir);
    const target = e.target.closest('[data-id]');
    if (target && frame.contains(target)) return pressBlock(e, target.dataset.id);
    startMarquee(e);
  });

  container.addEventListener('dblclick', (e) => {
    const target = e.target.closest('.blocks > .block[data-id]');
    if (!target) return;
    const b = blockById(target.dataset.id);
    // Yığın içindeki bloğa gir; zaten seçiliyse (görselse) odak modu.
    if (b.stack_id != null && state.selectedId !== b.id) return store.select(b.id);
    if (b.type === 'image') setFocalMode(b.id);
  });

  function pressBlock(e, id) {
    const b = blockById(id);
    if (b?.stack_id != null) {
      // Seçili yığın çocuğu: sırala ya da dışarı çıkar. Değilse yığını tut.
      if (state.selectedIds.length === 1 && state.selectedId === id) return startChildDrag(e, b);
      id = b.stack_id;
    }
    if (e.shiftKey) {
      e.preventDefault();
      return store.toggle(id);
    }
    if (!state.selectedIds.includes(id)) store.select(id);
    startMoveUnits(e, selectedUnits());
  }

  /** Seçili birimleri birlikte taşı. Tek serbest blok bir yığına bırakılabilir. */
  function startMoveUnits(e, ids) {
    if (!ids.length) return;
    const starts = new Map(ids.map((id) => [id, { x: posOf(id).x, y: posOf(id).y }]));
    const bounds = union(ids.map(unitRect));
    const others = unitsOnSpread()
      .filter((id) => !ids.includes(id))
      .map(unitRect);
    const single = ids.length === 1 && !stackById(data(), ids[0]) ? blockById(ids[0]) : null;
    const p0 = toCells(e);
    let moved = false;
    let into = null;

    const apply = (dx, dy) => {
      for (const id of ids) {
        const o = posOf(id);
        o.x = starts.get(id).x + dx;
        o.y = starts.get(id).y + dy;
        if (!stackById(data(), id)) applyBox(o);
      }
      relayout();
    };

    drag(e, {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        if (!moved) store.checkpoint();
        moved = true;
        const p = toCells(ev);
        const pos = placeRect(bounds, { x: p.x - p0.x, y: p.y - p0.y }, others, ev);
        apply(pos.x - bounds.x, pos.y - bounds.y);
        into = single && !noSnap(ev) ? stackUnder(p, single.id) : null;
        marker = into ? insertionMarker(data(), into.stackId, into.index, single.id) : null;
        if (into) guides = [];
        drawOverlay();
      },
      end() {
        guides = [];
        marker = null;
        if (!moved) return drawOverlay();
        if (into) store.commit(() => insertIntoStack(data(), single.id, into.stackId, into.index));
        else store.commit();
      },
      cancel() {
        store.discard();
        apply(0, 0);
        guides = [];
        marker = null;
        drawOverlay();
      },
    });
  }

  /** Yığın içindeki seçili blok: yığın içinde sırala ya da dışarı sürükle. */
  function startChildDrag(e, b) {
    const stack = stackById(data(), b.stack_id);
    const el = elementOf(b.id);
    const start = blockRect(b);
    const others = [
      ...unitsOnSpread()
        .filter((id) => id !== stack.id)
        .map(unitRect),
      ...childrenOf(data(), stack.id)
        .filter((x) => x.id !== b.id)
        .map(blockRect),
    ];
    const p0 = toCells(e);
    let moved = false;
    let target = null;

    const reset = () => {
      el.style.transform = '';
      el.classList.remove('is-dragging');
      draggingId = null;
      guides = [];
      marker = null;
    };

    drag(e, {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        moved = true;
        draggingId = b.id;
        el.classList.add('is-dragging');
        const p = toCells(ev);
        const d = { x: p.x - p0.x, y: p.y - p0.y };
        if (!noSnap(ev) && contains(stackBounds(data(), stack), p, LEAVE_STACK)) {
          const index = insertionIndex(data(), stack.id, p, b.id);
          target = { kind: 'reorder', index };
          marker = insertionMarker(data(), stack.id, index, b.id);
          guides = [];
          el.style.transform = `translate(${d.x * CELL}px, ${d.y * CELL}px)`;
        } else {
          const pos = placeRect(start, d, others, ev);
          target = { kind: 'out', x: pos.x, y: pos.y };
          marker = null;
          el.style.transform = `translate(${(pos.x - start.x) * CELL}px, ${(pos.y - start.y) * CELL}px)`;
        }
        drawOverlay();
      },
      end() {
        reset();
        if (!moved || !target) return drawOverlay();
        store.commit(() => {
          if (target.kind === 'reorder') return moveInStack(data(), b.id, target.index);
          removeFromStack(data(), b.id);
          b.x = target.x;
          b.y = target.y;
        });
      },
      cancel() {
        reset();
        drawOverlay();
      },
    });
  }

  function startResize(e, dir) {
    const b = blockById(state.selectedId);
    if (!b) return;
    const D = DIRS[dir];
    const start = { x: b.x, y: b.y, w: b.w, h: b.h };
    const others = [
      ...unitsOnSpread()
        .filter((id) => id !== b.id && id !== b.stack_id)
        .map(unitRect),
      ...(b.stack_id ? childrenOf(data(), b.stack_id).filter((x) => x.id !== b.id).map(blockRect) : []),
    ];
    const lines = frameLines();
    const p0 = toCells(e);
    store.checkpoint();
    drag(e, {
      move(ev) {
        const p = toCells(ev);
        const delta = { x: p.x - p0.x, y: p.y - p0.y };
        const step = { x: stepOf(ev), y: stepOf(ev) };
        const matched = { x: null, y: null };
        if (!noSnap(ev)) {
          // Hareket eden kenarı kılavuza yakala; o eksende ızgara snap'i uygulanmaz.
          for (const [axis, pos, size] of [['x', 'x', 'w'], ['y', 'y', 'h']]) {
            if (!D[axis] || (axis === 'y' && b.type !== 'image')) continue;
            const edge0 = D[axis] === 1 ? start[pos] + start[size] : start[pos];
            const m = snapValue(edge0 + delta[axis], axisTargets(others, lines, axis), threshold());
            if (m) {
              delta[axis] = Math.round(m.line) - edge0;
              step[axis] = 1;
              matched[axis] = m.line;
            }
          }
        }
        const box = resizeBox(start, D, delta, {
          step,
          // Shift, oran kilidini geçici olarak tersine çevirir.
          lock: b.type === 'image' && state.lockAspect !== ev.shiftKey,
          widthOnly: b.type !== 'image',
        });
        // Bloğu frame dışına çıkaracak adım uygulanmaz; son geçerli kutu kalır.
        if (!staysInFrame(box)) return;
        Object.assign(b, box);
        applyBox(b);
        relayout();
        guides = guideSegments(blockRect(b), others, lines, matched);
        drawOverlay();
      },
      end() {
        guides = [];
        store.commit();
      },
      cancel() {
        store.discard();
        Object.assign(b, start);
        applyBox(b);
        relayout();
        guides = [];
        drawOverlay();
      },
    });
  }

  /** Boş alanda sürükleyerek seçim; Shift mevcut seçime ekler. */
  function startMarquee(e) {
    const p0 = toCells(e);
    const base = e.shiftKey ? [...state.selectedIds] : [];
    let moved = false;
    drag(e, {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        moved = true;
        const p = toCells(ev);
        marquee = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
        const hits = unitsOnSpread().filter((id) => intersects(unitRect(id), marquee));
        state.selectedIds = [...new Set([...base, ...hits])];
        state.focalId = null;
        drawOverlay();
      },
      end() {
        marquee = null;
        if (moved) store.emit('selection');
        else if (!e.shiftKey) store.select(null);
        else drawOverlay();
      },
      cancel() {
        marquee = null;
        store.setSelection(base);
      },
    });
  }

  function startFocal(e, b) {
    const natural = naturalSize(b.id);
    if (!natural) return;
    const start = { ...(b.focal_point ?? DEFAULT_FOCAL) };
    const box = boxOf(b);
    const p0 = toCells(e);
    let moved = false;
    drag(e, {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        if (!moved) store.checkpoint();
        moved = true;
        const p = toCells(ev);
        b.focal_point = panFocal(start, { x: (p.x - p0.x) * CELL, y: (p.y - p0.y) * CELL }, box, natural);
        applyFocal(b);
        drawOverlay();
      },
      end() {
        if (moved) store.commit();
      },
      cancel() {
        store.discard();
        b.focal_point = start;
        applyFocal(b);
        drawOverlay();
      },
    });
  }

  /**
   * Tepsiden sürükleme. İşaretçi tuval üzerindeyken blok gerçek boyutunda,
   * kılavuzlu ya da snap'li konumda önizlenir; bir yığının üstündeyse ekleme
   * çizgisi gösterilir. Dışarıdaysa küçük bir etiket işaretçiyi izler.
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
    let into = null;
    let others = [];

    const cleanup = () => {
      preview?.remove();
      ghost?.remove();
      guides = [];
      marker = null;
      drawOverlay();
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
          others = unitsOnSpread().map(unitRect);
        }
        const over = isOverCanvas(ev);
        preview.hidden = !over;
        ghost.hidden = over;
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        if (over) {
          const p = toCells(ev);
          const pos = placeRect({ x: 0, y: 0, w: temp.w, h: temp.h }, p, others, ev);
          Object.assign(temp, pos);
          preview.style.left = px(temp.x);
          preview.style.top = px(temp.y);
          target = pos;
          into = noSnap(ev) ? null : stackUnder(p, block.id);
          marker = into ? insertionMarker(data(), into.stackId, into.index, block.id) : null;
          if (into) guides = [];
        } else {
          target = null;
          into = null;
          guides = [];
          marker = null;
        }
        drawOverlay();
      },
      end() {
        cleanup();
        if (!started) return onClick?.();
        if (!target) return;
        store.commit((s) => {
          const all = blocksOnSpread(s.data.blocks, spread().id);
          const z = Math.max(0, ...all.map((o) => o.z ?? 0)) + 1;
          Object.assign(block, { spread_id: spread().id, ...target, w, h: temp.h, z });
          if (into) insertIntoStack(s.data, block.id, into.stackId, into.index);
          s.selectedIds = [block.id];
        });
      },
      cancel: cleanup,
    });
  }

  return {
    render,
    drawOverlay,
    fit,
    beginPlace,
    naturalSize,
    toggleFocal: (id) => setFocalMode(state.focalId === id ? null : id),
    exitFocal: () => setFocalMode(null),
  };
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

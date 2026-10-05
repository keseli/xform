// Tuval etkileşimleri:
// - taşıma (çoklu seçim dahil), resize, tepsiden bırakma — akıllı kılavuzlarla
// - alan seçimi ve Shift+tık
// - auto layout: yığın taşıma, içindeki bloğu sıralama/çıkarma, yığına bırakma
// - görsel odak modu (state.focalId): kutu içinde sürüklemek görseli kaydırır
//
// Taşınabilir birim: serbest blok ya da yığın. Yığın içindeki blok tek başına
// taşınmaz; seçiliyken sürüklemek sırasını değiştirir ya da yığından çıkarır.
//
// Eskiden DOM'a doğrudan yazılanlar (kılavuz, ekleme çizgisi, alan seçimi,
// sürüklenen bloğun kayması, önizleme) burada `layer` durumunda tutulur ve
// React çizer (Canvas, EditorLayer). Veri değişince refresh() React'i eşzamanlı
// çizdirir; ölçüm (akış yükseklikleri, yığın dizilişi) çizimin hemen ardından
// yapılır, böylece sonraki satır güncel yüksekliği okur.
import { flushSync } from 'react-dom';
import { CELL, DIVIDER_ROWS, FLOW_TYPES, FRAME, SNAP } from '../config.ts';
import { blocksOnSpread } from '../model.ts';
import { settleHeight } from '../render/measure.ts';
import {
  childrenOf,
  insertIntoStack,
  insertionIndex,
  insertionMarker,
  moveInStack,
  removeFromStack,
  stackBounds,
  stackById,
} from '../stacks.ts';
import type { Block, FocalPoint, PlacedBlock, Point, Rect, Stack } from '../types.ts';
import { defaultWidth, heightForRatio, keepInFrame, resizeBox, snap, staysInFrame, type Dir } from './geometry.ts';
import {
  axisTargets,
  frameLines,
  guideSegments,
  snapRect,
  snapValue,
  type GuideSegment,
  type Lines,
} from './snapping.ts';
import { kindLabel } from './labels.ts';
import { panFocal, type Size } from './focal.ts';
import type { Store } from './store.ts';

const DEFAULT_FOCAL: FocalPoint = { x: 0.5, y: 0.5 };
const DRAG_THRESHOLD = 3; // ekran pikseli
const SNAP_PX = 5; // akıllı kılavuz yakalama mesafesi, ekran pikseli
const LEAVE_STACK = 6; // hücre: içteki blok yığından bu kadar uzaklaşınca dışarı çıkar
export const PAD = 56;

export const DIRS: Record<string, Dir> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

const stepOf = (e: PointerEvent | MouseEvent) => (e.altKey ? SNAP.fine : SNAP.step);
const noSnap = (e: PointerEvent | MouseEvent) => e.ctrlKey || e.metaKey; // Ctrl/⌘: kılavuz ve yığına bırakma kapalı
export const union = (rects: Rect[]): Rect => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  };
};
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (r: Rect, p: Point, pad = 0) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

/** Tuvalin üstündeki editör katmanının çizim durumu. */
export interface Layer {
  guides: GuideSegment[];
  marker: Rect | null;
  marquee: Rect | null;
  /** Yığın içinden sürüklenen blok ve görsel kayması (tasarım birimi). */
  draggingId: string | null;
  dragOffset: Point | null;
  /** Tepsiden sürüklenen bloğun önizlemesi (tuval üstündeyken). */
  preview: PlacedBlock | null;
  /** İşaretçiyi izleyen etiket (tuval dışındayken). */
  ghost: { text: string; x: number; y: number; hidden: boolean } | null;
}

export type Controller = ReturnType<typeof createController>;

export function createController(store: Store) {
  const { state } = store;
  let frame: HTMLElement | null = null;
  let container: HTMLElement | null = null;
  const layer: Layer = {
    guides: [],
    marker: null,
    marquee: null,
    draggingId: null,
    dragOffset: null,
    preview: null,
    ghost: null,
  };

  const data = () => state.data;
  const spread = () => data().spreads[state.spreadIndex];
  const blockById = (id: string | null) => data().blocks.find((b) => b.id === id) as PlacedBlock | undefined;
  const boxOf = (b: PlacedBlock): Size => ({ width: b.w * CELL, height: b.h * CELL });
  const stacksHere = () => (data().stacks ?? []).filter((s) => s.spread_id === spread().id);
  const blockRect = (b: PlacedBlock): Rect => ({
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.type === 'divider' ? DIVIDER_ROWS : b.h,
  });

  /** Yığındaki metin blokları (genişliği yığınla birlikte değişenler). */
  const stackTexts = (s: Stack) => childrenOf(data(), s.id).filter((b) => FLOW_TYPES.has(b.type));
  const textWidth = (texts: PlacedBlock[]) => Math.max(...texts.map((b) => b.w));

  /** Birimin (serbest blok ya da yığın) kapladığı alan. */
  function unitRect(id: string): Rect {
    const s = stackById(data(), id);
    return s ? stackBounds(data(), s) : blockRect(blockById(id) as PlacedBlock);
  }

  function unitsOnSpread(): string[] {
    return [
      ...blocksOnSpread(data().blocks, spread().id)
        .filter((b) => b.stack_id == null)
        .map((b) => b.id),
      ...stacksHere().map((s) => s.id),
    ];
  }

  /** Seçimdeki, bu spread'deki taşınabilir birimler. */
  function selectedUnits(): string[] {
    return state.selectedIds.filter((id) => {
      const s = stackById(data(), id);
      if (s) return s.spread_id === spread().id;
      const b = blockById(id);
      return b?.spread_id === spread().id && b.stack_id == null;
    });
  }

  const posOf = (id: string): Point => (stackById(data(), id) ?? blockById(id)) as Point;

  /** Veri ya da katman değişti: React'i şimdi çizdir (ölçüm çizimin ardından). */
  function refresh() {
    flushSync(() => store.emit('drag'));
  }

  // ---------- Görsel ölçüleri ve odak modu ----------

  // Görsellerin doğal boyutu, kaynağa göre. Yeniden çizimde yeni <img> henüz
  // yüklenmemiş olabilir; ölçü buradan okunur.
  const naturals = new Map<string, Size>();

  function rememberNatural(img: HTMLImageElement) {
    const src = img.getAttribute('src') as string;
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
  function naturalSize(id: string): Size | null {
    const b = blockById(id);
    return (b?.source && naturals.get(b.source)) || null;
  }

  /** Odak modundaki görsel, bu spread'de ve çizilebilir durumdaysa. */
  function focalBlock(): PlacedBlock | null {
    const b = state.focalId ? blockById(state.focalId) : null;
    return b?.type === 'image' && b.source && b.spread_id === spread().id ? b : null;
  }

  function setFocalMode(id: string | null) {
    const b = id ? blockById(id) : null;
    const ok = !!(b?.type === 'image' && b.source && b.spread_id === spread().id);
    if (ok) state.selectedIds = [id as string];
    state.focalId = ok ? id : null;
    store.emit('selection');
  }

  // ---------- Koordinatlar ve yakalama ----------

  /** İşaretçi konumu, frame'in sol üst köşesinden hücre cinsinden (kesirli). */
  function toCells(e: MouseEvent): Point {
    const f = frame as HTMLElement;
    const r = f.getBoundingClientRect();
    const s = r.width / f.offsetWidth;
    return { x: (e.clientX - r.left) / s / CELL, y: (e.clientY - r.top) / s / CELL };
  }

  /** Kılavuz eşiği, hücre cinsinden (ekranda sabit piksel). */
  function threshold() {
    const s = (frame as HTMLElement).getBoundingClientRect().width / FRAME.width;
    return SNAP_PX / (s * CELL);
  }

  function isOverCanvas(e: MouseEvent) {
    const r = (container as HTMLElement).getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  /**
   * Taşınan alanın yeni sol üst köşesi: kılavuza yakınsa ona, değilse ızgaraya
   * snap; frame sınırı uygulanır. Kılavuzlar güncellenir.
   */
  function placeRect(rect: Rect, delta: Point, others: Rect[], ev: PointerEvent): Point {
    const step = stepOf(ev);
    const raw = { ...rect, x: rect.x + delta.x, y: rect.y + delta.y };
    let x = snap(raw.x, step);
    let y = snap(raw.y, step);
    let matched: { x: number | null; y: number | null } = { x: null, y: null };
    if (!noSnap(ev)) {
      const m = snapRect(raw, others, frameLines(), threshold());
      if (m.x != null) x = Math.round(raw.x + m.dx);
      if (m.y != null) y = Math.round(raw.y + m.dy);
      matched = m;
    }
    const final = keepInFrame({ ...rect, x, y });
    layer.guides = noSnap(ev)
      ? []
      : guideSegments({ ...rect, ...final }, others, frameLines(), {
          x: final.x === x ? matched.x : null,
          y: final.y === y ? matched.y : null,
        });
    return final;
  }

  /** İşaretçinin altındaki yığın ve ekleme sırası (taşınan blok hariç). */
  function stackUnder(p: Point, excludeBlockId: string | null, excludeStackId?: string) {
    for (const s of stacksHere()) {
      if (s.id === excludeStackId) continue;
      if (contains(stackBounds(data(), s), p)) {
        return { stackId: s.id, index: insertionIndex(data(), s.id, p, excludeBlockId) };
      }
    }
    return null;
  }

  // ---------- Etkileşimler ----------

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !frame) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const target0 = e.target as Element;
    const focal = focalBlock();
    if (focal) {
      const hit = target0.closest<HTMLElement>('.blocks > .block[data-id]');
      if (hit?.dataset.id === focal.id) return startFocal(e, focal);
      // Kutu dışına tıklama odak modundan çıkar ve normal işler.
      state.focalId = null;
      store.emit('selection');
    }
    const handle = target0.closest<HTMLElement>('.handle');
    if (handle) return startResize(e, handle.dataset.dir as string);
    const target = target0.closest<HTMLElement>('[data-id]');
    if (target && frame.contains(target)) return pressBlock(e, target.dataset.id as string);
    startMarquee(e);
  }

  function onDoubleClick(e: MouseEvent) {
    const target = (e.target as Element).closest<HTMLElement>('.blocks > .block[data-id]');
    if (!target) return;
    const b = blockById(target.dataset.id as string) as PlacedBlock;
    // Yığın içindeki bloğa gir; zaten seçiliyse (görselse) odak modu.
    if (b.stack_id != null && state.selectedId !== b.id) return store.select(b.id);
    if (b.type === 'image') setFocalMode(b.id);
  }

  function pressBlock(e: PointerEvent, id: string) {
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
  function startMoveUnits(e: PointerEvent, ids: string[]) {
    if (!ids.length) return;
    const starts = new Map(ids.map((id) => [id, { x: posOf(id).x, y: posOf(id).y }]));
    const bounds = union(ids.map(unitRect));
    const others = unitsOnSpread()
      .filter((id) => !ids.includes(id))
      .map(unitRect);
    const single = ids.length === 1 && !stackById(data(), ids[0]) ? (blockById(ids[0]) ?? null) : null;
    const p0 = toCells(e);
    let moved = false;
    let into: { stackId: string; index: number } | null = null;

    const apply = (dx: number, dy: number) => {
      for (const id of ids) {
        const o = posOf(id);
        o.x = (starts.get(id) as Point).x + dx;
        o.y = (starts.get(id) as Point).y + dy;
      }
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
        layer.marker = into ? insertionMarker(data(), into.stackId, into.index, single!.id) : null;
        if (into) layer.guides = [];
        refresh();
      },
      end() {
        layer.guides = [];
        layer.marker = null;
        if (!moved) return refresh();
        const target = into;
        if (target) store.commit(() => insertIntoStack(data(), single!.id, target.stackId, target.index));
        else store.commit();
      },
      cancel() {
        store.discard();
        apply(0, 0);
        layer.guides = [];
        layer.marker = null;
        refresh();
      },
    });
  }

  /** Yığın içindeki seçili blok: yığın içinde sırala ya da dışarı sürükle. */
  function startChildDrag(e: PointerEvent, b: PlacedBlock) {
    const stack = stackById(data(), b.stack_id) as Stack;
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
    let target: { kind: 'reorder'; index: number } | { kind: 'out'; x: number; y: number } | null = null;

    const reset = () => {
      layer.draggingId = null;
      layer.dragOffset = null;
      layer.guides = [];
      layer.marker = null;
    };

    drag(e, {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        moved = true;
        layer.draggingId = b.id;
        const p = toCells(ev);
        const d = { x: p.x - p0.x, y: p.y - p0.y };
        if (!noSnap(ev) && contains(stackBounds(data(), stack), p, LEAVE_STACK)) {
          const index = insertionIndex(data(), stack.id, p, b.id);
          target = { kind: 'reorder', index };
          layer.marker = insertionMarker(data(), stack.id, index, b.id);
          layer.guides = [];
          layer.dragOffset = { x: d.x * CELL, y: d.y * CELL };
        } else {
          const pos = placeRect(start, d, others, ev);
          target = { kind: 'out', x: pos.x, y: pos.y };
          layer.marker = null;
          layer.dragOffset = { x: (pos.x - start.x) * CELL, y: (pos.y - start.y) * CELL };
        }
        refresh();
      },
      end() {
        reset();
        const t = target;
        if (!moved || !t) return refresh();
        store.commit(() => {
          if (t.kind === 'reorder') return moveInStack(data(), b.id, t.index);
          removeFromStack(data(), b.id);
          b.x = t.x;
          b.y = t.y;
        });
      },
      cancel() {
        reset();
        refresh();
      },
    });
  }

  /**
   * Dikey yığının metin genişliği: tüm metin blokları aynı genişliğe geçer.
   * Sol tutamaç yığının x'ini kaydırır; görsel ve çizgilerin genişliği korunur.
   */
  function startStackResize(e: PointerEvent, dir: string, st: Stack) {
    const D = DIRS[dir];
    const texts = stackTexts(st);
    if (!texts.length) return;
    const startX = st.x;
    const widths = new Map(texts.map((b) => [b.id, b.w]));
    const bounds = stackBounds(data(), st);
    const base = { x: st.x, y: bounds.y, w: textWidth(texts), h: bounds.h };
    const others = unitsOnSpread()
      .filter((id) => id !== st.id)
      .map(unitRect);
    const lines = frameLines();
    const p0 = toCells(e);
    store.checkpoint();

    const apply = (x: number, w: number | null) => {
      st.x = x;
      for (const b of texts) b.w = w ?? (widths.get(b.id) as number);
      refresh();
    };

    drag(e, {
      move(ev) {
        const p = toCells(ev);
        const delta = { x: p.x - p0.x, y: 0 };
        let step = stepOf(ev);
        let matched: number | null = null;
        if (!noSnap(ev)) {
          const edge0 = D.x === 1 ? base.x + base.w : base.x;
          const m = snapValue(edge0 + delta.x, axisTargets(others, lines, 'x'), threshold());
          if (m) {
            delta.x = Math.round(m.line) - edge0;
            step = 1;
            matched = m.line;
          }
        }
        const box = resizeBox(base, D, delta, { step, widthOnly: true });
        if (!staysInFrame({ ...box, h: bounds.h })) return;
        apply(box.x, box.w);
        layer.guides = guideSegments({ ...box, h: stackBounds(data(), st).h }, others, lines, { x: matched, y: null });
        refresh();
      },
      end() {
        layer.guides = [];
        store.commit();
      },
      cancel() {
        store.discard();
        layer.guides = [];
        apply(startX, null);
      },
    });
  }

  function startResize(e: PointerEvent, dir: string) {
    const st = stackById(data(), state.selectedId);
    if (st) return startStackResize(e, dir, st);
    const b = blockById(state.selectedId);
    if (!b) return;
    const D = DIRS[dir];
    const start = { x: b.x, y: b.y, w: b.w, h: b.h };
    const others = [
      ...unitsOnSpread()
        .filter((id) => id !== b.id && id !== b.stack_id)
        .map(unitRect),
      ...(b.stack_id
        ? childrenOf(data(), b.stack_id)
            .filter((x) => x.id !== b.id)
            .map(blockRect)
        : []),
    ];
    const lines: Lines = frameLines();
    const p0 = toCells(e);
    store.checkpoint();
    drag(e, {
      move(ev) {
        const p = toCells(ev);
        const delta = { x: p.x - p0.x, y: p.y - p0.y };
        const step = { x: stepOf(ev), y: stepOf(ev) };
        const matched: { x: number | null; y: number | null } = { x: null, y: null };
        if (!noSnap(ev)) {
          // Hareket eden kenarı kılavuza yakala; o eksende ızgara snap'i uygulanmaz.
          for (const [axis, pos, size] of [
            ['x', 'x', 'w'],
            ['y', 'y', 'h'],
          ] as const) {
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
        refresh();
        layer.guides = guideSegments(blockRect(b), others, lines, matched);
        refresh();
      },
      end() {
        layer.guides = [];
        store.commit();
      },
      cancel() {
        store.discard();
        Object.assign(b, start);
        layer.guides = [];
        refresh();
      },
    });
  }

  /** Boş alanda sürükleyerek seçim; Shift mevcut seçime ekler. */
  function startMarquee(e: PointerEvent) {
    const p0 = toCells(e);
    const base = e.shiftKey ? [...state.selectedIds] : [];
    let moved = false;
    drag(e, {
      move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        moved = true;
        const p = toCells(ev);
        const marquee = {
          x: Math.min(p0.x, p.x),
          y: Math.min(p0.y, p.y),
          w: Math.abs(p.x - p0.x),
          h: Math.abs(p.y - p0.y),
        };
        layer.marquee = marquee;
        const hits = unitsOnSpread().filter((id) => intersects(unitRect(id), marquee));
        state.selectedIds = [...new Set([...base, ...hits])];
        state.focalId = null;
        refresh();
      },
      end() {
        layer.marquee = null;
        if (moved) store.emit('selection');
        else if (!e.shiftKey) store.select(null);
        else refresh();
      },
      cancel() {
        layer.marquee = null;
        store.setSelection(base);
      },
    });
  }

  function startFocal(e: PointerEvent, b: PlacedBlock) {
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
        refresh();
      },
      end() {
        if (moved) store.commit();
      },
      cancel() {
        store.discard();
        b.focal_point = start;
        refresh();
      },
    });
  }

  /**
   * Tepsiden sürükleme. İşaretçi tuval üzerindeyken blok gerçek boyutunda,
   * kılavuzlu ya da snap'li konumda önizlenir; bir yığının üstündeyse ekleme
   * çizgisi gösterilir. Dışarıdaysa küçük bir etiket işaretçiyi izler.
   * Sürüklemeden bırakılırsa onClick çağrılır.
   */
  function beginPlace(
    block: Block,
    e: PointerEvent,
    { ratio, onClick }: { ratio?: number; onClick?: () => void } = {},
  ) {
    const w = defaultWidth(block);
    const temp = {
      ...block,
      x: 0,
      y: 0,
      w,
      h: block.type === 'image' ? heightForRatio(w, ratio) : DIVIDER_ROWS,
      z: 100000,
    } as PlacedBlock;
    let started = false;
    let target: Point | null = null;
    let into: { stackId: string; index: number } | null = null;
    let others: Rect[] = [];

    const cleanup = () => {
      layer.preview = null;
      layer.ghost = null;
      layer.guides = [];
      layer.marker = null;
      refresh();
    };

    drag(e, {
      move(ev) {
        if (!started) {
          if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
          started = true;
          layer.ghost = { text: `${block.order} · ${kindLabel(block)}`, x: 0, y: 0, hidden: false };
          layer.preview = temp;
          refresh();
          // Önizleme çizildi: akış tipinde yüksekliği ölç.
          const el = frame?.querySelector<HTMLElement>('.overlay > .block.is-preview');
          if (el && FLOW_TYPES.has(temp.type)) temp.h = settleHeight(el);
          others = unitsOnSpread().map(unitRect);
        }
        const over = isOverCanvas(ev);
        layer.preview = over ? temp : null;
        layer.ghost = {
          text: `${block.order} · ${kindLabel(block)}`,
          x: ev.clientX + 12,
          y: ev.clientY + 12,
          hidden: over,
        };
        if (over) {
          const p = toCells(ev);
          const pos = placeRect({ x: 0, y: 0, w: temp.w, h: temp.h }, p, others, ev);
          Object.assign(temp, pos);
          target = pos;
          into = noSnap(ev) ? null : stackUnder(p, block.id);
          layer.marker = into ? insertionMarker(data(), into.stackId, into.index, block.id) : null;
          if (into) layer.guides = [];
        } else {
          target = null;
          into = null;
          layer.guides = [];
          layer.marker = null;
        }
        refresh();
      },
      end() {
        cleanup();
        if (!started) return onClick?.();
        const t = target;
        const i = into;
        if (!t) return;
        store.commit((s) => {
          const all = blocksOnSpread(s.data.blocks, spread().id);
          const z = Math.max(0, ...all.map((o) => o.z ?? 0)) + 1;
          Object.assign(block, { spread_id: spread().id, ...t, w, h: temp.h, z });
          if (i) insertIntoStack(s.data, block.id, i.stackId, i.index);
          s.selectedIds = [block.id];
        });
      },
      cancel: cleanup,
    });
  }

  return {
    layer,
    /** Canvas her çizimde frame ve tuval elemanını bildirir. */
    attach(frameEl: HTMLElement | null, containerEl: HTMLElement | null) {
      frame = frameEl;
      container = containerEl;
    },
    onPointerDown,
    onDoubleClick,
    beginPlace,
    rememberNatural,
    naturalSize,
    focalBlock,
    unitRect,
    stackTexts,
    textWidth,
    blockRect,
    /** Fontlar değişince: yükseklikler yeniden ölçülsün, paneller güncellensin. */
    remeasure: () => store.emit('selection'),
    toggleFocal: (id: string) => setFocalMode(state.focalId === id ? null : id),
    exitFocal: () => setFocalMode(null),
  };
}

/** Pencere düzeyinde sürükleme; Escape iptal eder. */
function drag(
  e: PointerEvent,
  { move, end, cancel }: { move: (ev: PointerEvent) => void; end: (ev: PointerEvent) => void; cancel?: () => void },
) {
  e.preventDefault();
  const onMove = (ev: PointerEvent) => move(ev);
  const onUp = (ev: PointerEvent) => {
    done();
    end(ev);
  };
  const onKey = (ev: KeyboardEvent) => {
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

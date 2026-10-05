// Editör oturumu: durum, store, işlemler, kayıt/yeniden yükleme ve klavye
// kısayolları. React bileşenleri yalnız bunu çizer ve işlemleri çağırır.
import { SNAP } from '../config.ts';
import { blocksOnSpread } from '../model.ts';
import { ConflictError, fetchRevision, fetchTemplates, loadIssue, saveIssue, saveTemplate } from '../data.ts';
import { checkLineHeights, loadFonts, onFontsChanged } from '../render/fonts.ts';
import {
  childrenOf,
  createStack,
  layoutStack,
  layoutStacks,
  moveInStack,
  removeFromStack,
  removeStack,
  stackBounds,
  stackById,
} from '../stacks.ts';
import {
  createBox,
  instantiateTemplate,
  removeSlot,
  removeSpreadSkeleton,
  slotById,
  templateFromSpread,
  templateKey,
} from '../templates.ts';
import type { Block, FocalPoint, PaletteName, PlacedBlock, Rect, Spread, Stack, Template } from '../types.ts';
import { createStore, type EditorState } from './store.ts';
import { createController } from './controller.ts';
import { keepInFrame, normalizeZ } from './geometry.ts';

const params = new URLSearchParams(location.search);
export const ISSUE = params.get('issue') ?? 'issue-001';
const POSITION_KEYS = ['spread_id', 'x', 'y', 'w', 'h', 'z'] as const;
const POLL_MS = 4000;
const NOTICE_MS = 8000;

// Görünüm tercihleri yalnız bu tarayıcıda tutulur; yoksa varsayılan kullanılır.
function pref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`xform.${key}`);
    return v == null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}
function setPref(key: string, value: boolean) {
  try {
    localStorage.setItem(`xform.${key}`, value ? '1' : '0');
  } catch {}
}

export type Session = Awaited<ReturnType<typeof createSession>>;
export type Actions = Session['actions'];

export async function createSession() {
  const data = await loadIssue(ISSUE);
  // revision yalnız kayıt protokolüne ait; geri alma kopyalarına girmesin.
  const revision = data.revision ?? 0;
  delete data.revision;
  const wanted = params.get('spread');
  const state = {
    data,
    revision,
    notice: null,
    spreadIndex: Math.max(
      0,
      data.spreads.findIndex((s) => s.id === wanted),
    ),
    selectedIds: [], // blok, yığın ve slot id'leri; son eleman birincil seçim
    focalId: null, // odak modundaki görsel (yalnız arayüz durumu)
    showGrid: pref('grid', true),
    lockAspect: pref('lock', true),
    saveStatus: 'saved',
    templates: [],
  } as unknown as EditorState;
  // Tek seçim kullanan kod için kısayol: birincil seçim.
  Object.defineProperty(state, 'selectedId', {
    get(this: EditorState) {
      return this.selectedIds.at(-1) ?? null;
    },
    set(this: EditorState, id: string | null) {
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

  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(text: string) {
    state.notice = text;
    store.emit('save');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      state.notice = null;
      store.emit('save');
    }, NOTICE_MS);
  }

  /** Dosyayı yeniden okur; geri alma geçmişi sıfırlanır. */
  async function reload(message: string) {
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
      console.warn('[xform]', (err as Error).message);
    } finally {
      checking = false;
    }
  }
  setInterval(checkExternal, POLL_MS);
  addEventListener('focus', checkExternal);
  document.addEventListener('visibilitychange', checkExternal);

  checkLineHeights();
  await loadFonts();

  async function loadTemplates() {
    try {
      state.templates = await fetchTemplates();
    } catch (err) {
      console.warn('[xform]', (err as Error).message);
    }
    store.emit('view');
  }
  await loadTemplates();

  const controller = createController(store);

  const block = (id: string | null) => state.data.blocks.find((b) => b.id === id) as PlacedBlock | undefined;
  const currentSpread = (): Spread => state.data.spreads[state.spreadIndex];
  const onSpread = (id: string, spreadId = currentSpread().id) =>
    (stackById(state.data, id) ?? block(id) ?? slotById(state.data, id))?.spread_id === spreadId;
  const isUnit = (id: string) => stackById(state.data, id) || (block(id) && block(id)!.stack_id == null);
  const unitRect = (id: string): Rect => {
    const st = stackById(state.data, id);
    if (st) return stackBounds(state.data, st);
    const b = block(id) as PlacedBlock;
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  };

  const actions = {
    /** Bloğu ya da yığını seç; başka bir spread'deyse oraya geç. */
    reveal(id: string) {
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
    /** Bloklar ve yığınlar tepsiye; yığın kalkar, çocukları tepsiye gider. Slot silinir. */
    unplace(ids: string | string[]) {
      store.commit((s) => {
        for (const id of ([] as string[]).concat(ids)) {
          if (slotById(s.data, id)) {
            removeSlot(s.data, id);
            continue;
          }
          // Kutu içerik değildir: tepsiye gitmez, silinir.
          if (block(id)?.type === 'box') {
            s.data.blocks = s.data.blocks.filter((b) => b.id !== id);
            continue;
          }
          const st = stackById(s.data, id);
          const targets = st ? childrenOf(s.data, id).map((b) => b.id) : [id];
          if (st) removeStack(s.data, id);
          for (const bid of targets) {
            removeFromStack(s.data, bid);
            for (const k of POSITION_KEYS) (block(bid) as Block)[k] = null;
          }
        }
        s.selectedIds = s.selectedIds.filter((id) => block(id) || stackById(s.data, id) || slotById(s.data, id));
      });
    },
    front(id: string) {
      store.commit(() => {
        const b = block(id) as PlacedBlock;
        const others = blocksOnSpread(state.data.blocks, b.spread_id);
        b.z = Math.max(...others.map((o) => o.z ?? 0)) + 1;
        normalizeZ(others);
      });
    },
    back(id: string) {
      store.commit(() => {
        const b = block(id) as PlacedBlock;
        const others = blocksOnSpread(state.data.blocks, b.spread_id);
        b.z = Math.min(...others.map((o) => o.z ?? 0)) - 1;
        normalizeZ(others);
      });
    },
    /** Seçili birimleri (serbest blok, yığın) kaydır. */
    nudge(ids: string[], dx: number, dy: number) {
      const units = ids.filter(isUnit);
      if (!units.length) return;
      store.commit((s) => {
        for (const id of units) {
          const r = unitRect(id);
          const kept = keepInFrame({ ...r, x: r.x + dx, y: r.y + dy });
          const o = (stackById(s.data, id) ?? block(id)) as Stack | PlacedBlock;
          o.x += kept.x - r.x;
          o.y += kept.y - r.y;
        }
        layoutStacks(s.data);
      });
    },
    /** Yığın içindeki bloğun sırasını bir öne/arkaya al. */
    reorderChild(id: string, delta: number) {
      const b = block(id) as PlacedBlock;
      const n = childrenOf(state.data, b.stack_id as string).length;
      const index = Math.max(0, Math.min(n - 1, (b.stack_index as number) + delta));
      if (index !== b.stack_index) store.commit((s) => moveInStack(s.data, id, index));
    },
    moveToSpread(id: string, spreadId: string) {
      store.commit((s) => {
        const others = blocksOnSpread(s.data.blocks, spreadId);
        let z = Math.max(0, ...others.map((o) => o.z ?? 0));
        const st = stackById(s.data, id);
        if (st) {
          st.spread_id = spreadId;
          for (const b of childrenOf(s.data, id)) b.z = ++z;
          layoutStack(s.data, st);
        } else {
          const b = block(id) as Block;
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
    updateStack(id: string, patch: Partial<Stack>) {
      store.commit((s) => {
        const st = stackById(s.data, id) as Stack;
        Object.assign(st, patch);
        layoutStack(s.data, st);
      });
    },
    detachFromStack(id: string) {
      store.commit(() => removeFromStack(state.data, id));
    },
    /** Yeni spread; şablon verilirse chrome ve tema ayarları, slotlar, boş yığınlar ve kutular ondan. */
    addSpread(template?: Template) {
      store.commit((s) => {
        const ids = new Set(s.data.spreads.map((x) => x.id));
        let n = s.data.spreads.length + 1;
        while (ids.has(`s-${n}`)) n++;
        const id = `s-${n}`;
        s.data.spreads.push({
          id,
          section: currentSpread().section ?? '',
          chrome_left: template?.chrome_left ?? 'full',
          chrome_right: template?.chrome_right ?? 'full',
          ...(template?.theme_left ? { theme_left: template.theme_left } : {}),
          ...(template?.theme_right ? { theme_right: template.theme_right } : {}),
        });
        if (template) instantiateTemplate(s.data, template, id);
        s.spreadIndex = s.data.spreads.length - 1;
        s.selectedId = null;
      });
    },
    /** Bloğun görünüm alanları (color, drop_cap, treatment, fill, opacity); undefined alanı siler. */
    updateBlock(id: string, patch: Partial<Block>) {
      store.commit(() => {
        const b = block(id) as Block;
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) delete (b as unknown as Record<string, unknown>)[k];
          else (b as unknown as Record<string, unknown>)[k] = v;
        }
      });
    },
    /** Sayının paletinde bir renk. */
    setPaletteColor(name: PaletteName, hex: string) {
      store.commit((s) => {
        s.data.palette = { ...(s.data.palette ?? {}), [name]: hex.toLowerCase() };
      });
    },
    /** Açık spread'e kutu: sol sayfanın ortasında, en üstte; seçili gelir. */
    addBox() {
      store.commit((s) => {
        const sp = currentSpread();
        const z = Math.max(0, ...blocksOnSpread(s.data.blocks, sp.id).map((b) => b.z ?? 0)) + 1;
        const b = createBox(s.data, sp.id, { x: 64, y: 108, w: 64, h: 40, z, fill: 'accent-soft' });
        s.selectedIds = [b.id];
      });
    },
    /** Bloksuz spread silinir; slotları ve boş yığınları da gider. */
    removeSpread() {
      const s = currentSpread();
      if (state.data.spreads.length === 1 || blocksOnSpread(state.data.blocks, s.id).length) return;
      store.commit((st) => {
        removeSpreadSkeleton(st.data, s.id);
        st.data.spreads.splice(st.spreadIndex, 1);
        st.spreadIndex = Math.max(0, st.spreadIndex - 1);
      });
    },
    /**
     * Açık spread'i şablon olarak kaydeder (data/templates/<ad>.json): bloklar
     * slota, yığınlar boş yığına. Aynı adda şablon varsa onay ister.
     */
    async saveAsTemplate(name: string, confirmOverwrite: (name: string) => boolean) {
      const key = templateKey(name);
      if (!key) return notify('Şablon adı harf ya da rakam içermeli.');
      const existing = state.templates.find((t) => t.key === key);
      if (existing && !confirmOverwrite(existing.template.name)) return;
      try {
        await saveTemplate(key, templateFromSpread(state.data, currentSpread().id, name.trim()));
        await loadTemplates();
        notify(`Şablon kaydedildi: ${name.trim()}`);
      } catch (err) {
        notify((err as Error).message);
      }
    },
    updateSpread(patch: Partial<Spread>) {
      store.commit(() => Object.assign(currentSpread(), patch));
    },
    goToSpread(i: number) {
      if (i === state.spreadIndex) return;
      store.view((s) => {
        s.spreadIndex = i;
        // Tepsideki seçim kalır; başka spread'de kalan seçim düşer.
        s.selectedIds = s.selectedIds.filter(
          (id) => (block(id) && block(id)!.spread_id == null) || onSpread(id, s.data.spreads[i].id),
        );
        s.focalId = null;
      });
    },
    setFocal(id: string, focal: FocalPoint) {
      store.commit(() => ((block(id) as Block).focal_point = focal));
    },
    toggleFocal(id: string) {
      controller.toggleFocal(id);
    },
    naturalSize(id: string) {
      return controller.naturalSize(id);
    },
    setLock(on: boolean) {
      setPref('lock', on);
      store.view((s) => (s.lockAspect = on));
    },
    toggleGrid() {
      setPref('grid', !state.showGrid);
      store.view((s) => (s.showGrid = !s.showGrid));
    },
  };

  store.subscribe((reason) => {
    if (reason === 'save' || reason === 'drag') return;
    const url = new URL(location.href);
    url.searchParams.set('spread', currentSpread().id);
    history.replaceState(null, '', url);
  });

  // Bir font sonradan gelirse (yavaş ağ) yükseklikler ve yığınlar yeniden.
  onFontsChanged(() => controller.remeasure());
  addEventListener('keydown', (e) => {
    // Metin alanında tarayıcının kendi geri alması çalışsın.
    if ((e.target as Element | null)?.closest?.('input, select, textarea')) return;
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
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };

    if (e.code === 'KeyA' && e.shiftKey && e.altKey) actions.removeAutoLayout();
    else if (e.code === 'KeyA' && e.shiftKey) actions.autoLayout();
    else if (e.key === 'g') actions.toggleGrid();
    else if (e.key === 'l') actions.setLock(!state.lockAspect);
    else if (e.key === 'Escape') {
      // Odak modu → çık; yığın içindeki blok → yığını seç; aksi halde seçimi bırak.
      if (state.focalId) controller.exitFocal();
      else store.select(child ? (child.stack_id as string) : null);
    } else if (!ids.length) return;
    else if (e.key === 'f' && b?.type === 'image') actions.toggleFocal(b.id);
    else if (state.focalId)
      return; // odak modunda taşıma/silme kısayolları kapalı
    else if (e.key === 'Delete' || e.key === 'Backspace') actions.unplace(ids);
    else if (e.key === ']' && b) actions.front(b.id);
    else if (e.key === '[' && b) actions.back(b.id);
    else if (e.key in arrows && child) {
      // Yığın içinde ok tuşları sırayı değiştirir (yığın yönünde).
      const vertical = (stackById(state.data, child.stack_id) as Stack).direction === 'vertical';
      const delta = {
        ArrowUp: vertical ? -1 : 0,
        ArrowDown: vertical ? 1 : 0,
        ArrowLeft: vertical ? 0 : -1,
        ArrowRight: vertical ? 0 : 1,
      }[e.key as 'ArrowUp'];
      if (delta) actions.reorderChild(child.id, delta);
    } else if (e.key in arrows) actions.nudge(ids, ...arrows[e.key]);
    else return;
    e.preventDefault();
  });

  Object.assign(window, { __xform: { state, store, actions } });
  return { state, store, actions, controller, block, currentSpread };
}

// Editör durumu. Seçim state.selectedIds'tedir (blok ya da yığın id'leri);
// state.selectedId son seçilene (birincil) bakan bir kısayoldur. Tek bir nesne;
// değişiklikler commit() ile yayınlanır ve gecikmeli olarak kaydedilir. emit
// nedeni dinleyicilerin ne kadarını yeniden çizeceğini belirler:
//   'all'       veri değişti (canvas tamamen yeniden çizilir, kayıt planlanır)
//   'selection' yalnız seçim değişti (canvas sadece katmanı günceller)
//   'view'      görünüm ayarı değişti (ızgara, kilit, spread sekmesi)
//   'save'      kayıt durumu değişti
//   'drag'      sürükleme sırasında veri doğrudan değişti (kayıt yok; commit gelecek)
//
// Geri alma: her commit'ten önce issue verisinin (ve açık spread'in) kopyası
// undo yığınına atılır. Sürüklemelerde kopya, ilk değişiklikten önce
// checkpoint() ile alınır; böylece bir sürükleme tek adım sayılır.
//
// React'e useSyncExternalStore ile bağlanır (src/editor/useStore.ts): her emit
// sürüm sayacını artırır.
import type { Issue } from '../types.ts';

const SAVE_DELAY = 400;
const HISTORY_LIMIT = 100;

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';
export type EmitReason = 'all' | 'selection' | 'view' | 'save' | 'drag';

export interface EditorState {
  data: Issue;
  revision: number;
  notice: string | null;
  spreadIndex: number;
  /** Blok ve yığın id'leri; son eleman birincil seçim. */
  selectedIds: string[];
  /** Birincil seçim kısayolu (main'de selectedIds'e bağlanır). */
  selectedId: string | null;
  /** Odak modundaki görsel (yalnız arayüz durumu). */
  focalId: string | null;
  showGrid: boolean;
  lockAspect: boolean;
  saveStatus: SaveStatus;
}

interface Snapshot {
  data: Issue;
  spreadIndex: number;
}

export type Store = ReturnType<typeof createStore>;

export function createStore(state: EditorState, save: (data: Issue) => Promise<void>) {
  const listeners = new Set<(reason: EmitReason) => void>();
  const undoStack: Snapshot[] = [];
  const redoStack: Snapshot[] = [];
  let pending: Snapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  let again = false;
  let version = 0;

  const snapshot = (): Snapshot => ({ data: structuredClone(state.data), spreadIndex: state.spreadIndex });

  const exists = (id: string) =>
    state.data.blocks.some((b) => b.id === id) || (state.data.stacks ?? []).some((s) => s.id === id);

  function restore(snap: Snapshot) {
    state.data = snap.data;
    state.spreadIndex = Math.min(snap.spreadIndex, state.data.spreads.length - 1);
    state.selectedIds = state.selectedIds.filter(exists);
    if (state.focalId && !exists(state.focalId)) state.focalId = null;
  }

  function changed() {
    store.emit('all');
    state.saveStatus = 'pending';
    store.emit('save');
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  }

  const store = {
    state,

    subscribe(fn: (reason: EmitReason) => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    /** Her emit'te artar; React bileşenleri buna abone olur. */
    getVersion() {
      return version;
    },

    emit(reason: EmitReason) {
      version++;
      for (const fn of listeners) fn(reason);
    },

    /** Veri doğrudan değiştirilmeden önce (sürükleme başında) çağrılır. */
    checkpoint() {
      pending ??= snapshot();
    },

    /** Sürükleme iptal edildi; alınan kopya geçmişe yazılmaz. */
    discard() {
      pending = null;
    },

    /** Veriyi değiştir, geçmişe yaz, yeniden çiz, kaydı planla. */
    commit(mutate?: (s: EditorState) => unknown) {
      const before = pending ?? snapshot();
      pending = null;
      mutate?.(state);
      if (JSON.stringify(before.data) === JSON.stringify(state.data)) {
        // Veri değişmedi (ör. tutamaca tıklayıp bırakma); yalnız görünüm.
        store.emit('all');
        return;
      }
      undoStack.push(before);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
      changed();
    },

    undo() {
      if (!undoStack.length) return;
      redoStack.push(snapshot());
      restore(undoStack.pop()!);
      changed();
    },

    redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshot());
      restore(redoStack.pop()!);
      changed();
    },

    get canUndo() {
      return undoStack.length > 0;
    },

    get canRedo() {
      return redoStack.length > 0;
    },

    /** Tek öğe seç (null: seçimi temizle). */
    select(id: string | null) {
      const ids = id ? [id] : [];
      if (ids.join() === state.selectedIds.join()) return;
      store.setSelection(ids);
    },

    /** Shift+tık: seçime ekle ya da çıkar. */
    toggle(id: string) {
      const ids = state.selectedIds.includes(id)
        ? state.selectedIds.filter((x) => x !== id)
        : [...state.selectedIds, id];
      store.setSelection(ids);
    },

    setSelection(ids: string[]) {
      state.selectedIds = [...new Set(ids)];
      if (state.focalId !== state.selectedId || state.selectedIds.length !== 1) state.focalId = null;
      store.emit('selection');
    },

    view(mutate: (s: EditorState) => unknown) {
      mutate(state);
      store.emit('view');
    },

    /** Dışarıda değişen veriyi yükler: geçmiş sıfırlanır, kaydedilmez. */
    replace(data: Issue) {
      clearTimeout(timer);
      again = false;
      pending = null;
      undoStack.length = 0;
      redoStack.length = 0;
      restore({ data, spreadIndex: state.spreadIndex });
      state.saveStatus = 'saved';
      store.emit('all');
      store.emit('save');
    },
  };

  // Kayıtlar sırayla gider; biri sürerken gelen değişiklik bittikten sonra yazılır.
  async function flush() {
    if (saving) {
      again = true;
      return;
    }
    saving = true;
    state.saveStatus = 'saving';
    store.emit('save');
    try {
      await save(state.data);
      if (state.saveStatus === 'saving') state.saveStatus = 'saved';
    } catch (err) {
      console.error(err);
      state.saveStatus = 'error';
    }
    saving = false;
    store.emit('save');
    if (again) {
      again = false;
      flush();
    }
  }

  addEventListener('beforeunload', (e) => {
    if (state.saveStatus === 'pending' || state.saveStatus === 'saving') e.preventDefault();
  });

  return store;
}

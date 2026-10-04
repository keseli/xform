// Editör durumu. Tek bir nesne; değişiklikler commit() ile yayınlanır ve
// gecikmeli olarak kaydedilir. emit nedeni dinleyicilerin ne kadarını yeniden
// çizeceğini belirler:
//   'all'       veri değişti (canvas tamamen yeniden çizilir, kayıt planlanır)
//   'selection' yalnız seçim değişti (canvas sadece katmanı günceller)
//   'view'      görünüm ayarı değişti (ızgara, kilit, spread sekmesi)
//   'save'      kayıt durumu değişti
//
// Geri alma: her commit'ten önce issue verisinin (ve açık spread'in) kopyası
// undo yığınına atılır. Sürüklemelerde kopya, ilk değişiklikten önce
// checkpoint() ile alınır; böylece bir sürükleme tek adım sayılır.

const SAVE_DELAY = 400;
const HISTORY_LIMIT = 100;

export function createStore(state, save) {
  const listeners = new Set();
  const undoStack = [];
  const redoStack = [];
  let pending = null;
  let timer = null;
  let saving = false;
  let again = false;

  const snapshot = () => ({ data: structuredClone(state.data), spreadIndex: state.spreadIndex });

  function restore(snap) {
    state.data = snap.data;
    state.spreadIndex = Math.min(snap.spreadIndex, state.data.spreads.length - 1);
    if (!state.data.blocks.some((b) => b.id === state.selectedId)) state.selectedId = null;
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

    subscribe(fn) {
      listeners.add(fn);
    },

    emit(reason) {
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
    commit(mutate) {
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
      restore(undoStack.pop());
      changed();
    },

    redo() {
      if (!redoStack.length) return;
      undoStack.push(snapshot());
      restore(redoStack.pop());
      changed();
    },

    get canUndo() {
      return undoStack.length > 0;
    },

    get canRedo() {
      return redoStack.length > 0;
    },

    select(id) {
      if (state.selectedId === id) return;
      state.selectedId = id;
      if (state.focalId !== id) state.focalId = null;
      store.emit('selection');
    },

    view(mutate) {
      mutate(state);
      store.emit('view');
    },

    /** Dışarıda değişen veriyi yükler: geçmiş sıfırlanır, kaydedilmez. */
    replace(data) {
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

// Editör durumu. Tek bir nesne; değişiklikler commit() ile yayınlanır ve
// gecikmeli olarak kaydedilir. emit nedeni dinleyicilerin ne kadarını yeniden
// çizeceğini belirler:
//   'all'       veri değişti (canvas tamamen yeniden çizilir, kayıt planlanır)
//   'selection' yalnız seçim değişti (canvas sadece katmanı günceller)
//   'view'      görünüm ayarı değişti (ızgara, kilit, spread sekmesi)
//   'save'      kayıt durumu değişti

const SAVE_DELAY = 400;

export function createStore(state, save) {
  const listeners = new Set();
  let timer = null;

  const store = {
    state,

    subscribe(fn) {
      listeners.add(fn);
    },

    emit(reason) {
      for (const fn of listeners) fn(reason);
    },

    /** Veriyi değiştir, yeniden çiz, kaydı planla. */
    commit(mutate) {
      mutate?.(state);
      store.emit('all');
      state.saveStatus = 'pending';
      store.emit('save');
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY);
    },

    select(id) {
      if (state.selectedId === id) return;
      state.selectedId = id;
      store.emit('selection');
    },

    view(mutate) {
      mutate(state);
      store.emit('view');
    },
  };

  async function flush() {
    state.saveStatus = 'saving';
    store.emit('save');
    try {
      await save(state.data);
      if (state.saveStatus === 'saving') state.saveStatus = 'saved';
    } catch (err) {
      console.error(err);
      state.saveStatus = 'error';
    }
    store.emit('save');
  }

  addEventListener('beforeunload', (e) => {
    if (state.saveStatus === 'pending' || state.saveStatus === 'saving') e.preventDefault();
  });

  return store;
}

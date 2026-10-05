import { useSyncExternalStore } from 'react';
import type { Store } from './store.ts';

/** Store'daki her emit'te yeniden çizim (store sürüm sayacına abone). */
export function useStore(store: Store): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

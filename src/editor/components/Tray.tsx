// Tepsi: yerleştirilmemiş bloklar, order sırasıyla. Sürükleme tuvale devredilir.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { unplacedBlocks } from '../../model.ts';
import type { Session } from '../session.ts';
import { kindLabel, snippet } from '../labels.ts';

export function Tray({ session }: { session: Session }) {
  const { state, store, controller } = session;
  const items = unplacedBlocks(state.data.blocks);
  const selected = state.data.blocks.find((b) => b.id === state.selectedId);
  const related = new Set(selected?.relates_to ?? []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const item = (e.target as Element).closest<HTMLElement>('.tray-item');
    if (!item) return;
    const block = state.data.blocks.find((b) => b.id === item.dataset.id);
    if (!block) return;
    const img = item.querySelector('img');
    const ratio = img?.naturalWidth ? img.naturalWidth / img.naturalHeight : undefined;
    controller.beginPlace(block, e.nativeEvent, { ratio, onClick: () => store.select(block.id) });
  };

  return (
    <aside id="tray" onPointerDown={onPointerDown}>
      <div className="panel-head">
        Tepsi <span className="count">{items.length}</span>
      </div>
      {items.length ? (
        <ol className="tray-list">
          {items.map((b) => {
            const cls = ['tray-item'];
            if (b.id === state.selectedId) cls.push('is-selected');
            if (related.has(b.id)) cls.push('is-related');
            return (
              <li key={b.id} className={cls.join(' ')} data-id={b.id}>
                <div className="tray-meta">
                  <span className="tray-order">{b.order}</span>
                  {kindLabel(b)}
                  {b.label ? (
                    <>
                      {' '}
                      <span className="tray-label">{b.label}</span>
                    </>
                  ) : null}
                  {b.removed_from_content ? (
                    <>
                      {' '}
                      <span className="tray-removed">içerikte yok</span>
                    </>
                  ) : null}
                </div>
                {b.type === 'image' && b.source ? <img src={b.source} alt="" draggable={false} /> : null}
                <div className="tray-text">{snippet(b)}</div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty">Tepsi boş. Bir bloğu geri göndermek için seçip Delete’e bas.</p>
      )}
    </aside>
  );
}

// Üst çubuk: geri al/yinele, spread sekmeleri, yeni spread (boş ya da şablondan),
// ızgara ve oran kilidi, kayıt durumu.
import { useEffect, useRef, useState } from 'react';
import { SNAP } from '../../config.ts';
import type { Session } from '../session.ts';
import { ISSUE } from '../session.ts';
import { computeWarnings } from '../warnings.ts';
import { pageLabel } from '../labels.ts';

const SAVE_TEXT = {
  saved: 'Kaydedildi',
  pending: 'Değişiklik var…',
  saving: 'Kaydediliyor…',
  error: 'Kaydedilemedi — npm run dev ile mi açtın?',
};

/** "+ Spread": boş spread ya da data/templates/ altındaki bir şablon. */
function AddSpread({ session }: { session: Session }) {
  const { state, actions } = session;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('pointerdown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  const choose = (template?: (typeof state.templates)[number]['template']) => {
    setOpen(false);
    actions.addSpread(template);
  };
  return (
    <div className="spread-add" ref={ref}>
      <button
        className="tab tab--add"
        data-cmd="add-spread"
        title="Yeni spread"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        + Spread
      </button>
      {open ? (
        <div className="spread-menu" role="menu">
          <button role="menuitem" data-template="" onClick={() => choose()}>
            Boş spread
          </button>
          {state.templates.length ? <div className="menu-sep" /> : null}
          {state.templates.map(({ key, template }) => (
            <button key={key} role="menuitem" data-template={key} onClick={() => choose(template)}>
              {template.name}
              <span className="menu-meta">
                {template.slots.length} slot{template.stacks.length ? ` · ${template.stacks.length} sütun` : ''}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({ session }: { session: Session }) {
  const { state, store, actions, block, currentSpread } = session;
  const warnings = computeWarnings(state.data);
  const perSpread = new Map<string | null, number>();
  for (const [id, list] of warnings) {
    const sid = block(id)?.spread_id ?? null;
    perSpread.set(sid, (perSpread.get(sid) ?? 0) + list.length);
  }
  const saveClass = `save save--${state.notice ? 'notice' : state.saveStatus}`;
  return (
    <header id="topbar">
      <div className="brand">
        XFORM <span>editör</span>
      </div>
      <div className="history">
        <button data-cmd="undo" disabled={!store.canUndo} title="Geri al (Ctrl+Z)" onClick={() => store.undo()}>
          ↶
        </button>
        <button data-cmd="redo" disabled={!store.canRedo} title="Yinele (Ctrl+Shift+Z)" onClick={() => store.redo()}>
          ↷
        </button>
      </div>
      <nav className="tabs">
        {state.data.spreads.map((s, i) => {
          const n = perSpread.get(s.id);
          return (
            <button
              key={s.id}
              className={`tab${i === state.spreadIndex ? ' is-active' : ''}`}
              data-tab={i}
              title={s.section ?? ''}
              onClick={() => actions.goToSpread(i)}
            >
              {i + 1} <span className="tab-pages">{pageLabel(state.data.issue, i)}</span>
              {n ? <span className="tab-warn">{n}</span> : null}
            </button>
          );
        })}
      </nav>
      <AddSpread session={session} />
      <button className="tab tab--add" data-cmd="add-box" title="Açık spread'e kutu ekle" onClick={() => actions.addBox()}>
        + Kutu
      </button>
      <div className="tools">
        <button className="toggle" data-cmd="grid" aria-pressed={state.showGrid} onClick={() => actions.toggleGrid()}>
          Izgara <kbd>G</kbd>
        </button>
        <button
          className="toggle"
          data-cmd="lock"
          aria-pressed={state.lockAspect}
          onClick={() => actions.setLock(!state.lockAspect)}
        >
          Oran kilidi <kbd>L</kbd>
        </button>
        <span className="hint">
          snap {SNAP.step} hücre · <kbd>Alt</kbd> {SNAP.fine}
        </span>
        <span className={saveClass} title={state.notice ?? ''}>
          {state.notice ?? SAVE_TEXT[state.saveStatus]}
        </span>
        <a
          className="read-link"
          href={`index.html?issue=${encodeURIComponent(ISSUE)}&spread=${encodeURIComponent(currentSpread().id)}`}
          target="_blank"
        >
          Okuma görünümü ↗
        </a>
      </div>
    </header>
  );
}

// Sağ panel: seçili bloğun, yığının, slotun ya da çoklu seçimin bilgileri ve
// işlemleri; seçim yoksa spread ayarları. Altta her zaman bu spread'in uyarıları.
import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import { CELL } from '../../config.ts';
import { blocksOnSpread, isPlaced } from '../../model.ts';
import { childrenOf, hasPlaceholder, stackBounds, stackById } from '../../stacks.ts';
import { slotById, slotsOn } from '../../templates.ts';
import { colorsFor, paletteOf, PALETTE_NAMES, THEMES, TREATMENTS } from '../../style.ts';
import type { Block, PaletteName, Slot, Stack, TextColor, Theme, Treatment } from '../../types.ts';
import type { Session } from '../session.ts';
import { computeWarnings, type Warning } from '../warnings.ts';
import { kindLabel, pageLabel, snippet } from '../labels.ts';
import { isCropped } from '../focal.ts';

/**
 * Yerel 'change' olayıyla çalışan input: metin ve sayı alanında değer, odak
 * kaybında ya da Enter'da işlenir (React'in onChange'i her tuşta tetiklenir).
 */
function CommitInput({
  onCommit,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { onCommit: (el: HTMLInputElement) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const handler = useRef(onCommit);
  handler.current = onCommit;
  useEffect(() => {
    const el = ref.current as HTMLInputElement;
    const fn = () => handler.current(el);
    el.addEventListener('change', fn);
    return () => el.removeEventListener('change', fn);
  }, []);
  return <input ref={ref} {...props} />;
}

export function Inspector({ session }: { session: Session }) {
  const { state, actions } = session;
  const { data } = state;
  const warnings = computeWarnings(data);
  const spreadId = data.spreads[state.spreadIndex].id;
  const ids = state.selectedIds;
  const stack = ids.length === 1 ? stackById(data, ids[0]) : undefined;
  const slot = ids.length === 1 ? slotById(data, ids[0]) : undefined;
  const selected = ids.length === 1 ? data.blocks.find((b) => b.id === ids[0]) : undefined;
  const id = state.selectedId as string;

  const spreadName = (sid: string | null | undefined) => {
    const i = data.spreads.findIndex((s) => s.id === sid);
    return i < 0 ? 'tepsi' : `spread ${i + 1}`;
  };

  const spreadOptions = data.spreads.map((s, i) => (
    <option key={s.id} value={s.id}>
      {`${i + 1} · ${pageLabel(data.issue, i)} · ${s.section ?? ''}`}
    </option>
  ));

  function blockPanel(b: Block) {
    const placed = isPlaced(b);
    const st = b.stack_id ? stackById(data, b.stack_id) : undefined;
    const own = warnings.get(b.id) ?? [];
    return (
      <section className="panel">
        <div className="panel-head">
          {kindLabel(b)} <span className="count">sıra {b.order}</span>
        </div>
        <div className="block-id">{b.id}</div>
        <p className="snippet">{snippet(b, 140)}</p>
        {placed ? (
          <dl className="metrics">
            {(['x', 'y', 'w', 'h', 'z'] as const).map((k) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{b[k]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="muted">Tepside. Yerleştirmek için tepsiden spread’e sürükle.</p>
        )}
        {st ? (
          <div className="field">
            Auto layout
            <div className="focal-row">
              <span className="focal-values">
                {st.direction === 'vertical' ? 'Dikey' : 'Yatay'} yığında {(b.stack_index as number) + 1}. sırada
              </span>
              <button data-action="select" data-id={st.id} onClick={() => actions.reveal(st.id)}>
                Yığını seç
              </button>
              <button data-action="detach" onClick={() => actions.detachFromStack(id)}>
                Çıkar
              </button>
            </div>
            <span className="muted">Konum yığından gelir. Sürükleyerek ya da ok tuşlarıyla sırasını değiştir.</span>
          </div>
        ) : null}
        {placed && !st ? (
          <label className="field">
            Spread
            <select
              data-action="move-spread"
              value={b.spread_id as string}
              onChange={(e) => actions.moveToSpread(id, e.target.value)}
            >
              {spreadOptions}
            </select>
          </label>
        ) : null}
        {(b.relates_to ?? []).length ? (
          <div className="field">
            İlişkili
            <div className="chips">
              {b.relates_to.map((rid) => {
                const r = data.blocks.find((x) => x.id === rid);
                const here = r?.spread_id === spreadId;
                return (
                  <button
                    key={rid}
                    className={`chip${here ? ' chip--here' : ''}`}
                    data-action="select"
                    data-id={rid}
                    onClick={() => actions.reveal(rid)}
                  >
                    {rid} <span>{here ? 'bu spread' : spreadName(r?.spread_id)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {b.type === 'image' ? (
          <label className="check">
            <input
              type="checkbox"
              data-action="lock"
              checked={state.lockAspect}
              onChange={(e) => actions.setLock(e.target.checked)}
            />{' '}
            Oran kilidi <kbd>L</kbd> <span className="muted">(Shift ile geçici ters)</span>
          </label>
        ) : null}
        {b.type === 'image' && placed && b.source ? focalPanel(b) : null}
        {lookPanel(b)}
        <div className="buttons">
          <button data-action="front" disabled={!placed} onClick={() => actions.front(id)}>
            Öne getir <kbd>]</kbd>
          </button>
          <button data-action="back" disabled={!placed} onClick={() => actions.back(id)}>
            Arkaya gönder <kbd>[</kbd>
          </button>
          <button data-action="unplace" className="danger" disabled={!placed} onClick={() => actions.unplace(id)}>
            {b.type === 'box' ? 'Kutuyu sil' : 'Tepsiye gönder'} <kbd>Del</kbd>
          </button>
        </div>
        {own.length ? (
          <ul className="warnings">
            {own.map((w, i) => (
              <li key={i} className={`warn--${w.kind}`}>
                {w.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  /** Görünüm: metin rengi, büyük baş harf, görsel işleme, kutu dolgusu ve saydamlığı. */
  function lookPanel(b: Block) {
    const colors = colorsFor(b.type);
    const COLOR_TEXT: Record<TextColor, string> = { default: 'Varsayılan', accent: 'Accent', muted: 'Soluk' };
    const TREAT_TEXT: Record<Treatment, string> = {
      none: 'Yok',
      mono: 'Mono (gri)',
      duotone: 'Duotone (ink + paper)',
      multiply: 'Multiply (kâğıda karışır)',
    };
    return (
      <>
        {colors.length ? (
          <label className="field">
            Renk
            <select
              data-action="color"
              value={b.color ?? 'default'}
              onChange={(e) => {
                const v = e.target.value as TextColor;
                actions.updateBlock(id, { color: v === 'default' ? undefined : v });
              }}
            >
              {colors.map((c) => (
                <option key={c} value={c}>
                  {COLOR_TEXT[c]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {b.type === 'text' && b.variant === 'body' ? (
          <label className="check">
            <input
              type="checkbox"
              data-action="drop-cap"
              checked={!!b.drop_cap}
              onChange={(e) => actions.updateBlock(id, { drop_cap: e.target.checked || undefined })}
            />{' '}
            Büyük baş harf <span className="muted">(üç satır)</span>
          </label>
        ) : null}
        {b.type === 'image' ? (
          <label className="field">
            İşleme
            <select
              data-action="treatment"
              value={b.treatment ?? 'none'}
              onChange={(e) => {
                const v = e.target.value as Treatment;
                actions.updateBlock(id, { treatment: v === 'none' ? undefined : v });
              }}
            >
              {TREATMENTS.map((t) => (
                <option key={t} value={t}>
                  {TREAT_TEXT[t]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {b.type === 'box' ? (
          <div className="field-row">
            <label className="field">
              Dolgu
              <select
                data-action="fill"
                value={b.fill ?? 'accent-soft'}
                onChange={(e) => actions.updateBlock(id, { fill: e.target.value as PaletteName })}
              >
                {PALETTE_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Saydamlık (%)
              <CommitInput
                key={`${b.id}:${b.opacity ?? 1}`}
                type="number"
                min="0"
                max="100"
                step="5"
                data-action="opacity"
                defaultValue={Math.round((b.opacity ?? 1) * 100)}
                onCommit={(el) => {
                  const v = Math.max(0, Math.min(100, Math.round(Number(el.value))));
                  if (!Number.isFinite(v)) return void (el.value = String(Math.round((b.opacity ?? 1) * 100)));
                  actions.updateBlock(id, { opacity: v >= 100 ? undefined : v / 100 });
                }}
              />
            </label>
          </div>
        ) : null}
      </>
    );
  }

  /** Sayı ayarları: palet (bloklar renk kodu değil ad taşır). */
  function issuePanel() {
    const palette = paletteOf(data);
    return (
      <section className="panel">
        <div className="panel-head">
          Sayı <span className="count">palet</span>
        </div>
        <div className="palette">
          {PALETTE_NAMES.map((n) => (
            <label key={n} className="palette-row">
              <CommitInput
                key={`${n}:${palette[n]}`}
                type="color"
                data-action={`palette-${n}`}
                defaultValue={palette[n]}
                onCommit={(el) => actions.setPaletteColor(n, el.value)}
              />
              <span className="palette-name">{n}</span>
              <code>{palette[n]}</code>
            </label>
          ))}
        </div>
      </section>
    );
  }

  function stackPanel(st: Stack) {
    const kids = childrenOf(data, st.id);
    const r = stackBounds(data, st);
    return (
      <section className="panel">
        <div className="panel-head">
          Auto layout <span className="count">{kids.length} blok</span>
        </div>
        <dl className="metrics">
          {(
            [
              ['x', r.x],
              ['y', r.y],
              ['w', r.w],
              ['h', r.h],
              ['gap', st.gap],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="field-row">
          <label className="field">
            Yön
            <select
              data-action="stack-direction"
              value={st.direction}
              onChange={(e) => actions.updateStack(id, { direction: e.target.value as Stack['direction'] })}
            >
              <option value="vertical">Dikey ↓</option>
              <option value="horizontal">Yatay →</option>
            </select>
          </label>
          <label className="field">
            Boşluk (hücre)
            <CommitInput
              key={`${st.id}:${st.gap}`}
              type="number"
              min="0"
              step="1"
              data-action="stack-gap"
              defaultValue={st.gap}
              onCommit={(el) => {
                const gap = Math.max(0, Math.round(Number(el.value)));
                if (Number.isFinite(gap)) actions.updateStack(id, { gap });
                else el.value = String(st.gap);
              }}
            />
          </label>
        </div>
        <label className="field">
          Spread
          <select
            data-action="move-spread"
            value={st.spread_id}
            onChange={(e) => actions.moveToSpread(id, e.target.value)}
          >
            {spreadOptions}
          </select>
        </label>
        <div className="field">
          Sıra
          {!kids.length && hasPlaceholder(st) ? (
            <p className="muted">Boş sütun: metin bloklarını tepsiden ya da tuvalden içine bırak.</p>
          ) : null}
          <ol className="stack-list">
            {kids.map((b) => (
              <li key={b.id}>
                <button data-action="select" data-id={b.id} onClick={() => actions.reveal(b.id)}>
                  <span className="tray-order">{b.order}</span> {kindLabel(b)}{' '}
                  <span className="muted">{snippet(b, 40)}</span>
                </button>
              </li>
            ))}
          </ol>
          <span className="muted">
            Boşluk, art arda gövde paragrafları (boşluksuz, girintili) ve ara başlıklar (üstü 8, altı 3 hücre)
            dışındaki bloklar arasına uygulanır. Çift tık ya da listeden seç: içindeki bloğa gir.
            {st.direction === 'vertical'
              ? ' Yan tutamaçlar tüm metin bloklarının genişliğini birlikte değiştirir.'
              : ''}
          </span>
        </div>
        <div className="buttons">
          <button data-action="remove-stack" onClick={() => actions.removeAutoLayout()}>
            Auto layout’u kaldır <kbd>Alt⇧A</kbd>
          </button>
          <button data-action="unplace" className="danger" onClick={() => actions.unplace(id)}>
            {kids.length ? 'Tepsiye gönder' : 'Sütunu sil'} <kbd>Del</kbd>
          </button>
        </div>
      </section>
    );
  }

  function slotPanel(sl: Slot) {
    const variant = sl.accepts.variant ? ` (${sl.accepts.variant})` : ' (her variant)';
    const needsVariant = sl.accepts.type === 'heading' || sl.accepts.type === 'text';
    return (
      <section className="panel">
        <div className="panel-head">
          Slot <span className="count">şablon</span>
        </div>
        <p className="field">
          Kabul eder: <strong>{kindLabel({ type: sl.accepts.type, variant: sl.accepts.variant ?? null })}</strong>
          {needsVariant ? <span className="muted">{variant}</span> : null}
        </p>
        <dl className="metrics">
          {(
            [
              ['x', sl.x],
              ['y', sl.y],
              ['w', sl.w],
              ['h', sl.h],
              ['z', sl.z],
              ['tone', sl.tone === 'light' ? 'açık' : 'koyu'],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          Uygun bloğu tepsiden ya da tuvalden üstüne bırak: blok konumu, genişliği, z ve tone’u
          {sl.accepts.type === 'image' ? ', yüksekliği' : ''} alır, slot kalkar. Uymayan blok serbest yerleşir.
        </p>
        <div className="buttons">
          <button data-action="remove-slot" className="danger" onClick={() => actions.unplace(sl.id)}>
            Slotu sil <kbd>Del</kbd>
          </button>
        </div>
      </section>
    );
  }

  function multiPanel() {
    const here = ids.filter((x) => (stackById(data, x) ?? data.blocks.find((b) => b.id === x))?.spread_id === spreadId);
    const free = here.filter((x) => data.blocks.find((b) => b.id === x)?.stack_id == null && !stackById(data, x));
    return (
      <section className="panel">
        <div className="panel-head">
          Çoklu seçim <span className="count">{here.length} öğe</span>
        </div>
        <p className="muted">Birlikte taşı (sürükle ya da ok tuşları). Shift+tık seçime ekler ya da çıkarır.</p>
        <div className="buttons">
          <button data-action="auto-layout" disabled={!free.length} onClick={() => actions.autoLayout()}>
            Auto layout <kbd>⇧A</kbd>
          </button>
          <button data-action="unplace-all" className="danger" onClick={() => actions.unplace(state.selectedIds)}>
            Tepsiye gönder <kbd>Del</kbd>
          </button>
        </div>
      </section>
    );
  }

  function focalPanel(b: Block) {
    const f = b.focal_point ?? { x: 0.5, y: 0.5 };
    const natural = actions.naturalSize(b.id);
    const cropped = natural
      ? isCropped({ width: (b.w as number) * CELL, height: (b.h as number) * CELL }, natural)
      : true;
    const on = state.focalId === b.id;
    return (
      <div className="field">
        Odak noktası
        <div className="focal-row">
          <span className="focal-values">
            x {f.x.toFixed(2)} · y {f.y.toFixed(2)}
          </span>
          <button data-action="focal-mode" aria-pressed={on} onClick={() => actions.toggleFocal(id)}>
            Kaydır <kbd>F</kbd>
          </button>
          <button
            data-action="focal-center"
            disabled={f.x === 0.5 && f.y === 0.5}
            onClick={() => actions.setFocal(id, { x: 0.5, y: 0.5 })}
          >
            Ortala
          </button>
        </div>
        <span className="muted">
          {!cropped
            ? 'Kutu görselle aynı oranda; kırpma yok.'
            : on
              ? 'Görseli kutu içinde sürükle. Esc ya da kutu dışına tıkla: çık.'
              : 'Çift tık ya da F: görseli kutu içinde kaydır.'}
        </span>
      </div>
    );
  }

  function spreadPanel() {
    const i = state.spreadIndex;
    const s = data.spreads[i];
    const empty = blocksOnSpread(data.blocks, s.id).length === 0;
    const only = data.spreads.length === 1;
    return (
      <section className="panel">
        <div className="panel-head">
          Spread {i + 1} <span className="count">sayfa {pageLabel(data.issue, i)}</span>
        </div>
        <label className="field">
          Bölüm adı
          <CommitInput
            key={`${s.id}:${s.section}`}
            type="text"
            data-action="section"
            defaultValue={s.section ?? ''}
            onCommit={(el) => actions.updateSpread({ section: el.value.trim() })}
          />
        </label>
        <div className="field-row">
          {(['left', 'right'] as const).map((side) => (
            <label key={side} className="field">
              {side === 'left' ? 'Sol sayfa teması' : 'Sağ sayfa teması'}
              <select
                data-action={`theme-${side}`}
                value={s[`theme_${side}`] ?? 'paper'}
                onChange={(e) => {
                  const v = e.target.value as Theme;
                  actions.updateSpread({ [`theme_${side}`]: v === 'paper' ? undefined : v });
                }}
              >
                {THEMES.map((t) => (
                  <option key={t} value={t}>
                    {{ paper: 'Kâğıt', ink: 'Koyu (ink)', soft: 'Açık vurgu (soft)', accent: 'Vurgu (accent)' }[t]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            data-action="chrome-left"
            checked={s.chrome_left === 'full'}
            onChange={(e) => actions.updateSpread({ chrome_left: e.target.checked ? 'full' : 'none' })}
          />{' '}
          Sol sayfada chrome
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-action="chrome-right"
            checked={s.chrome_right === 'full'}
            onChange={(e) => actions.updateSpread({ chrome_right: e.target.checked ? 'full' : 'none' })}
          />{' '}
          Sağ sayfada chrome
        </label>
        {slotsOn(data, s.id).length ? (
          <p className="muted">Bu spread’de {slotsOn(data, s.id).length} boş slot var.</p>
        ) : null}
        <div className="buttons">
          <button
            data-action="save-template"
            onClick={() => {
              const name = prompt('Şablon adı', s.section || `Spread ${i + 1}`);
              if (name?.trim()) {
                void actions.saveAsTemplate(name, (old) => confirm(`“${old}” şablonu var. Üzerine yazılsın mı?`));
              }
            }}
          >
            Şablon olarak kaydet
          </button>
          <button
            data-action="remove-spread"
            className="danger"
            disabled={!(empty && !only)}
            title={only ? 'Son spread silinemez' : empty ? '' : 'Yalnız boş spread silinebilir'}
            onClick={() => actions.removeSpread()}
          >
            Spread’i sil
          </button>
        </div>
      </section>
    );
  }

  function warningsPanel() {
    const rows: { b: Block; w: Warning }[] = [];
    let elsewhere = 0;
    for (const [wid, list] of warnings) {
      const b = data.blocks.find((x) => x.id === wid) as Block;
      if (b.spread_id !== spreadId) {
        elsewhere += list.length;
        continue;
      }
      for (const w of list) rows.push({ b, w });
    }
    rows.sort((a, z) => a.b.order - z.b.order);
    return (
      <section className="panel panel--warnings">
        <div className="panel-head">
          Uyarılar <span className="count">{rows.length}</span>
        </div>
        {rows.length ? (
          <ul className="warning-list">
            {rows.map(({ b, w }, i) => (
              <li key={i}>
                <button
                  className={`warn--${w.kind}`}
                  data-action="select"
                  data-id={b.id}
                  onClick={() => actions.reveal(b.id)}
                >
                  <span className="warning-who">
                    {b.order} · {b.id}
                  </span>
                  {w.message}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Bu spread’de uyarı yok.</p>
        )}
        {elsewhere ? <p className="muted">Diğer spread’lerde {elsewhere} uyarı.</p> : null}
      </section>
    );
  }

  let panel;
  if (ids.length > 1) panel = multiPanel();
  else if (stack) panel = stackPanel(stack);
  else if (slot) panel = slotPanel(slot);
  else if (selected) panel = blockPanel(selected);
  else
    panel = (
      <>
        {spreadPanel()}
        {issuePanel()}
      </>
    );

  return (
    <aside id="inspector">
      {panel}
      {warningsPanel()}
    </aside>
  );
}

// Editör katmanları; Spread'e genel yuvalarla verilir, blok bileşenleri bunlardan
// habersizdir. Üst üste diziliş styles/*.css'teki z-index'lerle ve DOM sırasıyla
// belirlenir (eşit z'de boyama sırasını DOM sırası belirler):
// - SlotLayer (.slots, z 0): şablon slotları; `underlay` yuvası, blokların
//   altında (slotu dolduran ya da üstüne bırakılan blok onu örter)
// - GridGuides (.guides, z 9800): ızgara ve kenar kılavuzları; `underlay` yuvası,
//   bloklardan önce
// - EditorLayer (.overlay, z 9900): yığın çerçeveleri, rozetler, seçim ve
//   tutamaçlar, odak modu, akıllı kılavuz çizgileri, ekleme çizgisi, alan seçimi,
//   tepsi önizlemesi; `children` yuvası, en sonda
import type { ReactNode } from 'react';
import { CELL, FRAME, MARGINS, PAGE_COLS } from '../../config.ts';
import { blocksOnSpread, LAYOUT_ONLY } from '../../model.ts';
import { childrenOf, hasPlaceholder, stackBounds, stackById } from '../../stacks.ts';
import { slotById, slotsOn } from '../../templates.ts';
import type { PlacedBlock, Rect, Slot } from '../../types.ts';
import { Block } from '../../components/Block.tsx';
import { DIRS, union } from '../controller.ts';
import { imageRect } from '../focal.ts';
import { kindLabel } from '../labels.ts';
import type { Session } from '../session.ts';
import type { Warning } from '../warnings.ts';

const px = (cells: number) => `${cells * CELL}px`;
const DEFAULT_FOCAL = { x: 0.5, y: 0.5 };

function Box({ className, r, children }: { className: string; r: Rect; children?: ReactNode }) {
  return (
    <div className={className} style={{ left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) }}>
      {children}
    </div>
  );
}

function Handles({ dirs }: { dirs: string[] }) {
  return dirs.map((dir) => <div key={dir} className={`handle handle--${dir}`} data-dir={dir} />);
}

const slotLabel = (s: Slot) =>
  s.accepts.variant == null && (s.accepts.type === 'heading' || s.accepts.type === 'text')
    ? { heading: 'Başlık (her tür)', text: 'Metin (her tür)' }[s.accepts.type]
    : kindLabel({ type: s.accepts.type, variant: s.accepts.variant ?? null });

/** Şablon slotları: kesikli çerçeve ve kabul ettiği tür (yalnız editör). */
export function SlotLayer({ session }: { session: Session }) {
  const { state, controller } = session;
  const spread = state.data.spreads[state.spreadIndex];
  return (
    <div className="slots">
      {slotsOn(state.data, spread.id).map((s) => {
        const cls = ['slot', `slot--${s.accepts.type}`];
        if (s.h < 8) cls.push('slot--thin'); // etiket kutuya sığmaz: ortada ya da yanında
        if (controller.layer.slotTarget === s.id) cls.push('is-target');
        if (state.selectedIds.includes(s.id)) cls.push('is-selected');
        return (
          <div
            key={s.id}
            className={cls.join(' ')}
            data-slot-id={s.id}
            style={{ left: px(s.x), top: px(s.y), width: px(s.w), height: px(s.h) }}
          >
            <span className="slot-label">{slotLabel(s)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Izgara ve kenar boşluğu kılavuzları (yalnız editör). */
export function GridGuides() {
  return (
    <div className="guides">
      {(['left', 'right'] as const).map((side) => {
        const pageLeft = side === 'left' ? 0 : PAGE_COLS;
        const l = side === 'left' ? MARGINS.outer : MARGINS.inner;
        const r = side === 'left' ? MARGINS.inner : MARGINS.outer;
        return (
          <div
            key={side}
            className="guides-margin"
            style={{
              left: `${(pageLeft + l) * CELL}px`,
              top: `${MARGINS.top * CELL}px`,
              width: `${(PAGE_COLS - l - r) * CELL}px`,
              height: `${FRAME.height - (MARGINS.top + MARGINS.bottom) * CELL}px`,
            }}
          />
        );
      })}
    </div>
  );
}

export function EditorLayer({ session, warnings }: { session: Session; warnings: Map<string, Warning[]> }) {
  const { state, controller } = session;
  const { layer } = controller;
  const data = state.data;
  const spread = data.spreads[state.spreadIndex];
  const stacks = (data.stacks ?? []).filter((s) => s.spread_id === spread.id);
  const blockById = (id: string) => data.blocks.find((b) => b.id === id) as PlacedBlock | undefined;

  function selection(): ReactNode {
    const ids = state.selectedIds.filter((id) => {
      const s = stackById(data, id);
      return s ? s.spread_id === spread.id : blockById(id)?.spread_id === spread.id;
    });
    const slots = state.selectedIds.map((id) => slotById(data, id)).filter((s) => s?.spread_id === spread.id);
    if (!ids.length) {
      return slots.map((s) => <Box key={s!.id} className="selection selection--slot" r={s!} />);
    }
    if (ids.length > 1) {
      const rects = ids.map(controller.unitRect);
      return (
        <>
          {rects.map((r, i) => (
            <Box key={ids[i]} className="selection selection--member" r={r} />
          ))}
          <Box className="selection selection--group" r={union(rects)} />
        </>
      );
    }
    const id = ids[0];
    if (id === layer.draggingId) return null;
    const s = stackById(data, id);
    if (s) {
      // Dikey yığında metin genişliği tutamaçları: metin bloklarının ortak kenarında.
      const texts = controller.stackTexts(s);
      const r = stackBounds(data, s);
      return (
        <>
          <Box className="selection selection--stack" r={r} />
          {s.direction === 'vertical' && texts.length ? (
            <Box className="selection selection--sides selection--handles" r={{ ...r, w: controller.textWidth(texts) }}>
              <Handles dirs={['w', 'e']} />
            </Box>
          ) : null}
        </>
      );
    }
    const b = blockById(id) as PlacedBlock;
    const cls = ['selection'];
    let dirs: string[];
    if (b.stack_id != null) {
      // Yığın içinde konum yığından gelir: yalnız sağ/alt kenar.
      dirs = b.type === 'image' || b.type === 'box' ? ['e', 's', 'se'] : ['e'];
      cls.push('selection--child');
    } else {
      dirs = b.type === 'image' || b.type === 'box' ? Object.keys(DIRS) : ['w', 'e'];
    }
    if (b.type !== 'image' && b.type !== 'box') cls.push('selection--sides');
    return (
      <Box className={cls.join(' ')} r={controller.blockRect(b)}>
        <Handles dirs={dirs} />
      </Box>
    );
  }

  /** Kırpılan kısmın soluk önizlemesi, odak işareti ve kesikli çerçeve. */
  function focalLayer(b: PlacedBlock): ReactNode {
    const natural = controller.naturalSize(b.id);
    const focal = b.focal_point ?? DEFAULT_FOCAL;
    const r = natural ? imageRect(focal, { width: b.w * CELL, height: b.h * CELL }, natural) : null;
    return (
      <Box className="focal" r={controller.blockRect(b)}>
        {r ? (
          <>
            <img
              className="focal-ghost"
              src={b.source as string}
              alt=""
              style={{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` }}
            />
            <div className="focal-mark" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} />
          </>
        ) : null}
        <div className="selection selection--focal" />
      </Box>
    );
  }

  const focal = controller.focalBlock();

  return (
    <div className="overlay">
      {stacks.map((s) => {
        const empty = !childrenOf(data, s.id).length;
        return (
          <Box key={s.id} className={empty ? 'stack-outline stack-outline--empty' : 'stack-outline'} r={stackBounds(data, s)}>
            {empty && hasPlaceholder(s) ? (
              <span className="slot-label">{s.direction === 'vertical' ? 'Metin sütunu ↓' : 'Metin dizisi →'}</span>
            ) : null}
          </Box>
        );
      })}
      {blocksOnSpread(data.blocks, spread.id).map((b) => {
        if (LAYOUT_ONLY.has(b.type)) return null; // kutunun okuma sırası yok
        const list = warnings.get(b.id) ?? [];
        return (
          <div
            key={b.id}
            className={list.length ? 'badge badge--warn' : 'badge'}
            data-id={b.id}
            title={list.length ? list.map((w) => w.message).join('\n') : `${kindLabel(b)} · ${b.id}`}
            style={{ left: px(b.x), top: px(b.y) }}
          >
            {b.order}
          </div>
        );
      })}
      {focal ? focalLayer(focal) : selection()}
      {layer.guides.map((g, i) =>
        g.axis === 'x' ? (
          <div
            key={i}
            className="guide-line guide-line--x"
            style={{ left: px(g.at), top: px(g.from), height: px(g.to - g.from) }}
          />
        ) : (
          <div
            key={i}
            className="guide-line guide-line--y"
            style={{ top: px(g.at), left: px(g.from), width: px(g.to - g.from) }}
          />
        ),
      )}
      {layer.marker ? (
        <Box className={`insert-marker insert-marker--${layer.marker.h === 0 ? 'h' : 'v'}`} r={layer.marker} />
      ) : null}
      {layer.marquee ? <Box className="marquee" r={layer.marquee} /> : null}
      {layer.preview ? <Block block={layer.preview} className="is-preview" /> : null}
    </div>
  );
}

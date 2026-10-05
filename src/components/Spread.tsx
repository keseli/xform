// Bir spread'in frame'i (ölçeklenmemiş, tasarım biriminde). Saf: yalnız veriden
// çizer. Okuma görünümü ve editör aynı bileşeni kullanır. Palet frame'e CSS
// değişkeni olarak bağlanır; her sayfanın teması kendi zeminini çizer; bloklar
// sayfalarının temasını, girinti ve künye bilgisini buradan alır (src/style.ts).
// Editör yalnız genel girişlerle ekleme yapar:
//   className   frame'e ek sınıf
//   blockProps  bloğa ek sınıf/stil
//   underlay    frame içinde, bloklardan önce ek katman
//   children    frame içinde, en sonda ek katman
import { useMemo, type CSSProperties, type ReactNode, type Ref } from 'react';
import { FRAME } from '../config.ts';
import { blocksOnSpread } from '../model.ts';
import { creditsByBlock, duotoneTables, indentedParagraphs, paletteOf, paletteVars, sideOf, themeOf } from '../style.ts';
import type { Issue, PlacedBlock } from '../types.ts';
import { Block, type BlockViewProps } from './Block.tsx';
import { Chrome } from './Chrome.tsx';

interface SpreadProps {
  data: Issue;
  spreadId: string;
  className?: string;
  blockProps?: (block: PlacedBlock) => Pick<BlockViewProps, 'className' | 'style'> | undefined;
  underlay?: ReactNode;
  children?: ReactNode;
  frameRef?: Ref<HTMLDivElement>;
}

export function Spread({ data, spreadId, className, blockProps, underlay, children, frameRef }: SpreadProps) {
  const index = data.spreads.findIndex((s) => s.id === spreadId);
  const spread = data.spreads[index];
  if (!spread) throw new Error(`spread bulunamadı: ${spreadId}`);
  const palette = paletteOf(data);
  const duo = duotoneTables(palette);
  const indented = useMemo(() => indentedParagraphs(data.blocks), [data.blocks]);
  const credits = useMemo(() => creditsByBlock(data.blocks), [data.blocks]);

  return (
    <div
      ref={frameRef}
      className={className ? `frame ${className}` : 'frame'}
      style={{ width: `${FRAME.width}px`, height: `${FRAME.height}px`, ...(paletteVars(palette) as CSSProperties) }}
      data-spread={spread.id}
    >
      {/* Duotone: siyah → ink, beyaz → paper (styles/main.css .treat--duotone). */}
      <svg className="defs" width="0" height="0" aria-hidden="true">
        <filter id="xform-duotone" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={duo.r} />
            <feFuncG type="table" tableValues={duo.g} />
            <feFuncB type="table" tableValues={duo.b} />
          </feComponentTransfer>
        </filter>
      </svg>
      <div className={`page page--left theme--${themeOf(spread, 'left')}`} />
      <div className={`page page--right theme--${themeOf(spread, 'right')}`} />
      {underlay}
      <div className="blocks">
        {blocksOnSpread(data.blocks, spread.id).map((b) => (
          <Block
            key={b.id}
            block={b}
            theme={themeOf(spread, sideOf(b.x))}
            indent={indented.has(b.id)}
            credits={credits.get(b.id)}
            {...blockProps?.(b)}
          />
        ))}
      </div>
      <div className="gutter" />
      {spread.chrome_left === 'full' && <Chrome side="left" issue={data.issue} spread={spread} index={index} />}
      {spread.chrome_right === 'full' && <Chrome side="right" issue={data.issue} spread={spread} index={index} />}
      {children}
    </div>
  );
}

// Bir spread'in frame'i (ölçeklenmemiş, tasarım biriminde). Saf: yalnız veriden
// çizer. Okuma görünümü ve editör aynı bileşeni kullanır; editör yalnız genel
// girişlerle ekleme yapar:
//   className   frame'e ek sınıf
//   blockProps  bloğa ek sınıf/stil
//   underlay    frame içinde, bloklardan önce ek katman
//   children    frame içinde, en sonda ek katman
import type { ReactNode, Ref } from 'react';
import { FRAME } from '../config.ts';
import { blocksOnSpread } from '../model.ts';
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

  return (
    <div
      ref={frameRef}
      className={className ? `frame ${className}` : 'frame'}
      style={{ width: `${FRAME.width}px`, height: `${FRAME.height}px` }}
      data-spread={spread.id}
    >
      {underlay}
      <div className="blocks">
        {blocksOnSpread(data.blocks, spread.id).map((b) => (
          <Block key={b.id} block={b} {...blockProps?.(b)} />
        ))}
      </div>
      <div className="gutter" />
      {spread.chrome_left === 'full' && <Chrome side="left" issue={data.issue} spread={spread} index={index} />}
      {spread.chrome_right === 'full' && <Chrome side="right" issue={data.issue} spread={spread} index={index} />}
      {children}
    </div>
  );
}

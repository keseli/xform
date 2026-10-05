// Tuval: aynı saf Spread bileşenini çizer; editöre özgü her şey (ızgara,
// rozet, seçim, tutamaç, kılavuz, odak) Spread'in içinde, en üstteki
// EditorLayer katmanında. Çizimden sonra akış yükseklikleri ölçülür, yığınlar
// dizilir, frame sığdırılır.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Spread } from '../../components/Spread.tsx';
import { fitFrame } from '../../render/fit.ts';
import { measureLayout } from '../../render/measure.ts';
import type { PlacedBlock } from '../../types.ts';
import { PAD } from '../controller.ts';
import type { Session } from '../session.ts';
import { computeWarnings } from '../warnings.ts';
import { EditorLayer, GridGuides, SlotLayer } from './EditorLayer.tsx';

export function Canvas({ session }: { session: Session }) {
  const { state, store, controller } = session;
  const containerRef = useRef<HTMLElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const { layer } = controller;

  const spread = state.data.spreads[state.spreadIndex];
  const warnings = computeWarnings(state.data);
  const primary = state.selectedId ? state.data.blocks.find((b) => b.id === state.selectedId) : undefined;
  const related = new Set(primary?.relates_to ?? []);
  const focal = controller.focalBlock();

  /** Editörün bloklara eklediği sınıf ve stil (CSS: styles/editor.css). */
  const blockProps = (b: PlacedBlock) => {
    const cls: string[] = [];
    if (related.has(b.id)) cls.push('is-related');
    if ((warnings.get(b.id) ?? []).some((w) => w.kind === 'overflow')) cls.push('is-overflow');
    if (focal?.id === b.id) cls.push('is-focal');
    let style: CSSProperties | undefined;
    if (layer.draggingId === b.id) {
      cls.push('is-dragging');
      if (layer.dragOffset) style = { transform: `translate(${layer.dragOffset.x}px, ${layer.dragOffset.y}px)` };
    }
    return { className: cls.length ? cls.join(' ') : undefined, style };
  };

  // Her çizimden sonra: ölç, diz, sığdır. Bir şey değiştiyse yeniden çiz.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const container = containerRef.current;
    controller.attach(frame, container);
    if (!frame || !container) return;
    const { changed } = measureLayout(frame, state.data);
    for (const img of frame.querySelectorAll<HTMLImageElement>('.blocks > .block--image img')) {
      controller.rememberNatural(img);
    }
    if (holderRef.current) fitFrame(holderRef.current, container, PAD);
    if (changed) store.emit('drag');
  });

  useEffect(() => {
    const fit = () => {
      if (holderRef.current && containerRef.current) fitFrame(holderRef.current, containerRef.current, PAD);
    };
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  const frameClass = state.showGrid ? 'frame--editor frame--guides' : 'frame--editor';

  return (
    <main
      id="canvas"
      ref={containerRef}
      onPointerDown={(e) => controller.onPointerDown(e.nativeEvent)}
      onDoubleClick={(e) => controller.onDoubleClick(e.nativeEvent)}
    >
      <div className="frame-holder" ref={holderRef}>
        <Spread
          data={state.data}
          spreadId={spread.id}
          className={frameClass}
          blockProps={blockProps}
          underlay={
            <>
              <SlotLayer session={session} />
              {state.showGrid ? <GridGuides /> : null}
            </>
          }
          frameRef={frameRef}
        >
          <EditorLayer session={session} warnings={warnings} />
        </Spread>
      </div>
    </main>
  );
}

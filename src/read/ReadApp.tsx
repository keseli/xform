// Okuma görünümü: ızgara, rozet, uyarı ve tutamaç yok.
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Spread } from '../components/Spread.tsx';
import { loadIssue } from '../data.ts';
import { checkLineHeights, loadFonts, onFontsChanged } from '../render/fonts.ts';
import { fitFrame } from '../render/fit.ts';
import { measureLayout } from '../render/measure.ts';
import type { Issue } from '../types.ts';

const params = new URLSearchParams(location.search);
const ISSUE = params.get('issue') ?? 'issue-001';

export function ReadApp({ stage }: { stage: HTMLElement }) {
  const [data, setData] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const frameRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const d = await loadIssue(ISSUE);
      const wanted = params.get('spread');
      setSpreadIndex(
        Math.max(
          0,
          d.spreads.findIndex((s) => s.id === wanted),
        ),
      );
      checkLineHeights();
      await loadFonts();
      setData(d);
    })().catch((err: Error) => {
      setError(err.message);
      console.error(err);
    });
  }, []);

  const fit = useCallback(() => {
    if (holderRef.current) fitFrame(holderRef.current, stage, 32);
  }, [stage]);

  /** Yükseklikleri ölç, yığınları bu yüksekliklerle diz. */
  const measure = useCallback(() => {
    if (!frameRef.current || !data) return;
    const { changed, heights } = measureLayout(frameRef.current, data);
    Object.assign(window, { __xform: { data, heights } });
    if (changed) rerender();
  }, [data]);

  // Her spread çiziminden sonra: satır içi em/sup gibi ek kesitler de yüklenmiş olsun.
  useLayoutEffect(() => {
    if (!data) return;
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      measure();
      fit();
      document.body.dataset.ready = '';
    });
    return () => {
      live = false;
    };
  }, [data, spreadIndex, measure, fit]);

  // Bir font sonradan gelirse (yavaş ağ) yükseklikler ve yığınlar yeniden.
  useEffect(() => (data ? onFontsChanged(measure) : undefined), [data, measure]);

  useEffect(() => {
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [fit]);

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && spreadIndex < data.spreads.length - 1) setSpreadIndex(spreadIndex + 1);
      else if (e.key === 'ArrowLeft' && spreadIndex > 0) setSpreadIndex(spreadIndex - 1);
      else if (e.key === 'e') {
        location.href = `editor.html?issue=${ISSUE}&spread=${data.spreads[spreadIndex].id}`;
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [data, spreadIndex]);

  if (error) return <>{`Yüklenemedi: ${error}`}</>;
  if (!data) return null;
  return (
    <div className="frame-holder" ref={holderRef}>
      <Spread data={data} spreadId={data.spreads[spreadIndex].id} frameRef={frameRef} />
    </div>
  );
}

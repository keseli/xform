// Editör: üst çubuk, tepsi, tuval, sağ panel. Oturum (durum, store, işlemler)
// src/editor/session.ts'te; bileşenler store'daki her değişiklikte yeniden çizer.
import { useEffect, useState } from 'react';
import { createSession, type Session } from '../session.ts';
import { useStore } from '../useStore.ts';
import { TopBar } from './TopBar.tsx';
import { Tray } from './Tray.tsx';
import { Canvas } from './Canvas.tsx';
import { Inspector } from './Inspector.tsx';

export function EditorApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createSession()
      .then(setSession)
      .catch((err: Error) => {
        setError(err.message);
        console.error(err);
      });
  }, []);

  if (error) {
    return (
      <>
        <header id="topbar" />
        <aside id="tray" />
        <main id="canvas">{`Yüklenemedi: ${error}`}</main>
        <aside id="inspector" />
      </>
    );
  }
  if (!session) {
    return (
      <>
        <header id="topbar" />
        <aside id="tray" />
        <main id="canvas" />
        <aside id="inspector" />
      </>
    );
  }
  return <EditorView session={session} />;
}

function EditorView({ session }: { session: Session }) {
  useStore(session.store);
  const { ghost } = session.controller.layer;

  useEffect(() => {
    document.body.dataset.ready = '';
  }, []);

  // Eski sürüm üst çubuğu ve paneli her değişiklikte baştan çizdiği için tıklanan
  // düğme ya da değiştirilen alan odağı kaybediyordu. Aynı davranış: Space/Enter
  // düğmeyi yeniden tetiklemesin, ok tuşları yine seçili bloğa gitsin.
  useEffect(() => {
    const release = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.('#topbar, #inspector')) return;
      if (e.type === 'click' ? t.closest('button') : t.matches('input, select')) {
        setTimeout(() => (t.closest('button') ?? t).blur());
      }
    };
    document.addEventListener('click', release);
    document.addEventListener('change', release);
    return () => {
      document.removeEventListener('click', release);
      document.removeEventListener('change', release);
    };
  }, []);

  return (
    <>
      <TopBar session={session} />
      <Tray session={session} />
      <Canvas session={session} />
      <Inspector session={session} />
      {ghost ? (
        <div
          className="place-ghost"
          hidden={ghost.hidden}
          style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}
        >
          {ghost.text}
        </div>
      ) : null}
    </>
  );
}

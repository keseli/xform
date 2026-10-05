import { shell, type BlockViewProps } from './shell.ts';

/** Kutu: palet adından dolgu, isteğe bağlı saydamlık; içerik yok. */
export function BoxBlock(props: BlockViewProps) {
  const b = props.block;
  const base = shell(props);
  return (
    <div
      {...base}
      style={{ ...base.style, background: `var(--${b.fill ?? 'accent-soft'})`, opacity: b.opacity ?? undefined }}
    />
  );
}

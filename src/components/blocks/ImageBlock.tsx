import { shell, type BlockViewProps } from './shell.ts';

/**
 * Kutu oranı görselden farklıysa focal_point'e göre kırpılır (object-position).
 * Künye görselin üstünde değil, bağlı caption'ın ya da notun sonunda (Spread).
 * İşleme (treatment) sınıfı shell'den: mono, duotone, multiply.
 */
export function ImageBlock(props: BlockViewProps) {
  const b = props.block;
  const fx = (b.focal_point?.x ?? 0.5) * 100;
  const fy = (b.focal_point?.y ?? 0.5) * 100;
  return (
    <div {...shell(props)}>
      <div className="image-frame">
        {b.source && (
          <img src={b.source} alt={b.alt ?? ''} draggable={false} style={{ objectPosition: `${fx}% ${fy}%` }} />
        )}
      </div>
    </div>
  );
}

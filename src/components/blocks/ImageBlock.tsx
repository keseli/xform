import { inlineHtml } from '../../inline.ts';
import { shell, type BlockViewProps } from './shell.ts';

/** Kutu oranı görselden farklıysa focal_point'e göre kırpılır (object-position). */
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
      {b.credit && <span className="image-credit" dangerouslySetInnerHTML={{ __html: inlineHtml(b.credit) }} />}
    </div>
  );
}

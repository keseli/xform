import { escapeHtml, inlineHtml } from '../../inline.ts';
import { shell, type BlockViewProps } from './shell.ts';

/** text: body | deck | caption. Caption'da label metnin üstünde. */
export function TextBlock(props: BlockViewProps) {
  const b = props.block;
  const label = b.variant === 'caption' && b.label ? `<span class="caption-label">${escapeHtml(b.label)}</span>` : '';
  return (
    <div {...shell(props)}>
      <p className="flow" dangerouslySetInnerHTML={{ __html: label + inlineHtml(b.content) }} />
    </div>
  );
}

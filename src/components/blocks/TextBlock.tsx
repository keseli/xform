import { escapeHtml, inlineHtml } from '../../inline.ts';
import { creditHtml } from './credit.ts';
import { shell, type BlockViewProps } from './shell.ts';

/** text: body | deck | caption. Caption'da label metnin üstünde, künye sonunda. */
export function TextBlock(props: BlockViewProps) {
  const b = props.block;
  const caption = b.variant === 'caption';
  const label = caption && b.label ? `<span class="caption-label">${escapeHtml(b.label)}</span>` : '';
  const credit = caption ? creditHtml(props.credits) : '';
  return (
    <div {...shell(props)}>
      <p className="flow" dangerouslySetInnerHTML={{ __html: label + inlineHtml(b.content) + credit }} />
    </div>
  );
}

import { inlineHtml } from '../../inline.ts';
import { shell, type BlockViewProps } from './shell.ts';

export function QuoteBlock(props: BlockViewProps) {
  return (
    <div {...shell(props)}>
      <blockquote className="flow" dangerouslySetInnerHTML={{ __html: inlineHtml(props.block.content) }} />
    </div>
  );
}

import { inlineHtml } from '../../inline.ts';
import { shell, type BlockViewProps } from './shell.ts';

/** heading: title | subhead | kicker */
export function HeadingBlock(props: BlockViewProps) {
  return (
    <div {...shell(props)}>
      <div className="flow" dangerouslySetInnerHTML={{ __html: inlineHtml(props.block.content) }} />
    </div>
  );
}

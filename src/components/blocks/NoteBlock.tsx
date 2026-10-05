import { escapeHtml, inlineHtml } from '../../inline.ts';
import { creditHtml } from './credit.ts';
import { shell, type BlockViewProps } from './shell.ts';

/** Dipnot ve yan notlar; label solda asılı, bağlı görselin künyesi sonda. */
export function NoteBlock(props: BlockViewProps) {
  const b = props.block;
  const label = b.label ? `<span class="note-label">${escapeHtml(b.label)}</span>` : '';
  return (
    <div {...shell(props)}>
      <div
        className="flow"
        dangerouslySetInnerHTML={{
          __html: `${label}<span class="note-body">${inlineHtml(b.content)}${creditHtml(props.credits)}</span>`,
        }}
      />
    </div>
  );
}

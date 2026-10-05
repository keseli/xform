import { shell, type BlockViewProps } from './shell.ts';

/** Çizgi bloğun üst kenarında, ızgara çizgisine oturur. */
export function DividerBlock(props: BlockViewProps) {
  return (
    <div {...shell(props)}>
      <div className="rule" />
    </div>
  );
}

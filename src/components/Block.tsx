import type { ComponentType } from 'react';
import type { BlockType } from '../types.ts';
import type { BlockViewProps } from './blocks/shell.ts';
import { TextBlock } from './blocks/TextBlock.tsx';
import { HeadingBlock } from './blocks/HeadingBlock.tsx';
import { ImageBlock } from './blocks/ImageBlock.tsx';
import { QuoteBlock } from './blocks/QuoteBlock.tsx';
import { NoteBlock } from './blocks/NoteBlock.tsx';
import { DividerBlock } from './blocks/DividerBlock.tsx';
import { BoxBlock } from './blocks/BoxBlock.tsx';

const BY_TYPE: Record<BlockType, ComponentType<BlockViewProps>> = {
  text: TextBlock,
  heading: HeadingBlock,
  image: ImageBlock,
  quote: QuoteBlock,
  note: NoteBlock,
  divider: DividerBlock,
  box: BoxBlock,
};

/** Tipine göre blok bileşeni. Yalnız veriden çizer. */
export function Block(props: BlockViewProps) {
  const View = BY_TYPE[props.block.type];
  return <View {...props} />;
}

export type { BlockViewProps };

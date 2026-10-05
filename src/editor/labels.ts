// Editör arayüzünde blok adları ve kısa önizlemeler.
import type { Block, IssueMeta } from '../types.ts';

const KIND: Record<string, string> = {
  'heading/title': 'Başlık',
  'heading/subhead': 'Ara başlık',
  'heading/kicker': 'Kicker',
  'text/body': 'Paragraf',
  'text/deck': 'Deck',
  'text/caption': 'Caption',
  image: 'Görsel',
  quote: 'Alıntı',
  'quote/pull': 'Büyük alıntı',
  box: 'Kutu',
  note: 'Not',
  divider: 'Çizgi',
};

export function kindLabel(b: Pick<Block, 'type' | 'variant'>): string {
  return KIND[`${b.type}/${b.variant}`] ?? KIND[b.type] ?? b.type;
}

export function snippet(b: Block, max = 90): string {
  const text =
    b.type === 'image' ? (b.alt ?? b.source ?? '') : b.type === 'divider' || b.type === 'box' ? '—' : (b.content ?? '');
  const plain = text.replace(/[*^]/g, '');
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

export function pageLabel(issue: IssueMeta, index: number): string {
  const left = issue.first_page + index * 2;
  const pad = (n: number) => String(n).padStart(3, '0');
  return `${pad(left)}–${pad(left + 1)}`;
}

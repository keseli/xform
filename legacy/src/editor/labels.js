// Editör arayüzünde blok adları ve kısa önizlemeler.

const KIND = {
  'heading/title': 'Başlık',
  'heading/subhead': 'Ara başlık',
  'heading/kicker': 'Kicker',
  'text/body': 'Paragraf',
  'text/deck': 'Deck',
  'text/caption': 'Caption',
  image: 'Görsel',
  quote: 'Alıntı',
  note: 'Not',
  divider: 'Çizgi',
};

export function kindLabel(b) {
  return KIND[`${b.type}/${b.variant}`] ?? KIND[b.type] ?? b.type;
}

export function snippet(b, max = 90) {
  const text =
    b.type === 'image' ? (b.alt ?? b.source ?? '') : b.type === 'divider' ? '—' : (b.content ?? '');
  const plain = text.replace(/[*^]/g, '');
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

export function pageLabel(issue, index) {
  const left = issue.first_page + index * 2;
  const pad = (n) => String(n).padStart(3, '0');
  return `${pad(left)}–${pad(left + 1)}`;
}

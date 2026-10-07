// Araç çıktısının JSON biçimi: kısa nesne ve diziler tek satırda, uzunlar
// satır satır. Modelin okuyacağı metin hem kısa hem taranabilir olsun.
const LINE = 180;

export function formatJson(value: unknown, indent = ''): string {
  const flat = JSON.stringify(value);
  if (flat === undefined) return 'null';
  if (value === null || typeof value !== 'object' || flat.length + indent.length <= LINE) return flat;
  const inner = `${indent} `;
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + formatJson(v, inner)).join(',\n')}\n${indent}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`).join(',\n')}\n${indent}}`;
}

// İçerikteki minimal satır içi işaretleme: *italik* ve ^üst simge^ (dipnot işaretleri).
// Geri kalan her şey düz metin olarak kaçırılır.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function inlineHtml(s: string | null | undefined): string {
  return escapeHtml(s ?? '')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
}

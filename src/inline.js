// İçerikteki minimal satır içi işaretleme: *italik* ve ^üst simge^ (dipnot işaretleri).
// Geri kalan her şey düz metin olarak kaçırılır.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function inlineHtml(s) {
  return escapeHtml(s ?? '')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\^([^^]+)\^/g, '<sup>$1</sup>');
}

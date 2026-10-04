// Veri modeli. Dosya biçimi: data/<issue>.json
//
// {
//   revision: number                                   // her yazmada +1 (scripts/serve.mjs, scripts/import.mjs)
//   issue:   { title, month, year, number, first_page }
//   spreads: [{ id, section, chrome_left, chrome_right }]   // dizideki sıra = spread sırası
//   blocks:  [Block]
// }

/**
 * @typedef {'text'|'heading'|'image'|'quote'|'note'|'divider'} BlockType
 *
 * @typedef {Object} Block
 * @property {string} id
 * @property {BlockType} type
 * @property {string|null} variant  heading: title|subhead|kicker, text: body|deck|caption, diğerleri: null
 * @property {string|null} content  Satır içi işaretleme: *italik*, ^üst simge^
 * @property {number} order         İçerikteki okuma sırası, konumdan bağımsız
 * @property {string[]} relates_to  Görsel/not: ait olduğu paragraflar. Caption: ait olduğu görsel.
 * @property {string|null} spread_id   Yerleştirilmemişse null (konum alanları da null)
 * @property {number|null} x        Hücre, spread'in sol kenarından
 * @property {number|null} y        Hücre, spread'in üst kenarından
 * @property {number|null} w
 * @property {number|null} h        Akış tiplerinde içerikten türetilir, saklanan değer önbellektir
 * @property {number|null} z
 * @property {'dark'|'light'} tone
 * @property {string|null} [label]  Örn. "01". Caption'da metnin üstünde, notta solda asılı.
 * @property {true} [removed_from_content]  İçe aktarma: paketten çıktı ama yerleşik olduğu için korundu.
 *
 * Görsellere özgü:
 * @property {{x:number, y:number}} [focal_point]  0–1 arası
 * @property {string|null} [source]
 * @property {string|null} [credit]
 * @property {string|null} [alt]
 *
 * @typedef {Object} Spread
 * @property {string} id
 * @property {string} section
 * @property {'full'|'none'} chrome_left
 * @property {'full'|'none'} chrome_right
 */

export const VARIANTS = {
  heading: ['title', 'subhead', 'kicker'],
  text: ['body', 'deck', 'caption'],
  image: [null],
  quote: [null],
  note: [null],
  divider: [null],
};

const POSITION_KEYS = ['spread_id', 'x', 'y', 'w', 'h', 'z'];

export function isPlaced(block) {
  return block.spread_id != null;
}

export function blocksOnSpread(blocks, spreadId) {
  return blocks.filter((b) => b.spread_id === spreadId).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

export function unplacedBlocks(blocks) {
  return blocks.filter((b) => !isPlaced(b)).sort((a, b) => a.order - b.order);
}

export function pageNumbers(issue, spreadIndex) {
  const left = issue.first_page + spreadIndex * 2;
  return { left, right: left + 1 };
}

/** Veri tutarlılığını kontrol eder; engellemez, sorun listesi döner. */
export function validate(data) {
  const problems = [];
  const ids = new Set();
  const spreadIds = new Set(data.spreads.map((s) => s.id));

  for (const s of data.spreads) {
    for (const key of ['chrome_left', 'chrome_right']) {
      if (!['full', 'none'].includes(s[key])) problems.push(`spread ${s.id}: ${key} geçersiz`);
    }
  }

  for (const b of data.blocks) {
    if (ids.has(b.id)) problems.push(`yinelenen id: ${b.id}`);
    ids.add(b.id);

    if (!(b.type in VARIANTS)) {
      problems.push(`${b.id}: bilinmeyen tip ${b.type}`);
      continue;
    }
    if (!VARIANTS[b.type].includes(b.variant ?? null)) {
      problems.push(`${b.id}: ${b.type} için geçersiz variant ${b.variant}`);
    }
    if (!['dark', 'light'].includes(b.tone)) problems.push(`${b.id}: tone geçersiz`);

    const set = POSITION_KEYS.filter((k) => b[k] != null);
    if (set.length && set.length !== POSITION_KEYS.length) {
      problems.push(`${b.id}: konum alanları kısmen dolu (${set.join(', ')})`);
    }
    if (b.spread_id != null && !spreadIds.has(b.spread_id)) {
      problems.push(`${b.id}: bilinmeyen spread ${b.spread_id}`);
    }
  }

  const byId = new Map(data.blocks.map((b) => [b.id, b]));
  for (const b of data.blocks) {
    for (const rel of b.relates_to ?? []) {
      if (!byId.has(rel)) problems.push(`${b.id}: relates_to bilinmeyen id ${rel}`);
    }
    if (b.type === 'text' && b.variant === 'caption') {
      const images = (b.relates_to ?? []).filter((id) => byId.get(id)?.type === 'image');
      if (!images.length) problems.push(`${b.id}: caption bir görsele bağlı değil`);
    }
  }

  return problems;
}

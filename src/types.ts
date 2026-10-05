// XFORM veri tipleri. Dosya biçimi: data/<issue>.json (bkz. src/model.ts).
// Konumlar hücre cinsinden; x spread'in sol kenarından sayılır.

export type BlockType = 'text' | 'heading' | 'image' | 'quote' | 'note' | 'divider';
export type HeadingVariant = 'title' | 'subhead' | 'kicker';
export type TextVariant = 'body' | 'deck' | 'caption';
export type Variant = HeadingVariant | TextVariant;
export type Tone = 'dark' | 'light';
export type ChromeMode = 'full' | 'none';
export type Direction = 'vertical' | 'horizontal';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 0–1 arası; CSS object-position yüzdesiyle aynı tanım. */
export interface FocalPoint {
  x: number;
  y: number;
}

export interface Block {
  id: string;
  type: BlockType;
  /** heading: title|subhead|kicker, text: body|deck|caption, diğerleri: null */
  variant: Variant | null;
  /** Satır içi işaretleme: *italik*, ^üst simge^ */
  content: string | null;
  /** İçerikteki okuma sırası, konumdan bağımsız */
  order: number;
  /** Görsel/not: ait olduğu paragraflar. Caption: ait olduğu görsel. */
  relates_to: string[];
  /** Yerleştirilmemişse null (konum alanları da null) */
  spread_id: string | null;
  x: number | null;
  y: number | null;
  w: number | null;
  /** Akış tiplerinde içerikten türetilir, saklanan değer önbellektir */
  h: number | null;
  z: number | null;
  tone: Tone;
  /** Örn. "01". Caption'da metnin üstünde, notta solda asılı. */
  label?: string | null;
  /** Auto layout yığını; x/y yığından türetilir, dosyada null */
  stack_id?: string;
  stack_index?: number;
  /** İçe aktarma: paketten çıktı ama yerleşik olduğu için korundu. */
  removed_from_content?: boolean;
  // Görsellere özgü
  focal_point?: FocalPoint;
  /** Görsel dosyasının yolu (assets/<issue>/<slug>/<file>); içe aktarma yazar. */
  source?: string | null;
  credit?: string | null;
  alt?: string | null;
  /** Görselin arşivdeki açıklama sayfası (künye; sayfada görünmez). */
  source_url?: string | null;
  /** Lisans, ör. "Public domain", "CC BY-SA 4.0" (künye; sayfada görünmez). */
  license?: string | null;
}

/** Yerleştirilmiş blok: konum alanları dolu (yığındakiler bellekte hesaplanmış). */
export type PlacedBlock = Block & { spread_id: string; x: number; y: number; w: number; h: number; z: number };

export interface Spread {
  id: string;
  section: string;
  chrome_left: ChromeMode;
  chrome_right: ChromeMode;
}

/** Auto layout yığını (src/stacks.ts). */
export interface Stack {
  id: string;
  spread_id: string;
  direction: Direction;
  x: number;
  y: number;
  gap: number;
  /**
   * Yer tutucu alan (metin sütunu). Varsa yığın boşalınca silinmez, editörde
   * bu alanla görünür; içine giren metin bloğu w genişliğini alır.
   */
  w?: number;
  h?: number;
}

/** Slotun kabul ettiği blok: tür ve isteğe bağlı variant (yoksa türün hepsi). */
export interface SlotAccepts {
  type: BlockType;
  variant?: Variant | null;
}

/**
 * Spread üzerinde boş kutu (src/templates.ts). Yalnız editörde görünür; uygun
 * blok bırakılınca blok konumu, genişliği, z ve tone'u (görselde yüksekliği
 * de) alır ve slot silinir.
 */
export interface Slot {
  id: string;
  spread_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  tone: Tone;
  accepts: SlotAccepts;
}

/** Spread iskeleti: data/templates/<ad>.json. Kimlikler spread kurulurken verilir. */
export interface Template {
  name: string;
  chrome_left: ChromeMode;
  chrome_right: ChromeMode;
  slots: Omit<Slot, 'id' | 'spread_id'>[];
  stacks: (Omit<Stack, 'id' | 'spread_id' | 'w' | 'h'> & { w: number; h: number })[];
}

export interface IssueMeta {
  title: string;
  month: number;
  year: number;
  number: string;
  first_page: number;
}

export interface Issue {
  /** Her yazmada +1 (scripts/api.mjs, scripts/import.mjs); editörde bellekte tutulmaz. */
  revision?: number;
  issue: IssueMeta;
  /** Dizideki sıra = spread sırası */
  spreads: Spread[];
  blocks: Block[];
  stacks?: Stack[];
  /** Şablondan gelen ya da kalan boş kutular (yalnız editörde görünür). */
  slots?: Slot[];
}

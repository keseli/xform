# XFORM

Kişisel dergi için spread renderer'ı (ve ileride elle yerleşim editörü).

```
npm run dev        # http://localhost:5173 — bağımlılık yok, Node 20+
npm test           # node:test, DOM'suz modüller (geometri, uyarılar, içe aktarma)
npm run import -- content/issue-001.json [--dry-run]   # içerik paketlerini sayıya aktar
```

- **Okuma görünümü** `index.html`: **← / →** spread'ler arası, **e** editöre geçer.
- **Editör** `editor.html`: değişiklikler `data/<issue>.json` dosyasına otomatik
  kaydedilir (dev sunucusundaki `PUT /api/data/<issue>` ucu). Dosya dışarıda
  değişirse (içe aktarma, başka sekme) editör birkaç saniye içinde yeniden yükler.
- `?issue=issue-001&spread=s-tablets`: dosya ve spread seçimi (iki görünümde de).

### Editör

| | |
| --- | --- |
| Tepsiden sürükle | Bloğu spread'e yerleştirir (varsayılan genişlik, görselde doğal oran) |
| Sürükle | Taşı; snap 2 hücre, **Alt** ile 1 hücre. Blok frame'e taşabilir ama her eksende en az 8 hücresi (`KEEP_IN_FRAME`) içeride kalır |
| Tutamaçlar | Metin/çizgi: yalnız genişlik. Görsel: 8 yön, oran kilidi **L** (Shift geçici tersine çevirir) |
| **← ↑ → ↓** | Seçili bloğu snap adımı kadar kaydır (**Alt** ile 1) |
| **]** / **[** | Öne getir / arkaya gönder |
| **Delete** | Bloğu tepsiye geri gönder |
| **Ctrl+Z** / **Ctrl+Shift+Z** | Geri al / yinele (Mac'te ⌘; Ctrl+Y de yineler). Sürükleme tek adımdır, geçmiş 100 adım |
| **G** | Izgara ve kılavuzlar |
| **Esc** | Seçimi bırak / sürüklemeyi iptal et |

Uyarılar engellemez, rozet, sekme ve listede gösterilir:
- daha büyük `order`'lı blok daha küçük `order`'lı bir bloktan önceki spread'de,
- `relates_to` bloklarının hiçbiri aynı spread'de değil (görsel, not, caption),
- blok frame dışına taşıyor.

Görsel seçilince `relates_to` paragrafları tuvalde ve tepside vurgulanır.

## İçerik girişi

İçerik hattı makale başına bir paket üretir; içe aktarma blokları tepsiye düşürür.

```
content/
  issue-001.json                 { "issue": "issue-001", "meta": {…}, "articles": ["empire-of-paper", …] }
  empire-of-paper/
    article.json                 { "slug", "section", "blocks": [ { "key", "type", "variant", … } ] }
    tablet.svg                   görseller paketle aynı klasörde
```

- **Blok:** `key` (makale içinde benzersiz: küçük harf, rakam, `-`), `type`, `variant`,
  `content`, `label`, `relates_to` (aynı makalenin key'leri ya da `diger-slug/key`).
  Görselde `file`, `alt`, `credit`, `focal_point`; `file` yoksa düz kutu görünür.
- **id** = `slug/key`. **order** yazılmaz: manifest'teki makale sırası ve makale içindeki
  sıradan her aktarmada baştan hesaplanır.
- Görseller `assets/<issue>/<slug>/` altına kopyalanır.
- Tekrar aktarmada içerik alanları güncellenir; yerleşim, `tone` ve mevcut görsellerin
  `focal_point`'i korunur. Paketten çıkan blok tepsideyse silinir, yerleşikse korunur ve
  editörde "içerikte yok" uyarısı alır.
- Hatalı paket (çözülemeyen `relates_to`, yinelenen key, eksik dosya…) hiçbir şey yazmaz.

`data/<issue>.json` içindeki `revision` her yazmada artar. Sunucu eski revizyondan gelen
kaydı reddeder (409); editör o durumda güncel dosyayı yükler ve bildirir.

## Yapı

| Dosya | İçerik |
| --- | --- |
| `src/config.js` | Frame ölçüsü ve hücre boyu (tek kaynak), kenar kılavuzları, caption ölçüleri |
| `src/model.js` | Blok/spread şeması, doğrulama, yardımcılar |
| `src/render/` | Spread, chrome ve blok çizimi; akış tiplerinde yükseklik ölçümü |
| `src/editor/` | Editör: tuval, tepsi, inspector, durum; `geometry.js` ve `warnings.js` DOM'suz |
| `styles/main.css` | Renkler ve tipografi; `--lh-*` satır yükseklikleri hücrenin katı olmalı |
| `src/content/merge.js` | İçe aktarma kuralları (DOM'suz, dosya sistemsiz) |
| `scripts/import.mjs` | İçe aktarma komutu |
| `content/` | İçerik paketleri (hattın çıktısı); örnek sayının kaynağı |
| `data/issue-001.json` | Sayı: bloklar ve yerleşim |

## Kurallar

- Hücre 4 birim, ızgara 384×256. Konumlar hücre cinsinden; `x` spread'in sol
  kenarından sayılır (0–383). Editör snap adımı 2 hücre, değiştirici tuşla 1 (`SNAP`).
- Tüm `--lh-*` satır yükseklikleri 4'ün katı; gövde 14.5/20.
- `text`, `heading`, `quote`, `note` yüksekliği içerikten ölçülür ve bir üst hücreye
  yuvarlanır; saklanan `h` önbellektir.
- Caption bağımsız bir bloktur (`text` / `caption`): genişliği blokta tutulur, `label`
  metnin üstünde görünür, `relates_to` ile görsele bağlanır. Görselde caption alanı yok.
- Satır içi işaretleme: `*italik*`, `^1^` (üst simge).
- Okuma görünümünde frame dışına taşan kısım kesilir.

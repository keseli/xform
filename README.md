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
| Çift tık / **F** | Seçili görselde odak modu: kutu içinde sürüklemek görseli kaydırır (`focal_point`), kırpılan kısım soluk görünür. **Esc** çıkar |
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

### Hat çıktısından pakete: örnek

Hattın çıktısı ne olursa olsun dönüşüm aynı soruları yanıtlar. Örnek olarak Markdown
çıktısı ve karşılığı:

```markdown
## The Materiality of Administration

Paper changed everything. Unlike stone or clay, it was *cheap*, light and reproducible.[^1]

![Clay tablet from Ur](tablet.jpg "Clay tablets from Ur (c. 2100 BCE).")

> Empires are not held together by force alone.

[^1]: Van De Mieroop, M. (2015). *A History of the Ancient Near East.* Wiley.
```

```json
{
  "slug": "materiality",
  "section": "The Empire of Paper",
  "blocks": [
    { "key": "sub-1", "type": "heading", "variant": "subhead", "content": "The Materiality of Administration" },
    { "key": "p1", "type": "text", "variant": "body",
      "content": "Paper changed everything. Unlike stone or clay, it was *cheap*, light and reproducible.^1^" },
    { "key": "img-tablet", "type": "image", "file": "tablet.jpg", "alt": "Clay tablet from Ur",
      "relates_to": ["p1"] },
    { "key": "cap-tablet", "type": "text", "variant": "caption", "label": "01",
      "content": "Clay tablets from Ur (c. 2100 BCE).", "relates_to": ["img-tablet"] },
    { "key": "quote-1", "type": "quote", "content": "“Empires are not held together by force alone.”" },
    { "key": "fn1", "type": "note", "label": "1",
      "content": "Van De Mieroop, M. (2015). *A History of the Ancient Near East.* Wiley.", "relates_to": ["p1"] }
  ]
}
```

Dönüştürücünün yapması gerekenler:

| Çıktıda | Pakette |
| --- | --- |
| Başlık seviyeleri (`#`, `##`, üst etiket) | `heading` / `title`, `subhead`, `kicker` |
| Her paragraf | ayrı `text` / `body`; deck için `text` / `deck` |
| `*italik*`, `<em>` | `*italik*`; başka satır içi biçim yok (kalın, bağlantı düşer) |
| Dipnot işareti `[^1]` | metinde `^1^`; dipnotun kendisi `note`, `label: "1"`, `relates_to` işaretin paragrafı |
| Görsel | `image` + dosya paket klasörüne; altyazı ayrı `text` / `caption`, `relates_to` görselin key'i |
| Alıntı `>` | `quote` (tırnak işaretleri metnin parçası) |
| Yatay çizgi `---` | `divider` |
| Görselin hangi paragraflara ait olduğu | `relates_to` — konumdan tahmin edilmez, hat açıkça söylemeli |

Key'ler okunur ve kararlı olmalı (`p1`, `img-tablet`): içerik güncellenip tekrar
aktarıldığında aynı key aynı bloğa eşleşir ve yerleşimi korunur. Paragraf eklendiğinde
sonrakileri yeniden numaralamak (`p3` → `p4`) yerleşimi yanlış bloğa taşır; yeni
paragrafa yeni bir key ver (`p2b` ya da içerikten türeyen bir kısaltma).

`data/<issue>.json` içindeki `revision` her yazmada artar. Sunucu eski revizyondan gelen
kaydı reddeder (409); editör o durumda güncel dosyayı yükler ve bildirir.

## Yapı

| Dosya | İçerik |
| --- | --- |
| `src/config.js` | Frame ölçüsü ve hücre boyu (tek kaynak), kenar kılavuzları, caption ölçüleri |
| `src/model.js` | Blok/spread şeması, doğrulama, yardımcılar |
| `src/render/` | Spread, chrome ve blok çizimi; akış tiplerinde yükseklik ölçümü |
| `src/editor/` | Editör: tuval, tepsi, inspector, durum; `geometry.js`, `focal.js` ve `warnings.js` DOM'suz |
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

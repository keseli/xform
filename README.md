# XFORM

Kişisel dergi için spread renderer'ı (ve ileride elle yerleşim editörü).

```
npm run dev        # http://localhost:5173 — bağımlılık yok, Node 20+
```

- `?guides` veya **g** tuşu: hücre ızgarası, kenar boşluğu kılavuzları, blok kutuları
- **← / →**: spread'ler arası geçiş
- `?issue=issue-001&spread=s-tablets`: dosya ve spread seçimi

## Yapı

| Dosya | İçerik |
| --- | --- |
| `src/config.js` | Frame ölçüsü ve hücre boyu (tek kaynak), kenar kılavuzları, caption ölçüleri |
| `src/model.js` | Blok/spread şeması, doğrulama, yardımcılar |
| `src/render/` | Spread, chrome ve blok çizimi; akış tiplerinde yükseklik ölçümü |
| `styles/main.css` | Renkler ve tipografi; `--lh-*` satır yükseklikleri hücrenin katı olmalı |
| `data/issue-001.json` | Örnek sayı |

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

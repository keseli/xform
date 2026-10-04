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

- Konumlar hücre cinsinden; `x` spread'in sol kenarından sayılır (0–191).
- `text`, `heading`, `quote`, `note` yüksekliği içerikten ölçülür ve bir üst hücreye
  yuvarlanır; saklanan `h` önbellektir.
- Görselde `x, y, w, h` görselin kutusudur; caption kutunun dışında (alt/sağ) durur.
- Satır içi işaretleme: `*italik*`, `^1^` (üst simge).
- Okuma görünümünde frame dışına taşan kısım kesilir.

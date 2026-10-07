// Görselin piksel boyutu, dosya başlığından (JPEG, PNG, SVG). Tepsi listesi
// tarayıcı açmadan oran verebilsin diye; okunamazsa null.
import { readFileSync } from 'node:fs';

export interface ImageSize {
  width: number;
  height: number;
}

export function imageSize(file: string): ImageSize | null {
  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch {
    return null;
  }
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
  if (file.endsWith('.svg')) return svgSize(buf.toString('utf8'));
  return null;
}

function jpegSize(buf: Buffer): ImageSize | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    // SOF0–SOF15 (DHT C4, JPG C8, DAC CC hariç): yükseklik, genişlik.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function svgSize(text: string): ImageSize | null {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const attr = (n: string) => new RegExp(`\\s${n}="([\\d.]+)(px)?"`).exec(tag)?.[1];
  const w = Number(attr('width'));
  const h = Number(attr('height'));
  if (w > 0 && h > 0) return { width: w, height: h };
  const vb = /viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/.exec(tag);
  return vb ? { width: Number(vb[1]), height: Number(vb[2]) } : null;
}

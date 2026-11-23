// Renders the app icon (three category arcs around a souls-cyan diamond) to PNG without dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / 2) / size, (y + (sy + 0.5) / 2) / size);
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0; raw[o + 3] = Math.round((a / 4) * 255);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const BG = [11, 12, 14], WEAPON = [220, 143, 60], SPIRIT = [157, 126, 227], VITALITY = [124, 174, 76], ACCENT = [76, 200, 212];
function logo(maskable) {
  const pad = maskable ? 0.18 : 0.06;
  return (u, v) => {
    // rounded square background (full bleed for maskable)
    const inBg = maskable || (() => { const r = 0.2, x = Math.abs(u - 0.5), y = Math.abs(v - 0.5), m = 0.5 - r; if (x <= m || y <= m) return x <= 0.5 && y <= 0.5; const dx = x - m, dy = y - m; return dx * dx + dy * dy <= r * r; })();
    if (!inBg) return [0, 0, 0, 0];
    const s = 1 - 2 * pad, cx = (u - 0.5) / s, cy = (v - 0.5) / s;
    const d = Math.hypot(cx, cy);
    if (d > 0.3 && d < 0.44) {
      const ang = (Math.atan2(cy, cx) * 180 / Math.PI + 360 + 90) % 360;
      const gap = 10;
      const seg = ang < 120 ? 0 : ang < 240 ? 1 : 2;
      const local = ang - seg * 120;
      if (local > gap / 2 && local < 120 - gap / 2) return [...[WEAPON, SPIRIT, VITALITY][seg], 1];
    }
    if (Math.abs(cx) + Math.abs(cy) < 0.17) return [...ACCENT, 1];
    return [...BG, 1];
  };
}
const out = process.argv[2];
for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true], ['favicon-32.png', 32, false]]) {
  writeFileSync(`${out}/${name}`, png(size, logo(mask)));
}
console.log('icons written');

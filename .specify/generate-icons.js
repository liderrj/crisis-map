// Generate minimal PWA icons (red square 192x192 and 512x512) without any image library.
// Pure-Node, no dependencies. Writes PNG files to apps/web/public/icons/.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}

function makePng(size) {
  // RGBA: solid #d32f2f with a white "CM" would need raster font. Use a simple
  // 2-color radial-ish band so it visually identifies CrisisMap.
  const r = 0xd3, g = 0x2f, b = 0x2f; // red
  const w = 0xff, wh = 0xff; // white
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Centered circle (radius = 0.42 * size), red outside, white inside
      const cx = size / 2, cy = size / 2;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inside = dist < size * 0.42;
      // Simple "CM" cross: a vertical bar in the center + a horizontal bar
      const inV = Math.abs(dx) < size * 0.05 && Math.abs(dy) < size * 0.28;
      const inH = Math.abs(dy) < size * 0.05 && Math.abs(dx) < size * 0.28;
      const pixel = (inside && !(inV || inH)) ? [r, g, b, 0xff] : [w, wh, wh, 0xff];
      const off = 1 + x * 4;
      row[off] = pixel[0]; row[off + 1] = pixel[1]; row[off + 2] = pixel[2]; row[off + 3] = pixel[3];
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);

  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'apps', 'web', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, makePng(size));
  console.log('wrote', file, fs.statSync(file).size, 'bytes');
}
#!/usr/bin/env node
// Generates the CrisisMap PWA icons (192 and 512) as PNGs using only
// Node.js built-ins. The icon is a red square with a stylized white
// "map pin with a small dot inside" — a single readable mark that
// works at any size and across all platforms (Android adaptive,
// iOS, desktop).
//
// Usage:
//   node apps/web/scripts/generate-icons.js

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZES = [192, 512];
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

// Colors (RGBA bytes).
const BG = [183, 28, 28, 255];        // deep crisis red #b71c1c
const FG = [255, 255, 255, 255];      // pin body
const DOT = [183, 28, 28, 255];       // inner dot matches background
const PAD = [0, 0, 0, 0];             // transparent (corners get cut by OS mask)

function paint(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const radius = size * 0.30;        // pin head radius
  const headCy = size * 0.40;        // center of the pin head
  const tipY = size * 0.82;          // point at the bottom
  const dotRadius = size * 0.10;
  const cornerCut = size * 0.18;     // rounded corner radius

  // Triangle vertices: base meets the lower part of the head circle,
  // apex is the pin point.
  const baseY = headCy + radius * 0.55;
  const baseHalfW = radius * 0.92;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rgba = PAD;

      // Rounded square background (so OS masks don't leave spikes).
      const insideRounded = (() => {
        if (x >= cornerCut && x < size - cornerCut) return true;
        if (y >= cornerCut && y < size - cornerCut) return true;
        const cxs = x < size / 2 ? cornerCut : size - 1 - cornerCut;
        const cys = y < size / 2 ? cornerCut : size - 1 - cornerCut;
        const dx = x - cxs;
        const dy = y - cys;
        return dx * dx + dy * dy <= cornerCut * cornerCut;
      })();

      if (insideRounded) rgba = BG;

      const dxh = x - cx;
      const dyh = y - headCy;
      const headDist = Math.sqrt(dxh * dxh + dyh * dyh);

      // Inside the head circle?
      if (headDist <= radius) rgba = FG;

      // Inside the pin tip triangle?
      if (y >= baseY && y <= tipY) {
        const t = (tipY - y) / (tipY - baseY); // 1 at top, 0 at apex
        const halfW = baseHalfW * t;
        if (Math.abs(x - cx) <= halfW) rgba = FG;
      }

      // Inner dot in the pin head.
      if (headDist <= dotRadius) rgba = DOT;

      const idx = (y * size + x) * 4;
      buf[idx] = rgba[0];
      buf[idx + 1] = rgba[1];
      buf[idx + 2] = rgba[2];
      buf[idx + 3] = rgba[3];
    }
  }
  return buf;
}

// --- Minimal PNG encoder (RGBA, 8-bit, no interlace) ---

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Prefix each scanline with a filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- Main ---

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const rgba = paint(size);
  const png = encodePng(size, size, rgba);
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}

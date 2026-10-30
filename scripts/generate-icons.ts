import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Helper to create a valid uncompressed PNG file with pure Node.js
function createPng(width: number, height: number, bgColor: [number, number, number], fgColor: [number, number, number]): Buffer {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth: 8
  ihdrData[9] = 2; // color type: 2 (Truecolor RGB)
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw pixel data: for each row, 1 filter byte (0 = None) + width * 3 bytes (RGB)
  const rowStride = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowStride);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.44;
  const innerRadius = Math.min(width, height) * 0.35;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowStride;
    rawData[rowOffset] = 0; // filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded container or circular brand icon
      let r = bgColor[0];
      let g = bgColor[1];
      let b = bgColor[2];

      // Draw modern emblem in center
      // Blue rounded card background
      const cornerRadius = width * 0.22;
      const inBoxX = Math.abs(dx) <= (width * 0.5 - cornerRadius) || Math.abs(dy) <= (height * 0.5 - cornerRadius) ||
        Math.hypot(Math.abs(dx) - (width * 0.5 - cornerRadius), Math.abs(dy) - (height * 0.5 - cornerRadius)) <= cornerRadius;

      if (inBoxX && Math.abs(dx) < width * 0.45 && Math.abs(dy) < height * 0.45) {
        // Deep Royal Blue to Emerald gradient
        const t = (x + y) / (width + height);
        r = Math.round(30 * (1 - t) + 16 * t);
        g = Math.round(58 * (1 - t) + 185 * t);
        b = Math.round(138 * (1 - t) + 129 * t);

        // Center stylized ledger / calculator / scale marks
        const isCenterMark =
          (Math.abs(dx) < width * 0.22 && Math.abs(dy) < height * 0.22 && (Math.abs(dx) < width * 0.05 || Math.abs(dy) < height * 0.05)) ||
          (Math.abs(dx) < width * 0.25 && Math.abs(dy - height * 0.1) < height * 0.04) ||
          (Math.abs(dx) < width * 0.25 && Math.abs(dy + height * 0.1) < height * 0.04);

        if (isCenterMark) {
          r = fgColor[0];
          g = fgColor[1];
          b = fgColor[2];
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Standard CRC32 table
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate icons
const icon192 = createPng(192, 192, [248, 250, 252], [255, 255, 255]);
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192);

const icon512 = createPng(512, 512, [248, 250, 252], [255, 255, 255]);
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512);

const iconMaskable = createPng(512, 512, [30, 58, 138], [255, 255, 255]);
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), iconMaskable);

const appleIcon = createPng(180, 180, [248, 250, 252], [255, 255, 255]);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);

// Also create SVG version for vector scalability
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#grad)" />
  <g fill="#ffffff" transform="translate(106, 106) scale(0.58)">
    <path d="M70 120 C70 90 90 70 120 70 L400 70 C430 70 450 90 450 120 L450 400 C450 430 430 450 400 450 L120 450 C90 450 70 430 70 400 Z" opacity="0.15" />
    <path d="M110 140 H410 V400 H110 Z" fill="none" stroke="#ffffff" stroke-width="28" stroke-linejoin="round" />
    <path d="M170 200 H350 M170 260 H350 M170 320 H270" stroke="#ffffff" stroke-width="24" stroke-linecap="round" />
    <circle cx="340" cy="320" r="24" fill="#34d399" />
  </g>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icon192);

console.log('✅ PWA Icons successfully generated in /public');

// Draws the toolbar icon (an indigo tile with three text lines, the middle one blurred) and
// writes PNGs to static/icons. Run once with `node scripts/icons.mjs`. Output is committed.
import { mkdir, writeFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function roundedRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function draw(size) {
  const ss = 4;
  const out = Buffer.alloc(size * size * 4);
  const bg = [79, 70, 229];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (!roundedRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) continue;
          let c = bg;
          const bar = (y0, x1) => y >= y0 && y <= y0 + 0.11 && x >= 0.2 && x <= x1;
          if (bar(0.24, 0.8) || bar(0.65, 0.62)) c = [255, 255, 255];
          else if (y >= 0.41 && y <= 0.6 && x >= 0.14 && x <= 0.86) {
            const d = Math.min(Math.abs(y - 0.505) / 0.095, 1);
            const m = 0.55 * (1 - d * d);
            c = [bg[0] + (255 - bg[0]) * m, bg[1] + (255 - bg[1]) * m, bg[2] + (255 - bg[2]) * m];
          }
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      const cov = a / 255;
      out[i] = cov ? Math.round(r / cov) : 0;
      out[i + 1] = cov ? Math.round(g / cov) : 0;
      out[i + 2] = cov ? Math.round(b / cov) : 0;
      out[i + 3] = Math.round(a / n);
    }
  }
  return png(size, out);
}

await mkdir("static/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(`static/icons/icon-${size}.png`, draw(size));
}
console.log("wrote static/icons/icon-{16,32,48,128}.png");

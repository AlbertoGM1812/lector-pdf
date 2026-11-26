// Copia los "cmaps" de PDF.js a public/ y crea los iconos de la app.
// Se ejecuta solo antes de `npm run dev` y `npm run build`.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const destino = 'public/cmaps';
if (!existsSync(destino)) {
  cpSync('node_modules/pdfjs-dist/cmaps', destino, { recursive: true });
}

mkdirSync('public', { recursive: true });
for (const [nombre, lado] of [['icono-192.png', 192], ['icono-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync('public/' + nombre, icono(lado));
}

// Dibuja un libro abierto sencillo y lo guarda como PNG (sin librerías externas).
function icono(n) {
  const fondo = [138, 90, 43];
  const papel = [247, 243, 234];
  const linea = [200, 186, 160];
  const px = Buffer.alloc(n * n * 3);
  const pon = (x, y, c) => px.set(c, (y * n + x) * 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      let c = fondo;
      const centro = Math.abs(u - 0.5);
      // dos páginas con una leve curva arriba
      const arriba = 0.27 + 0.05 * Math.sin((centro / 0.32) * Math.PI / 2);
      if (centro <= 0.32 && centro >= 0.012 && v >= arriba && v <= 0.74 + 0.03 * (centro / 0.32)) {
        c = papel;
        const enLinea = ((v - 0.36) * n) % Math.max(4, Math.round(n * 0.055));
        if (v > 0.36 && v < 0.68 && centro > 0.05 && centro < 0.27 && enLinea >= 0 && enLinea < Math.max(1.5, n * 0.012)) c = linea;
      }
      pon(x, y, c);
    }
  }
  const filas = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) {
    filas[y * (n * 3 + 1)] = 0;
    px.copy(filas, y * (n * 3 + 1) + 1, y * n * 3, (y + 1) * n * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(filas)),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

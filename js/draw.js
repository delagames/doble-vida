// Primitivas de interfaz: solo colores de la paleta, contorno de 1 px, sombras planas.
import { C } from './assets.js';
import { text, wrap, lineHeight } from './text.js';

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function outline(ctx, x, y, w, h, color) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
}

export function panel(ctx, x, y, w, h, { fill = C.noche, edge = C.morado } = {}) {
  rect(ctx, x, y, w, h, fill);
  outline(ctx, x, y, w, h, C.carbon);
  outline(ctx, x + 1, y + 1, w - 2, h - 2, edge);
}

// Tramas ordenadas para oscurecer sin transparencias (un alfa crearía colores nuevos).
const patterns = new Map();
const TILES = {
  1: ['1000', '0000', '0010', '0000'],
  2: ['1010', '0101', '1010', '0101'],
  3: ['1011', '1111', '1110', '1111'],
};

/** ¿Va pintado el píxel (x, y) en la trama de ese nivel? Es lo mismo que hace dither(). */
export function enTrama(level, x, y) { return level >= 4 || TILES[level]?.[y & 3][x & 3] === '1'; }

export function dither(ctx, x, y, w, h, color, level = 2) {
  if (level <= 0) return;
  if (level >= 4) { rect(ctx, x, y, w, h, color); return; }
  let porColor = patterns.get(color);
  if (!porColor) patterns.set(color, porColor = []);
  let p = porColor[level];
  if (!p) {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const t = c.getContext('2d');
    t.fillStyle = color;
    TILES[level].forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') t.fillRect(i, j, 1, 1); }));
    p = ctx.createPattern(c, 'repeat');
    porColor[level] = p;
  }
  ctx.fillStyle = p;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** La caja de abajo, vacía: sin ella se vería la banda del fondo. */
export function cajaVacia(ctx) { panel(ctx, 2, 380, 266, 98); }

export function button(ctx, r, label, { font = 'bold', fill = C.noche_clara, color = C.marfil, edge = C.morado, active = false } = {}) {
  panel(ctx, r.x, r.y, r.w, r.h, { fill: active ? C.morado : fill, edge: active ? C.rosa_neon : edge });
  const lines = wrap(label, font, r.w - 10);
  const lh = lineHeight(font);
  const y0 = r.y + Math.floor((r.h - lines.length * lh) / 2);
  lines.forEach((l, i) => text(ctx, l, r.x + Math.floor(r.w / 2), y0 + i * lh, { font, color, align: 'center' }));
}

export function bar(ctx, x, y, w, h, frac, color, back = C.carbon) {
  rect(ctx, x, y, w, h, back);
  outline(ctx, x, y, w, h, C.carbon);
  rect(ctx, x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, frac))), h - 2, color);
}

export function heart(ctx, x, y, color, escala = 1) {
  const rows = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
  ctx.fillStyle = color;
  rows.forEach((row, j) => [...row].forEach((b, i) => { if (b === 'x') ctx.fillRect(x + i * escala, y + j * escala, escala, escala); }));
}

// Cifras de 3×5 para números pequeños: a 8 px el 0, 6, 8 y 9 de las fuentes se confunden.
const CIFRAS = {
  0: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'], 1: ['.x.', 'xx.', '.x.', '.x.', 'xxx'],
  2: ['xxx', '..x', 'xxx', 'x..', 'xxx'], 3: ['xxx', '..x', '.xx', '..x', 'xxx'],
  4: ['x.x', 'x.x', 'xxx', '..x', '..x'], 5: ['xxx', 'x..', 'xxx', '..x', 'xxx'],
  6: ['xxx', 'x..', 'xxx', 'x.x', 'xxx'], 7: ['xxx', '..x', '.x.', '.x.', '.x.'],
  8: ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'], 9: ['xxx', 'x.x', 'xxx', '..x', 'xxx'],
  ':': ['.', 'x', '.', 'x', '.'], '.': ['.', '.', '.', '.', 'x'], '·': ['.', '.', 'x', '.', '.'],
  '-': ['...', '...', 'xxx', '...', '...'], '+': ['...', '.x.', 'xxx', '.x.', '...'],
  '=': ['...', 'xxx', '...', 'xxx', '...'],
  '/': ['..x', '..x', '.x.', 'x..', 'x..'], '%': ['x.x', '..x', '.x.', 'x..', 'x.x'], ' ': ['.', '.', '.', '.', '.'],
};

const anchoCifra = (ch) => (CIFRAS[ch]?.[0].length ?? 0) + 1;

/** Ancho en píxeles de lo que pintaría `cifras`. */
export function anchoCifras(str, escala = 1) {
  const w = [...String(str)].reduce((s, ch) => s + anchoCifra(ch), 0);
  return Math.max(0, w - 1) * escala;
}

/** Números pequeños en cifras de 3×5 con escala entera. y es el borde de arriba. */
export function cifras(ctx, str, x, y, { color = C.marfil, align = 'left', escala = 1 } = {}) {
  str = String(str);
  if (align !== 'left') x -= align === 'center' ? anchoCifras(str, escala) >> 1 : anchoCifras(str, escala);
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = color;
  for (const ch of str) {
    (CIFRAS[ch] ?? []).forEach((fila, j) => [...fila].forEach((b, i) => {
      if (b === 'x') ctx.fillRect(x + i * escala, y + j * escala, escala, escala);
    }));
    x += anchoCifra(ch) * escala;
  }
}

/** Línea de Bresenham: sin suavizado, a diferencia de stroke(). dash: trazos de 2^dash px. */
export function pixelLine(ctx, x0, y0, x1, y1, color, grosor = 1, dash = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  ctx.fillStyle = color;
  const off = grosor >> 1;
  for (;;) {
    if (!dash || (n >> dash) % 2 === 0) ctx.fillRect(x0 - off, y0 - off, grosor, grosor);
    n++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Polígono relleno por filas de píxeles enteros: fill() metería colores de borde. */
export function pixelPoly(ctx, pts, color, edge = null) {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  ctx.fillStyle = color;
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.round(xs[i]);
      ctx.fillRect(a, y, Math.round(xs[i + 1]) - a, 1);
    }
  }
  if (edge) pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; pixelLine(ctx, p[0], p[1], q[0], q[1], edge); });
}

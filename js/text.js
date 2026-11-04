// Texto pixel sin suavizado: canvas no deja apagar el antialias de fillText, así que cada glifo
// se rasteriza una vez, se umbraliza su alfa y se guarda teñido en un único atlas. Un lienzo por
// glifo y color serían miles de lienzos: con el atlas la memoria tiene tope, y si se llena se
// vacía y se rehace lo que haga falta.
import { rgbDe } from './assets.js';

const FONTS = {
  dialog: { css: '16px Pixelify', line: 15, base: 12 },
  bold: { css: 'bold 16px Pixelify', line: 15, base: 12 },
  label: { css: '8px Silkscreen', line: 9, base: 7 },
  huge: { css: 'bold 32px Pixelify', line: 30, base: 25 },
};

const CELL = 48, ORIGIN_X = 4, ORIGIN_Y = 36;
const ATLAS_W = 1024, ATLAS_H = 512;
const scratch = document.createElement('canvas');
scratch.width = scratch.height = CELL;
const sx = scratch.getContext('2d', { willReadFrequently: true });
const atlas = document.createElement('canvas');
atlas.width = ATLAS_W; atlas.height = ATLAS_H;
const ax = atlas.getContext('2d', { willReadFrequently: true });
let glyphs = new Map();       // fuente -> color -> carácter -> { x, y, w, h, dx, dy, adv }
const avances = new Map();    // fuente -> carácter -> avance: medir no necesita pintar
let estante = { x: 0, y: 0, h: 0 };
export const atlasTexto = { glifos: 0, vaciados: 0 };   // lo lee DV.medida

function vaciarAtlas() {
  ax.clearRect(0, 0, ATLAS_W, ATLAS_H);
  glyphs = new Map();
  estante = { x: 0, y: 0, h: 0 };
  atlasTexto.glifos = 0;
  atlasTexto.vaciados++;
}

/** Sitio libre para w×h, por estantes. */
function hueco(w, h) {
  if (estante.x + w > ATLAS_W) estante = { x: 0, y: estante.y + estante.h, h: 0 };
  if (estante.y + h > ATLAS_H) vaciarAtlas();
  const q = { x: estante.x, y: estante.y };
  estante.x += w + 1;
  estante.h = Math.max(estante.h, h + 1);
  return q;
}

/**
 * En Pixelify Bold la C se cierra y parece una O: se le abre la boca a mano. La G parece
 * una Q por lo mismo: con `arriba`, solo se abre lo que queda por encima de su barra.
 */
function abreC(d, labio, ancho, arriba = false) {
  const on = (x, y) => d[(y * CELL + x) * 4 + 3] > 0;
  let x1 = 0, y0 = CELL, y1 = 0;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    if (!on(x, y)) continue;
    x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const hasta = arriba ? ((y0 + y1) >> 1) - 1 : y1 - labio;
  for (let y = y0 + labio; y <= hasta; y++) for (let x = x1 - ancho; x <= x1; x++) d[(y * CELL + x) * 4 + 3] = 0;
}

function avance(ch, font) {
  let tabla = avances.get(font);
  if (!tabla) avances.set(font, tabla = new Map());
  let adv = tabla.get(ch);
  if (adv === undefined) {
    sx.font = FONTS[font].css;
    adv = Math.round(sx.measureText(ch).width);
    tabla.set(ch, adv);
  }
  return adv;
}

function pintaGlifo(ch, font, color) {
  sx.clearRect(0, 0, CELL, CELL);
  sx.font = FONTS[font].css;
  sx.textBaseline = 'alphabetic';
  sx.fillStyle = '#000';
  sx.fillText(ch, ORIGIN_X, ORIGIN_Y);
  const id = sx.getImageData(0, 0, CELL, CELL);
  const [r, gr, b] = rgbDe(color);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] >= 100;
    d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = on ? 255 : 0;
  }
  if (ch === 'C' && font === 'bold') abreC(d, 3, 2);
  if (ch === 'C' && font === 'huge') abreC(d, 6, 4);
  if (ch === 'G' && font === 'bold') abreC(d, 2, 2, true);
  if (ch === 'G' && font === 'huge') abreC(d, 4, 4, true);
  // Al atlas va solo lo que tiene tinta.
  let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (!d[(y * CELL + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const g = { x: 0, y: 0, w: 0, h: 0, dx: 0, dy: 0, adv: avance(ch, font) };
  if (x1 < 0) return g;
  g.w = x1 - x0 + 1; g.h = y1 - y0 + 1;
  g.dx = x0; g.dy = y0;
  const q = hueco(g.w, g.h);
  g.x = q.x; g.y = q.y;
  ax.putImageData(id, g.x - x0, g.y - y0, x0, y0, g.w, g.h);
  atlasTexto.glifos++;
  return g;
}

function glyph(ch, font, color) {
  let g = glyphs.get(font)?.get(color)?.get(ch);
  if (g) return g;
  g = pintaGlifo(ch, font, color);     // puede vaciar el atlas: las tablas se buscan después
  let porColor = glyphs.get(font);
  if (!porColor) glyphs.set(font, porColor = new Map());
  let porChar = porColor.get(color);
  if (!porChar) porColor.set(color, porChar = new Map());
  porChar.set(ch, g);
  return g;
}

export function measure(str, font = 'dialog') {
  let w = 0;
  for (const ch of String(str)) w += avance(ch, font);
  return w;
}

export function lineHeight(font = 'dialog') { return FONTS[font].line; }

function sello(ctx, g, x, top) {
  if (g.w) ctx.drawImage(atlas, g.x, g.y, g.w, g.h, x - ORIGIN_X + g.dx, top + g.dy, g.w, g.h);
}

/** Pinta texto con la esquina superior izquierda en (x, y). */
export function text(ctx, str, x, y, { font = 'dialog', color = '#F4EFE6', align = 'left', shadow = null, chars = Infinity } = {}) {
  const f = FONTS[font];
  str = String(str);
  if (align !== 'left') {
    const w = measure(str, font);
    x -= align === 'center' ? Math.floor(w / 2) : w;
  }
  x = Math.round(x); y = Math.round(y);
  const top = y + f.base - ORIGIN_Y;
  let n = 0;
  for (const ch of str) {
    if (n++ >= chars) break;
    if (shadow) sello(ctx, glyph(ch, font, shadow), x + 1, top + 1);
    const g = glyph(ch, font, color);
    sello(ctx, g, x, top);
    x += g.adv;
  }
}

/** Parte en líneas que quepan en maxW. Respeta \n. */
export function wrap(str, font, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, font) > maxW && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

// Cargador único de sprites y retratos, para Pokémon y para Juanjo.
// Lee hojas en formato SpriteCollab: AnimData.xml y NOMBRE-Anim.png, con 8 filas de
// dirección (0 abajo, 2 derecha, 4 arriba, 6 izquierda) o 1 si la hoja no gira.
import { C, img, loadImage, rgbDe } from './assets.js';
import { dither, outline, rect } from './draw.js';
import { text } from './text.js';
import { S } from './state.js';
import { G } from './game.js';

export const DIR = { abajo: 0, derecha: 2, arriba: 4, izquierda: 6 };

const sprites = new Map();  // id -> { anims } ya listo
const pending = new Map();  // id -> Promise
let manifest = {};          // data/sprites.json: qué retratos existen de verdad

export function setManifest(m) { manifest = m || {}; }

const spriteDir = (id) => (id === 'juanjo' ? 'assets/sprites/juanjo' : `assets/sprites/pokemon/${id}`);
const tag = (el, name) => el.querySelector(name)?.textContent ?? null;

/** Lee AnimData.xml y resuelve CopyOf: cada animación sabe qué hoja usa (`sheet`). */
function parseAnimData(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const raw = {};
  for (const a of doc.querySelectorAll('Anim')) {
    const name = tag(a, 'Name');
    const copyOf = tag(a, 'CopyOf');
    raw[name] = copyOf ? { name, copyOf } : {
      name,
      sheet: name,
      index: Number(tag(a, 'Index')),
      fw: Number(tag(a, 'FrameWidth')),
      fh: Number(tag(a, 'FrameHeight')),
      durations: [...a.querySelectorAll('Duration')].map((d) => Number(d.textContent)),
    };
  }
  const anims = {};
  for (const name of Object.keys(raw)) {
    let cur = raw[name];
    for (let hops = 0; cur?.copyOf && hops < 8; hops++) cur = raw[cur.copyOf];
    if (cur?.durations) anims[name] = { ...cur, name };
  }
  return anims;
}

/**
 * Línea de los pies de cada fila: la última fila de píxeles opacos de la hoja.
 * Los cuadros de SpriteCollab llevan aire debajo; anclar por el borde del cuadro
 * dejaría a todo el mundo flotando.
 */
function footLines(image, fw, fh, rows) {
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(image, 0, 0);
  const { data } = x.getImageData(0, 0, c.width, c.height);
  const opaque = (px, py) => data[(py * c.width + px) * 4 + 3] > 0;
  const feet = [];
  const cabezas = [];    // por fila y cuadro: dónde cae la cabeza, para gorras y dientes
  for (let r = 0; r < rows; r++) {
    let foot = fh;
    search:
    for (let py = (r + 1) * fh - 1; py >= r * fh; py--) {
      for (let px = 0; px < c.width; px++) {
        if (opaque(px, py)) { foot = py - r * fh + 1; break search; }
      }
    }
    feet[r] = foot;
    cabezas[r] = [];
    for (let f = 0; f * fw < c.width; f++) cabezas[r][f] = cabeza((px, py) => opaque(f * fw + px, r * fh + py), fw, fh);
  }
  return { feet, cabezas };
}

/** Lo alto del cuadro: la primera fila opaca y el centro de las seis siguientes. */
function cabeza(opaco, fw, fh) {
  for (let py = 0; py < fh; py++) {
    let suma = 0, n = 0, hay = false;
    for (let y = py; y < Math.min(fh, py + 7); y++) {
      for (let x = 0; x < fw; x++) {
        if (!opaco(x, y)) continue;
        suma += x; n++;
        if (y === py) hay = true;
      }
    }
    if (hay) return { x: suma / n, y: py };
  }
  return { x: fw >> 1, y: 0 };
}

/** Carga una hoja (id: 'juanjo' o número de dex '0067'). Solo Idle y Walk. */
function loadSprite(id) {
  if (sprites.has(id)) return Promise.resolve(sprites.get(id));
  if (pending.has(id)) return pending.get(id);
  const dir = spriteDir(id);
  const p = (async () => {
    const r = await fetch(`${dir}/AnimData.xml`);
    if (!r.ok) throw new Error(`Sin AnimData: ${id}`);
    const all = parseAnimData(await r.text());
    const anims = {};
    await Promise.all(['Idle', 'Walk'].map(async (name) => {
      const a = all[name];
      if (!a) return;
      const image = await loadImage(`${dir}/${a.sheet}-Anim.png`);
      const rows = Math.max(1, Math.floor(image.height / a.fh));
      const n = Math.min(a.durations.length, Math.floor(image.width / a.fw));
      const durations = a.durations.slice(0, n);
      const { feet, cabezas } = footLines(image, a.fw, a.fh, rows);
      anims[name] = {
        ...a, image, rows, durations, cabezas,
        total: durations.reduce((s, d) => s + d, 0),
        foot: feet,
      };
    }));
    const sp = { id, anims };
    sprites.set(id, sp);
    pending.delete(id);
    return sp;
  })();
  pending.set(id, p);
  return p;
}

function frameAt(a, ticks) {
  let t = Math.floor(ticks) % a.total;
  for (let i = 0; i < a.durations.length; i++) {
    t -= a.durations[i];
    if (t < 0) return i;
  }
  return 0;
}

/** Sombra plana en el suelo: ancla visualmente al sprite. */
export function drawShadow(ctx, x, y, w) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x - (w >> 1), y - 1, w, 3, C.carbon);
  rect(ctx, x - (w >> 1) + 2, y + 2, w - 4, 1, C.carbon);
}

// Cara blanca ------------------------------------------------------------------
// Desde el extintor (S.flags.caraBlanca), todo Juanjo. Sus PNG no usan `piel` ni `piel_sombra`
// de la paleta sino decenas de naranjas, así que se decide por tono: la piel es naranja claro,
// R > G > B. Los labios, la barba, la botella y la madera son más rojos o más oscuros y no pasan.
// La zona media se trama con los dos colores, porque si no la cara se queda sin relieve.

const LUZ = 165, MEDIA = 125;     // luminosidad: blanco, trama y gris
const blancas = new WeakMap();    // imagen -> lienzo: el filtro se hace una vez por imagen

const luz = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function esPiel(r, g, b, rojoMin) {
  if (!(r > g && g > b) || r - b < 45 || luz(r, g, b) < 88) return false;
  const rg = g / r, rb = b / r;
  return rg >= rojoMin && rg <= 0.8 && rb >= 0.28 && rb <= 0.68;
}

/** Quita lo suelto: en los retratos, las marcas de emoción naranjas del fondo no son piel. */
function soloManchas(mapa, w, h, minimo) {
  const visto = new Uint8Array(w * h);
  for (let i = 0; i < mapa.length; i++) {
    if (!mapa[i] || visto[i]) continue;
    const pila = [i], grupo = [];
    visto[i] = 1;
    while (pila.length) {
      const q = pila.pop();
      grupo.push(q);
      const x = q % w, y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, n = ny * w + nx;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mapa[n] || visto[n]) continue;
          visto[n] = 1;
          pila.push(n);
        }
      }
    }
    if (grupo.length < minimo) grupo.forEach((q) => { mapa[q] = 0; });
  }
}

/**
 * Versión blanca de una imagen de Juanjo, en un lienzo. Opciones:
 *   minimo     manchas más pequeñas que esto se quedan como están (retratos).
 *   excluye    (x, y) => true para lo que no es piel aunque lo parezca (suelas).
 *   piernas    desde esta y el tono admite más rojo: rodillas y espinillas, sin labios.
 */
function blanqueada(image, { minimo = 1, excluye = null, piernas = Infinity } = {}) {
  const hecho = blancas.get(image);
  if (hecho) return hecho;
  const c = document.createElement('canvas');
  const w = c.width = image.width, h = c.height = image.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(image, 0, 0);
  const datos = x.getImageData(0, 0, w, h);
  const d = datos.data;
  const mapa = new Uint8Array(w * h);
  for (let py = 0; py < h; py++) {
    const rojoMin = py >= piernas ? 0.38 : 0.5;
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      if (d[i + 3] && esPiel(d[i], d[i + 1], d[i + 2], rojoMin) && !excluye?.(px, py)) mapa[py * w + px] = 1;
    }
  }
  if (minimo > 1) soloManchas(mapa, w, h, minimo);
  const claro = rgbDe(C.blanco_extintor), gris = rgbDe(C.gris);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (!mapa[py * w + px]) continue;
      const i = (py * w + px) * 4;
      const l = luz(d[i], d[i + 1], d[i + 2]);
      const tono = l >= LUZ || (l >= MEDIA && (px + py) % 2) ? claro : gris;
      d[i] = tono[0]; d[i + 1] = tono[1]; d[i + 2] = tono[2];
    }
  }
  x.putImageData(datos, 0, 0);
  blancas.set(image, c);
  return c;
}

const hayBlanco = (id) => id === 'juanjo' && S.flags.caraBlanca;

/** En las hojas, las suelas son del mismo naranja que la piel: los pies de cada fila no se tocan. */
function hojaDe(a, id) {
  if (!hayBlanco(id)) return a.image;
  return blanqueada(a.image, { excluye: (px, py) => py % a.fh >= a.foot[Math.floor(py / a.fh)] - 3 });
}

/** La figura de escena (el entrenador de 65×160). */
export function figura(who, ruta) {
  const pic = img(ruta);
  if (!pic || !hayBlanco(who)) return pic;
  return blanqueada(pic, { excluye: (px, py) => py >= 148, piernas: 100 });
}

// Lo que se dibuja encima: gorras y dientes --------------------------------------
// `gorra` y `boca` van en data/cast.json, en píxeles del retrato de 40×40.

const decos = {};     // id de retrato o de hoja -> { gorra, boca }

function deco(id) {
  if (decos[id]) return decos[id];
  const d = {};
  for (const a of Object.values(G.data.cast ?? {})) {
    if (a.retrato !== id && a.sprite !== id) continue;
    d.gorra ??= a.gorra;
    d.boca ??= a.boca;
  }
  decos[id] = d;
  return d;
}

/** Dientes: una tira oscura con dos filas de triángulos marfil. Se ve desde lejos, que es lo malo. */
export function pintaDientes(ctx, x, y, w, h) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x, y, w, h, C.carbon);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, C.rojo_extintor);
  const paso = Math.max(3, h >> 1) + 1, alto = Math.max(1, (h - 2) >> 1);
  ctx.fillStyle = C.marfil;
  for (let i = x + 1; i < x + w - 1; i += paso) {
    for (let j = 0; j < alto; j++) {
      const a = paso - 1 - j * 2;
      if (a <= 0) break;
      ctx.fillRect(i + j, y + 1 + j, Math.min(a, x + w - 1 - i - j), 1);
      ctx.fillRect(i + j, y + h - 2 - j, Math.min(a, x + w - 1 - i - j), 1);
    }
  }
}

// La gorra de los retratos, vista de lado y mirando a la derecha: 24×10. a azul, c carbón, s escudo.
const GORRA_RETRATO = [
  '.....ccccccccccc........',
  '...cccaaaaaaaaaccc......',
  '..caaaaaaaaaaaaaaac.....',
  '.caaaaaaaaaaassaaaac....',
  'caaaaaaaaaaaasssaaac....',
  'caaaaaaaaaaaassaaaac....',
  'caaaaaaaaaaaaaaaaaac....',
  'cccccccccccccccccccccc..',
  'ccsssssssssssssssssccccc',
  '.cccccccccccccccccc.cccc',
];

function pintaGorraRetrato(ctx, x, y) {
  const color = { a: C.azul_mar, c: C.carbon, s: C.amarillo_mural };
  GORRA_RETRATO.forEach((fila, j) => [...fila].forEach((b, i) => {
    if (b !== '.') rect(ctx, x + i, y + j, 1, 1, color[b]);
  }));
}

/** La gorra de los sprites: dir 0 de frente, 2 derecha, 4 de espaldas, 6 izquierda. */
function pintaGorraSprite(ctx, x, y, e, dir) {
  const px = (a, b, w, h, c) => rect(ctx, x + a * e, y + b * e, w * e, h * e, c);
  px(-5, -5, 10, 5, C.carbon);
  px(-4, -4, 8, 3, C.azul_mar);
  if (dir === DIR.derecha) { px(-5, 0, 13, 1, C.carbon); px(2, -3, 2, 2, C.amarillo_mural); }
  else if (dir === DIR.izquierda) { px(-8, 0, 13, 1, C.carbon); px(-4, -3, 2, 2, C.amarillo_mural); }
  else if (dir === DIR.arriba) px(-5, 0, 10, 1, C.carbon);
  else { px(-6, 0, 12, 1, C.carbon); px(-1, -3, 2, 2, C.amarillo_mural); }
}

/** Sprite entero de un solo color. Es lo que se ve dentro de la nube del extintor. */
const silueta = { c: null, x: null };
export function drawSilueta(ctx, id, anim, dir, ticks, x, y, color, { escala = 1 } = {}) {
  const a = sprites.get(id)?.anims[anim] ?? sprites.get(id)?.anims.Idle;
  if (!a) return false;
  silueta.c ??= document.createElement('canvas');
  silueta.x ??= silueta.c.getContext('2d');
  const row = a.rows === 1 ? 0 : dir % a.rows;
  const f = frameAt(a, ticks);
  if (silueta.c.width < a.fw || silueta.c.height < a.fh) {
    silueta.c.width = Math.max(silueta.c.width, a.fw);
    silueta.c.height = Math.max(silueta.c.height, a.fh);
  }
  const t = silueta.x;
  t.clearRect(0, 0, a.fw, a.fh);
  t.drawImage(a.image, f * a.fw, row * a.fh, a.fw, a.fh, 0, 0, a.fw, a.fh);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, a.fw, a.fh);
  t.globalCompositeOperation = 'source-over';
  x = Math.round(x); y = Math.round(y);
  ctx.drawImage(silueta.c, 0, 0, a.fw, a.fh, x - Math.floor((a.fw * escala) / 2), y - a.foot[row] * escala, a.fw * escala, a.fh * escala);
  return true;
}

/**
 * Pinta con los pies en (x, y), abajo-centro y en píxeles enteros.
 * ticks va en 1/60 s, como las duraciones del AnimData. Devuelve false si aún no ha cargado.
 * dientes: fuerza los dientes; si no se dice, salen con S.flags.dientes, a todos menos a Juanjo.
 */
export function drawSprite(ctx, id, anim, dir, ticks, x, y, { escala = 1, sombra = false, dientes = S.flags.dientes && id !== 'juanjo' } = {}) {
  const a = sprites.get(id)?.anims[anim] ?? sprites.get(id)?.anims.Idle;
  if (!a) return false;
  const row = a.rows === 1 ? 0 : dir % a.rows;
  const f = frameAt(a, ticks);
  x = Math.round(x); y = Math.round(y);
  if (sombra) drawShadow(ctx, x, y, 16 * escala);
  const x0 = x - Math.floor((a.fw * escala) / 2), y0 = y - a.foot[row] * escala;
  ctx.drawImage(hojaDe(a, id), f * a.fw, row * a.fh, a.fw, a.fh, x0, y0, a.fw * escala, a.fh * escala);
  const cab = a.cabezas[row]?.[f];
  if (cab && deco(id).gorra) pintaGorraSprite(ctx, Math.round(x0 + cab.x * escala), Math.round(y0 + (cab.y + 4) * escala), escala, dir);
  if (cab && dientes && dir !== DIR.arriba) {
    const alto = a.foot[row] - cab.y;
    const w = Math.max(10, Math.min(16, alto >> 1)) * escala, h = 6 * escala;
    pintaDientes(ctx, Math.round(x0 + cab.x * escala - (w >> 1)), Math.round(y0 + (cab.y + alto * 0.33) * escala), w, h);
  }
  return true;
}

// Retratos -------------------------------------------------------------------

function portraitPath(actor, mood) { return `assets/portraits/${actor}/${mood}.png`; }

export async function loadPortraits(actor, moods) {
  await Promise.all(moods.map((m) => loadImage(portraitPath(actor, m)).catch(() => null)));
}

const decorados = new WeakMap();  // imagen -> { clave: lienzo }

function decorado(base, gorra, boca) {
  const clave = `${gorra ? 'g' : ''}${boca ? 'd' : ''}`;
  let hechos = decorados.get(base);
  if (!hechos) decorados.set(base, hechos = {});
  if (hechos[clave]) return hechos[clave];
  const c = document.createElement('canvas');
  c.width = base.width; c.height = base.height;
  const x = c.getContext('2d');
  x.drawImage(base, 0, 0);
  if (boca) pintaDientes(x, boca.x, boca.y, boca.w, boca.h ?? 8);
  if (gorra) pintaGorraRetrato(x, gorra.x, gorra.y);
  hechos[clave] = c;
  return c;
}

/** El retrato, ya con lo que toque: cara blanca, gorra, dientes. */
export function portrait(actor, mood = 'Normal') {
  const base = img(portraitPath(actor, mood)) || img(portraitPath(actor, 'Normal'));
  if (!base) return null;
  if (actor === 'juanjo') return S.flags.caraBlanca ? blanqueada(base, { minimo: 10 }) : base;
  const { gorra, boca } = deco(actor);
  const dientes = S.flags.dientes && boca ? boca : null;
  return gorra || dientes ? decorado(base, gorra, dientes) : base;
}

// Fotos del álbum -------------------------------------------------------------

/** La foto de dentro de la nube: blanco y una silueta enorme. Nadie sabe quién es. */
function fotoBlanca(ctx, x, y) {
  rect(ctx, x, y, 40, 40, C.blanco_extintor);
  dither(ctx, x, y, 40, 40, C.gris, 1);
  rect(ctx, x + 14, y + 6, 12, 10, C.gris);
  rect(ctx, x + 8, y + 15, 24, 18, C.gris);
  rect(ctx, x + 3, y + 12, 6, 14, C.gris);
  rect(ctx, x + 31, y + 12, 6, 14, C.gris);
  rect(ctx, x + 12, y + 33, 6, 7, C.gris);
  rect(ctx, x + 22, y + 33, 6, 7, C.gris);
}

/** Foto de 40×40 de una entrada del álbum: retrato o, si no hay o se pide, sprite. */
export function drawFoto(ctx, e, x, y) {
  rect(ctx, x, y, 40, 40, C.noche_clara);
  if (e.foto === 'blanca') { fotoBlanca(ctx, x, y); return; }
  const a = G.data.cast[e.who];
  const pic = e.foto !== 'sprite' && a?.retrato ? portrait(a.retrato, e.mood) : null;
  if (pic) { ctx.drawImage(pic, x, y, 40, 40); return; }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, 40, 40);
  ctx.clip();
  const ok = a?.sprite && drawSprite(ctx, a.sprite, 'Idle', DIR.abajo, 0, x + 20, y + 38, { escala: 2 });
  ctx.restore();
  if (!ok) text(ctx, '?', x + 20, y + 12, { font: 'bold', color: C.gris, align: 'center' });
}

/** La foto como instantánea: marco marfil, contorno oscuro y sombra plana. Mide 48×50. */
export function drawPolaroid(ctx, e, x, y) {
  rect(ctx, x + 2, y + 2, 48, 50, C.carbon);
  rect(ctx, x, y, 48, 50, C.marfil);
  outline(ctx, x, y, 48, 50, C.carbon);
  drawFoto(ctx, e, x + 4, y + 4);
}

// Precarga -------------------------------------------------------------------

/** Todo lo de un personaje de data/cast.json: hoja, retratos que existan y figura de escena. */
function loadActor(key) {
  const a = G.data.cast[key];
  if (!a) return Promise.resolve();
  const jobs = [];
  if (a.sprite) jobs.push(loadSprite(a.sprite));
  if (a.retrato && manifest[a.retrato]) jobs.push(loadPortraits(a.retrato, manifest[a.retrato].retratos));
  if (a.escena) jobs.push(loadImage(a.escena));
  return Promise.all(jobs);
}

/** keys: claves de cast.json o rutas de imagen. Nunca falla: lo que no llegue no se pinta. */
export function preload(keys = []) {
  return Promise.all(keys.map((k) => (k.includes('/') ? loadImage(k) : loadActor(k)).catch(() => null)));
}

// Lo que da vida a los fondos sin tocar assets/. Al entrar un fondo se hornean dos capas una sola
// vez: la fija (remiendo del bloque morado, bandas de arriba y abajo) y la de apagados (el neón o
// la farola con la luz floja). Cada fotograma solo se copian y se añaden unos pocos píxeles.
// Nada de alfa: lo que oscurece es trama, y lo apagado sale de los colores del propio fondo.
import { C, img, rgbDe, bgPath } from './assets.js';
import { W, H } from './screen.js';
import { dither, enTrama, rect } from './draw.js';
import { G } from './game.js';

function lienzo(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

const [fijo, fx] = lienzo();
const [apagado, ax] = lienzo();
const [trabajo, tx] = lienzo();
let actual = null;
let brillos = [];        // los trozos que fallan: { r, cuando(t) }

// Fallos ---------------------------------------------------------------------

/** Un chispazo corto cada `per` segundos. */
const chispa = (per, sem = 0, dura = 0.45) => (t) => {
  const q = (t + sem) % per;
  return q < dura && Math.floor(q * 14) % 3 !== 1;
};
/** Se queda apagado un rato, tras temblar un poco. */
const cansado = (per, sem, dura) => (t) => {
  const q = (t + sem) % per;
  return q < dura && (q > 0.3 || Math.floor(q * 14) % 2 === 0);
};
const compas = (bpm, cada, cual) => (t) => Math.floor((t * bpm) / 60) % cada === cual;

const luz = (x, y, w, h, cuando, umbral = 150, filtro = null) => ({ r: [x, y, w, h], cuando, umbral, filtro });
const rosa = (r, g, b) => r > b * 1.1 && r > 120;
const azulado = (r, g, b) => b > r * 1.15 && b > 120;

// Pequeñas cosas que se mueven -----------------------------------------------

function polillas(ctx, t, cx, cy, n = 3, radio = 11) {
  for (let i = 0; i < n; i++) {
    const a = t * (2.3 + i * 0.7) + i * 2.1;
    const x = Math.round(cx + Math.cos(a) * radio + Math.sin(a * 2.7) * 3);
    const y = Math.round(cy + Math.sin(a * 1.3) * radio * 0.7);
    ctx.fillStyle = C.carbon;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = C.marfil;
    if (Math.floor(t * 12 + i) % 2) ctx.fillRect(x - 1, y, 3, 1); else ctx.fillRect(x, y - 1, 1, 1);
  }
}

/** Humo: copos de trama que suben y se deshacen. Sin alfa, se deshace bajando el nivel. */
function humo(ctx, t, x0, y0, n = 4, sube = 70) {
  for (let i = 0; i < n; i++) {
    const f = (t * 0.07 + i / n) % 1;
    const x = Math.round(x0 + Math.sin(f * 7 + i * 2) * (5 + f * 12) + i * 3);
    const y = Math.round(y0 - f * sube);
    const nivel = f < 0.45 ? 2 : 1;
    const w = 9 + Math.round(f * 12);
    dither(ctx, x - (w >> 1), y, w, 5 + Math.round(f * 3), C.gris, nivel);
  }
}

/** Motas que caen despacio dentro de un rectángulo. */
function polvo(ctx, t, x, y, w, h, n, color = C.gris) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const f = (t * (0.035 + (i % 3) * 0.012) + i * 0.37) % 1;
    ctx.fillRect(x + ((i * 53) % w) + Math.round(Math.sin(t * 0.8 + i) * 3), y + Math.round(f * h), 1, 1);
  }
}

function estrellas(ctx, t, lista) {
  for (const [x, y, s] of lista) {
    if (Math.floor(t * 1.7 + s * 3) % 7 === 0) continue;
    ctx.fillStyle = s % 2 ? C.gris : C.marfil;
    ctx.fillRect(x, y, 1, 1);
  }
}

const CIELO = Array.from({ length: 22 }, (_, i) => [(i * 83 + 17) % W, 28 + ((i * 47) % 66), i]);

/** La orilla de la Malagueta: una curva que entra hacia la derecha. */
const orillaY = (x) => 270 + Math.round(((x - 125) / 145) ** 2 * 30);

function olas(ctx, t) {
  for (let k = 0; k < 3; k++) {
    const f = (t * 0.28 + k / 3) % 1;
    const sube = Math.round(f * 7);
    const ancho = 14 + k * 5;
    for (let x = 128 + ((k * 37 + Math.floor(t * 5)) % 22); x < W; x += ancho + 16) {
      ctx.fillStyle = f < 0.6 ? C.azul_claro : C.gris;
      ctx.fillRect(x, orillaY(x) - sube, ancho, 1);
    }
  }
  // El reflejo del paseo tiembla sobre el agua.
  ctx.fillStyle = C.naranja_farola;
  for (let i = 0; i < 7; i++) {
    const x = 140 + (i * 19) % 90;
    if (Math.floor(t * 4 + i * 1.7) % 3 === 0) ctx.fillRect(x, 262 + (i * 3) % 7, 3, 1);
  }
}

/** Puntos de la bola de espejos, resbalando por la pared. */
function bola(ctx, t) {
  for (let i = 0; i < 8; i++) {
    const x = Math.round(28 + ((t * (9 + i) + i * 41) % 214));
    const y = 116 + (i * 29) % 80;
    ctx.fillStyle = i % 3 ? C.rosa_claro : C.cian_neon;
    ctx.fillRect(x, y, 2, 1);
  }
}

// Cada fondo -----------------------------------------------------------------
// franja: cuántas filas del dibujo se reflejan, alternas, para seguir por arriba.
// tope(x, sup, arte): lo que se pinta encima al hornear.

const ESCENAS = {
  '01-pasillo-laura': {
    franja: 2,
    luces: [luz(108, 110, 56, 24, chispa(13, 4))],
    vivo(c, t) { polvo(c, t, 95, 130, 80, 150, 5); },
  },
  '02-chino': {
    franja: 33,
    luces: [luz(64, 134, 142, 14, chispa(6, 1, 0.6), 170)],
    vivo(c, t) { polillas(c, t, 135, 134, 3, 16); },
  },
  '04-portal': {
    franja: 52,
    luces: [luz(222, 138, 34, 54, chispa(9, 2), 170)],
    vivo(c, t) { polillas(c, t, 238, 150, 3, 12); },
  },
  '05-siglo-xxi': {
    franja: 30,
    luces: [luz(216, 122, 44, 30, chispa(11, 5), 160)],
    vivo(c, t) { humo(c, t, 80, 262, 2); humo(c, t + 30, 200, 268, 1, 60); },
  },
  '06-alquimia-puerta': {
    franja: 50,
    luces: [luz(96, 148, 74, 12, chispa(8, 3), 150)],
    vivo(c, t) { polillas(c, t, 132, 156, 2, 13); },
  },
  '07-alquimia-dentro': {
    franja: 26,
    luces: [luz(110, 124, 54, 32, chispa(12, 7), 130)],
    vivo(c, t) {
      humo(c, t, 150, 262, 2, 80);
      // Un destello recorre los vasos.
      const i = Math.floor(t * 0.6) % 6;
      if ((t * 0.6) % 1 < 0.18) rect(c, 62 + i * 33, 272, 1, 4, C.marfil);
    },
  },
  '08-modernicolas-puerta': {
    franja: 24,
    cielo: 151,
    luces: [
      luz(30, 146, 66, 54, chispa(5.3, 0, 0.5), 140),
      luz(96, 146, 30, 54, chispa(7.7, 2, 0.35), 140),
      luz(126, 146, 20, 54, cansado(11, 4, 1.7), 140),
      luz(155, 218, 24, 34, chispa(10, 6), 170),
      luz(244, 188, 26, 34, chispa(14, 1), 170),
    ],
    vivo(c, t) {
      estrellas(c, t, CIELO.filter((e) => e[0] > 155));
      polillas(c, t, 166, 230, 2, 8);
      polillas(c, t, 257, 198, 2, 9);
    },
  },
  '09-modernicolas-dentro': {
    franja: 26,
    luces: [luz(98, 122, 54, 26, chispa(9, 8), 150)],
    vivo(c, t) { humo(c, t, 70, 250, 2, 80); humo(c, t + 22, 165, 262, 1, 60); },
  },
  '10-hotel': {
    franja: 2,
    luces: [luz(84, 165, 68, 112, cansado(8, 3, 0.6), 120)],
    vivo(c, t) { polvo(c, t, 70, 130, 110, 220, 9); polvo(c, t + 9, 40, 110, 200, 90, 4, C.noche_clara); },
  },
  '11-mitjana': {
    franja: 2,
    luces: [luz(128, 148, 32, 42, chispa(10, 2), 170), luz(198, 214, 20, 24, chispa(7, 5), 170)],
    vivo(c, t) { polillas(c, t, 144, 168, 3, 11); },
  },
  '12-malagueta-noche': {
    franja: 0,
    luces: [luz(28, 212, 26, 30, chispa(17, 3), 170), luz(106, 206, 20, 22, chispa(9, 6), 170)],
    tope(x, sup) {
      for (const [a, b, s] of CIELO) if (s % 3 === 0) rect(x, (a + 40) % W, b + 3, 1, 1, C.noche_clara);
      rect(x, 0, 97, 44, 42, sup);     // su bloque es casi del color del cielo: basta con taparlo
      // Luna en menguante, que la Malagueta a las tres de la mañana se la merece.
      for (let j = -6; j <= 6; j++) {
        const a = Math.round(Math.sqrt(36 - j * j)), b = Math.round(Math.sqrt(Math.max(0, 30 - j * j)));
        rect(x, 212 - a, 56 + j, a + 1 + Math.min(a, 2), 1, C.arena);
        if (b) rect(x, 212 - b + 3, 56 + j, b * 2 + 1, 1, sup);
      }
    },
    vivo(c, t) { estrellas(c, t, CIELO); olas(c, t); },
  },
  '13-onda-pasadena': {
    franja: 2,
    luces: [
      luz(20, 134, 230, 250, compas(128, 4, 2), 100, rosa),
      luz(70, 104, 130, 150, compas(128, 4, 0), 100, azulado),
    ],
    vivo(c, t) { bola(c, t); },
  },
  '14-malagueta-amanecer': {
    franja: 0,
    tope(x, sup, arte) {
      // Nubes altas que siguen las del dibujo: tiras de trama, sin degradado.
      dither(x, 0, 25, W, arte - 25, C.morado, 1);
      dither(x, 0, 66, W, arte - 66, C.morado, 2);
      const nubes = [[20, 76, 90], [120, 66, 70], [176, 84, 94], [40, 52, 46], [200, 44, 60]];
      for (const [a, b, l] of nubes) {
        rect(x, a, b, l, 2, C.rosa_claro);
        rect(x, a + 8, b + 2, l - 16, 1, C.rosa_claro);
        dither(x, a - 4, b - 2, l + 8, 2, C.rosa_claro, 2);
      }
    },
  },
  '15-control': {
    franja: 0,
    manana: true,
    vivo(c, t) {
      // Las luces del coche cruzado, que siguen ahí.
      const a = Math.floor(t * 3) % 2;
      rect(c, 116, 250, 3, 2, a ? C.azul_claro : C.morado);
      rect(c, 133, 250, 3, 2, a ? C.morado : C.rojo_extintor);
    },
  },
};

// Horneado ---------------------------------------------------------------------

const clave = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

/** Primera fila, por arriba, donde acaba la banda lisa, y última por abajo. */
function limites(d) {
  const distinta = (y, ref) => {
    let n = 0;
    for (let x = 0; x < W; x++) if (clave(d, (y * W + x) * 4) !== ref) n++;
    return n > 60;
  };
  const refA = clave(d, (40 * W + 135) * 4), refB = clave(d, (470 * W + 135) * 4);
  let arte = 90, suelo = 386;
  while (arte < 130 && !distinta(arte, refA)) arte++;
  while (suelo > 340 && !distinta(suelo, refB)) suelo--;
  return { arte, suelo };
}

/** Arriba a la izquierda todos los fondos traen un rectángulo liso: se tapa con lo que tiene al lado. */
function remiendo(d, arte) {
  const y0 = arte + 8, ref = clave(d, (y0 * W + 8) * 4);
  let w = 8, ab = y0, ar = y0;
  while (w < 80 && clave(d, (y0 * W + w) * 4) === ref) w++;
  while (ab < 160 && clave(d, (ab * W + 8) * 4) === ref) ab++;
  while (ar > arte - 4 && clave(d, (ar * W + 8) * 4) === ref) ar--;
  if (w < 16 || w >= 70 || ab - ar < 16) return;
  const m = w + 2, h = ab - ar + 2;
  tx.save();
  tx.scale(-1, 1);
  tx.drawImage(trabajo, m, ar, m, h, -m, ar, m, h);
  tx.restore();
}

/** Sigue el dibujo reflejando sus primeras filas; cuanto más lejos, más oscuro y con trama. */
function banda(x, desde, hacia, franja, origen, sentido) {
  const n = Math.abs(hacia - desde);
  const baja = hacia > desde;
  for (let k = 0; k < n; k++) {
    const m = k % (2 * franja);
    const fila = origen + sentido * (m < franja ? m : 2 * franja - 1 - m);
    x.drawImage(trabajo, 0, fila, W, 1, 0, baja ? desde + k : desde - k - 1, W, 1);
  }
  const trozo = Math.ceil(n / 3);
  for (let i = 0; i < 3; i++) {
    const y = baja ? desde + 4 + i * trozo : desde - 4 - (i + 1) * trozo;
    dither(x, 0, y, W, trozo, C.carbon, i + 1);
  }
}

/** Los colores del fondo, para que lo apagado no invente ninguno. */
function coloresDe(d) {
  const s = new Map();
  for (let i = 0; i < d.length; i += 4 * 3) s.set(clave(d, i), [d[i], d[i + 1], d[i + 2]]);
  return [...s.values()];
}

function cercano(lista, r, g, b) {
  let mejor = lista[0], dist = Infinity;
  for (const q of lista) {
    const e = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2;
    if (e < dist) { dist = e; mejor = q; }
  }
  return mejor;
}

function hornearLuces(luces, d, colores) {
  const memo = new Map();
  for (const l of luces) {
    const [x0, y0, w, h] = l.r;
    const id = ax.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * W + x0 + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (Math.max(r, g, b) < l.umbral || (l.filtro && !l.filtro(r, g, b))) continue;
        const k = clave(d, i);
        let q = memo.get(k);
        if (!q) memo.set(k, q = cercano(colores, r * 0.5, g * 0.42, b * 0.6));
        const o = (y * w + x) * 4;
        id.data[o] = q[0]; id.data[o + 1] = q[1]; id.data[o + 2] = q[2]; id.data[o + 3] = 255;
      }
    }
    ax.putImageData(id, x0, y0);
  }
}

/** El cielo de la mañana, de arriba abajo: se pasa de un color a otro por trama. */
const tonos = () => [C.azul_claro, C.rosa_claro, C.arena, C.amanecer].map(rgbDe);

function tonoManana(lista, x, y, y0, y1) {
  const f = Math.max(0, Math.min(0.999, (y - y0) / (y1 - y0))) * (lista.length - 1);
  const i = Math.floor(f), niv = Math.floor((f - i) * 5);
  return lista[enTrama(niv, x, y) ? Math.min(i + 1, lista.length - 1) : i];
}

/**
 * Convierte un trozo de fondo de noche en mañana: el cielo (azul puro) se cambia entero, la luz de
 * farolas y ventanas se apaga y lo demás sube de negro a morado, que a las ocho ya se ve la calle.
 */
export function aManana(x, y, w, h, cieloY0, cieloY1, alzar = 0) {
  const id = x.getImageData(0, y, w, h);
  const d = id.data, o = rgbDe(C.morado), mad = rgbDe(C.madera), lista = tonos();
  const pon = (p, q) => { d[p] = q[0]; d[p + 1] = q[1]; d[p + 2] = q[2]; };
  const azul = (r, g, b) => b > 24 && b > r * 1.7 && b > g * 1.3;
  for (let i = 0; i < w; i++) {
    // Por columnas, de arriba abajo: el cielo acaba en lo primero que no es cielo (un árbol, un
    // edificio). Más abajo solo se cambia el azul muy claro, el de los huecos entre las ramas.
    let visto = false, cerrada = false, duro = 0;
    for (let j = 0; j < h; j++) {
      const p = (j * w + i) * 4;
      if (d[p + 3] === 0) continue;
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const fy = y + j;
      const dentro = fy >= cieloY0 && fy < cieloY1;
      const es = azul(r, g, b);
      if (dentro && !cerrada) {
        if (es) { visto = true; duro = 0; } else if (visto && ++duro >= 2) cerrada = true;
      }
      if (dentro && es && (!cerrada || (b > 80 && b > r * 2.2))) pon(p, tonoManana(lista, i, fy, cieloY0, cieloY1));
      else if (r > 170 && g > 90 && b < 150) pon(p, mad);
      else if (fy >= alzar && r + g + b < 60 && enTrama(2, i, fy)) pon(p, o);
    }
  }
  x.putImageData(id, 0, y);
}

/** Copia de una imagen con lo brillante apagado: el neón del título sin corriente. */
export function apagarImagen(pic) {
  const [c, x] = lienzo(pic.width, pic.height);
  x.drawImage(pic, 0, 0);
  const id = x.getImageData(0, 0, pic.width, pic.height);
  const d = id.data, m = rgbDe(C.morado), n = rgbDe(C.noche_clara);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const q = Math.max(d[i], d[i + 1], d[i + 2]) > 150 ? m : n;
    d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2];
  }
  x.putImageData(id, 0, 0);
  return c;
}

let manana03 = null;

/** La ciudad del fondo 03 ya de día, para la vuelta: se calcula una vez. */
export function ciudadDeDia(bg) {
  if (!manana03) {
    const [c, x] = lienzo(W, 150);
    x.drawImage(bg, 0, 130, W, 150, 0, 0, W, 150);
    aManana(x, 0, W, 150, 8, 118, 8);
    manana03 = c;
  }
  return manana03;
}

function hornear(bg) {
  const pic = img(bgPath(bg));
  if (!pic) return false;
  actual = bg;
  const e = ESCENAS[bg] ?? { franja: 0 };
  tx.clearRect(0, 0, W, H);
  tx.drawImage(pic, 0, 0);
  const d0 = tx.getImageData(0, 0, W, H).data;
  const { arte, suelo } = limites(d0);
  remiendo(d0, arte);
  if (e.manana) aManana(tx, 25, W, 228, arte + 6, 252, 128);
  fx.clearRect(0, 0, W, H);
  ax.clearRect(0, 0, W, H);
  fx.drawImage(trabajo, 0, arte, W, suelo - arte, 0, arte, W, suelo - arte);
  const b = (40 * W + 135) * 4;
  const sup = `rgb(${d0[b]},${d0[b + 1]},${d0[b + 2]})`;
  if (e.manana) rect(fx, 0, 25, W, arte - 25, sup);        // ahí arriba solo está el techo del coche
  if (e.franja) banda(fx, arte, 25, e.franja, arte, 1);
  if (e.cielo) {   // lo que queda encima del tejado es cielo, no fachada
    const q = (arte * W + e.cielo + 40) * 4;
    rect(fx, e.cielo, 25, W - e.cielo, arte - 25, `rgb(${d0[q]},${d0[q + 1]},${d0[q + 2]})`);
  }
  e.tope?.(fx, sup, arte);
  banda(fx, suelo, H, 18, suelo - 1, -1);
  brillos = e.luces ?? [];
  if (brillos.length) hornearLuces(brillos, d0, coloresDe(d0));
  return true;
}

/** Va sobre el fondo y bajo los actores. */
export function pintaAmbiente(ctx, bg) {
  if (bg !== actual && !hornear(bg)) return;
  ctx.drawImage(fijo, 0, 0);
  const t = G.time;
  for (const q of brillos) {
    if (!q.cuando(t)) continue;
    const [x, y, w, h] = q.r;
    ctx.drawImage(apagado, x, y, w, h, x, y, w, h);
  }
  ESCENAS[bg]?.vivo?.(ctx, t);
}

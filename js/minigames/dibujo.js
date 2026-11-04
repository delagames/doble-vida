// Ayudantes de dibujo de los minijuegos: bebidas, litronas, grifos, retratos y fondos.
// Solo colores de la paleta, contorno de 1 px y sin alfa.
import { C, img, bgPath } from '../assets.js';
import { dither, outline, panel, rect } from '../draw.js';
import { W, H } from '../screen.js';
import { text, wrap, lineHeight } from '../text.js';
import { portrait } from '../sprites.js';
import { G } from '../game.js';

/** El fondo de una parada, oscurecido con trama para que lo de encima se lea. */
export function fondoTenue(ctx, bg, nivel = 3) {
  const pic = img(bgPath(bg));
  if (pic) ctx.drawImage(pic, 0, 0); else rect(ctx, 0, 0, W, H, C.noche);
  dither(ctx, 0, 0, W, H, C.carbon, nivel);
}

/** Retrato de un personaje de cast.json dentro de su marco, a lado×lado (múltiplo de 40 o mitad). */
export function retrato(ctx, who, x, y, { mood = 'Normal', lado = 40 } = {}) {
  const pic = portrait(G.data.cast[who]?.retrato, mood);
  rect(ctx, x - 1, y - 1, lado + 2, lado + 2, C.carbon);
  if (pic) ctx.drawImage(pic, x, y, lado, lado);
  outline(ctx, x - 1, y - 1, lado + 2, lado + 2, C.morado);
}

/** Vaso con líquido. Base: 12×16 a escala 1, con (x, y) arriba a la izquierda. */
function vaso(ctx, x, y, s, liquido, { w = 12, h = 16, espuma = null, dentro = null } = {}) {
  rect(ctx, x, y, w * s, h * s, C.carbon);
  rect(ctx, x + s, y + s, (w - 2) * s, (h - 2) * s, C.blanco_extintor);
  rect(ctx, x + s, y + 4 * s, (w - 2) * s, (h - 5) * s, liquido);
  if (espuma) rect(ctx, x + s, y + 2 * s, (w - 2) * s, 2 * s, espuma);
  if (dentro) {
    rect(ctx, x + 3 * s, y + 7 * s, 6 * s, 7 * s, C.carbon);
    rect(ctx, x + 4 * s, y + 8 * s, 4 * s, 5 * s, dentro);
  }
  rect(ctx, x + 2 * s, y + 5 * s, s, (h - 8) * s, C.marfil);
}

/**
 * Icono de bebida de data/pedidos.json: cerveza, ipa, chupito, jagercerveza, jagerbomb.
 * Mide 14×18 a escala 1. (x, y) es la esquina de arriba a la izquierda.
 */
export function drawBebida(ctx, id, x, y, { escala = 1 } = {}) {
  const s = escala;
  x = Math.round(x); y = Math.round(y);
  switch (id) {
    case 'cerveza':       // jarra con asa
      vaso(ctx, x, y + s, s, C.amarillo_mural, { espuma: C.marfil });
      rect(ctx, x + 12 * s, y + 5 * s, 2 * s, 8 * s, C.carbon);
      rect(ctx, x + 12 * s, y + 7 * s, s, 4 * s, C.blanco_extintor);
      break;
    case 'ipa':           // pinta alta
      vaso(ctx, x + s, y, s, C.verde_ipa, { h: 18, espuma: C.amarillo_mural });
      break;
    case 'jagercerveza':  // pinta oscura
      vaso(ctx, x + s, y, s, C.jager, { h: 18, espuma: C.amarillo_mural });
      break;
    case 'jagerbomb':     // vaso con el chupito dentro
      vaso(ctx, x + s, y + 2 * s, s, C.amarillo_mural, { dentro: C.jager });
      break;
    case 'chupito':       // vasito
      vaso(ctx, x + 3 * s, y + 8 * s, s, C.rojo_extintor, { w: 8, h: 10 });
      break;
    default:
      rect(ctx, x, y, 14 * s, 18 * s, C.gris);
  }
}

/** Una litrona: 14×40, o 18×50 la de litro y medio. (x, y) arriba a la izquierda. */
export function drawLitrona(ctx, x, y, color, { grande = false } = {}) {
  x = Math.round(x); y = Math.round(y);
  const w = grande ? 18 : 14, h = grande ? 50 : 40, cuello = grande ? 16 : 13;
  const cx = x + (w >> 1);
  rect(ctx, cx - 3, y, 6, cuello + 2, C.carbon);
  rect(ctx, cx - 2, y + 1, 4, 2, C.marfil);
  rect(ctx, cx - 2, y + 3, 4, cuello, color);
  rect(ctx, x, y + cuello, w, h - cuello, C.carbon);
  rect(ctx, x + 1, y + cuello + 1, w - 2, h - cuello - 2, color);
  rect(ctx, x + 1, y + cuello + 9, w - 2, 12, C.marfil);
  rect(ctx, x + 3, y + cuello + 11, w - 6, 8, color);
  rect(ctx, x + 2, y + cuello + 2, 1, 6, C.marfil);
}

/** Rectángulos de n grifos en la banda del pulgar: una fila hasta 3; con más, dos filas. */
export function grifos(n, y = 384, alto = H - 388) {
  const fila = (cuantos, yy, h) => {
    const w = Math.floor((W - 8 - (cuantos - 1) * 3) / cuantos);
    return Array.from({ length: cuantos }, (_, i) => ({ x: 4 + i * (w + 3), y: yy, w, h }));
  };
  if (n <= 3) return fila(n, y, alto);
  const h = (alto - 3) >> 1;
  const arriba = Math.ceil(n / 2);
  return [...fila(arriba, y, h), ...fila(n - arriba, y + h + 3, h)];
}

/** Un grifo: icono de la bebida, tirador y nombre. */
export function drawGrifo(ctx, r, id, { activo = false } = {}) {
  panel(ctx, r.x, r.y, r.w, r.h, { fill: activo ? C.morado : C.noche_clara, edge: activo ? C.rosa_neon : C.morado });
  const beb = G.data.pedidos.bebidas[id];
  const cx = r.x + (r.w >> 1);
  const alto = r.h > 60;
  const lineas = wrap(beb.nombre, 'label', r.w - 6);
  if (alto) {
    rect(ctx, cx - 2, r.y + 4, 5, 9, C.carbon);
    rect(ctx, cx - 1, r.y + 5, 3, 7, C[beb.color]);
    rect(ctx, cx - 5, r.y + 13, 11, 5, C.gris);
    drawBebida(ctx, id, cx - 14, r.y + 20, { escala: 2 });
    lineas.forEach((l, i) => text(ctx, l, cx, r.y + r.h - 5 - (lineas.length - i) * lineHeight('label'), { font: 'label', color: C.marfil, align: 'center' }));
    return;
  }
  drawBebida(ctx, id, r.x + 4, r.y + ((r.h - 36) >> 1), { escala: 2 });      // el mismo icono del bocadillo
  const lados = wrap(beb.nombre, 'label', r.w - 38);
  lados.forEach((l, i) => text(ctx, l, r.x + 34, r.y + ((r.h - lados.length * 9) >> 1) + i * 9, { font: 'label', color: C.marfil }));
}

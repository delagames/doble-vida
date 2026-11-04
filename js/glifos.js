// La escritura del Zorro y Gengar: assets/ui/glifos.png, hecho por tools/build_glifos.py.
// Ley fija: cada carácter, en mayúscula y sin acentos, es siempre el mismo signo, así que el mismo
// mensaje da los mismos signos. La Ñ tiene el suyo. Lo que no está en el alfabeto cae en uno fijo
// según su código. La barra de arriba une las letras de cada palabra, como una escritura de verdad.
import { img, loadImage, loadJSON } from './assets.js';

const RUTA = 'assets/ui/glifos.png';
let tabla = null;           // data/glifos.json
const tenidos = new Map();  // color -> lienzo: uno por color de la paleta, como mucho

export async function cargarGlifos() {
  tabla = await loadJSON('data/glifos.json').catch(() => null);
  await loadImage(RUTA).catch(() => null);
}

export const hayGlifos = () => !!tabla && !!img(RUTA);

/** El índice del signo de un carácter: la ley de arriba. */
export function signo(ch) {
  const a = tabla.alfabeto;
  const mayus = ch.toUpperCase();
  const base = mayus === 'Ñ' ? 'Ñ' : mayus.normalize('NFD')[0];
  const i = a.indexOf(base);
  return i >= 0 ? i : 1 + (ch.codePointAt(0) % (a.length - 1));
}

/** Los signos con barra son las letras y las cifras; la puntuación y el espacio van sueltos. */
const conBarra = (k) => /[A-ZÑ0-9]/.test(tabla.alfabeto[k]);

function tenido(color) {
  let c = tenidos.get(color);
  if (c) return c;
  const pic = img(RUTA);
  c = document.createElement('canvas');
  c.width = pic.width; c.height = pic.height;
  const x = c.getContext('2d');
  x.drawImage(pic, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  tenidos.set(color, c);
  return c;
}

function anchoGlifos(str) { return [...str].length * (tabla?.celda[0] ?? 7); }

/** Parte en líneas que quepan en maxW, por palabras. */
export function partirGlifos(str, maxW) {
  const out = [];
  let linea = '';
  for (const p of str.split(' ')) {
    const junto = linea ? `${linea} ${p}` : p;
    if (anchoGlifos(junto) > maxW && linea) { out.push(linea); linea = p; } else linea = junto;
  }
  out.push(linea);
  return out;
}

/** Pinta los signos con la esquina superior izquierda en (x, y). */
export function glifos(ctx, str, x, y, color) {
  const [cw, ch] = tabla.celda;
  const hoja = tenido(color);
  const letras = [...str].map(signo);
  ctx.fillStyle = color;
  letras.forEach((k, i) => {
    const px = x + i * cw;
    ctx.drawImage(hoja, (k % tabla.columnas) * cw, Math.floor(k / tabla.columnas) * ch, cw, ch, px, y, cw, ch);
    if (conBarra(k) && i + 1 < letras.length && conBarra(letras[i + 1])) ctx.fillRect(px + cw - 1, y, 1, 1);
  });
}

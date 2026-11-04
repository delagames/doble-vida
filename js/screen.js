// Canvas vertical 270×480: se pinta en un búfer y se presenta con escalado entero.
// La inclinación y la ondulación de la coherencia baja se hacen por bandas de
// píxeles enteros, nunca rotando, para no introducir suavizado ni colores nuevos.
import { C } from './assets.js';

export const W = 270, H = 480;
const MAX_LIENZO = 6;   // tope del lienzo ampliado: 1620×2880
const BANDA_HUD = 25;   // los medidores no se inclinan: tienen que verse siempre

const view = document.getElementById('game');
const vctx = view.getContext('2d');
vctx.imageSmoothingEnabled = false;

function layer() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

const [buf, ctx] = layer();
const [tmp, tctx] = layer();
const [foto, fctx] = layer();
export { ctx, foto };

/** Guarda lo último que se ha pintado: la cortinilla lo tapa antes de cambiar de parada. */
export function congelar() { fctx.drawImage(buf, 0, 0); }

export const fx = { tilt: 0, wobble: 0, shakeT: 0 };

export function fit() {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(window.innerWidth * dpr);
  const ph = Math.round(window.innerHeight * dpr);
  // Ocupa toda la pantalla, aunque el múltiplo no sea entero. Para que los píxeles salgan iguales:
  // se amplía con vecino al entero de arriba y el navegador reduce ese lienzo al tamaño final.
  const s = Math.min(pw / W, ph / H);
  const k = Math.min(MAX_LIENZO, Math.max(1, Math.ceil(s - 0.001)));
  if (view.width !== W * k) {
    view.width = W * k;
    view.height = H * k;
  }
  vctx.setTransform(k, 0, 0, k, 0, 0);
  vctx.imageSmoothingEnabled = false;
  view.style.imageRendering = Number.isInteger(s) ? 'pixelated' : 'auto';
  view.style.width = `${(W * s) / dpr}px`;
  view.style.height = `${(H * s) / dpr}px`;
}

export function toLogical(clientX, clientY) {
  const r = view.getBoundingClientRect();
  const x = Math.floor(((clientX - r.left) / r.width) * W);
  const y = Math.floor(((clientY - r.top) / r.height) * H);
  // Se toca lo que se ve: la inclinación desplaza columnas, así que se descuenta.
  return { x, y: y < BANDA_HUD ? y : y - inclinacion(x) };
}

function inclinacion(x) { return Math.round(((x - W / 2) / (W / 2)) * fx.tilt); }

export function eventTarget() { return view; }

export function shake(t = 0.25) { fx.shakeT = Math.max(fx.shakeT, t); }

/** Vibración corta: al fallar, nunca al acertar. */
export function vibrar(ms = 60) {
  try { navigator.vibrate?.(ms); } catch { /* sin vibración: se juega igual */ }
}

export function present(time, dt) {
  let src = buf;
  fx.shakeT = Math.max(0, fx.shakeT - dt);
  const sx = fx.shakeT > 0 ? Math.round(Math.sin(time * 70) * 2) : 0;

  if (fx.wobble > 0 || sx) {
    tctx.fillStyle = C.carbon;
    tctx.fillRect(0, 0, W, H);
    const bh = 6;
    for (let y = 0; y < H; y += bh) {
      const off = Math.round(Math.sin(time * 1.7 + y * 0.03) * fx.wobble) + sx;
      tctx.drawImage(buf, 0, y, W, bh, off, y, W, bh);
    }
    src = tmp;
  }

  vctx.fillStyle = C.carbon;
  vctx.fillRect(0, 0, W, H);
  if (fx.tilt !== 0) {
    const bw = 6;
    for (let x = 0; x < W; x += bw) {
      vctx.drawImage(src, x, 0, bw, H, x, inclinacion(x), bw, H);
    }
    vctx.drawImage(src, 0, 0, W, BANDA_HUD, 0, 0, W, BANDA_HUD);
  } else {
    vctx.drawImage(src, 0, 0);
  }
}

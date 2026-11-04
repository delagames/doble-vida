// ¡BAILA!: Jynx canta las flechas en su idioma. Cada palabra es una dirección; cuál, cambia cada
// partida. En los primeros compases la palabra sale con su flecha y después ya nunca: ni al
// fallar se dice cuál era. Hay que confiar en la palabra.
// Jynx canta de dos en dos: cada compás es X Y X Y. Con coherencia baja, una palabra de cada
// cuatro sale mal traducida, siempre en la segunda mitad del compás. Se nota porque rompe la
// repetición y porque entra temblando; lo que vale es lo que debería haber repetido.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, H, shake, vibrar } from '../screen.js';
import { text, measure } from '../text.js';
import { bar, cifras, panel, pixelPoly, rect } from '../draw.js';
import { S, UMBRAL, barajar } from '../state.js';
import { endurece } from '../medidores.js';
import { ANTICIPO, audio, Pulso } from '../audio.js';
import { DIR, drawSprite } from '../sprites.js';
import { fondoTenue } from './dibujo.js';

const PALABRAS = ['JYN', 'LALÁ', 'UMÉ', 'KISSU'];
const TECLAS = ['Q', 'W', 'E', 'R'];
const FLECHAS = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const BOTON_Y = 392, BOTON_H = 84;
const BOTONES = [0, 1, 2, 3].map((i) => ({ x: 4 + i * 66, y: BOTON_Y, w: 64, h: BOTON_H }));
const LINEA = 340;           // donde hay que tocar
const VISTA = 3;             // golpes que se ven por delante
const BOCA = 150;            // de donde salen las palabras
const PX = (LINEA - BOCA) / VISTA;
const CUENTA = 4;            // golpes de entrada
const COMPASES = 12;         // compases puntuados
const UMBRAL_GANA = 0.7;     // el que sigue la letra mal traducida se queda justo en el 75 %
const LATENCIA = 0.08;       // como en ¡AL RITMO!: lo que tarda en llegar un toque
const MENSAJE = 0.35;

export default class Baila {
  static instruccion = '¡BAILA!';
  static ayuda = 'Toca la flecha cuando su palabra llegue a la línea. Al principio Jynx te enseña qué flecha es cada palabra; luego no. Canta de dos en dos: si algo rompe la repetición, Juanjo lo ha traducido mal.';
  static carga = ['jynx', 'juanjo'];
  static musica = null;        // la música sale del Pulso, golpe a golpe, para no desfasarse

  start() {
    this.bpm = Math.round(endurece(90, 120));
    this.p = 60 / this.bpm;
    this.ventana = endurece(0.2, 0.12);
    this.trucos = S.coherencia < UMBRAL.loca;
    this.dirDe = barajar([0, 1, 2, 3]);     // palabra -> botón
    this.notas = this.partitura();
    this.total = this.notas.filter((n) => n.puntua).length;
    this.t = 0;
    this.res = null;
    this.ok = 0;
    this.golpe = 0;
    this.mensaje = null;
    this.pulsado = [0, 0, 0, 0];
    this.pulso = new Pulso(this.bpm, {
      compas: 4,
      alBatir: () => { this.golpe = 0.12; },
      alPrever: (n, retardo) => audio.pistaBaila(n, this.p, retardo),
    });
  }

  partitura() {
    const notas = [];
    let compas = 0;
    const pon = (pos, palabra, extra = {}) => notas.push({ beat: CUENTA + compas * 4 + pos, palabra, ver: palabra, estado: null, cantada: false, ...extra });
    // Aprender: cada palabra tres veces, con su flecha.
    for (const w of barajar([0, 1, 2, 3])) {
      for (let i = 0; i < 3; i++) pon(i, w, { flecha: true });
      compas++;
    }
    // Un repaso mezclado, y se acabaron las flechas.
    barajar([0, 1, 2, 3]).forEach((w, i) => pon(i, w, { flecha: true }));
    compas++;
    for (let c = 0; c < COMPASES; c++) {
      const [x, y, ...resto] = barajar([0, 1, 2, 3]);
      const falsa = this.trucos ? 2 + (Math.random() < 0.5 ? 1 : 0) : -1;
      [x, y, x, y].forEach((w, i) => {
        const mal = i === falsa;
        pon(i, w, { puntua: true, ver: mal ? resto[0] : w, falsa: mal });
      });
      compas++;
    }
    return notas;
  }

  horaDe(n) { return n.beat * this.p; }

  update(dt) {
    this.t += dt;
    this.pulso.update(dt);
    this.golpe = Math.max(0, this.golpe - dt);
    if (this.mensaje && (this.mensaje.t -= dt) <= 0) this.mensaje = null;
    this.pulsado = this.pulsado.map((v) => Math.max(0, v - dt));
    this.canta();
    this.teclas();
    const ultima = this.notas[this.notas.length - 1];
    for (const n of this.notas) if (!n.estado && this.t > this.horaDe(n) + this.ventana) this.juzga(n, false);
    if (this.t > this.horaDe(ultima) + this.p * 2) this.res = this.ok / this.total >= UMBRAL_GANA ? 'win' : 'lose';
  }

  canta() {
    for (const n of this.notas) {
      const falta = this.horaDe(n) - this.p * VISTA - this.t;
      if (n.cantada || falta > ANTICIPO) continue;
      n.cantada = true;
      audio.canta(n.ver, Math.max(0, falta));
    }
  }

  teclas() {
    if (input.pressed) {
      const i = BOTONES.findIndex((b) => inRect(input.pressed, b));
      if (i >= 0) this.toca(i);
    }
    FLECHAS.forEach((k, i) => { if (input.hit(k)) this.toca(i); });
  }

  toca(boton) {
    this.pulsado[boton] = 0.12;
    const t = this.t - LATENCIA;
    const n = this.notas.find((q) => !q.estado && Math.abs(this.horaDe(q) - t) <= this.ventana);
    if (n) this.juzga(n, this.dirDe[n.palabra] === boton);
  }

  juzga(n, bien) {
    n.estado = bien ? 'ok' : 'mal';
    if (!n.puntua) { this.mensaje = bien ? { txt: 'ASÍ', t: MENSAJE, ok: true } : null; return; }
    if (bien) { this.ok++; this.mensaje = { txt: 'JYN', t: MENSAJE, ok: true }; return; }
    this.mensaje = { txt: 'NO', t: MENSAJE, ok: false };
    shake(0.08);
    vibrar();
  }

  result() { return this.res; }

  tarjeta(res) {
    const datos = [['ACIERTOS', `${this.ok}/${this.total}`]];
    if (res === 'win') return { titulo: '¡QUÉ PIES!', lineas: ['Jynx no se ha reído de Juanjo. Es lo más parecido a un elogio que se oye a estas horas.'], datos };
    return { titulo: 'FUERA', lineas: ['Jynx deja de cantar, baja del escenario y saca a Juanjo de la pista. De la mano. Con mucho cuidado, como a una lámpara.'], datos, coste: 0 };
  }

  // Dibujo --------------------------------------------------------------------

  draw(ctx) {
    fondoTenue(ctx, '13-onda-pasadena', 2);
    const salto = this.golpe > 0 ? 3 : 0;
    drawSprite(ctx, '0124', 'Idle', DIR.abajo, this.t * 60, W >> 1, 124 - salto, { escala: 2, sombra: true, dientes: false });
    this.pintaLinea(ctx);
    drawSprite(ctx, 'juanjo', 'Idle', DIR.abajo, this.t * 60, 34, 376 - salto, { sombra: true });
    this.pintaNotas(ctx);
    this.pintaBotones(ctx);
    this.pintaPuntos(ctx);
    if (this.mensaje) {
      const { txt, ok } = this.mensaje;
      text(ctx, txt, W - 42, 340, { font: 'bold', color: ok ? C.cian_neon : C.rosa_neon, align: 'center' });
    }
  }

  pintaLinea(ctx) {
    const y = LINEA;
    rect(ctx, 0, y - 13, W, 26, C.carbon);
    rect(ctx, 0, y - 13, W, 1, this.golpe > 0 ? C.rosa_neon : C.morado);
    rect(ctx, 0, y + 12, W, 1, this.golpe > 0 ? C.rosa_neon : C.morado);
  }

  pintaNotas(ctx) {
    const b = this.t / this.p;
    for (const n of this.notas) {
      const falta = n.beat - b;
      if (falta > VISTA || falta < -0.6 || n.estado) continue;
      const pal = PALABRAS[n.ver];
      const w = measure(pal, 'bold') + (n.flecha ? 32 : 14);
      const tiembla = n.falsa ? Math.round(Math.sin(this.t * 31) * 2) : 0;
      const x = (W >> 1) - (w >> 1) + tiembla;
      const y = Math.round(LINEA - falta * PX) - 11;
      panel(ctx, x, y, w, 22, { fill: C.marfil, edge: C.rosa_neon });
      text(ctx, pal, x + 7, y + 4, { font: 'bold', color: C.carbon });
      if (n.flecha) flecha(ctx, x + w - 21, y + 3, this.dirDe[n.palabra], C.rosa_neon, 16);
    }
  }

  pintaBotones(ctx) {
    panel(ctx, 0, BOTON_Y - 5, W, H - BOTON_Y + 5, { fill: C.carbon });
    BOTONES.forEach((r, i) => {
      const on = this.pulsado[i] > 0;
      panel(ctx, r.x, r.y, r.w, r.h, { fill: on ? C.morado : C.noche_clara, edge: on ? C.rosa_neon : C.morado });
      flecha(ctx, r.x + 14, r.y + 18, i, C.marfil, 36);
      if (this.trucos) text(ctx, TECLAS[i], r.x + (r.w >> 1), r.y + r.h - 12, { font: 'label', color: C.gris, align: 'center' });
    });
  }

  pintaPuntos(ctx) {
    const hechas = this.notas.filter((n) => n.puntua && n.estado).length;
    bar(ctx, 3, 379, W - 44, 5, hechas / this.total, C.cian_neon);
    cifras(ctx, this.ok, W - 6, 28, { escala: 2, color: C.marfil, align: 'right' });
  }
}

/** Una flecha de lado×lado. dir: 0 izquierda, 1 abajo, 2 arriba, 3 derecha. */
function flecha(ctx, x, y, dir, color, l) {
  const m = l >> 1, b = Math.max(3, l >> 2);
  const base = [[m, 0], [l, m], [m + b, m], [m + b, l], [m - b, l], [m - b, m], [0, m]];     // arriba
  const giro = { 2: (p, q) => [p, q], 1: (p, q) => [p, l - q], 0: (p, q) => [q, p], 3: (p, q) => [l - q, p] }[dir];
  pixelPoly(ctx, base.map(([p, q]) => { const [a, c] = giro(p, q); return [x + a, y + c]; }), color, C.carbon);
}

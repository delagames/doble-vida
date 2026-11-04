// ¡BAILA!: las flechas salen de Jynx y caen por cuatro carriles hasta su marca, sobre los cuatro
// botones: se toca la dirección al llegar. Cada dirección tiene su color y su nota, y Jynx canta
// esa nota en el golpe de la flecha: lo que suena sale del mismo reloj que lo que cae.
// Su idioma queda de adorno. Con coherencia baja va más rápido, entra más justo, llegan ráfagas
// a contratiempo y las flechas tiemblan. Dos compases de entrada no puntúan.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, H, shake, vibrar } from '../screen.js';
import { text } from '../text.js';
import { bar, cifras, dither, panel, pixelPoly, rect } from '../draw.js';
import { S, UMBRAL, barajar } from '../state.js';
import { endurece } from '../medidores.js';
import { ANTICIPO, audio, Pulso } from '../audio.js';
import { DIR, drawSprite } from '../sprites.js';
import { fondoTenue } from './dibujo.js';

const CANTO = ['JYN', 'LALÁ', 'UMÉ', 'KISSU'];      // solo sabor
const FLECHAS = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const BOTON_Y = 392, BOTON_H = 84;
const BOTONES = [0, 1, 2, 3].map((i) => ({ x: 4 + i * 66, y: BOTON_Y, w: 64, h: BOTON_H }));
const LADO = 40;             // lo que mide una flecha
const LINEA = 340;           // donde hay que tocar
const VISTA = 3;             // golpes que se ven por delante
const BOCA = 134;            // de donde salen las flechas
const PX = (LINEA - BOCA) / VISTA;
const CUENTA = 4;            // golpes de entrada
const ENTRADA = 2;           // compases sin puntuar
const COMPASES = 12;         // compases puntuados
const UMBRAL_GANA = 0.7;
const LATENCIA = 0.08;       // como en ¡AL RITMO!: lo que tarda en llegar un toque
const MENSAJE = 0.35;

export default class Baila {
  static instruccion = '¡BAILA!';
  static ayuda = 'Las flechas caen por cuatro carriles. Toca el botón de esa flecha, abajo, justo cuando llega a su marca. Cada dirección tiene su color. Falla demasiadas y Jynx te saca de la pista.';
  static carga = ['jynx', 'juanjo'];
  static musica = null;        // la música sale del Pulso, golpe a golpe, para no desfasarse

  start() {
    this.bpm = Math.round(endurece(90, 120));
    this.p = 60 / this.bpm;
    this.ventana = endurece(0.2, 0.12);
    // Cada cuántos compases llega una ráfaga; 0, ninguna.
    this.cada = S.coherencia < UMBRAL.baila ? 1 : S.coherencia < UMBRAL.loca ? 2 : S.coherencia < UMBRAL.inclina ? 4 : 0;
    this.tiembla = endurece(0, 4);
    this.notas = this.partitura();
    this.total = this.notas.filter((n) => n.puntua).length;
    this.t = 0;
    this.res = null;
    this.ok = 0;
    this.golpe = 0;
    this.mensaje = null;
    this.canto = null;
    this.pulsado = [0, 0, 0, 0];
    this.brillo = [0, 0, 0, 0];
    this.pulso = new Pulso(this.bpm, {
      compas: 4,
      alBatir: () => { this.golpe = 0.12; },
      alPrever: (n, retardo) => audio.pistaBaila(n, this.p, retardo),
    });
  }

  partitura() {
    const notas = [];
    let ultima = -1;
    const otra = () => { ultima = barajar([0, 1, 2, 3].filter((d) => d !== ultima))[0]; return ultima; };
    const pon = (compas, pos, puntua) => notas.push({ beat: CUENTA + compas * 4 + pos, dir: otra(), puntua, estado: null, cantada: false, fase: Math.random() * 6 });
    for (let c = 0; c < ENTRADA; c++) for (let i = 0; i < 4; i++) pon(c, i, false);
    for (let c = 0; c < COMPASES; c++) {
      const rafaga = this.cada && (c + 1) % this.cada === 0;
      for (const q of rafaga ? [0, 1, 2, 2.5, 3, 3.5] : [0, 1, 2, 3]) pon(ENTRADA + c, q, true);
    }
    return notas;
  }

  horaDe(n) { return n.beat * this.p; }

  update(dt) {
    this.t += dt;
    this.pulso.update(dt);
    this.golpe = Math.max(0, this.golpe - dt);
    if (this.mensaje && (this.mensaje.t -= dt) <= 0) this.mensaje = null;
    if (this.canto && (this.canto.t -= dt) <= 0) this.canto = null;
    this.pulsado = this.pulsado.map((v) => Math.max(0, v - dt));
    this.brillo = this.brillo.map((v) => Math.max(0, v - dt));
    this.canta();
    this.teclas();
    const ultima = this.notas[this.notas.length - 1];
    for (const n of this.notas) if (!n.estado && this.t > this.horaDe(n) + this.ventana + LATENCIA) this.juzga(n, false);
    if (this.t > this.horaDe(ultima) + this.p * 2) this.res = this.ok / this.total >= UMBRAL_GANA ? 'win' : 'lose';
  }

  /** Cada flecha suena en su golpe, con su nota, la toques o no. */
  canta() {
    for (const n of this.notas) {
      const falta = this.horaDe(n) - this.t;
      if (n.cantada || falta > ANTICIPO) continue;
      n.cantada = true;
      audio.canta(n.dir, Math.max(0, falta));
      this.canto = { txt: CANTO[n.dir], t: 0.2 };
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
    const cerca = this.notas.filter((q) => !q.estado && Math.abs(this.horaDe(q) - t) <= this.ventana)
      .sort((a, b) => Math.abs(this.horaDe(a) - t) - Math.abs(this.horaDe(b) - t));
    const n = cerca.find((q) => q.dir === boton) ?? cerca[0];     // en una ráfaga, la de su carril
    if (n) this.juzga(n, n.dir === boton);
  }

  juzga(n, bien) {
    n.estado = bien ? 'ok' : 'mal';
    if (bien) this.brillo[n.dir] = 0.14;
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
    drawSprite(ctx, 'juanjo', 'Idle', DIR.abajo, this.t * 60, 40, 124 - salto, { sombra: true });
    if (this.canto) text(ctx, this.canto.txt, 214, 66, { font: 'bold', color: C.gris, align: 'center' });
    this.pintaCarriles(ctx);
    this.pintaNotas(ctx);
    this.pintaBotones(ctx);
    this.pintaPuntos(ctx);
    if (this.mensaje) {
      const { txt, ok } = this.mensaje;
      text(ctx, txt, W >> 1, 363, { font: 'bold', color: ok ? C.cian_neon : C.rosa_neon, align: 'center' });
    }
  }

  pintaCarriles(ctx) {
    dither(ctx, 0, BOCA, W, H - BOCA, C.carbon, 2);
    const y = LINEA - (LADO >> 1) - 3;
    rect(ctx, 0, y, W, LADO + 6, C.carbon);
    rect(ctx, 0, y, W, 1, this.golpe > 0 ? C.rosa_neon : C.morado);
    rect(ctx, 0, y + LADO + 5, W, 1, this.golpe > 0 ? C.rosa_neon : C.morado);
    BOTONES.forEach((r, i) => {
      const color = this.brillo[i] > 0 ? color_(i) : this.pulsado[i] > 0 ? C.gris : C.noche_clara;
      flecha(ctx, r.x + 12, LINEA - (LADO >> 1), i, color, LADO);
    });
  }

  pintaNotas(ctx) {
    const b = this.t / this.p;
    for (const n of this.notas) {
      const falta = n.beat - b;
      if (falta > VISTA || falta < -0.6 || n.estado === 'ok') continue;
      const dx = Math.round(Math.sin(this.t * 33 + n.fase) * this.tiembla);
      const dy = Math.round(Math.cos(this.t * 27 + n.fase) * this.tiembla * 0.5);
      const y = Math.round(LINEA - falta * PX) - (LADO >> 1) + dy;
      flecha(ctx, BOTONES[n.dir].x + 12 + dx, y, n.dir, n.estado === 'mal' ? C.gris : color_(n.dir), LADO);
    }
  }

  pintaBotones(ctx) {
    panel(ctx, 0, BOTON_Y - 5, W, H - BOTON_Y + 5, { fill: C.carbon });
    BOTONES.forEach((r, i) => {
      const on = this.pulsado[i] > 0;
      panel(ctx, r.x, r.y, r.w, r.h, { fill: on ? C.morado : C.noche_clara, edge: on ? C.marfil : color_(i) });
      flecha(ctx, r.x + 10, r.y + 20, i, color_(i), 44);
    });
  }

  pintaPuntos(ctx) {
    const hechas = this.notas.filter((n) => n.puntua && n.estado).length;
    bar(ctx, 3, 379, W - 6, 5, hechas / this.total, C.cian_neon);
    cifras(ctx, this.ok, W - 6, 28, { escala: 2, color: C.marfil, align: 'right' });
  }
}

/** Izquierda, abajo, arriba, derecha: se leen por el color antes que por la forma. */
function color_(dir) { return [C.rosa_neon, C.cian_neon, C.verde_ipa, C.amarillo_mural][dir]; }

/** Una flecha de lado×lado. dir: 0 izquierda, 1 abajo, 2 arriba, 3 derecha. */
function flecha(ctx, x, y, dir, color, l) {
  const m = l >> 1, b = Math.max(3, l >> 2);
  const base = [[m, 0], [l, m], [m + b, m], [m + b, l], [m - b, l], [m - b, m], [0, m]];     // arriba
  const giro = { 2: (p, q) => [p, q], 1: (p, q) => [p, l - q], 0: (p, q) => [q, p], 3: (p, q) => [l - q, p] }[dir];
  pixelPoly(ctx, base.map(([p, q]) => { const [a, c] = giro(p, q); return [x + a, y + c]; }), color, C.carbon);
}

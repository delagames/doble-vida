// ¡SAL!: la nube del extintor. Arrastrar a Juanjo por una pantalla casi blanca hasta la salida,
// que no se ve. Lo que se ve son siluetas a medio metro. La salida late: un golpe de sonido y
// un pulso de luz, cada vez más seguidos cuanto más cerca. Por eso se juega igual en silencio.
// Con sonido además va a izquierda o derecha, pero no hace falta.
// Fallar no para nada: se sale igual. Los dos tragos del bar del hotel van en night.json.
import { C } from '../assets.js';
import { W, H, shake } from '../screen.js';
import { text, measure } from '../text.js';
import { cifras, dither, panel, pixelLine, rect } from '../draw.js';
import { barajar } from '../state.js';
import { endurece, sumarTejo } from '../medidores.js';
import { audio } from '../audio.js';
import { DIR, drawSilueta, drawSprite } from '../sprites.js';
import { Dedo, rumbo } from './dedo.js';

const TIEMPO = 40;
const ZONA = { x: 10, y: 46, w: 250, h: 424 };
const R_YO = 6;
const PUERTA = 40;                 // largo de la salida
const COLS = 3, FILAS = 4;         // un escombro por celda: siempre queda paso entre ellos
// Golpes de la salida: a pasos, para que el salto de ritmo al acercarse se note.
const LEJOS = 56;                  // píxeles por escalón
const PERIODOS = [0.15, 0.22, 0.32, 0.44, 0.6, 0.8, 1.05];
const CHOQUE = 15;

const azar = (a, b) => a + Math.random() * (b - a);

export default class Sal {
  static instruccion = '¡SAL!';
  static ayuda = 'El Zorro ha disparado el extintor. Arrastra a Juanjo: el dedo puede ir donde quieras. La salida no se ve, pero late: el borde y un anillo laten más rápido cuanto más cerca estás. Tienes 40 segundos. Lo que choca contigo te empuja.';
  static carga = ['juanjo', 'manolo', 'gengar', 'zorro', 'buitre', 'jairo'];
  static musica = null;        // dentro de la nube solo se oye el faro de la salida

  start() {
    this.vista = endurece(62, 36);                   // el medio metro
    this.vel = endurece(74, 58);
    this.empuje = endurece(110, 190);
    const n = Math.round(endurece(5, 9));

    this.t = 0;
    this.res = null;
    this.yo = { x: ZONA.x + ZONA.w / 2, y: ZONA.y + ZONA.h - 16, dir: DIR.arriba, vx: 0, vy: 0 };
    this.dedo = new Dedo(this.yo.x, this.yo.y);
    this.andando = false;
    this.anim = 0;
    this.salida = this.ponSalida();
    this.bloques = this.ponEscombros();
    this.nube = Array.from({ length: 7 }, () => ({ x: azar(0, W), y: azar(30, H), w: azar(70, 150), h: azar(30, 80), v: azar(5, 16) }));
    const quien = ['0067', '0094', '0571', '0630'];
    this.bichos = Array.from({ length: n }, (_, i) => this.ponBicho(quien[i % quien.length]));
    this.grande = this.ponGrande();
    this.tocada = false;
    this.faro = 0.4;
    this.nivel = 6;
    this.ritmo = PERIODOS[6];        // lo que hay entre golpes: los bots ciegos solo leen esto
    this.golpes = 0;
    this.anillos = [];
    this.borde = 0;
    this.pum = null;
  }

  /** La salida va arriba o en la mitad alta de un lado: siempre lejos de donde se empieza. */
  ponSalida() {
    const lado = barajar(['arriba', 'arriba', 'izquierda', 'derecha'])[0];
    if (lado === 'arriba') {
      const x = azar(ZONA.x + 10, ZONA.x + ZONA.w - PUERTA - 10);
      return { lado, x, y: ZONA.y - 4, w: PUERTA, h: 8, cx: x + PUERTA / 2, cy: ZONA.y };
    }
    const y = azar(ZONA.y + 10, ZONA.y + ZONA.h * 0.45);
    const x = lado === 'izquierda' ? ZONA.x - 4 : ZONA.x + ZONA.w - 4;
    return { lado, x, y, w: 8, h: PUERTA, cx: lado === 'izquierda' ? ZONA.x : ZONA.x + ZONA.w, cy: y + PUERTA / 2 };
  }

  ponEscombros() {
    const b = [];
    const cw = ZONA.w / COLS, ch = ZONA.h / FILAS;
    for (let j = 0; j < FILAS; j++) {
      for (let i = 0; i < COLS; i++) {
        const w = Math.round(azar(22, 42)), h = Math.round(azar(14, 28));
        const x = Math.round(ZONA.x + i * cw + azar(4, cw - w - 4)), y = Math.round(ZONA.y + j * ch + azar(4, ch - h - 4));
        const cx = x + w / 2, cy = y + h / 2;
        if (Math.hypot(cx - this.yo.x, cy - this.yo.y) < 56) continue;
        if (Math.hypot(cx - this.salida.cx, cy - this.salida.cy) < 56) continue;
        b.push({ x, y, w, h });
      }
    }
    return b;
  }

  ponBicho(id) {
    let x, y;
    do {
      x = azar(ZONA.x + 8, ZONA.x + ZONA.w - 8);
      y = azar(ZONA.y + 8, ZONA.y + ZONA.h - 8);
    } while (Math.hypot(x - this.yo.x, y - this.yo.y) < 110);
    return { id, x, y, dir: DIR.abajo, ang: azar(0, 6.28), reloj: azar(0.5, 2), v: azar(26, 40), golpe: 0 };
  }

  /** La silueta enorme que baila. Nadie la explica. */
  ponGrande() {
    return { x: azar(ZONA.x + 50, ZONA.x + ZONA.w - 50), y: azar(ZONA.y + 130, ZONA.y + 270), fase: 0 };
  }

  // Juego ---------------------------------------------------------------------

  libre(x, y) {
    if (x < ZONA.x || x > ZONA.x + ZONA.w || y < ZONA.y || y > ZONA.y + ZONA.h) return false;
    return !this.bloques.some((b) => x > b.x - R_YO && x < b.x + b.w + R_YO && y > b.y - R_YO && y < b.y + b.h + R_YO);
  }

  update(dt) {
    this.t += dt;
    this.anim += dt;
    const { yo } = this;
    const x0 = yo.x, y0 = yo.y;
    const libre = (x, y) => this.libre(x, y);
    this.andando = this.dedo.mueve(yo, dt, this.vel, libre, ZONA);
    if (yo.vx || yo.vy) this.empujado(dt);
    yo.dir = rumbo(yo.x - x0, yo.y - y0, yo.dir);
    this.mueveBichos(dt);
    this.mueveGrande(dt);
    this.late(dt);
    for (const n of this.nube) { n.x += n.v * dt; if (n.x > W) n.x = -n.w; }
    if (this.pum && (this.pum.t -= dt) <= 0) this.pum = null;
    const s = this.salida;
    if (yo.x > s.x - 12 && yo.x < s.x + s.w + 12 && yo.y > s.y - 12 && yo.y < s.y + s.h + 12) this.res = 'win';
    else if (this.t >= TIEMPO) this.res = 'lose';
  }

  empujado(dt) {
    const { yo } = this;
    const nx = yo.x + yo.vx * dt, ny = yo.y + yo.vy * dt;
    if (this.libre(nx, yo.y)) yo.x = nx;
    if (this.libre(yo.x, ny)) yo.y = ny;
    yo.vx *= Math.exp(-6 * dt);
    yo.vy *= Math.exp(-6 * dt);
    if (Math.hypot(yo.vx, yo.vy) < 6) { yo.vx = 0; yo.vy = 0; }
    this.dedo.reubica(yo);
  }

  mueveBichos(dt) {
    const { yo } = this;
    for (const b of this.bichos) {
      b.golpe = Math.max(0, b.golpe - dt);
      if ((b.reloj -= dt) <= 0) { b.reloj = azar(0.8, 2.4); b.ang = azar(0, 6.28); }
      const dx = Math.cos(b.ang) * b.v * dt, dy = Math.sin(b.ang) * b.v * dt;
      b.x += dx; b.y += dy;
      if (b.x < ZONA.x || b.x > ZONA.x + ZONA.w) { b.ang = Math.PI - b.ang; b.x = Math.max(ZONA.x, Math.min(ZONA.x + ZONA.w, b.x)); }
      if (b.y < ZONA.y || b.y > ZONA.y + ZONA.h) { b.ang = -b.ang; b.y = Math.max(ZONA.y, Math.min(ZONA.y + ZONA.h, b.y)); }
      b.dir = rumbo(dx, dy, b.dir);
      const d = Math.hypot(b.x - yo.x, b.y - yo.y);
      if (d < CHOQUE && !b.golpe) this.choca(b, d);
    }
  }

  choca(b, d) {
    const { yo } = this;
    const k = d > 0.1 ? 1 / d : 0;
    yo.vx = (yo.x - b.x) * k * this.empuje;
    yo.vy = (yo.y - b.y) * k * this.empuje;
    b.golpe = 1.2;
    this.pum = { t: 0.5, x: Math.round(yo.x), y: Math.round(yo.y) - 34 };
    audio.toque();
    shake(0.1);
  }

  mueveGrande(dt) {
    const g = this.grande;
    g.fase += dt;
    if (this.tocada) return;
    if (Math.hypot(g.x + Math.sin(g.fase * 4) * 8 - this.yo.x, g.y - this.yo.y) < 26) {
      this.tocada = true;
      sumarTejo({ who: 'silueta', foto: 'blanca', pie: 'Alta. Fuerte. Me ha mirado.', real: 'Nadie sabe qué era eso.' });
    }
  }

  late(dt) {
    const { yo, salida: s } = this;
    const d = Math.hypot(s.cx - yo.x, s.cy - yo.y);
    this.nivel = Math.min(PERIODOS.length - 1, Math.floor(d / LEJOS));
    this.ritmo = PERIODOS[this.nivel];
    for (const a of this.anillos) a.t += dt;
    this.anillos = this.anillos.filter((a) => a.t < 0.36);
    this.borde = Math.max(0, this.borde - dt);
    this.faro = Math.min(this.faro - dt, this.ritmo);
    if (this.faro > 0) return;
    this.faro = this.ritmo;
    this.golpes++;
    this.anillos.push({ t: 0 });
    this.borde = 0.08;
    audio.faro(1 - this.nivel / (PERIODOS.length - 1), Math.max(-1, Math.min(1, (s.cx - yo.x) / 130)));
  }

  result() { return this.res; }

  tarjeta(res) {
    if (res === 'win') {
      return { titulo: '¡FUERA!', lineas: ['Juanjo sale de la nube. Es la puerta de la lavandería, pero es una puerta.'], datos: [['SEGUNDOS', Math.ceil(this.t)]] };
    }
    return { titulo: 'SALES IGUAL', lineas: ['Juanjo encuentra el bar del hotel: una caja con dos botellas. Dos tragos. Por el susto.', 'Sale detrás de un olor a Manolo.'], coste: 0 };
  }

  // Dibujo --------------------------------------------------------------------

  draw(ctx) {
    rect(ctx, 0, 25, W, H - 25, C.blanco_extintor);
    dither(ctx, 0, 25, W, H - 25, C.marfil, 2);
    this.pintaNube(ctx);
    this.pintaSalida(ctx);
    this.pintaEscombros(ctx);
    this.pintaBichos(ctx);
    const { yo } = this;
    drawSprite(ctx, 'juanjo', this.andando ? 'Walk' : 'Idle', yo.dir, this.anim * 60, yo.x, yo.y + 6);
    this.pintaFaro(ctx);
    if (this.pum) {
      const w = measure('¡EH!', 'bold') + 10;
      panel(ctx, Math.max(2, Math.min(W - w - 2, this.pum.x - (w >> 1))), this.pum.y, w, 19, { fill: C.carbon, edge: C.rosa_neon });
      text(ctx, '¡EH!', Math.max(2 + (w >> 1), Math.min(W - 2 - (w >> 1), this.pum.x)), this.pum.y + 3, { font: 'bold', color: C.marfil, align: 'center' });
    }
    this.pintaReloj(ctx);
  }

  pintaNube(ctx) {
    for (const n of this.nube) dither(ctx, n.x, n.y, n.w, n.h, C.gris, 1);
  }

  cerca(x, y, r) { return Math.hypot(x - this.yo.x, y - this.yo.y) < r; }

  pintaSalida(ctx) {
    const s = this.salida;
    if (!this.cerca(s.cx, s.cy, this.vista * 1.6)) return;
    rect(ctx, s.x, s.y, s.w, s.h, C.carbon);
    rect(ctx, s.x + 1, s.y + 1, s.w - 2, s.h - 2, C.verde_ipa);
    const w = measure('SALIDA', 'label') + 8;
    const x = Math.max(2, Math.min(W - w - 2, Math.round(s.cx - w / 2)));
    const y = s.lado === 'arriba' ? s.y + 11 : Math.round(s.cy - 6);
    rect(ctx, x, y, w, 12, C.jager);
    text(ctx, 'SALIDA', x + 4, y + 2, { font: 'label', color: C.marfil });
  }

  pintaEscombros(ctx) {
    for (const b of this.bloques) {
      const cx = Math.max(b.x, Math.min(b.x + b.w, this.yo.x)), cy = Math.max(b.y, Math.min(b.y + b.h, this.yo.y));
      if (!this.cerca(cx, cy, this.vista)) continue;
      rect(ctx, b.x, b.y, b.w, b.h, C.gris);
      dither(ctx, b.x, b.y + b.h - 4, b.w, 4, C.carbon, 2);
    }
  }

  pintaBichos(ctx) {
    const a = this.anim * 60;
    for (const b of this.bichos) {
      if (this.cerca(b.x, b.y, this.vista)) drawSilueta(ctx, b.id, 'Walk', b.dir, a, b.x, b.y + 8, C.gris);
    }
    const g = this.grande;
    const gx = g.x + Math.sin(g.fase * 4) * 8;
    if (this.cerca(gx, g.y, this.vista * 1.5)) drawSilueta(ctx, '0068', 'Idle', DIR.abajo, a, gx, g.y + 24, C.gris, { escala: 3 });
  }

  /** El aviso de la salida, para quien no la oye: borde que parpadea y anillo desde Juanjo. */
  pintaFaro(ctx) {
    const { x, y } = this.yo;
    for (const a of this.anillos) {
      const r = 10 + (a.t / 0.36) * 34;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const nx = Math.round(x + Math.cos(ang) * r), ny = Math.round(y - 6 + Math.sin(ang) * r);
        rect(ctx, nx, ny, 2, 2, C.rosa_neon);
      }
    }
    if (this.borde > 0) {
      pixelLine(ctx, 1, 27, W - 2, 27, C.rosa_neon, 3);
      pixelLine(ctx, 1, H - 2, W - 2, H - 2, C.rosa_neon, 3);
      pixelLine(ctx, 1, 27, 1, H - 2, C.rosa_neon, 3);
      pixelLine(ctx, W - 2, 27, W - 2, H - 2, C.rosa_neon, 3);
    }
  }

  pintaReloj(ctx) {
    const queda = Math.max(0, Math.ceil(TIEMPO - this.t));
    panel(ctx, (W >> 1) - 18, 28, 36, 17, { fill: C.carbon, edge: queda <= 10 ? C.rojo_extintor : C.morado });
    cifras(ctx, queda, W >> 1, 32, { escala: 2, color: queda <= 10 ? C.rojo_extintor : C.marfil, align: 'center' });
  }
}

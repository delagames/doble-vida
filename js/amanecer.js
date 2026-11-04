// El amanecer: la capa que sigue viva sobre el fondo 14 mientras sale el sol. La luz nace en el
// horizonte y se abre con tramas, sin alfa; encima, el sol, su reflejo, la boya y Manolo nadando.
// También la usan los créditos del final Doble vida, ya de día (`dia`).
//   {"t":"amanecer","lejos":false}         pone la capa. lejos: se ve desde el banco del paseo.
//   {"t":"boya","fase":"entra","hasta":.5} espera a que Manolo llegue a esa parte del camino.
//   {"t":"boya","fase":"vuelve"}           vuelve nadando y sale del agua, con el alga.
import { C, rgbDe } from './assets.js';
import { W } from './screen.js';
import { input } from './input.js';
import { enTrama, rect } from './draw.js';
import { registrarOps } from './night.js';
import { DIR, drawSprite } from './sprites.js';
import { pintaAmbiente } from './ambiente.js';

const FONDO = '14-malagueta-amanecer';
const DURA = 62;                            // lo que tarda en hacerse de día
const SOL = { x: 126, r: 15, desde: 256, hasta: 228 };
const HORIZONTE = 240;
const BOYA = { x: 226, y: 240 };
const ORILLA = { x: 120, y: 301 };          // aquí deja de andar y empieza a nadar
const ARENA = { x: 104, y: 346 };
const LEJOS = { orilla: { x: 118, y: 300 }, arena: { x: 104, y: 312 } };
const VEL_NADO = 0.08, VEL_ANDA = 26;
const TRAMA = 8;

const VELO_H = 384;
const mezcla = (a, b, f) => a + (b - a) * f;

export class Amanecer {
  constructor({ lejos = false, dia = false } = {}) {
    this.t = dia ? DURA : 0;
    this.lejos = lejos;
    this.dia = dia;
    this.fase = dia ? 'nada' : 'quieto';     // quieto, anda, nada, boya, vuelve, sale, fuera
    this.f = 0;                  // de la orilla (0) a la boya (1)
    this.alga = false;
    const a = lejos ? LEJOS.arena : ARENA;
    this.m = { x: a.x, y: a.y };
    if (dia) this.fase = 'fuera';
  }

  get p() { return Math.min(1, this.t / DURA); }

  get orilla() { return this.lejos ? LEJOS.orilla : ORILLA; }

  get escala() { return this.lejos ? 1 : 2; }

  /** Manolo echa a andar hacia el agua, o vuelve de ella. */
  entra() { if (this.fase === 'quieto') this.fase = 'anda'; }

  vuelve() { this.fase = 'vuelve'; this.alga = true; }

  update(dt) {
    // Con el dedo puesto se adelanta, para quien ya la ha visto otras noches.
    const v = dt * (input.p() ? 3 : 1);
    this.t += v;
    if (this.fase === 'anda') {
      if (this.acercar(this.orilla, v)) this.fase = 'nada';
    } else if (this.fase === 'nada') {
      this.f = Math.min(1, this.f + v * VEL_NADO * (this.lejos ? 2 : 1));
      if (this.f >= 1) this.fase = 'boya';
    } else if (this.fase === 'vuelve') {
      this.f = Math.max(0, this.f - v * VEL_NADO * 2);
      if (this.f <= 0) { this.fase = 'sale'; Object.assign(this.m, this.orilla); }
    } else if (this.fase === 'sale') {
      const a = this.lejos ? LEJOS.arena : ARENA;
      if (this.acercar({ x: a.x, y: a.y }, v)) this.fase = 'fin';
    }
  }

  acercar(q, dt) {
    const { m } = this;
    const dx = q.x - m.x, dy = q.y - m.y;
    const d = Math.hypot(dx, dy), paso = VEL_ANDA * dt;
    if (d <= paso) { m.x = q.x; m.y = q.y; return true; }
    m.x += (dx / d) * paso;
    m.y += (dy / d) * paso;
    return false;
  }

  draw(ctx) {
    pintaAmbiente(ctx, FONDO);
    this.velo(ctx);
    this.sol(ctx);
    this.reflejo(ctx);
    this.boya(ctx);
    this.manolo(ctx);
  }

  /**
   * La noche que se retira: bloques de trama, más finos cuanto más cerca del sol. Son unos mil
   * bloques, así que se calculan aparte, píxel a píxel y unas pocas veces por segundo, y luego
   * solo se copian. Miles de rellenos con patrón por segundo fueron lo que más pesaba aquí.
   */
  velo(ctx) {
    const { p } = this;
    if (p >= 1) return;
    const paso = Math.floor(p * DURA * 5);
    if (paso !== this.pasoVelo) {
      this.pasoVelo = paso;
      this.pintaVelo(p);
    }
    ctx.drawImage(this.lienzo, 0, 0);
  }

  pintaVelo(p) {
    if (!this.lienzo) {
      this.lienzo = document.createElement('canvas');
      this.lienzo.width = W;
      this.lienzo.height = VELO_H;
      this.vctx = this.lienzo.getContext('2d', { willReadFrequently: true });
      this.pixeles = this.vctx.createImageData(W, VELO_H);
      this.tinta = new Uint32Array(this.pixeles.data.buffer);
      const [r, g, b] = rgbDe(C.noche);
      this.color = (255 * 2 ** 24) + (b << 16) + (g << 8) + r;     // bytes al revés: RGBA en memoria
    }
    const { tinta, color } = this;
    tinta.fill(0);
    const radio = -70 + p * 520;
    for (let j = 24; j < VELO_H; j += TRAMA) {
      for (let i = 0; i < W; i += TRAMA) {
        const d = Math.hypot(i - SOL.x, (j - HORIZONTE) * 1.5) + ((i * 7 + j * 13) % 23);
        const nivel = Math.min(3, Math.ceil((d - radio) / 60));
        if (nivel <= 0) continue;
        for (let y = j; y < j + TRAMA && y < VELO_H; y++) {
          for (let x = i; x < i + TRAMA && x < W; x++) if (enTrama(nivel, x, y)) tinta[y * W + x] = color;
        }
      }
    }
    this.vctx.putImageData(this.pixeles, 0, 0);
  }

  sol(ctx) {
    const f = 1 - (1 - this.p) ** 2;
    const cy = Math.round(mezcla(SOL.desde, SOL.hasta, f));
    for (let y = cy - SOL.r; y <= cy + SOL.r && y < HORIZONTE; y++) {
      const a = Math.round(Math.sqrt(SOL.r * SOL.r - (y - cy) ** 2));
      rect(ctx, SOL.x - a, y, a * 2 + 1, 1, C.naranja_farola);
      if (a > 2) rect(ctx, SOL.x - a + 2, y, a * 2 - 3, 1, C.amarillo_mural);
    }
  }

  /** El camino de luz en el agua: se ensancha al subir el sol y tiembla. */
  reflejo(ctx) {
    const { p, t } = this;
    if (p < 0.15) return;
    for (let k = 0; k < 11; k++) {
      const y = HORIZONTE + 2 + k * 5;
      const ancho = Math.round((3 + k) * Math.min(1, p * 1.5));
      for (let n = -1; n <= 1; n++) {
        const x = Math.round(SOL.x + n * ancho * 1.6 + Math.sin(t * 1.3 + k * 1.9 + n) * (2 + k * 0.3));
        rect(ctx, x - (ancho >> 1), y, ancho, 1, n ? C.amanecer : C.amarillo_mural);
      }
    }
  }

  boya(ctx) {
    const y = BOYA.y + (Math.sin(this.t * 1.2) > 0 ? 1 : 0);
    const x = BOYA.x;
    rect(ctx, x - 3, y - 10, 7, 11, C.carbon);
    rect(ctx, x - 2, y - 9, 5, 9, C.rojo_extintor);
    rect(ctx, x - 2, y - 6, 5, 2, C.marfil);
    rect(ctx, x - 5, y, 11, 2, C.carbon);
    rect(ctx, x - 4, y, 9, 1, C.gris);
    rect(ctx, x, y - 13, 1, 3, C.carbon);
    rect(ctx, x - 6, y + 3, 13, 1, C.azul_claro);
  }

  manolo(ctx) {
    const { fase } = this;
    if (fase === 'fuera') return;
    if (fase === 'nada' || fase === 'boya' || fase === 'vuelve') { this.nadador(ctx); return; }
    const anda = fase === 'anda' || fase === 'sale';
    const dir = fase === 'sale' ? DIR.abajo : DIR.arriba;
    const { x, y } = this.m;
    // Se mete en el agua poco a poco: el mar le va cortando las piernas.
    const agua = this.orilla.y + 8 * this.escala;
    const mojado = fase === 'anda' && y < agua;
    if (mojado) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, Math.round(y - (agua - y) * 0.6));
      ctx.clip();
    }
    drawSprite(ctx, '0067', anda ? 'Walk' : 'Idle', dir, this.t * 60, x, y, { escala: this.escala, sombra: !mojado });
    if (mojado) ctx.restore();
    if (this.alga) this.pintaAlga(ctx, Math.round(x), Math.round(y - 30 * this.escala), this.escala);
  }

  /** Crónicas: Manolo cubierto de algas. Una, en la calva. */
  pintaAlga(ctx, x, y, e) {
    rect(ctx, x - 5 * e, y, 10 * e, 2 * e, C.carbon);
    rect(ctx, x - 4 * e, y, 8 * e, e, C.verde_ipa);
    rect(ctx, x + 3 * e, y + e, 2 * e, 5 * e, C.jager);
  }

  /** Un punto en el mar. Cuanto más lejos, menos Manolo. */
  nadador(ctx) {
    const { f, t } = this;
    const o = this.orilla;
    const fin = { x: BOYA.x - 7, y: BOYA.y + 1 };
    const x = Math.round(mezcla(o.x, fin.x, f));
    const y = Math.round(mezcla(o.y, fin.y, f ** 0.8));
    const e = this.lejos || f > 0.55 ? 1 : 2;
    const brazo = Math.floor(t * 3) % 2;
    if (this.fase !== 'boya') {
      for (let i = 1; i <= 3; i++) rect(ctx, x - i * 5 * e, y + e * 2 + (i % 2), 3 * e, 1, C.marfil);
    }
    const saluda = this.fase === 'boya' && this.brazoArriba;
    if (saluda) {
      rect(ctx, x + 3, y - 6, 3, 7, C.carbon);
      rect(ctx, x + 4, y - 5, 1, 6, C.gris);
    }
    rect(ctx, x - 2 * e, y - 2 * e, 4 * e + 1, 3 * e + 1, C.carbon);
    rect(ctx, x - 2 * e + 1, y - 2 * e + 1, 4 * e - 1, 3 * e - 1, C.gris);
    rect(ctx, x - 2 * e + 1, y - 2 * e + 1, 2 * e - 1, e, C.marfil);
    if (this.fase !== 'boya') rect(ctx, x + (brazo ? 3 * e : -4 * e), y - e, 2 * e, e, C.gris);
    rect(ctx, x - 4 * e, y + e + 1, 8 * e + 1, 1, C.azul_claro);
  }
}

/** Actividad: espera a Manolo. No hay caja: este rato solo se mira. */
class EsperaBoya {
  constructor(a, listo) { this.a = a; this.listo = listo; }

  get done() { return this.listo(this.a); }

  update() {}

  draw() {}
}

registrarOps({
  amanecer(r, s) { r.capa = new Amanecer(s); },
  boya(r, s) {
    const a = r.capa;
    if (!(a instanceof Amanecer)) return;   // nunca se espera a una capa que no existe
    if (s.fase === 'saluda') { a.brazoArriba = s.v !== false; return; }
    if (s.fase === 'vuelve') {
      a.vuelve();
      r.wait = new EsperaBoya(a, (q) => q.fase === 'fin');
      return;
    }
    a.entra();
    const hasta = s.hasta ?? 1;
    r.wait = new EsperaBoya(a, (q) => q.fase === 'boya' || (q.fase === 'nada' && q.f >= hasta));
  },
});

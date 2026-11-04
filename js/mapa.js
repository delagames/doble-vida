// Mapa simple del centro de Málaga entre paradas: el norte arriba, la ruta marcada
// y un coche que avanza solo por el tramo. Datos en data/mapa.json.
import { C } from './assets.js';
import { input } from './input.js';
import { W, H } from './screen.js';
import { text } from './text.js';
import { dither, panel, pixelLine, pixelPoly, rect } from './draw.js';
import { G } from './game.js';

const TOP = 25, BOTTOM = 384;
const VEL = 70;
let base = null;

function trazo(x, pts, color, grosor, dash) {
  pts.forEach((q, i) => { if (i) pixelLine(x, pts[i - 1][0], pts[i - 1][1], q[0], q[1], color, grosor, dash); });
}

function pintaBase() {
  const m = G.data.mapa;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  rect(x, 0, 0, W, H, C.noche);
  dither(x, 0, TOP, W, BOTTOM - TOP, C.noche_clara, 1);
  pixelPoly(x, m.mar, C.azul_mar, C.azul_claro);
  m.tierra.forEach((t) => pixelPoly(x, t.p, C[t.color], t.borde ? C[t.borde] : null));
  m.calles.forEach((l) => trazo(x, l.p, C[l.color], l.grosor ?? 1));
  trazo(x, m.rio, C.carbon, 7);
  trazo(x, m.rio, C.azul_mar, 5);
  trazo(x, m.rio, C.azul_claro, 1, 2);
  m.etiquetas.forEach((e) => text(x, e.txt, e.x, e.y, { font: 'label', color: C[e.color] ?? C.gris, shadow: C.carbon }));
  return c;
}

function cochecito(ctx, x, y) {
  rect(ctx, x - 5, y - 3, 11, 7, C.carbon);
  rect(ctx, x - 4, y - 2, 9, 5, C.rosa_neon);
  rect(ctx, x - 1, y - 2, 3, 5, C.marfil);
}

/** Tramo del mapa: `de` y `a` son hitos con id de la ruta. Si `a` va antes, es la vuelta. */
export class Mapa {
  constructor({ de, a, rotulo }) {
    this.done = false;
    const m = G.data.mapa;
    base ??= pintaBase();
    const i = m.ruta.findIndex((p) => p.id === de);
    const j = m.ruta.findIndex((p) => p.id === a);
    if (i < 0 || j < 0) throw new Error(`Tramo desconocido: ${de} → ${a}`);
    this.ruta = m.ruta;
    this.i = i;
    this.vuelta = j < i;
    this.tramo = this.vuelta ? m.ruta.slice(j, i + 1).reverse() : m.ruta.slice(i, j + 1);
    this.lens = this.tramo.slice(1).map((p, k) => Math.hypot(p.x - this.tramo[k].x, p.y - this.tramo[k].y));
    this.total = this.lens.reduce((s, d) => s + d, 0);
    this.d = 0;
    this.pausa = 0.7;
    this.rotulo = rotulo;
  }

  punto(d) {
    for (let k = 0; k < this.lens.length; k++) {
      if (d <= this.lens[k]) {
        const f = this.lens[k] ? d / this.lens[k] : 0;
        const p = this.tramo[k], q = this.tramo[k + 1];
        return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, k };
      }
      d -= this.lens[k];
    }
    const e = this.tramo[this.tramo.length - 1];
    return { x: e.x, y: e.y, k: this.tramo.length - 1 };
  }

  update(dt) {
    if (input.confirm()) { this.done = true; return; }
    if (this.d < this.total) this.d += VEL * dt;
    else { this.pausa -= dt; if (this.pausa <= 0) this.done = true; }
  }

  draw(ctx) {
    ctx.drawImage(base, 0, 0);
    const pos = this.punto(this.d);
    const r = this.ruta;
    const pts = (a, b) => r.slice(a, b).map((p) => [p.x, p.y]);
    const hechos = this.tramo.slice(0, pos.k + 1).map((p) => [p.x, p.y]);
    if (this.vuelta) trazo(ctx, pts(0, r.length), C.morado, 3);   // ya está todo andado
    else {
      trazo(ctx, pts(this.i, r.length), C.gris, 1, 2);       // lo que queda
      trazo(ctx, pts(0, this.i + 1), C.morado, 3);           // lo ya recorrido
    }
    trazo(ctx, [...hechos, [pos.x, pos.y]], C.rosa_neon, 3);  // este tramo
    const hasta = this.vuelta ? r.length : this.i + pos.k;
    r.forEach((p, n) => {
      if (!p.id) return;
      rect(ctx, p.x - 3, p.y - 3, 7, 7, C.carbon);
      rect(ctx, p.x - 2, p.y - 2, 5, 5, n <= hasta ? C.rosa_neon : C.amarillo_mural);
      if (p.txt) text(ctx, p.txt, p.x + (p.dx ?? 6), p.y + (p.dy ?? -4), { font: 'label', color: C.marfil, shadow: C.carbon, align: p.align ?? 'left' });
    });
    cochecito(ctx, Math.round(pos.x), Math.round(pos.y));
    panel(ctx, 2, BOTTOM, W - 4, H - BOTTOM - 2);
    text(ctx, this.rotulo, W >> 1, BOTTOM + 30, { font: 'bold', color: C.rosa_claro, align: 'center' });
    text(ctx, G.data.mapa.pie, W >> 1, BOTTOM + 52, { font: 'label', color: C.gris, align: 'center' });
  }
}

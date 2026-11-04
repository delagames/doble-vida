// La calle en vista lateral: Juanjo anda mientras se mantiene pulsado y los colegas
// pisan su rastro en fila, con retardo. Fondo: el raw 11 desplazable (ver assets/bg/LEEME.md).
import { C, img } from './assets.js';
import { input, inRect } from './input.js';
import { W, H, shake } from './screen.js';
import { text, measure, wrap, lineHeight } from './text.js';
import { bar, button, dither, panel, pixelPoly, rect } from './draw.js';
import { Aviso } from './dialog.js';
import { traduce } from './night.js';
import { DIR, drawSprite } from './sprites.js';
import { S } from './state.js';
import { G } from './game.js';
import { audio } from './audio.js';

const RAW_MITJANA = 'assets/bg/raw/raw-11-mitjana.png';
const RAW_W = 307, RAW_TOP = 40, RAW_H = 284;  // arriba el raw trae un bloque morado que no es calle
const ART_Y = 97, SUELO_Y = 350, PIES = 370, UI_Y = 384;
const JX = 190;       // Juanjo se queda aquí y se mueve el mundo: la fila le cabe detrás
const VEL = 66;       // px/s
const HUECO = 34;     // separación por defecto en la fila, en píxeles de rastro
const GRITO = { x: W - 88, y: UI_Y + 15, w: 82, h: 76 };   // el botón, en la banda del pulgar
const GRITO_SEG = 1.5;
// Ventanas del raw 11, en píxeles del raw: cuadriláteros, que la calle va en perspectiva.
const VENTANAS = [
  [[32, 115], [73, 125], [73, 230], [32, 232]],
  [[101, 42], [116, 42], [116, 85], [101, 80]],
  [[144, 42], [158, 50], [158, 100], [144, 98]],
  [[190, 68], [200, 76], [200, 138], [190, 133]],
  [[216, 40], [226, 42], [226, 65], [216, 62]],
  [[218, 98], [226, 105], [226, 145], [218, 142]],
];

export class Calle {
  constructor(s) {
    this.done = false;
    this.largo = s.largo ?? 600;
    this.meta = s.meta ?? null;
    this.pista = s.pista ?? G.data.night.textos.andar;
    this.charla = (s.charla ?? []).map((c) => ({ ...c }));
    this.x = 0;
    this.t = 0;
    this.andando = false;
    this.aviso = null;
    this.fin = 0;
    // El rastro empieza ya sembrado, para que la fila salga formada.
    let atras = 0;
    this.colegas = (s.colegas ?? []).map((c) => {
      atras += c.hueco ?? HUECO;
      return { ...c, atras, sprite: G.data.cast[c.who].sprite, oculto: 0, reloj: 3 + atras / 40, x: -atras };
    });
    this.rastro = [];
    for (let i = atras + 1; i > 0; i--) this.rastro.push(-i);
    this.rastro.push(0);
    // {"gritar":true}: botón de gritar. Cada grito enciende una ventana y protesta un vecino.
    this.gritar = !!s.gritar;
    this.gritos = 0;
    this.luces = [];         // { copia, v }
    this.bocadillo = null;   // { txt, t }
    this.espera = 0;
    this.protesta = null;    // lo que contesta el vecino, un poco después del grito
  }

  /** Un dedo que empezó en el botón de gritar no anda. */
  pulsado() {
    if (!this.gritar) return input.count > 0 || input.key('ArrowRight', 'Space', 'KeyD');
    return input.points.some((p) => !inRect({ x: p.sx, y: p.sy }, GRITO)) || input.key('ArrowRight', 'Space', 'KeyD');
  }

  /** La siguiente ventana apagada de las que se ven. */
  encender() {
    const px = Math.round(this.x * 0.5);
    for (let i = Math.floor(px / RAW_W); i * RAW_W - px < W; i++) {
      for (let v = 0; v < VENTANAS.length; v++) {
        if (this.luces.some((l) => l.copia === i && l.v === v)) continue;
        const cx = VENTANAS[v][0][0];
        const sx = i * RAW_W - px + (i % 2 === 0 ? cx : RAW_W - cx);
        if (sx > 20 && sx < W - 20) { this.luces.push({ copia: i, v }); return; }
      }
    }
  }

  grita() {
    const t = G.data.night.textos;
    this.espera = GRITO_SEG;
    this.bocadillo = { txt: t.gritos[this.gritos % t.gritos.length], t: 1.3 };
    this.protesta = { t: 0.5, l: t.vecinos[this.gritos % t.vecinos.length] };
    this.gritos++;
    S.flags.gritosMitjana = this.gritos;
    this.encender();
    shake(0.15);
    audio.grito();
  }

  update(dt) {
    this.t += dt * 60;
    this.aviso?.update(dt);
    if (this.aviso?.done) this.aviso = null;
    if (this.gritar) this.updateGrito(dt);
    this.andando = this.fin === 0 && this.x < this.largo && this.pulsado();
    if (this.andando) {
      this.x = Math.min(this.largo, this.x + VEL * dt);
      // Un punto del rastro por píxel andado: seguir "con retardo" es leerlo más atrás.
      const n = Math.floor(this.x);
      while (this.rastro[this.rastro.length - 1] < n) this.rastro.push(this.rastro[this.rastro.length - 1] + 1);
      const c = this.charla[0];
      if (c && this.x >= c.x && !this.aviso) {
        this.charla.shift();
        this.aviso = new Aviso(traduce(c.id), this.gritar ? GRITO.x - 12 : W - 20);
      }
    }
    const n = this.rastro.length;
    for (const c of this.colegas) {
      c.x = this.rastro[Math.max(0, n - 1 - c.atras)];
      if (c.desaparece && this.andando) {
        c.reloj -= dt;
        if (c.reloj <= 0) { c.oculto = 1.1; c.reloj = 4 + Math.random() * 3; }
      }
      c.oculto = Math.max(0, c.oculto - dt);
    }
    if (this.x >= this.largo && !this.aviso) {
      this.fin += dt;
      if (this.fin > 0.4) this.done = true;
    }
  }

  updateGrito(dt) {
    this.espera = Math.max(0, this.espera - dt);
    if (this.bocadillo && (this.bocadillo.t -= dt) <= 0) this.bocadillo = null;
    if (this.protesta && !this.aviso && (this.protesta.t -= dt) <= 0) {
      this.aviso = new Aviso(this.protesta.l, GRITO.x - 12);
      this.protesta = null;
    }
    if (this.espera <= 0 && this.x < this.largo && ((input.pressed && inRect(input.pressed, GRITO)) || input.hit('KeyG'))) this.grita();
  }

  pintaLuces(ctx) {
    const px = Math.round(this.x * 0.5);
    const y = (ry) => ART_Y + ry - RAW_TOP;
    for (const { copia, v } of this.luces) {
      const dx = copia * RAW_W - px;
      if (dx > W || dx + RAW_W < 0) continue;
      const pts = VENTANAS[v].map(([a, b]) => [dx + (copia % 2 === 0 ? a : RAW_W - a), y(b)]);
      pixelPoly(ctx, pts, C.amarillo_mural, C.carbon);
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2), base = Math.max(...ys) - 2;
      const arriba = Math.min(...ys) + 3;
      for (let x = Math.min(...xs) + 4; x < Math.max(...xs) - 1; x += 7) rect(ctx, x, arriba, 1, base - arriba, C.naranja_oscuro);
      // El vecino: una silueta con los brazos en jarras, que de noche se ve igual en todas partes.
      rect(ctx, cx - 4, base - 20, 9, 8, C.carbon);
      rect(ctx, cx - 7, base - 12, 15, 12, C.carbon);
    }
  }

  fondo(ctx) {
    rect(ctx, 0, 24, W, ART_Y - 24, C.noche);
    dither(ctx, 0, 70, W, ART_Y - 70, C.noche_clara, 1);
    dither(ctx, 0, 86, W, ART_Y - 86, C.noche_clara, 2);
    ctx.fillStyle = C.gris;
    for (let i = 0; i < 12; i++) ctx.fillRect(((i * 83 + 11) - Math.round(this.x * 0.1) + 540) % W, 30 + (i * 37) % 44, 1, 1);
    const raw = img(RAW_MITJANA);
    if (raw) {
      // Las copias van alternadas en espejo: así los bordes siempre casan.
      const px = Math.round(this.x * 0.5);
      for (let i = Math.floor(px / RAW_W); i * RAW_W - px < W; i++) {
        const dx = i * RAW_W - px;
        if (i % 2 === 0) ctx.drawImage(raw, 0, RAW_TOP, RAW_W, RAW_H, dx, ART_Y, RAW_W, RAW_H);
        else {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(raw, 0, RAW_TOP, RAW_W, RAW_H, -dx - RAW_W, ART_Y, RAW_W, RAW_H);
          ctx.restore();
        }
      }
    } else rect(ctx, 0, ART_Y, W, RAW_H, C.noche_clara);
    this.pintaRotulos(ctx);
    // La acera por la que se anda va en primer plano, a velocidad completa.
    const off = Math.round(this.x);
    rect(ctx, 0, SUELO_Y, W, UI_Y - SUELO_Y, C.noche_clara);
    rect(ctx, 0, SUELO_Y, W, 1, C.carbon);
    rect(ctx, 0, SUELO_Y + 1, W, 2, C.naranja_oscuro);
    dither(ctx, 0, SUELO_Y + 3, W, 6, C.naranja_oscuro, 1);
    for (let x = -(off % 32); x < W; x += 32) rect(ctx, x, SUELO_Y + 3, 1, 12, C.noche);
    for (let x = -((off + 16) % 32); x < W; x += 32) rect(ctx, x, SUELO_Y + 15, 1, 14, C.noche);
    rect(ctx, 0, SUELO_Y + 14, W, 1, C.noche);
    rect(ctx, 0, SUELO_Y + 29, W, 1, C.noche);
    rect(ctx, 0, SUELO_Y + 30, W, UI_Y - SUELO_Y - 30, C.carbon);
    if (this.meta) this.pintaMeta(ctx);
    if (this.luces.length) this.pintaLuces(ctx);
  }

  /** Las copias del fondo van en espejo: los rótulos de cada una rompen la simetría. */
  pintaRotulos(ctx) {
    const px = Math.round(this.x * 0.5);
    for (let i = Math.floor(px / RAW_W); i * RAW_W - px < W; i++) {
      const dx = i * RAW_W - px;
      if (i % 2) {                             // farmacia de guardia
        const x = dx + 92, y = 196, on = Math.floor(G.time * 1.5) % 4 !== 3;
        rect(ctx, x - 1, y - 7, 15, 15, C.carbon);
        rect(ctx, x + 4, y - 6, 5, 13, on ? C.verde_ipa : C.jager);
        rect(ctx, x, y - 2, 13, 5, on ? C.verde_ipa : C.jager);
      } else if (i % 4 === 2) {                // un bar que ya ha cerrado
        panel(ctx, dx + 140, 188, 16, 38, { fill: C.carbon, edge: C.naranja_oscuro });
        ['B', 'A', 'R'].forEach((l, k) => text(ctx, l, dx + 148, 193 + k * 10, { font: 'label', color: C.naranja_farola, align: 'center' }));
      }
    }
  }

  pintaMeta(ctx) {
    // El final de la calle: un rótulo de neón plantado en la acera.
    const x = JX + 40 + this.largo - Math.round(this.x);
    if (x > W + 60) return;
    rect(ctx, x, 236, 3, SUELO_Y - 236 + 4, C.carbon);
    panel(ctx, x - 34, 214, 72, 24, { fill: C.carbon, edge: C.rosa_neon });
    text(ctx, this.meta, x + 2, 221, { font: 'label', color: C.rosa_neon, align: 'center' });
  }

  draw(ctx) {
    this.fondo(ctx);
    const a = this.andando ? 'Walk' : 'Idle';
    for (let i = this.colegas.length - 1; i >= 0; i--) {
      const c = this.colegas[i];
      if (c.oculto > 0) continue;
      drawSprite(ctx, c.sprite, a, DIR.derecha, this.t + i * 7, JX - (this.x - c.x), PIES, { sombra: true });
    }
    drawSprite(ctx, 'juanjo', a, DIR.derecha, this.t, JX, PIES + 1, { sombra: true });
    if (this.bocadillo) this.pintaBocadillo(ctx);
    panel(ctx, 2, UI_Y, W - 4, H - UI_Y - 2);
    bar(ctx, 10, UI_Y + 7, W - 20, 5, this.x / this.largo, C.cian_neon);
    if (this.gritar) button(ctx, GRITO, G.data.night.textos.gritar, { edge: this.espera > 0 ? C.gris : C.rosa_neon, active: this.espera > GRITO_SEG - 0.3 });
    if (this.aviso) this.aviso.draw(ctx, 8, UI_Y + 17);
    else if (this.gritar) wrap(this.pista, 'bold', GRITO.x - 16).forEach((l, i) => text(ctx, l, GRITO.x >> 1, UI_Y + 32 + i * lineHeight('bold'), { font: 'bold', color: C.rosa_claro, align: 'center' }));
    else text(ctx, this.pista, W >> 1, UI_Y + 42, { font: 'bold', color: C.rosa_claro, align: 'center' });
  }

  pintaBocadillo(ctx) {
    const { txt } = this.bocadillo;
    const w = measure(txt, 'bold') + 14;
    const x = Math.max(4, Math.min(W - w - 4, JX - (w >> 1)));
    panel(ctx, x, 282, w, 22, { fill: C.carbon, edge: C.rosa_neon });
    rect(ctx, JX - 1, 304, 3, 6, C.rosa_neon);
    text(ctx, txt, x + (w >> 1), 286, { font: 'bold', color: C.marfil, align: 'center' });
  }
}

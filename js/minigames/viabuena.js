// ¡LA VÍA BUENA! Gag sin dificultad: Arcanine en la ventanilla, la pantalla inclinada y cuatro
// respuestas. La buena se está quieta; las tres malas, que son lo que a Juanjo se le ocurre, se
// mueven y se escapan del dedo. No se puede fallar: ni premia ni castiga.
//   Parámetros: buena (texto), malas (lista, salen de tres en tres), linea (la de Arcanine,
//   { idioma, real, texto }), tarjeta { titulo, lineas }.
import { C, img, bgPath } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, H } from '../screen.js';
import { lineHeight, wrap, text } from '../text.js';
import { button, dither, panel, rect, outline } from '../draw.js';
import { barajar } from '../state.js';
import { G } from '../game.js';
import { audio } from '../audio.js';
import { DIR, drawSprite, portrait } from '../sprites.js';

const INCLINA = 9;
const ESPERA_MAX = 45;           // si nadie toca nada, la dice sola
const BUENA = { x: 58, y: 330, w: 154, h: 44 };
const ZONA = { x: 6, y: 216, w: W - 12, h: H - 222 };
const MALA = { w: 118, h: 40 };
const HUYE = 58;                 // a esta distancia del dedo, sale corriendo
const CAJA_Y = 112;

const chocan = (a, b, m = 4) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

export default class ViaBuena {
  static instruccion = '¡LA VÍA BUENA!';
  static ayuda = 'Solo hay una respuesta buena y está quieta. Las otras tres se le están ocurriendo a Juanjo. Que no salgan.';
  static carga = ['control', 'juanjo'];

  start({ params }) {
    this.p = params;
    this.t = 0;
    this.res = null;
    this.cola = barajar(params.malas ?? []);
    const sitios = [{ x: 10, y: 224 }, { x: 142, y: 270 }, { x: 40, y: 410 }];
    this.malas = sitios.map((s, i) => {
      const ang = 0.7 + i * 2.1;
      return { ...s, ...MALA, vx: Math.cos(ang) * 46, vy: Math.sin(ang) * 46, txt: this.otra() };
    });
    this.tras = false;
    G.inclina = INCLINA;
  }

  /** La siguiente tontería. Cuando se acaban, vuelven a empezar. */
  otra() {
    if (!this.cola.length) this.cola = barajar(this.p.malas ?? ['...']);
    return this.cola.pop();
  }

  update(dt) {
    this.t += dt;
    G.inclina = Math.round(INCLINA + Math.sin(this.t * 1.1) * 2);
    this.mueve(dt);
    if (this.t > ESPERA_MAX) { this.acierta(); return; }
    if (input.tapIn(BUENA) || input.hit('Enter', 'Space')) { this.acierta(); return; }
    if (input.tap) {
      const m = this.malas.find((q) => inRect(input.tap, q));
      if (m) this.espanta(m);
    }
  }

  acierta() { audio.toque(); this.res = 'win'; }

  /** Se le iba a escapar a Juanjo, y se escapa ella: sale disparada con otra idea. */
  espanta(m) {
    const ang = Math.random() * Math.PI * 2;
    m.vx = Math.cos(ang) * 170;
    m.vy = Math.sin(ang) * 170;
    m.txt = this.otra();
    audio.toque();
  }

  mueve(dt) {
    const dedo = input.p();
    for (const m of this.malas) {
      if (dedo) {
        const dx = m.x + (m.w >> 1) - dedo.x, dy = m.y + (m.h >> 1) - dedo.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < HUYE + (m.w >> 1)) { m.vx += (dx / d) * 900 * dt; m.vy += (dy / d) * 900 * dt; }
      }
      const v = Math.hypot(m.vx, m.vy) || 1;
      const tope = v > 220 ? 220 : v < 46 ? 46 : v * (1 - dt * 0.7);
      m.vx = (m.vx / v) * tope;
      m.vy = (m.vy / v) * tope;
      const antes = { x: m.x, y: m.y };
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < ZONA.x) { m.x = ZONA.x; m.vx = Math.abs(m.vx); }
      if (m.x + m.w > ZONA.x + ZONA.w) { m.x = ZONA.x + ZONA.w - m.w; m.vx = -Math.abs(m.vx); }
      if (m.y < ZONA.y) { m.y = ZONA.y; m.vy = Math.abs(m.vy); }
      if (m.y + m.h > ZONA.y + ZONA.h) { m.y = ZONA.y + ZONA.h - m.h; m.vy = -Math.abs(m.vy); }
      if (chocan(m, BUENA)) {     // la buena no se tapa nunca
        m.x = antes.x; m.y = antes.y;
        if (antes.y + m.h <= BUENA.y || antes.y >= BUENA.y + BUENA.h) m.vy = -m.vy; else m.vx = -m.vx;
      }
    }
    this.sinPisarse();
  }

  /** Las tonterías no se tapan entre ellas: se empujan y cada una sigue por su lado. */
  sinPisarse() {
    const [a, b, c] = this.malas;
    for (const [p, q] of [[a, b], [a, c], [b, c]]) {
      if (!chocan(p, q, 2)) continue;
      const dx = p.x - q.x || 1, dy = p.y - q.y || 1;
      const sep = 90;
      p.vx += Math.sign(dx) * sep; q.vx -= Math.sign(dx) * sep;
      p.vy += Math.sign(dy) * sep; q.vy -= Math.sign(dy) * sep;
    }
  }

  result() { return this.res; }

  tarjeta() { return { coste: 0, ...(this.p.tarjeta ?? {}) }; }

  parar() { G.inclina = null; }

  draw(ctx) {
    ctx.drawImage(img(bgPath('15-control')), 0, 0);
    dither(ctx, 0, 100, W, 150, C.azul_claro, 1);
    this.pintaArcanine(ctx);
    this.pintaLinea(ctx);
    rect(ctx, 0, ZONA.y - 6, W, H - ZONA.y + 6, C.noche);
    outline(ctx, 0, ZONA.y - 6, W, H - ZONA.y + 6, C.morado);
    button(ctx, BUENA, this.p.buena, { edge: C.cian_neon });
    for (const m of this.malas) {
      const r = { x: Math.round(m.x), y: Math.round(m.y), w: m.w, h: m.h };
      button(ctx, r, m.txt, { font: this.fuente(m), fill: C.morado, edge: C.rosa_neon });
    }
  }

  /** La letra más grande con la que cabe esa tontería. */
  fuente(m) {
    const cabe = (f) => wrap(m.txt, f, m.w - 10).length * lineHeight(f) + 4 <= m.h;
    return cabe('bold') ? 'bold' : cabe('dialog') ? 'dialog' : 'label';
  }

  pintaArcanine(ctx) {
    drawSprite(ctx, '0059', 'Idle', DIR.derecha, this.t * 60, 58, 224, { escala: 3 });
  }

  pintaLinea(ctx) {
    const l = this.p.linea ?? {};
    const tx = 52, tw = W - tx - 10;
    panel(ctx, 2, 27, W - 4, CAJA_Y - 27);
    const pic = portrait('0059', 'Normal');
    rect(ctx, 7, 33, 42, 42, C.carbon);
    if (pic) ctx.drawImage(pic, 8, 34, 40, 40);
    outline(ctx, 7, 33, 42, 42, C.morado);
    let y = 32;
    text(ctx, G.data.cast.control.nombre, tx, y, { font: 'bold', color: C.rosa_claro });
    y += 15;
    for (const s of wrap((l.idioma ?? '').toUpperCase(), 'label', tw)) { text(ctx, s, tx, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    for (const s of wrap(l.texto ?? '', 'dialog', tw)) { text(ctx, s, tx, y, { color: C.marfil }); y += lineHeight('dialog'); }
  }
}

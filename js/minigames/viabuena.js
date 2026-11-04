// ¡LA VÍA BUENA!: Arcanine en la ventanilla, la pantalla inclinada y un interrogatorio. Cada
// pregunta trae la respuesta sensata y las que se le ocurren a Juanjo; todas pasan en una cinta,
// borrosas y moviéndose, y hay que tocar la que no le lía más. La coherencia manda en lo que cuesta
// leerlas: más velocidad, más temblor y más trama. Borroso sin alfa: el texto se copia en tiras
// desplazadas, con un fantasma gris detrás y trama del color del botón encima.
// Una mala cuesta un punto de coherencia (cuatro como mucho) y aguantar la reacción; la primera
// añade una pregunta, y la respuesta tonta desaparece. Nunca te detiene: siempre acaba en casa.
// Con tres malas o más es 'lose': el mismo final, con más ventanilla.
//   Parámetros: preguntas [{ idioma, texto, buena, malas, bien?, mal? }], la última es la del
//   título; extra (se mete antes de la última); bien y mal (reacciones comunes); tarjeta { win, lose }.
import { C, img, bgPath } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, H, shake, vibrar } from '../screen.js';
import { lineHeight, wrap, text } from '../text.js';
import { bar, cifras, dither, panel, rect, outline } from '../draw.js';
import { S, barajar, rellenar } from '../state.js';
import { coh, endurece } from '../medidores.js';
import { G } from '../game.js';
import { audio } from '../audio.js';
import { DIR, drawSprite, portrait } from '../sprites.js';

const INCLINA = 9;
const CAJA_Y = 112;
const ZONA = { x: 6, y: 222, w: W - 12, h: 240 };
const FILAS = 4, PASO = ZONA.h / FILAS;
const CAJA = { w: 206, h: 44 };
const ALMA = 8;                  // margen del toque: el objetivo se mueve
const GRACIA = 0.3;              // el toque que cierra la reacción no elige la siguiente
const MIN_LEE = 0.5;             // una reacción se puede saltar a partir de aquí
const REACCION = { bien: 1.4, mal: 2.4 };
const MAX_COSTE = 4;             // lo mismo que cualquier minijuego fallado
const PIERDE = 3;
const HOJA = { w: CAJA.w, h: CAJA.h * FILAS };

let hoja = null;                 // una sola, compartida: el texto de las respuestas de la pantalla

export default class ViaBuena {
  static instruccion = '¡LA VÍA BUENA!';
  static ayuda = 'Arcanine pregunta. Toca la respuesta sensata, la que no le lía más, aunque se mueva y se vea borrosa. Las demás se le están ocurriendo a Juanjo: cada tontería alarga el control y cuesta coherencia. El objetivo es que te deje irte a casa.';
  static carga = ['control', 'juanjo'];

  start({ params }) {
    this.p = params;
    this.cola = [...(params.preguntas ?? [])];
    this.total = this.cola.length;
    this.hechas = 0;
    this.fallos = 0;
    this.cobrado = 0;
    this.t = 0;
    this.res = this.cola.length ? null : 'win';
    this.reaccion = null;
    this.ops = [];
    G.inclina = INCLINA;
    if (!hoja) { hoja = document.createElement('canvas'); hoja.width = HOJA.w; hoja.height = HOJA.h * 2; }
    if (!this.res) this.monta();
  }

  monta() {
    const q = this.cola[0];
    this.q = q;
    const malas = barajar(q.malas).slice(0, FILAS - 1).map((txt) => ({ txt, ok: false }));
    this.ops = barajar([{ txt: q.buena, ok: true }, ...malas]).map((o, i) => ({ ...o, i, txt: rellenar(o.txt), fase: Math.random() * 6 }));
    this.textoQ = wrap(rellenar(q.texto), 'dialog', W - 62);
    this.idiomaQ = wrap((q.idioma ?? '').toUpperCase(), 'label', W - 62);
    this.limite = endurece(20, 13);
    this.resta = this.limite;
    this.espera = GRACIA;
    this.desliza = Math.random() * ZONA.h;
    this.rotula();
  }

  /** Dos juegos de letras en la hoja: el marfil y, debajo, el fantasma gris. */
  rotula() {
    const c = hoja.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, hoja.width, hoja.height);
    const lh = lineHeight('dialog');
    this.ops.forEach((o) => {
      const l = wrap(o.txt, 'dialog', CAJA.w - 10);
      const y0 = o.i * CAJA.h + ((CAJA.h - l.length * lh) >> 1);
      l.forEach((s, k) => {
        text(c, s, CAJA.w >> 1, y0 + k * lh, { color: C.marfil, align: 'center' });
        text(c, s, CAJA.w >> 1, HOJA.h + y0 + k * lh, { color: C.gris, align: 'center' });
      });
    });
  }

  /** Dónde va una respuesta: la cinta baja, vuelve a entrar por arriba y se mece de lado. */
  caja(o) {
    const hueco = (ZONA.w - CAJA.w) >> 1;
    return {
      x: ZONA.x + hueco + Math.round(Math.sin(this.t * 1.3 + o.fase) * hueco * endurece(0.2, 1)),
      y: ZONA.y + Math.round((o.i * PASO + this.desliza) % ZONA.h),
      w: CAJA.w, h: CAJA.h,
    };
  }

  update(dt) {
    this.t += dt;
    G.inclina = Math.round(INCLINA + Math.sin(this.t * 1.1) * 2);
    if (this.reaccion) { this.paraReaccion(dt); return; }
    this.desliza += endurece(5, 42) * dt;
    this.resta -= dt;
    if (this.espera > 0) { this.espera -= dt; input.consume(); return; }
    if (this.resta <= 0) { this.fuera(); return; }
    const k = this.ops.findIndex((_, i) => input.hit(`Digit${i + 1}`));
    if (k >= 0) { this.elige(this.ops[k]); return; }
    if (input.pressed) this.toca(input.pressed);
  }

  toca(q) {
    if (q.y < ZONA.y || q.y >= ZONA.y + ZONA.h) return;
    const dentro = (r, y) => inRect(q, { x: r.x - ALMA, y: y - ALMA, w: r.w + ALMA * 2, h: r.h + ALMA * 2 });
    const o = this.ops.find((p) => { const r = this.caja(p); return dentro(r, r.y) || dentro(r, r.y - ZONA.h); });
    if (o) this.elige(o);
  }

  paraReaccion(dt) {
    const r = this.reaccion;
    r.t -= dt;
    r.vivo += dt;
    if (r.t > 0 && !(r.vivo >= MIN_LEE && input.tap)) return;
    input.consume();
    this.reaccion = null;
    if (!r.avanza) { this.espera = GRACIA; return; }
    this.cola.shift();
    this.hechas++;
    if (this.cola.length) this.monta(); else this.res = this.fallos >= PIERDE ? 'lose' : 'win';
  }

  reacciona(tipo, avanza) {
    const txt = this.q[tipo] ?? barajar(this.p[tipo] ?? ['...'])[0];
    this.reaccion = { tipo, avanza, t: REACCION[tipo], vivo: 0, lineas: wrap(rellenar(txt), 'dialog', W - 44) };
  }

  elige(o) {
    if (o.ok) { audio.toque(); this.reacciona('bien', true); return; }
    this.ops = this.ops.filter((p) => p !== o);
    this.falla();
    this.reacciona('mal', false);
  }

  /** Se acabó el tiempo de esa pregunta: Arcanine no espera y pasa a la siguiente. */
  fuera() {
    this.falla();
    this.reacciona('mal', true);
  }

  falla() {
    this.fallos++;
    if (this.fallos === 1 && this.p.extra) {
      this.cola.splice(Math.max(1, this.cola.length - 1), 0, this.p.extra);
      this.total++;
    }
    if (this.cobrado < MAX_COSTE) { this.cobrado++; coh(-1); }
    audio.fallo();
    shake(0.15);
    vibrar();
  }

  result() { return this.res; }

  tarjeta(res) {
    const t = this.p.tarjeta?.[res] ?? {};
    const datos = [['PREGUNTAS', this.total], ['TONTERÍAS DICHAS', this.fallos]];
    if (this.cobrado) datos.push(['COHERENCIA', `-${this.cobrado}`]);
    return { coste: 0, titulo: t.titulo, lineas: t.lineas ?? [], datos };
  }

  parar() { G.inclina = null; }

  draw(ctx) {
    ctx.drawImage(img(bgPath('15-control')), 0, 0);
    dither(ctx, 0, 100, W, 150, C.azul_claro, 1);
    drawSprite(ctx, '0059', 'Idle', DIR.derecha, this.t * 60, 58, 224, { escala: 3 });
    this.pintaLinea(ctx);
    const y = ZONA.y - 8;
    rect(ctx, 0, y, W, H - y, C.noche);
    outline(ctx, 0, y, W, H - y, C.morado);
    if (this.res && !this.reaccion) return;
    bar(ctx, 4, y + 2, W - 8, 3, Math.max(0, this.resta) / this.limite, this.resta < this.limite * 0.3 ? C.rojo_extintor : C.cian_neon);
    if (this.reaccion) { this.pintaReaccion(ctx); return; }
    ctx.save();
    ctx.beginPath();
    ctx.rect(ZONA.x, ZONA.y, ZONA.w, ZONA.h);
    ctx.clip();
    for (const o of this.ops) {
      const r = this.caja(o);
      this.pintaOpcion(ctx, o, r.x, r.y);
      if (r.y + CAJA.h > ZONA.y + ZONA.h) this.pintaOpcion(ctx, o, r.x, r.y - ZONA.h);
    }
    ctx.restore();
  }

  pintaOpcion(ctx, o, x, y) {
    panel(ctx, x, y, CAJA.w, CAJA.h, { fill: C.noche_clara, edge: C.morado });
    const sy = o.i * CAJA.h;
    const amp = endurece(0.8, 4);
    const doble = Math.round(endurece(0, 4));
    if (doble) ctx.drawImage(hoja, 0, HOJA.h + sy, CAJA.w, CAJA.h, x + doble, y - (doble >> 1), CAJA.w, CAJA.h);
    for (let f = 0; f < CAJA.h; f += 2) {     // tiras de 2 px, cada una por su lado
      const off = Math.round(Math.sin(this.t * 7 + f * 0.7 + o.fase) * amp);
      ctx.drawImage(hoja, 0, sy + f, CAJA.w, 2, x + off, y + f, CAJA.w, 2);
    }
    const trama = S.coherencia >= 75 ? 0 : 1;
    if (trama) dither(ctx, x + 2, y + 2, CAJA.w - 4, CAJA.h - 4, C.noche_clara, trama);
  }

  pintaReaccion(ctx) {
    const { tipo, lineas } = this.reaccion;
    const lh = lineHeight('dialog');
    const h = 16 + lineas.length * lh, y = ZONA.y + ((ZONA.h - h) >> 1);
    panel(ctx, 12, y, W - 24, h, { edge: tipo === 'bien' ? C.cian_neon : C.rojo_extintor });
    lineas.forEach((l, i) => text(ctx, l, W >> 1, y + 8 + i * lh, { color: C.marfil, align: 'center' }));
  }

  pintaLinea(ctx) {
    const tx = 52;
    panel(ctx, 2, 27, W - 4, CAJA_Y - 27);
    const pic = portrait('0059', 'Normal');
    rect(ctx, 7, 33, 42, 42, C.carbon);
    if (pic) ctx.drawImage(pic, 8, 34, 40, 40);
    outline(ctx, 7, 33, 42, 42, C.morado);
    let y = 32;
    text(ctx, G.data.cast.control.nombre, tx, y, { font: 'bold', color: C.rosa_claro });
    cifras(ctx, `${Math.min(this.hechas + 1, this.total)}/${this.total}`, W - 8, 34, { escala: 2, color: C.gris, align: 'right' });
    y += 15;
    for (const s of this.idiomaQ ?? []) { text(ctx, s, tx, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    for (const s of this.textoQ ?? []) { text(ctx, s, tx, y, { color: C.marfil }); y += lineHeight('dialog'); }
  }
}

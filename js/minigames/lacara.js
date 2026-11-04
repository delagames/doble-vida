// ¡LA CARA!: Gengar va a decir «Se equivoca usted» y hay que elegirle la cara. Solo una cuela.
// Los Growlithe dicen qué cara les vale: lo gris es lo de verdad, y lo que Juanjo traduce en
// grande lleva a otra. Primero se lee con calma; los segundos corren al tocar YA.
// Las pistas van en night.json, `caras`: por retrato, su rótulo y sus frases.
// Normal y Happy casi no se distinguen, así que nunca salen juntas.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, shake, vibrar } from '../screen.js';
import { text, wrap, lineHeight } from '../text.js';
import { bar, button, dither, outline, panel, rect } from '../draw.js';
import { S, UMBRAL, barajar } from '../state.js';
import { endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { DIR, drawSprite } from '../sprites.js';
import { G } from '../game.js';
import { fondoTenue, retrato } from './dibujo.js';

const PANEL = { x: 3, y: 27, w: W - 6, h: 100 };
const YA = { x: 30, y: 400, w: 210, h: 66 };
const CARTA = { w: 130, h: 136 };
const CARTAS = [[3, 146], [137, 146], [3, 288], [137, 288]];
const LADO = 120;
const LEE_MIN = 0.9;       // antes de esto no sale el botón: la pista hay que verla
const LEE_MAX = 25;        // nadie se queda aquí: al cabo, YA solo
const DICE = 1.1;          // lo que se queda la cara elegida antes de la tarjeta

export default class LaCara {
  static instruccion = '¡LA CARA!';
  static ayuda = 'Solo una cara de Gengar cuela. Lee lo gris: es lo que dicen de verdad los Growlithe, y te dice cuál. Lo grande es Juanjo, y te lleva a otra. Cuando lo tengas, toca YA y luego toca la cara.';
  static carga = ['gengar', 'nacional1', 'nacional2', 'juanjo'];

  start() {
    const caras = G.data.night.caras;
    const moods = Object.keys(caras);
    this.buena = barajar(moods)[0];
    const pareja = { Happy: 'Normal', Normal: 'Happy' };
    const resto = barajar(moods.filter((m) => m !== this.buena && m !== pareja[this.buena]));
    if (resto.includes('Happy') && resto.includes('Normal')) resto.splice(resto.indexOf(barajar(['Happy', 'Normal'])[0]), 1);
    this.caras = barajar([this.buena, ...resto.slice(0, 3)]).map((mood) => ({ mood, etiqueta: caras[mood].etiqueta }));
    const p = barajar(caras[this.buena].pistas)[0];
    this.pista = p;
    const juanjo = S.coherencia < UMBRAL.loca && p.loca ? p.loca : p.juanjo;
    this.rotulo = {
      idioma: wrap(p.idioma.toUpperCase(), 'label', PANEL.w - 58).slice(0, 1),
      real: wrap(p.real.toUpperCase(), 'label', PANEL.w - 58).slice(0, 3),
      juanjo: wrap(juanjo, 'dialog', PANEL.w - 58).slice(0, 2),
    };
    this.tiempo = endurece(4, 2.6);
    this.borracho = S.coherencia < UMBRAL.loca;     // sin rótulos y la pista se va al elegir
    this.temblor = Math.max(0, (60 - S.coherencia) / 60) * 3;
    this.fase = 'lee';
    this.t = 0;
    this.anim = 0;
    this.res = null;
    this.elegida = null;
  }

  update(dt) {
    this.anim += dt;
    this.t += dt;
    if (this.fase === 'lee') {
      const puede = this.t >= LEE_MIN;
      if ((puede && (input.tapIn(YA) || input.hit('Enter', 'Space'))) || this.t > LEE_MAX) this.aElegir();
      return;
    }
    if (this.fase === 'elige') {
      if (this.t >= this.tiempo) { this.elige(null); return; }
      const i = input.tap ? CARTAS.findIndex(([x, y]) => inRect(input.tap, { x, y, ...CARTA })) : -1;
      if (i >= 0) this.elige(this.caras[i]);
      return;
    }
    if (this.t >= DICE) this.res = this.elegida?.mood === this.buena ? 'win' : 'lose';
  }

  aElegir() {
    this.fase = 'elige';
    this.t = 0;
    input.soltarTodo();
  }

  elige(c) {
    this.elegida = c;
    this.fase = 'dice';
    this.t = 0;
    if (c?.mood === this.buena) audio.toque();
    else { audio.fallo(); shake(0.2); vibrar(); }
  }

  result() { return this.res; }

  tarjeta(res) {
    if (res === 'win') return { titulo: '¡CUELA!', lineas: ['Gengar pone la cara exacta. El Growlithe duda de sí mismo por primera vez desde la oposición.'] };
    return {
      titulo: 'NO CUELA',
      lineas: [this.elegida ? 'Gengar pone esa cara. Los Growlithe se miran. No se ríen.' : 'Gengar se queda sin cara. Los Growlithe esperan. Saben esperar.', 'No dicen nada más. Echan a andar detrás.'],
      coste: 0,
    };
  }

  // Dibujo --------------------------------------------------------------------

  draw(ctx) {
    fondoTenue(ctx, '11-mitjana', 2);
    if (this.fase === 'lee') this.pintaLee(ctx);
    else this.pintaCartas(ctx);
    this.pintaPista(ctx);
  }

  pintaPista(ctx) {
    const p = PANEL;
    panel(ctx, p.x, p.y, p.w, p.h);
    retrato(ctx, 'nacional1', p.x + 6, p.y + 6);
    let y = p.y + 5;
    const x = p.x + 51;
    const oculta = this.borracho && this.fase !== 'lee';
    for (const l of this.rotulo.idioma) { text(ctx, l, x, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    if (!oculta) for (const l of this.rotulo.real) { text(ctx, l, x, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    y += 2;
    for (const l of this.rotulo.juanjo) { text(ctx, l, x, y, { color: C.marfil }); y += lineHeight('dialog'); }
  }

  pintaLee(ctx) {
    const a = this.anim * 60;
    drawSprite(ctx, '0058', 'Idle', DIR.abajo, a, 88, 330, { escala: 3, sombra: true });
    drawSprite(ctx, '0058', 'Idle', DIR.abajo, a + 11, 182, 330, { escala: 3, sombra: true });
    if (this.t >= LEE_MIN) button(ctx, YA, 'YA', { font: 'huge', edge: C.rosa_neon, color: C.rosa_neon });
    else text(ctx, 'LEE', W >> 1, 420, { font: 'bold', color: C.gris, align: 'center' });
  }

  pintaCartas(ctx) {
    const f = this.fase === 'elige' ? 1 - this.t / this.tiempo : 0;
    bar(ctx, 3, 130, W - 6, 11, f, f < 0.3 ? C.rojo_extintor : C.cian_neon);
    CARTAS.forEach(([x, y], i) => {
      const c = this.caras[i];
      const ox = Math.round(Math.sin(this.anim * 9 + i * 2) * this.temblor);
      const oy = Math.round(Math.cos(this.anim * 7 + i) * this.temblor);
      const sel = c === this.elegida;
      panel(ctx, x, y, CARTA.w, CARTA.h, { fill: C.noche_clara, edge: sel ? C.rosa_neon : C.morado });
      retrato(ctx, 'gengar', x + 5 + ox, y + 4 + oy, { mood: c.mood, lado: LADO });
      if (!this.borracho) text(ctx, c.etiqueta, x + (CARTA.w >> 1), y + 125, { font: 'label', color: C.marfil, align: 'center' });
      if (this.fase === 'dice' && !sel) dither(ctx, x, y, CARTA.w, CARTA.h, C.carbon, 3);
      if (sel) outline(ctx, x + 2, y + 2, CARTA.w - 4, CARTA.h - 4, C.rosa_neon);
    });
    if (this.fase === 'dice') {
      const y = 268;
      rect(ctx, 0, y - 1, W, 26, C.carbon);
      text(ctx, this.elegida ? '«SE EQUIVOCA USTED.»' : '«...»', W >> 1, y + 4, { font: 'bold', color: C.rosa_neon, align: 'center' });
    }
  }
}

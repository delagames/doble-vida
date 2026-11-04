// ¡NO LA CAGUES!: el Zorro es Edward Norton, Gengar es Brad Pitt con lo que puede y las amigas preguntan
// por la película. Tres respuestas y 4 s: la buena, una de otra película y una que delata al
// dúo. Fallar por tiempo también cuenta. El Buitre se acerca con cada fallo, y al tercero las
// amigas se van. Sin fallos, dos tejos; con uno o dos, uno. El fallo se paga en tejos: coste 0.
//   Parámetros: preguntas (clave en `preguntas` de night.json), n, tejos [{who, pie, real}].
import { C } from '../assets.js';
import { input } from '../input.js';
import { W, H, shake, vibrar } from '../screen.js';
import { text, wrap, lineHeight } from '../text.js';
import { bar, button, cifras, panel } from '../draw.js';
import { S, barajar } from '../state.js';
import { endurece, sumarTejo } from '../medidores.js';
import { audio } from '../audio.js';
import { G } from '../game.js';
import { DIR, drawSprite } from '../sprites.js';
import { placa } from '../stage.js';
import { fondoTenue } from './dibujo.js';

const MAX_FALLOS = 3;
const LEE_SEG = 1.1;        // la pregunta sola, antes de que corra el reloj
const REACCION_SEG = 2;
const CAJA = { x: 6, y: 146, w: W - 12, h: 86 };
const BOTON_H = 60, BOTON_Y = H - 3 * (BOTON_H + 4) - 2;
const BUITRE_X = [300, 252, 226];   // se acerca con cada fallo; al tercero ya está aquí
const REACCIONES = {
  ok: ['BIEN. PITT ASIENTE COMO SI LO SUPIERA.', 'LA FROSLASS SE ACERCA UN POCO. A PITT.', 'JUANJO SE CRECE. SE LE NOTA EN LA FRENTE.'],
  otra: ['ESO ES DE OTRA PELÍCULA.', 'LA ROSERADE ARRUGA UN PÉTALO.', 'SAMUÉ MIRA AL TECHO Y SILBA.'],
  delata: ['NORTON SE PONE ROJO. SE LE VE UN POCO DE COLA.', 'LA FROSLASS MIRA A PITT. PITT NO ESTÁ.', 'SILENCIO EN LA MESA. HASTA EL FUTBOLÍN CALLA.'],
  tiempo: ['JUANJO SE HA QUEDADO EN BLANCO. Y SIGUE SONRIENDO.', 'SE LE HA PASADO. ESTABA MIRANDO LA BARRA.'],
};
const FINAL_OK = 'JUANJO LA DICE EN VOZ ALTA. DOS VECES.';

export default class NoLaCagues {
  static instruccion = '¡NO LA CAGUES!';
  static ayuda = 'Toca la respuesta buena en 4 segundos. Una es de otra película y otra os delata; no contestar también es fallo. Tres fallos y las amigas se van.';
  static carga = ['zorro', 'gengar', 'amiga1', 'amiga2', 'buitre'];

  start({ params }) {
    const banco = G.data.night.preguntas[params.preguntas ?? 'clublucha'];
    const n = params.n ?? 6;
    const fija = banco.filter((q) => q.final);
    this.lista = [...barajar(banco.filter((q) => !q.final)).slice(0, n - fija.length), ...fija];
    this.pie = params.tejos ?? [];
    this.total = this.lista.length;
    this.idx = 0;
    this.fallos = 0;
    this.aciertos = 0;
    this.limite = endurece(4, 2.8);
    this.baila = S.coherencia < 50;
    this.t = 0;
    this.g = 0;           // reloj del dibujo
    this.buitreX = BUITRE_X[0];
    this.rects = [0, 1, 2].map((i) => ({ x: 6, y: BOTON_Y + i * (BOTON_H + 4), w: W - 12, h: BOTON_H }));
    this.res = null;
    this.prepara();
  }

  prepara() {
    const q = this.lista[this.idx];
    this.q = q;
    this.lineas = wrap(q.q, 'dialog', CAJA.w - 16);
    this.ops = barajar([{ txt: q.ok, tipo: 'ok' }, { txt: q.otra, tipo: 'otra' }, { txt: q.delata, tipo: 'delata' }]);
    this.fase = 'lee';
    this.t = LEE_SEG;
    this.reaccion = null;
    this.elegida = null;
  }

  update(dt) {
    this.g += dt;
    const metaX = BUITRE_X[Math.min(this.fallos, BUITRE_X.length - 1)];
    this.buitreX += Math.sign(metaX - this.buitreX) * Math.min(Math.abs(metaX - this.buitreX), 40 * dt);
    this.t -= dt;
    if (this.fase === 'lee') {
      if (this.t > 0) return;
      this.fase = 'responde';
      this.t = this.limite;
      input.consume();
      return;
    }
    if (this.fase === 'reaccion') {
      if (this.t > REACCION_SEG - 0.5 || (this.t > 0 && !input.confirm())) return;
      this.siguiente();
      return;
    }
    if (this.t <= 0) { this.responde(null); return; }
    const i = this.ops.findIndex((_, k) => input.tapIn(this.rects[k]) || input.hit(`Digit${k + 1}`));
    if (i >= 0) this.responde(this.ops[i]);
  }

  responde(op) {
    const tipo = op?.tipo ?? 'tiempo';
    this.elegida = op;
    if (tipo === 'ok') { this.aciertos++; audio.toque(); } else {
      this.fallos++;
      audio.fallo();
      vibrar();
      shake(0.2);
    }
    const lista = REACCIONES[tipo];
    this.reaccion = { tipo, txt: tipo === 'ok' && this.q.final ? FINAL_OK : lista[this.idx % lista.length] };
    this.fase = 'reaccion';
    this.t = REACCION_SEG;
  }

  siguiente() {
    if (this.fallos >= MAX_FALLOS) { this.res = 'lose'; return; }
    if (++this.idx >= this.total) { this.res = 'win'; return; }
    this.prepara();
  }

  result() { return this.res; }

  tarjeta(res) {
    if (res === 'lose') {
      return {
        titulo: '¡LA HAS CAGADO!',
        coste: 0,
        lineas: ['Las amigas cogen los bolsos.', 'Sin correr. Eso es lo peor.'],
        datos: [['ACIERTOS', `${this.aciertos}/${this.total}`]],
      };
    }
    const n = this.fallos === 0 ? 2 : 1;
    this.pie.slice(0, n).forEach((t) => sumarTejo(t));
    return {
      titulo: this.fallos ? '¡POR LOS PELOS!' : '¡DE PELÍCULA!',
      lineas: [this.fallos ? 'Nadie sospecha. Nadie escucha, tampoco.' : 'Juanjo se viene arriba. Muy arriba.'],
      datos: [['ACIERTOS', `${this.aciertos}/${this.total}`], ['TEJOS', n]],
    };
  }

  draw(ctx) {
    fondoTenue(ctx, '09-modernicolas-dentro', 2);
    const suelo = 136;
    const fila = [['0571', 52, 'EDWARD NORTON'], ['0094', 104, 'BRAD PITT, CASI'], ['0407', 162, null], ['0478', 200, null]];
    const delata = this.reaccion?.tipo === 'delata';
    for (const [id, x, rot] of fila) {
      const dx = delata && rot ? Math.round(Math.sin(this.g * 40) * 2) : 0;
      drawSprite(ctx, id, 'Idle', x < 130 ? DIR.derecha : DIR.izquierda, this.g * 60, x + dx, suelo, { escala: 2, sombra: true });
      if (rot) placa(ctx, rot, x, 44 + (x > 80 ? 12 : 0));
    }
    drawSprite(ctx, '0630', 'Walk', DIR.izquierda, this.g * 60, this.buitreX, suelo, { escala: 2, sombra: true });
    text(ctx, 'FALLOS', 170, 32, { font: 'label', color: C.gris });
    cifras(ctx, `${this.fallos}/${MAX_FALLOS}`, 214, 30, { escala: 2, color: this.fallos ? C.rojo_extintor : C.gris });
    this.pintaCaja(ctx);
    if (this.fase === 'lee') return;
    if (this.fase === 'responde') bar(ctx, 6, BOTON_Y - 8, W - 12, 6, this.t / this.limite, this.t < 1.2 ? C.rojo_extintor : C.cian_neon);
    this.ops.forEach((o, i) => {
      const r = this.rects[i];
      const dx = this.baila && this.fase === 'responde' ? Math.round(Math.sin(this.g * 2.4 + i * 2) * 4) : 0;
      const marca = this.fase === 'reaccion' && o.tipo === 'ok';
      const mala = this.fase === 'reaccion' && o === this.elegida && o.tipo !== 'ok';
      const off = this.fase === 'reaccion' && !marca && !mala;
      button(ctx, { ...r, x: r.x + dx }, o.txt, {
        font: 'dialog', active: marca,
        edge: mala ? C.rojo_extintor : C.morado,
        color: off ? C.gris : C.marfil,
      });
    });
  }

  pintaCaja(ctx) {
    const c = CAJA;
    panel(ctx, c.x, c.y, c.w, c.h, { edge: C.rosa_neon });
    cifras(ctx, `${this.idx + 1}/${this.total}`, c.x + c.w - 8, c.y + 7, { color: C.gris, align: 'right' });
    text(ctx, 'PREGUNTAN LAS AMIGAS', c.x + 8, c.y + 6, { font: 'label', color: C.rosa_claro });
    const y0 = c.y + 18;
    this.lineas.forEach((l, i) => text(ctx, l, c.x + 8, y0 + i * lineHeight('dialog'), { color: C.marfil }));
    if (!this.reaccion) return;
    const { tipo, txt } = this.reaccion;
    const color = tipo === 'ok' ? C.cian_neon : C.rojo_extintor;
    const lineas = wrap(txt, 'label', c.w - 16);
    lineas.forEach((l, i) => text(ctx, l, c.x + 8, c.y + c.h - 4 - (lineas.length - i) * lineHeight('label'), { font: 'label', color }));
  }
}

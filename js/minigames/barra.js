// ¡PIDE! II: la barra de Modernícolas. Hereda ¡PIDE! con cinco bebidas y dos Pokémon a la
// vez, y le añade a la camarera, que acerca copas que nadie ha pedido. Mientras se lee su
// traducción doble, las notas van a cámara lenta y no se pueden coger.
//   Aceptar: tejo (parada 'barra') y la copa, que baja coherencia.
//   Rechazar o dejarla pasar: Juanjo se pasa un rato explicándose y las notas no esperan.
// Cada dos aciertos, un punto de coherencia: el control de calidad. Fallar te bebe la copa
// como en ¡PIDE!. Tres fallos seguidos cierran la barra: se devuelve la coherencia de la
// entrada y los tejos de la barra se anulan. Sin dinero solo llega una copa, de Manolo.
import { C } from '../assets.js';
import { input } from '../input.js';
import { W } from '../screen.js';
import { text, wrap, lineHeight } from '../text.js';
import { bar, button, panel, rect } from '../draw.js';
import { DINERO_BARRA, S, barajar } from '../state.js';
import { anularTejos, coh, copa, endurece, sumarTejo, tejosDeParada } from '../medidores.js';
import { traduce } from '../night.js';
import { audio } from '../audio.js';
import { G } from '../game.js';
import { drawBebida, fondoTenue, retrato } from './dibujo.js';
import Pide from './pide.js';

const LENTO = 0.25;        // velocidad de las notas mientras la camarera habla
const OFERTA_SEG = 7;      // lo que espera con la copa en la mano
const EXCUSA_SEG = 1.5;    // lo que cuesta rechazarla
const GRACIA = 0.3;        // el toque con el que soltabas una nota no acepta sin querer
const CUANDO = [1, 3, 5];  // copas bien servidas tras las que llega cada oferta
const CUANDO_SIN = [2];
const PANEL = { x: 4, y: 240, w: 262, h: 140 };
const SI = { x: PANEL.x + 5, y: PANEL.y + 97, w: 124, h: 38 };
const NO = { x: PANEL.x + 133, y: PANEL.y + 97, w: 124, h: 38 };
const BARRA = 'barra';
const INTERVALO = 2.55;    // entre parejas de notas: justo lo que da de sí un pulgar

export default class Barra extends Pide {
  static instruccion = '¡PIDE! II';
  static ayuda = 'Como en Siglo XXI: arrastra cada nota a su grifo y mira arriba qué quiere ahora, con dos notas a la vez y cinco bebidas. Si la camarera te acerca una copa, toca ACEPTAR (tejo, pero bebes) o RECHAZAR (pierdes tiempo). Tres fallos seguidos y te cierra la barra.';
  static carga = ['manolo', 'zorro', 'buitre', 'camarera'];

  start({ coh: c, params }) {
    super.start({
      coh: c,
      params: {
        bebidas: ['cerveza', 'ipa', 'chupito', 'jagercerveza', 'jagerbomb'],
        pokemon: ['manolo', 'zorro'],
        aLaVez: 2, meta: 6, maxFallos: 3, ritmo: 1.4,
        ...params,
      },
    });
    this.intervalo = INTERVALO;      // lo endurecen la velocidad, los cambios y el tercer Pokémon
    this.velBase = endurece(1, 1.8);
    const datos = G.data.pedidos.camarera;
    this.sinBlanca = !!S.flags.sinBlanca || S.dinero < DINERO_BARRA;
    this.cola = this.sinBlanca
      ? CUANDO_SIN.map((n) => ({ n, ...datos.sinBlanca }))
      : CUANDO.map((n, i) => ({ n, ...datos.copas[i] }));
    this.excusas = barajar(datos.excusas);
    this.coh0 = S.coherencia;
    this.oferta = null;
    this.excusa = 0;
    this.excusaTxt = '';
    this.aciertos = 0;
    this.bebidasTuyas = 0;   // `fallos` aquí es la racha: se pone a cero al acertar
    this.aceptadas = 0;
    this.pausa = 1.2;
  }

  update(dt) {
    if (this.excusa > 0) {
      this.excusa -= dt;
      input.consume();
      super.update(dt);
      return;
    }
    if (this.oferta) {
      this.atiende(dt);
      input.consume();
      super.update(dt * LENTO);
      return;
    }
    super.update(dt);
    this.pausa -= dt;
    const def = this.cola[0];
    // Con una nota en la mano no se interrumpe: espera a que la sueltes.
    const yaEs = def && this.servidas >= this.p.meta;   // la última no se pierde por servir rápido
    if (def && (this.pausa <= 0 || yaEs) && !this.arr.obj && this.servidas >= def.n) this.ofrece(this.cola.shift());
  }

  /** Ninguna oferta se queda sin salir: la ronda acaba cuando ha pasado la última. */
  result() {
    if (this.servidas >= this.p.meta && (this.oferta || this.excusa > 0 || this.cola.length)) return null;
    return super.result();
  }

  ofrece(def) {
    const l = traduce(def.id);
    const tw = PANEL.w - 58;
    this.oferta = {
      def, l, t: OFERTA_SEG, gracia: GRACIA,
      idioma: wrap(l.idioma.toUpperCase(), 'label', tw).slice(0, 1),
      real: wrap(l.real.toUpperCase(), 'label', tw),
      texto: wrap(l.texto, 'dialog', tw),
    };
    audio.compas(true);
  }

  atiende(dt) {
    const o = this.oferta;
    if (o.gracia > 0) { o.gracia -= dt; return; }
    o.t -= dt;
    if (input.tapIn(SI) || input.hit('KeyA')) this.acepta();
    else if (input.tapIn(NO) || input.hit('KeyR') || o.t <= 0) this.rechaza();
  }

  acepta() {
    const { def } = this.oferta;
    this.oferta = null;
    this.pausa = 2;
    this.aceptadas++;
    copa(1, def.tipo);
    sumarTejo({ who: 'camarera', mood: 'Happy', pie: def.pie, real: def.realPie, parada: BARRA });
    audio.toque();
  }

  rechaza() {
    this.oferta = null;
    this.pausa = 2;
    this.excusa = EXCUSA_SEG;
    this.excusaTxt = this.excusas[this.cola.length % this.excusas.length];
    audio.compas(false);
  }

  alServir(n, tipo) {
    if (tipo !== 'bien') { this.bebidasTuyas++; return; }
    this.fallos = 0;
    if (++this.aciertos % 2 === 0) coh(-1);
  }

  tarjeta(res) {
    if (res === 'win') {
      return {
        titulo: '¡MARCHANDO!',
        lineas: [this.aceptadas ? 'Juanjo sale de la barra enamorado.' : 'Juanjo sale de la barra entero. Y un poco triste.'],
        datos: [['TE HAS BEBIDO', this.bebidasTuyas + this.aceptadas], ['TEJOS DE BARRA', tejosDeParada(BARRA)]],
      };
    }
    const n = anularTejos(BARRA);
    coh(this.coh0 - S.coherencia);
    return {
      titulo: '¡BARRA CERRADA!',
      coste: 0,
      lineas: ['La camarera te señala el otro lado del local.', 'Coherencia intacta. Corazón, no.'],
      datos: [['COPAS BIEN', `${this.servidas}/${this.p.meta}`], ['TEJOS ANULADOS', n]],
    };
  }

  fondo(ctx) { fondoTenue(ctx, '09-modernicolas-dentro', 3); }

  get rotulos() {
    return { ...super.rotulos, fallos: 'SEGUIDOS' };
  }

  pintaRevela(ctx) {
    if (this.excusa <= 0) { super.pintaRevela(ctx); return; }
    panel(ctx, 4, 338, W - 8, 42, { fill: C.carbon, edge: C.rosa_neon });
    wrap(this.excusaTxt, 'label', W - 24).forEach((l, i) => text(ctx, l, W >> 1, 345 + i * lineHeight('label'), { font: 'label', color: C.amarillo_mural, align: 'center' }));
    rect(ctx, 6, 377, Math.round((W - 12) * (this.excusa / EXCUSA_SEG)), 1, C.rosa_neon);
  }

  draw(ctx) {
    super.draw(ctx);
    if (this.oferta) this.pintaOferta(ctx);
  }

  pintaOferta(ctx) {
    const o = this.oferta, p = PANEL;
    panel(ctx, p.x, p.y, p.w, p.h, { fill: C.noche, edge: C.rosa_neon });
    retrato(ctx, 'camarera', p.x + 7, p.y + 7, { mood: o.l.retrato?.mood ?? 'Normal' });
    drawBebida(ctx, o.def.bebida, p.x + 20, p.y + 56);
    const tx = p.x + 53;
    let y = p.y + 6;
    for (const l of o.idioma) { text(ctx, l, tx, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    for (const l of o.real) { text(ctx, l, tx, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    y += 2;
    for (const l of o.texto) { text(ctx, l, tx, y, { color: C.marfil }); y += lineHeight('dialog'); }
    bar(ctx, p.x + 5, p.y + 91, p.w - 10, 4, o.t / OFERTA_SEG, C.rosa_neon);
    button(ctx, SI, 'ACEPTAR', { edge: C.rosa_neon });
    button(ctx, NO, 'RECHAZAR');
  }
}

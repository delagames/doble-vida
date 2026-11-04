// ¡REGATEA! en el chino: Meowth está cerrando y Juanjo quiere su litrona. Lo que queda abierto de
// la tienda es el tiempo: la persiana baja sobre el fondo 02 y, si llega abajo, se paga lo pedido.
// Meowth ya ha hecho caja: solo le cuadra su número, oculto y distinto en cada intento. Lo gris es
// lo que dice de verdad (corto, te pasas, casi) y lo grande, lo que entiende Juanjo, que se la
// inventa y a veces manda justo al revés. Con tres ofertas y lo gris bien leído siempre se llega.
import { C, img, bgPath } from '../assets.js';
import { input, inRect } from '../input.js';
import { H, W, shake } from '../screen.js';
import { text, wrap, lineHeight } from '../text.js';
import { cifras, panel, rect } from '../draw.js';
import { S } from '../state.js';
import { endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { DIR, drawSprite } from '../sprites.js';
import { retrato } from './dibujo.js';

const SU_MIN = 4, SU_MAX = 9;        // lo que cuesta bien: deja 6 o más tras la ronda de 15
const PIDE_MIN = 11, PIDE_MAX = 15;  // lo que cuesta mal: tras la ronda quedan menos de 6
const OFERTA_0 = 2;                  // Juanjo empieza por lo que lleva en el bolsillo de la camisa
const ESPERA = 0.45;                 // tras ofrecer: el doble toque no ofrece otra vez
const CIERRE_WIN = 0.8, CIERRE_LOSE = 1.3, CIERRE_PERSIANA = 0.35;

const HUECO = { x: 30, w: 212, y: 163 };     // el hueco de la tienda en el fondo
const LAMA = 5;
const P0 = 226, P1 = 344;                    // donde está el borde al empezar, y el suelo
const CHARLA = { x: 4, y: 27, w: W - 8, h: 84 };
const CUENTA = { x: 4, y: 344, w: W - 8, h: 42 };
const BANDA = { y: 389, h: H - 389 - 4 };
const BOTONES = {
  menos: { x: 4, y: BANDA.y, w: 76, h: BANDA.h },
  ofrece: { x: 83, y: BANDA.y, w: 104, h: BANDA.h },
  mas: { x: 190, y: BANDA.y, w: 76, h: BANDA.h },
};

// { real, juanjo }. {p} es lo que pide. Las que mandan al revés son la trampa.
const FRASES = {
  abre: [
    { real: 'Cierro ya. La litrona, {p}. ¿Cuánto das?', juanjo: 'Dice que abre esta noche solo para mí.' },
    { real: 'Ya he hecho caja. {p} euros, o dime algo.', juanjo: 'Dice que me hace caso. A mí. De los primeros.' },
    { real: 'Son las once. {p}. O me das otra cifra.', juanjo: 'Dice que soy su cliente Challenger.' },
  ],
  corto: [
    { real: 'Te quedas corto. Sube, que esto no es el ARAM.', juanjo: 'Dice que me quede. Que le encanta mi compañía.' },
    { real: 'Muy poco. Sube. Eso no paga ni el tapón.', juanjo: 'Dice que baje, que le imponen mis números.' },
    { real: 'Corto, primo. Sube. Y yo ya llevo el abrigo.', juanjo: 'Dice que se pone guapo para mí.' },
    { real: 'Sube. Con eso no le doy ni a la nevera.', juanjo: 'Dice que baje un poco. Que soy mucho para él.' },
  ],
  casiSube: [
    { real: 'Casi. Sube uno y te vas.', juanjo: 'Dice que casi se enamora. Casi.' },
    { real: 'Por poco. Uno más, venga, que cierro.', juanjo: 'Dice que baje uno. Que ya está en promos.' },
    { real: 'Te falta uno. Sube y a la calle.', juanjo: 'Dice que le falto yo. En su vida.' },
  ],
  casiBaja: [
    { real: 'Casi. Baja uno, que la caja no cuadra.', juanjo: 'Dice que suba uno. Por amor.' },
    { real: 'Te pasas por poco. Baja uno.', juanjo: 'Dice que estoy a un paso de su corazón.' },
    { real: 'Sobra uno. Baja, que ya he cerrado la caja.', juanjo: 'Dice que uno más y me da la llave.' },
  ],
  pasas: [
    { real: 'Te pasas. Baja. Eso no es regatear, es donar.', juanjo: 'Dice que suba, que mi elo lo agradece.' },
    { real: 'Mucho. Baja. Ya hice caja y me la descuadras.', juanjo: 'Dice que le cuadro. Que le cuadro mucho.' },
    { real: 'Te pasas. Baja. Es una litrona, no una skin.', juanjo: 'Dice que valgo más que una legendaria.' },
    { real: 'Baja, hombre. Que no soy una ONG de elo.', juanjo: 'Dice que tengo una cara que no tiene precio.' },
  ],
  trato: [
    { real: 'Eso. Justo eso. Dame y vete.', juanjo: 'Dice que nunca olvidará esta noche.' },
    { real: 'Ni uno más ni uno menos. Fuera.', juanjo: 'Dice que me espera fuera. Del trabajo, se entiende.' },
  ],
  harto: [
    { real: 'Se acabó. {p} y no me hables más.', juanjo: 'Dice que el {p} va a ser nuestro número.' },
    { real: 'Basta. Paga {p} o duermes en la nevera.', juanjo: 'Dice que me deja dormir allí. Con las litronas.' },
  ],
};

const azar = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** Lo gris medio borrado: letras al azar, fijas para esa frase. */
function borra(txt, f) {
  return [...txt].map((ch) => (/[A-ZÁÉÍÓÚÑ]/.test(ch) && Math.random() < f ? '.' : ch)).join('');
}

export default class Regatea {
  static instruccion = '¡REGATEA!';
  static ayuda = 'Meowth cierra y solo acepta un número secreto. Toca +1 y -1 y luego OFRECER. Lee lo gris: te dice si subir o bajar. Lo grande es Juanjo, y se lo inventa. Si baja la persiana o se cansa, pagas lo que pidió.';
  static carga = ['meowth', 'juanjo'];

  start({ params }) {
    this.su = params.precio ?? azar(SU_MIN, SU_MAX);
    this.pide = params.pide ?? azar(PIDE_MIN, PIDE_MAX);
    this.oferta = OFERTA_0;
    this.ofertas0 = params.ofertas ?? Math.round(endurece(4, 2));
    this.ofertas = this.ofertas0;
    this.dura = params.tiempo ?? endurece(22, 11);
    this.borrado = endurece(0, 0.55);
    this.t = 0;
    this.espera = 0;
    this.cierre = 0;          // cuenta atrás hasta el resultado
    this.acaba = null;
    this.res = null;
    this.motivo = null;
    this.tipo = 'abre';
    this.mood = 'Normal';
    this.usadas = {};
    this.pulso = 0;
    this.di('abre');
  }

  /** Saca una frase de ese tipo sin repetir la última, con lo gris ya medio borrado. */
  di(tipo) {
    const lista = FRASES[tipo];
    const n = ((this.usadas[tipo] ?? azar(0, lista.length - 1)) + 1) % lista.length;
    this.usadas[tipo] = n;
    const f = lista[n];
    const pon = (s) => s.replaceAll('{p}', this.pide);
    const tw = CHARLA.w - 58;
    this.tipo = tipo;
    this.gris = wrap(borra(pon(f.real).toUpperCase(), this.borrado), 'label', tw);
    this.grande = wrap(pon(f.juanjo), 'dialog', tw);
  }

  update(dt) {
    this.pulso = Math.max(0, this.pulso - dt);
    if (this.acaba) {
      this.cierre -= dt;
      if (this.cierre <= 0) this.res = this.acaba;
      return;
    }
    this.t += dt;
    this.espera = Math.max(0, this.espera - dt);
    if (this.t >= this.dura) {
      this.termina('lose', CIERRE_PERSIANA, 'persiana');
      shake(0.25);
      audio.golpe();
      return;
    }
    this.mandos();
  }

  mandos() {
    const q = input.pressed;
    const toca = (r) => !!q && inRect(q, r);
    if (toca(BOTONES.menos) || input.hit('ArrowDown', 'ArrowLeft')) this.cambia(-1);
    if (toca(BOTONES.mas) || input.hit('ArrowUp', 'ArrowRight')) this.cambia(1);
    if ((toca(BOTONES.ofrece) || input.hit('Enter', 'Space')) && this.espera <= 0) this.ofrece();
  }

  cambia(d) {
    const v = Math.max(1, Math.min(this.pide, this.oferta + d));
    if (v === this.oferta) return;
    this.oferta = v;
    audio.toque();
  }

  ofrece() {
    const d = this.oferta - this.su;
    this.ofertas--;
    this.espera = ESPERA;
    this.pulso = 0.2;
    audio.opcion();
    if (d === 0) { this.mood = 'Sigh'; this.di('trato'); this.termina('win', CIERRE_WIN); return; }
    if (this.ofertas <= 0) { this.mood = 'Angry'; this.di('harto'); this.termina('lose', CIERRE_LOSE, 'harto'); return; }
    const tipo = d <= -2 ? 'corto' : d === -1 ? 'casiSube' : d === 1 ? 'casiBaja' : 'pasas';
    this.mood = { corto: 'Angry', casiSube: 'Worried', casiBaja: 'Worried', pasas: 'Surprised' }[tipo];
    this.di(tipo);
  }

  termina(res, seg, motivo = null) {
    this.acaba = res;
    this.cierre = seg;
    this.motivo = motivo;
  }

  result() { return this.res; }

  tarjeta(res) {
    const paga = res === 'win' ? this.su : this.pide;
    S.pagado = paga;
    S.dinero = Math.max(0, S.dinero - paga);
    if (res === 'win') {
      return {
        titulo: '¡TRATO!',
        lineas: ['Meowth cuenta las monedas y baja la persiana.', 'Juanjo sale con la litrona. Dice que le ha ganado el 1 contra 1.'],
        datos: [['PEDÍA', this.pide], ['PAGAS', paga], ['TE QUEDAN', S.dinero]],
      };
    }
    S.flags.chinoCaro = true;
    return {
      titulo: '¡TE HA VISTO!',
      coste: 0,
      lineas: [
        this.motivo === 'harto' ? 'Meowth se ha cansado de oír a Juanjo.' : 'La persiana llega al suelo con Juanjo pensando.',
        'Cobra lo primero que dijo. Impuesto de bajo elo.',
      ],
      datos: [['SU NÚMERO', this.su], ['PAGAS', paga], ['TE QUEDAN', S.dinero]],
    };
  }

  // Dibujo ---------------------------------------------------------------------

  draw(ctx) {
    const pic = img(bgPath('02-chino'));
    if (pic) ctx.drawImage(pic, 0, 0); else rect(ctx, 0, 0, W, H, C.noche);
    const a = performance.now() * 0.06;
    drawSprite(ctx, '0052', 'Idle', DIR.abajo, a, 162, 306, { escala: 2 });
    this.pintaPersiana(ctx);
    drawSprite(ctx, 'juanjo', 'Idle', DIR.arriba, a, 96, 342, { escala: 2 });
    this.pintaCharla(ctx);
    this.pintaCuenta(ctx);
    this.pintaBotones(ctx);
  }

  /** Baja a golpes de lama, con el faldón abajo, igual que la de la cortinilla. */
  pintaPersiana(ctx) {
    const f = Math.min(1, this.t / this.dura);
    const y1 = Math.round(P0 + (P1 - P0) * f);
    const { x, w, y } = HUECO;
    rect(ctx, x, y, w, y1 - y, C.noche);
    for (let j = y + ((y1 - y) % LAMA); j < y1; j += LAMA) rect(ctx, x, j, w, 1, C.noche_clara);
    rect(ctx, x, y1 - 5, w, 5, C.carbon);
    rect(ctx, x, y1 - 5, w, 1, C.gris);
    rect(ctx, x + (w >> 1) - 9, y1 - 3, 18, 1, C.gris);
  }

  pintaCharla(ctx) {
    const r = CHARLA;
    panel(ctx, r.x, r.y, r.w, r.h);
    retrato(ctx, 'meowth', r.x + 7, r.y + 7, { mood: this.mood });
    let y = r.y + 6;
    const x = r.x + 54;
    for (const l of this.gris) { text(ctx, l, x, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    y += 3;
    for (const l of this.grande) { text(ctx, l, x, y, { color: C.marfil }); y += lineHeight('dialog'); }
  }

  pintaCuenta(ctx) {
    const r = CUENTA;
    panel(ctx, r.x, r.y, r.w, r.h, { fill: C.carbon, edge: this.pulso > 0 ? C.rosa_neon : C.morado });
    text(ctx, 'PIDE', r.x + 8, r.y + 7, { font: 'label', color: C.gris });
    cifras(ctx, this.pide, r.x + 8, r.y + 19, { escala: 3, color: C.gris });
    text(ctx, 'TU OFERTA', W >> 1, r.y + 5, { font: 'label', color: C.rosa_claro, align: 'center' });
    cifras(ctx, this.oferta, W >> 1, r.y + 15, { escala: 4, color: C.marfil, align: 'center' });
    const x = r.x + r.w - 8;
    text(ctx, 'OFERTAS', x, r.y + 7, { font: 'label', color: C.gris, align: 'right' });
    for (let i = 0; i < this.ofertas0; i++) {
      const px = x - 10 - i * 13;
      rect(ctx, px, r.y + 20, 10, 10, i < this.ofertas ? C.cian_neon : C.noche_clara);
    }
  }

  pintaBotones(ctx) {
    const pulsado = (b) => input.points.some((q) => inRect(q, b));
    const { menos, mas, ofrece } = BOTONES;
    const mando = (b, s) => {
      panel(ctx, b.x, b.y, b.w, b.h, { fill: pulsado(b) ? C.morado : C.noche_clara, edge: C.morado });
      cifras(ctx, s, b.x + (b.w >> 1), b.y + ((b.h - 25) >> 1), { escala: 5, align: 'center' });
    };
    mando(menos, '-1');
    mando(mas, '+1');
    const listo = this.espera <= 0 && !this.acaba;
    panel(ctx, ofrece.x, ofrece.y, ofrece.w, ofrece.h, { fill: pulsado(ofrece) ? C.rosa_neon : C.morado, edge: C.rosa_neon });
    text(ctx, 'OFRECER', ofrece.x + (ofrece.w >> 1), ofrece.y + ((ofrece.h - 15) >> 1), { font: 'bold', color: listo ? C.marfil : C.rosa_claro, align: 'center' });
  }
}

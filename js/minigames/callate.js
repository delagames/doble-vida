// ¡CÁLLATE!: un dedo mantiene la boca de Juanjo cerrada y el otro toca los pensamientos
// antes de que lleguen a ella. Soltar, o que llegue uno, y Juanjo lo dice en voz alta.
// En ordenador, Espacio mantenido hace de primer dedo y el ratón de segundo.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, H, shake, vibrar } from '../screen.js';
import { text, measure } from '../text.js';
import { bar, panel, rect } from '../draw.js';
import { barajar } from '../state.js';
import { endurece, ebriedad } from '../medidores.js';
import { audio } from '../audio.js';
import { DIR, drawSprite } from '../sprites.js';
import { fondoTenue, retrato } from './dibujo.js';

const PAD = { x: 4, y: 396, w: W - 8, h: H - 400 };
const BOCA_Y = 160, SALE_Y = 372;
const CARA = { x: 75, y: 40, lado: 120 };
const ESPERA_MAX = 12;         // sin dedo, Juanjo acaba hablando solo
const SOLTAR_GRACIA = 0.2;     // un dedo que resbala no es soltar
const MARGEN = 8;

const PENSAMIENTOS = [
  'TENGO NOVIA', 'ESTOY EN PROMOS', 'SOY TRADUCTOR', '¿VIENES MUCHO?', 'CONDUZCO YO',
  'HUELES A BOLSO', '¿TÚ JUEGAS AL LOL?', 'ME LLAMO JUANJO', 'MI ELO ES MENTIRA', 'LAURA',
  '¿Y ESE BOLSO?', 'ME HA MIRADO', 'SOY DE TOP', 'TE QUIERO', 'HOLA', 'ESTOY CASADO CASI',
  '¿UNA RANKED RÁPIDA?', 'ME FALTAN 12 PUNTOS', 'LO DEJO CUANDO QUIERA', '¿TIENES WIFI?', 'WUB WUB WUB',
  'ERES COMO UN ELO: SUBES', 'PLATA, PERO DE MANOS DIAMANTE', '¿CONOCES A MI PRIMO?', 'TENGO UNA LITRONA FUERA', 'ERES MI ÁLBUM',
];

export default class Callate {
  static instruccion = '¡CÁLLATE!';
  static ayuda = 'Son DOS DEDOS. Mantén uno en la franja de abajo: la boca cerrada. Con el otro, toca los pensamientos antes de que lleguen a la boca. Si sueltas, Juanjo habla. En ordenador: Espacio mantenido y ratón.';
  static carga = ['nerea', 'juanjo'];

  start({ params }) {
    this.dura = params.dura ?? endurece(14, 18);
    this.vel = params.vel ?? endurece(42, 62);
    this.ritmo = params.ritmo ?? endurece(0.85, 1.7);   // pensamientos por segundo
    this.rafaga = params.rafaga ?? endurece(1, 3);
    this.fase = 'espera';
    this.t = 0;
    this.sale = 0.3;
    this.pid = null;
    this.suelta = 0;
    this.lista = [];
    this.bolsa = barajar(PENSAMIENTOS);
    this.dicho = null;
    this.res = null;
    this.anim = 0;
    this.chispas = [];       // { x, y, t }: el pensamiento que revienta
    this.callados = 0;
  }

  /** Primer dedo: el que empezó en la franja, o Espacio. */
  sujetando() {
    if (input.key('Space')) return true;
    if (this.pid !== null && input.points.some((p) => p.id === this.pid)) return true;
    const p = input.points.find((q) => q.sy >= PAD.y);
    this.pid = p ? p.id : null;
    return !!p;
  }

  saca() {
    if (!this.bolsa.length) this.bolsa = barajar(PENSAMIENTOS);
    const txt = this.bolsa.pop();
    const extra = Math.round(endurece(0, 44));
    const w = measure(txt, 'bold') + 14 + extra;
    const h = 22 + Math.round(endurece(0, 12));
    const x = 6 + Math.floor(Math.random() * (W - 12 - w));
    // LAURA cuesta dos toques: es el único pensamiento que no se va a la primera.
    this.lista.push({ txt, w, h, x0: x, x, y: SALE_Y - h, deriva: Math.random() * 6, vidas: txt === 'LAURA' ? 2 : 1 });
  }

  update(dt) {
    this.anim += dt;
    const sujeta = this.sujetando();
    if (this.fase === 'espera') {
      this.t += dt;
      if (sujeta) { this.fase = 'juego'; this.t = 0; audio.toque(); }
      else if (this.t > ESPERA_MAX) this.pierde('¿HOLA?');
      return;
    }
    if (!sujeta) {
      this.suelta += dt;
      if (this.suelta > SOLTAR_GRACIA) { this.pierde(this.masCercano()?.txt ?? this.bolsa[0] ?? 'HOLA'); return; }
    } else this.suelta = 0;
    this.t += dt;
    if (this.t >= this.dura) { this.res = 'win'; return; }
    this.sale -= dt;
    if (this.sale <= 0) {
      const n = Math.max(1, Math.floor(this.rafaga + Math.random() * 0.6));
      this.sale = n / this.ritmo;     // tras una ráfaga hay más respiro: el ritmo medio manda
      for (let i = 0; i < n; i++) this.saca();
      // Las de la misma ráfaga no salen encima unas de otras.
      this.lista.slice(-n).forEach((o, i) => { o.y += i * (o.h + 4); });
    }
    this.mueve(dt);
    this.toques();
    this.chispas = this.chispas.filter((c) => (c.t -= dt) > 0);
  }

  /** Suben hacia la boca, y cuanto más arriba, más cerca del centro. */
  mueve(dt) {
    for (const o of this.lista) {
      o.y -= this.vel * dt;
      const f = Math.max(0, Math.min(1, (SALE_Y - o.y) / (SALE_Y - BOCA_Y)));
      const borracho = Math.sin(this.anim * 2 + o.deriva) * ebriedad() * 14;
      o.x = Math.max(2, Math.min(W - o.w - 2, o.x0 + ((W >> 1) - (o.w >> 1) - o.x0) * f * f + borracho));
      if (o.y <= BOCA_Y) { this.pierde(o.txt); return; }
    }
  }

  masCercano() { return this.lista.reduce((a, b) => (!a || b.y < a.y ? b : a), null); }

  toques() {
    const q = input.pressed;
    if (!q || q.y >= PAD.y) return;
    const orden = [...this.lista].sort((a, b) => a.y - b.y);
    const o = orden.find((p) => inRect(q, { x: p.x - MARGEN, y: p.y - MARGEN, w: p.w + MARGEN * 2, h: p.h + MARGEN * 2 }));
    if (!o) return;
    this.chispas.push({ x: o.x + (o.w >> 1), y: o.y + (o.h >> 1), t: 0.2 });
    audio.toque();
    if (--o.vidas > 0) { shake(0.08); return; }
    this.lista = this.lista.filter((p) => p !== o);
    this.callados++;
  }

  pierde(txt) {
    this.dicho = txt;
    this.res = 'lose';
    shake(0.3);
    vibrar();
  }

  result() { return this.res; }

  tarjeta(res) {
    if (res === 'win') return { titulo: '¡NI MU!', lineas: ['Juanjo no ha dicho nada.', 'Lo apunta como su mejor partida: cero muertes, cero asistencias, cero palabras.'], datos: [['PENSAMIENTOS CALLADOS', this.callados]] };
    const dicho = this.dicho ?? 'HOLA';
    return { titulo: '¡LO HA DICHO!', lineas: [`«${dicho[0]}${dicho.slice(1).toLowerCase()}»`, 'En voz alta. Nerea coge el bolso. Juanjo cree que es para darle su número.'] };
  }

  draw(ctx) {
    fondoTenue(ctx, '05-siglo-xxi', 2);
    const cerca = this.masCercano();
    const apurado = cerca && cerca.y < BOCA_Y + 70;
    retrato(ctx, 'juanjo', CARA.x, CARA.y, { lado: CARA.lado, mood: apurado ? 'Worried' : 'Normal' });
    this.pintaBoca(ctx);
    this.pintaNerea(ctx);
    for (const o of this.lista) {
      const x = Math.round(o.x), y = Math.round(o.y);
      const dura = o.vidas > 1;
      panel(ctx, x, y, o.w, o.h, { fill: dura ? C.rojo_extintor : C.marfil, edge: dura ? C.amarillo_mural : C.rosa_neon });
      text(ctx, o.txt, x + (o.w >> 1), y + ((o.h - 15) >> 1) + 1, { font: 'bold', color: dura ? C.marfil : C.carbon, align: 'center' });
    }
    for (const c of this.chispas) {
      const l = Math.round((0.2 - c.t) * 90) + 4;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) rect(ctx, Math.round(c.x + dx * l) - 1, Math.round(c.y + dy * l * 0.6) - 1, 3, 3, C.amarillo_mural);
    }
    this.pintaPad(ctx);
  }

  pintaBoca(ctx) {
    const y = BOCA_Y;
    const cerrada = this.fase === 'juego' && this.suelta === 0;
    panel(ctx, 83, y, 104, 12, { fill: C.carbon, edge: C.rojo_extintor });
    if (cerrada) {
      for (let x = 90; x < 180; x += 6) rect(ctx, x, y + 4, 4, 4, C.gris);
    } else rect(ctx, 96, y + 3, 78, 6, C.rojo_extintor);
  }

  pintaNerea(ctx) {
    const x = 36 + Math.round(Math.sin(this.anim * 1.3) * 16);  // va y viene mirando cojines
    drawSprite(ctx, '0282', 'Idle', Math.cos(this.anim * 1.3) > 0 ? DIR.derecha : DIR.izquierda, this.anim * 60, x, 150, { escala: 2, sombra: true });
    const y = 28;
    text(ctx, 'NEREA BUSCA EL BOLSO', W >> 1, y, { font: 'label', color: C.marfil, align: 'center', shadow: C.carbon });
  }

  pintaPad(ctx) {
    const dentro = this.fase === 'juego' && this.suelta === 0;
    panel(ctx, PAD.x, PAD.y, PAD.w, PAD.h, { fill: dentro ? C.morado : C.noche_clara, edge: dentro ? C.cian_neon : C.rosa_neon });
    bar(ctx, PAD.x + 8, PAD.y + 8, PAD.w - 16, 6, this.fase === 'juego' ? this.t / this.dura : 0, C.cian_neon);
    const parpadea = Math.floor(this.anim * 3) % 2 === 0;
    if (this.fase === 'espera') {
      text(ctx, 'PON UN DEDO AQUÍ', W >> 1, PAD.y + 24, { font: 'bold', color: parpadea ? C.rosa_claro : C.marfil, align: 'center' });
      text(ctx, 'Y NO LO SUELTES', W >> 1, PAD.y + 44, { font: 'label', color: C.marfil, align: 'center' });
    } else {
      text(ctx, this.suelta > 0 ? '¡NO SUELTES!' : 'BOCA CERRADA', W >> 1, PAD.y + 24, { font: 'bold', color: this.suelta > 0 ? C.rojo_extintor : C.marfil, align: 'center' });
      text(ctx, 'CON EL OTRO DEDO, TOCA LOS PENSAMIENTOS', W >> 1, PAD.y + 44, { font: 'label', color: C.marfil, align: 'center' });
    }
  }
}

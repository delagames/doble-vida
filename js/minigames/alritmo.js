// ¡AL RITMO!: Gengar golpea la barra y Juanjo pulsa al compás. Cada chupito de la fila es
// un compás: 4, 4, 3, 3, 5 y el Jäger a doble velocidad. Cuando el compás cambia, Gengar lo
// marca una vez solo. El chupito fallado va dos veces y al tercer fallo Gengar pone lo que
// quede de golpe. Se cobra chupito a chupito, así que cada trago endurece el siguiente.
//
// Todo va con el reloj del juego y se ve sin sonido: Gengar sube y cae, la barra salta, los
// cuadros del compás se encienden y una cinta trae los golpes hasta la marca.
// Por eso aquí no se usa Pulso: este ritmo cambia de velocidad y de compás a mitad.
import { C, img, bgPath } from '../assets.js';
import { input } from '../input.js';
import { W, shake, vibrar } from '../screen.js';
import { text, measure } from '../text.js';
import { cifras, dither, outline, panel, rect } from '../draw.js';
import { S } from '../state.js';
import { copa, ebriedad, endurece } from '../medidores.js';
import { ANTICIPO, audio } from '../audio.js';
import { DIR, drawSprite } from '../sprites.js';
import { fondoTenue } from './dibujo.js';

const FONDO = '07-alquimia-dentro';
// Los seis vasos pintados en el fondo 07: (x, y) arriba a la izquierda y nivel del líquido.
const VASOS = [
  { x: 58, y: 294, w: 21, h: 31, liq: 308 }, { x: 86, y: 292, w: 21, h: 31, liq: 307 },
  { x: 114, y: 291, w: 21, h: 29, liq: 304 }, { x: 141, y: 289, w: 21, h: 29, liq: 302 },
  { x: 168, y: 287, w: 21, h: 29, liq: 300 }, { x: 194, y: 285, w: 21, h: 29, liq: 298 },
];
const COMPASES = [4, 4, 3, 3, 5];
const JAGER_NOTAS = 8;
const FALLOS_MAX = 3;          // al tercero, el resto de golpe
const ENTRADA = 1.2;           // segundos antes del primer golpe
const RESPIRO = 2;             // golpes de Gengar entre un chupito y el siguiente: el trago
// Lo que tarda un toque en llegar en un móvil. Se descuenta, porque si no todo saldría tarde.
const LATENCIA = 0.08;

const CINTA = { x: 4, y: 386, w: W - 8, h: 56 };
const MARCA_X = 40;
const VISTA_X = 256;           // donde asoman los golpes
const VEL = 110;               // píxeles por segundo de la cinta
const CUADROS_Y = 54, CUADRO = 24;

export default class AlRitmo {
  static instruccion = '¡AL RITMO!';
  static ayuda = 'Gengar marca cada compás él solo; luego te toca a ti. Toca la pantalla cuando cada golpe llegue a la marca. El chupito fallado va dos veces. El último es de Jäger y va al doble.';
  static carga = ['gengar'];
  static musica = null;          // aquí la música es la barra: pistaChupitos, golpe a golpe

  start({ params }) {
    this.compases = params.compases ?? COMPASES;
    this.bpmSereno = params.bpm ?? 84;
    this.cola = [
      ...this.compases.map((n, i) => ({ n, vaso: i, jager: false, repe: false })),
      { n: JAGER_NOTAS, vaso: this.compases.length, jager: true, repe: false },
    ];
    this.vasos = VASOS.map(() => ({ vacio: false, dos: false }));
    this.idx = 0;
    this.t = 0;
    this.golpes = [];            // todos los golpes planificados: { t, jugador, fuerte, i, n }
    this.medida = null;
    this.anterior = null;        // compás del chupito anterior: si cambia, Gengar lo enseña
    this.proximo = ENTRADA;
    this.fallos = 0;
    this.bebidos = 0;
    this.deGolpe = 0;
    this.repes = 0;
    this.res = null;
    this.cobrado = false;
    this.golpeT = 9;             // tiempo desde el último golpe de Gengar
    this.ultimo = null;          // último golpe que ha sonado
    this.nota = null;            // BIEN, PRONTO, TARDE
    this.notaT = 0;
    this.tragoT = 0;
    this.sonados = 0;            // golpes ya mandados al audio
    this.racha = 0;              // golpes seguidos dentro
    this.rachaMax = 0;
    this.chispaT = 0;            // destello en la marca al acertar
    this.planifica(this.cola[0]);
  }

  /** Se mira la coherencia en cada chupito: lo bebido endurece lo que viene. */
  ritmo(s) {
    const per = 60 / (this.bpmSereno * (1 + ebriedad() * 0.26) * (s.jager ? 2 : 1));
    const ventana = Math.min(per * 0.45, endurece(0.19, 0.075));
    return { per, ventana, tolera: s.jager ? 3 : s.n >= 5 ? 2 : 1 };   // golpes que se perdonan
  }

  planifica(s) {
    const { per, ventana, tolera } = this.ritmo(s);
    const ensena = !s.repe && s.n !== this.anterior;
    this.anterior = s.n;
    let t = this.proximo;
    if (ensena) {
      for (let i = 0; i < s.n; i++) this.golpes.push({ t: t + i * per, per, jugador: false, fuerte: i % (s.jager ? 2 : s.n) === 0, i, n: s.n });
      t += s.n * per;
    }
    const beats = [];
    for (let i = 0; i < s.n; i++) {
      const b = { t: t + i * per, per, jugador: true, fuerte: i % (s.jager ? 2 : s.n) === 0, i, n: s.n, estado: null };
      this.golpes.push(b);
      beats.push(b);
    }
    const hasta = t + (s.n - 1) * per;
    const pasoR = s.jager ? per * 2 : per;
    for (let i = 1; i <= RESPIRO; i++) this.golpes.push({ t: hasta + i * pasoR, per: pasoR, jugador: false, fuerte: false, i: -1, n: 0 });
    this.proximo = hasta + (RESPIRO + 1) * pasoR;
    this.medida = { s, beats, per, ventana, tolera, desde: t, hasta, mal: 0 };
  }

  update(dt) {
    this.t += dt;
    this.golpeT += dt;
    this.notaT = Math.max(0, this.notaT - dt);
    this.tragoT = Math.max(0, this.tragoT - dt);
    this.chispaT = Math.max(0, this.chispaT - dt);
    this.suena();
    if (input.pressed && input.pressed.y >= 25) this.toca();
    else if (input.hit('Space', 'Enter')) this.toca();
    this.corrige();
  }

  suena() {
    for (const b of this.golpes) {
      if (!b.sonado && b.t - this.t <= ANTICIPO) this.mandaAudio(b);
      if (b.oido || b.t > this.t) continue;
      b.oido = true;
      this.ultimo = b;
      this.golpeT = 0;
    }
  }

  /** Se manda un poco antes y con su hora exacta: el golpe suena cuando llega a la marca. */
  mandaAudio(b) {
    b.sonado = true;
    const falta = Math.max(0, b.t - this.t);
    audio.compas(b.fuerte, falta);
    audio.pistaChupitos(this.sonados++, b.per ?? 0.5, falta, b.fuerte);
  }

  toca() {
    const m = this.medida;
    if (!m) return;
    const tt = this.t - LATENCIA;
    if (tt < m.desde - m.ventana || tt > m.hasta + m.ventana) return;   // Gengar marcando: se puede seguir sin castigo
    // Cada toque responde por el golpe más cercano que aún no tenga toque: un toque torcido es
    // un fallo, no dos (el suyo y el del golpe que se queda sin tocar).
    const libres = m.beats.filter((b) => !b.tocado);
    if (!libres.length) return;
    const b = libres.reduce((x, y) => (Math.abs(y.t - tt) < Math.abs(x.t - tt) ? y : x));
    b.tocado = true;
    if (b.estado === 'no') { this.anota('TARDE', C.rojo_extintor); return; }   // ya cobrado
    if (Math.abs(b.t - tt) <= m.ventana) {
      b.estado = 'ok';
      const justo = Math.abs(b.t - tt) <= m.ventana * 0.4;
      this.racha++;
      this.rachaMax = Math.max(this.rachaMax, this.racha);
      this.anota(justo ? '¡CLAVADO!' : 'BIEN', justo ? C.amarillo_mural : C.cian_neon);
      this.chispaT = 0.14;
      audio.toque();
      return;
    }
    b.estado = 'no';
    m.mal++;                                  // aporrear se paga: cada toque de más gasta un golpe
    this.racha = 0;
    this.anota(tt < b.t ? 'PRONTO' : 'TARDE', C.rojo_extintor);
    vibrar();
  }

  anota(txt, color) { this.nota = { txt, color }; this.notaT = 0.4; }

  corrige() {
    const m = this.medida;
    if (!m) return;
    for (const b of m.beats) {
      if (b.estado || this.t <= b.t + LATENCIA + m.ventana) continue;
      b.estado = 'no';
      m.mal++;
      this.racha = 0;
      this.anota('TARDE', C.rojo_extintor);
      vibrar();
    }
    if (m.beats.every((b) => b.estado)) this.trago(m);
  }

  bebe(s) {
    copa(1, s.jager ? 'jager' : 'chupito');
    this.bebidos++;
  }

  trago(m) {
    this.medida = null;
    const { s } = m;
    const fallado = m.mal > m.tolera;
    this.bebe(s);
    this.tragoT = 0.6;
    const v = this.vasos[s.vaso];
    this.idx++;
    if (fallado) {
      this.fallos++;
      shake(0.2);
      if (this.fallos < FALLOS_MAX && !s.repe) {
        this.cola.splice(this.idx, 0, { ...s, repe: true });   // el fallado va dos veces
        this.repes++;
        v.dos = true;
      } else v.vacio = true;
    } else { v.vacio = true; v.dos = false; }
    if (this.fallos >= FALLOS_MAX) { this.acaba(); return; }
    if (this.idx >= this.cola.length) { this.acaba(); return; }
    this.planifica(this.cola[this.idx]);
  }

  acaba() { this.res = this.fallos >= FALLOS_MAX ? 'lose' : 'win'; }

  /** Lo que quede en la fila se cobra aquí: también si el final es forzado. */
  cobraResto() {
    if (this.cobrado) return;
    this.cobrado = true;
    for (const s of this.cola.slice(this.idx)) { this.bebe(s); this.deGolpe++; }
    this.vasos.forEach((v) => { v.vacio = true; v.dos = false; });
    this.medida = null;
  }

  result() { return this.res; }

  tarjeta(res) {
    this.cobraResto();
    const datos = [['CHUPITOS BEBIDOS', this.bebidos]];
    if (this.repes) datos.push(['REPETIDOS', this.repes]);
    datos.push(['MEJOR RACHA', this.rachaMax]);
    if (res === 'win') {
      const lineas = this.fallos
        ? ['Con alguna repetición, como el buen dubstep.', 'Juanjo dice que Gengar sigue su ritmo. Gengar ya no está.']
        : ['Ni un golpe fuera. Gengar aplaude sin manos.', 'Manolo: «Gengar lleva cinco sin beber nada.» Juanjo: «Dice que voy ganando.»'];
      return { titulo: '¡DROP!', lineas, datos };
    }
    const lineas = this.deGolpe
      ? ['Gengar se cansa de marcar y le pone el resto de golpe.', 'Juanjo lo llama «ejecución de bajo elo».']
      : ['Tres fuera de compás. Gengar mira al techo.', 'Juanjo culpa al ping de la barra.'];
    if (this.deGolpe) datos.push(['DE GOLPE', this.deGolpe]);
    return { titulo: '¡DESCOMPÁS!', lineas, datos, coste: 0 };   // el fallo ya se paga en chupitos
  }

  // Dibujo --------------------------------------------------------------------

  /** 0 justo en el golpe, 1 cuando Gengar está arriba del todo. */
  get alzado() {
    const sig = this.golpes.find((b) => !b.oido);
    const per = this.medida?.per ?? 0.7;
    if (!sig) return 1;
    return 1 - Math.min(1, Math.max(0, sig.t - this.t) / per);
  }

  draw(ctx) {
    const pic = img(bgPath(FONDO));
    if (pic) ctx.drawImage(pic, 0, 0); else fondoTenue(ctx, FONDO, 0);
    this.pintaFila(ctx);
    this.pintaGengar(ctx);
    this.pintaCuadros(ctx);
    this.pintaWub(ctx);
    this.pintaCinta(ctx);
    this.pintaPie(ctx);
  }

  /** Con buena racha, Juanjo oye el drop de su coche donde solo hay un puño en la barra. */
  pintaWub(ctx) {
    if (this.racha < 5 || this.res) return;
    const grande = this.golpeT < 0.16;
    const f = this.racha >= 8 ? 'WUB WUB' : 'WUB';
    const y = grande ? 88 : 90;
    panel(ctx, 34, y, W - 68, 32, { edge: grande ? C.amarillo_mural : C.morado });
    text(ctx, f, W >> 1, y + 1, { font: 'huge', color: grande ? C.amarillo_mural : C.rosa_claro, align: 'center' });
  }

  pintaFila(ctx) {
    const salto = this.golpeT < 0.08 ? 2 : 0;
    const actual = this.cola[this.idx]?.vaso;
    VASOS.forEach((r, i) => {
      const v = this.vasos[i];
      const jager = i === VASOS.length - 1;
      const x0 = r.x + 3, w = r.w - 6, y0 = r.liq - salto, h = r.y + r.h - 4 - r.liq;
      if (salto) rect(ctx, x0 - 2, r.y + r.h - 3, w + 4, 2, C.carbon);   // el vaso salta
      if (v.vacio) rect(ctx, x0, y0, w, h, C.noche);
      else if (jager) {
        rect(ctx, x0, y0, w, h, C.jager);
        rect(ctx, x0, y0, w, 1, C.amarillo_mural);
      } else if (salto) rect(ctx, x0, y0, w, h, C.naranja_oscuro);
      if (v.dos) {
        panel(ctx, r.x + 2, r.y - 13, 17, 11, { edge: C.rojo_extintor });
        cifras(ctx, '+1', r.x + 10, r.y - 10, { color: C.marfil, align: 'center' });
      }
      if (i === actual && !this.res) {
        const y = r.y - (v.dos ? 21 : 9) - (this.golpeT < 0.12 ? 0 : 1);
        for (let k = 0; k < 4; k++) rect(ctx, r.x + 7 + k, y + k, 8 - 2 * k, 1, C.rosa_neon);
      }
    });
  }

  pintaGengar(ctx) {
    const a = this.alzado;
    const x = 243;
    const y = Math.round(318 - a * 14);
    const oculto = ebriedad() > 0.5 && a > 0.3 && a < 0.75;   // borracho, Gengar se pierde a ratos
    if (!oculto) drawSprite(ctx, '0094', 'Idle', DIR.izquierda, this.t * 60, x, y, { escala: 2, sombra: false });
    // El puño cae sobre la barra.
    const py = Math.round(308 - a * 22);
    rect(ctx, 215, py - 1, 15, 11, C.carbon);
    rect(ctx, 216, py, 13, 9, C.morado);
    rect(ctx, 216, py, 13, 2, C.rosa_claro);
    rect(ctx, 220, py + 4, 1, 5, C.carbon);
    rect(ctx, 224, py + 4, 1, 5, C.carbon);
    if (this.golpeT < 0.12) {
      const c = this.ultimo?.fuerte ? C.amarillo_mural : C.marfil;
      const l = this.ultimo?.fuerte ? 9 : 6;
      rect(ctx, 222 - l, 317, l - 2, 2, c);
      rect(ctx, 225, 317, l - 2, 2, c);
      rect(ctx, 222, 317 - l, 2, l - 2, c);
      rect(ctx, 217 - l, 311, 3, 2, c);
      rect(ctx, 230, 311, 3, 2, c);
    }
  }

  /** Arriba: un cuadro por golpe del compás. Se enciende el que está sonando. */
  pintaCuadros(ctx) {
    const b = this.ultimo;
    const m = this.medida;
    const n = m?.s.n ?? this.cola[this.idx]?.n ?? 4;
    const lado = Math.min(CUADRO, Math.floor((W - 24) / n) - 4);
    const paso = lado + 4;
    const x0 = (W - n * paso + 4) >> 1;
    const estado = this.estadoTexto();
    panel(ctx, 3, 27, W - 6, 58);
    text(ctx, estado.txt, W >> 1, 32, { font: 'bold', color: estado.color, align: 'center' });
    const vivo = b && b.n === n && this.golpeT < (m?.per ?? 0.7) * 0.6 ? b.i : -1;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * paso;
      const on = i === vivo;
      const tocaYa = !!(m && this.t >= m.desde - m.per);
      const color = on ? (tocaYa ? C.rosa_neon : C.cian_neon) : C.noche_clara;
      rect(ctx, x, CUADROS_Y, lado, lado, C.carbon);
      rect(ctx, x + 1, CUADROS_Y + 1, lado - 2, lado - 2, color);
      if (lado >= 18) cifras(ctx, i + 1, x + (lado >> 1), CUADROS_Y + 5, { color: on ? C.carbon : C.gris, align: 'center', escala: 3 });
    }
  }

  estadoTexto() {
    const m = this.medida;
    if (this.res) return { txt: this.res === 'win' ? '¡TODOS!' : '¡DE GOLPE!', color: C.marfil };
    if (this.tragoT > 0 || !m) return { txt: 'TRAGO', color: C.naranja_farola };
    if (this.t < m.desde - m.per * 0.5) {
      const s = m.s;
      if (s.repe) return { txt: 'OTRA VEZ: VA DOS VECES', color: C.rojo_extintor };
      return { txt: s.jager ? 'MIRA: JÄGER AL DOBLE' : `MIRA A GENGAR: DE ${s.n}`, color: C.cian_neon };
    }
    return { txt: m.s.jager ? '¡TE TOCA: JÄGER!' : `¡TE TOCA: DE ${m.s.n}!`, color: C.rosa_neon };
  }

  pintaCinta(ctx) {
    const c = CINTA;
    panel(ctx, c.x, c.y, c.w, c.h);
    const cy = c.y + (c.h >> 1) + 2;
    rect(ctx, c.x + 6, cy, c.w - 12, 1, C.morado);
    const m = this.medida;
    const v = (m?.ventana ?? 0.12) * VEL;
    // Zona de acierto: lo que se ve es lo que puntúa, y encoge con la coherencia.
    const zx = MARCA_X - Math.round(v);
    dither(ctx, zx, c.y + 5, Math.round(v * 2), c.h - 10, C.cian_neon, 1);
    rect(ctx, MARCA_X - 1, c.y + 4, 3, c.h - 8, this.golpeT < 0.1 ? C.amarillo_mural : C.marfil);
    if (this.chispaT > 0) {       // el acierto salta en la marca, donde se está mirando
      const l = Math.round(16 - this.chispaT * 60);
      rect(ctx, MARCA_X - l, cy - 1, l * 2 + 1, 3, C.amarillo_mural);
      rect(ctx, MARCA_X - 1, cy - l, 3, l * 2 + 1, C.marfil);
    }
    const borracho = ebriedad();
    for (const b of this.golpes) {
      const x = Math.round(MARCA_X + (b.t - this.t) * VEL);
      if (x > VISTA_X) break;
      if (x < c.x + 3) continue;
      const y = cy + Math.round(Math.sin(this.t * 5 + b.t * 3) * borracho * 7);
      this.pintaNota(ctx, x, y, b);
    }
    if (this.notaT > 0 && this.nota) {
      const w = measure(this.nota.txt, 'label') + 10;
      panel(ctx, MARCA_X + 12, c.y + 2, w, 13, { edge: this.nota.color });
      text(ctx, this.nota.txt, MARCA_X + 17, c.y + 4, { font: 'label', color: this.nota.color });
    }
  }

  pintaNota(ctx, x, y, b) {
    const alto = b.fuerte ? 10 : 7;
    const color = !b.jugador ? null : b.estado === 'ok' ? C.cian_neon : b.estado === 'no' ? C.rojo_extintor : C.rosa_neon;
    rect(ctx, x - 4, y - alto, 9, alto * 2, C.carbon);
    if (color) rect(ctx, x - 3, y - alto + 1, 7, alto * 2 - 2, color);
    else outline(ctx, x - 3, y - alto + 1, 7, alto * 2 - 2, C.gris);
  }

  pintaPie(ctx) {
    panel(ctx, 4, 444, W - 8, 32);
    const total = this.cola.length;
    const hecho = Math.min(total, this.bebidos);
    text(ctx, 'TOCA EN LA MARCA', 12, 450, { font: 'label', color: C.marfil });
    text(ctx, 'CHUPITOS', 12, 461, { font: 'label', color: C.gris });
    cifras(ctx, `${hecho}/${total}`, W - 12, 451, { align: 'right', escala: 3 });
    if (S.coherencia < 30) text(ctx, 'SIGUE LA CINTA', 98, 461, { font: 'label', color: C.rosa_claro });
  }
}


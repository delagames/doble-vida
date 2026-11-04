// ¡NO MIRES!: el dedo es la mirada. Sale de los zapatos (la zona de abajo) y hay que
// llevarla hasta la respuesta buena sin que el trazo cruce los ojos del portero. Tocar
// directamente no vale: la mirada solo nace en la zona, y al levantar el dedo vuelve a ella.
//
// Reutilizable: también son los Growlithe de ¡LA CARA!. Parámetros, todos opcionales:
//   actor       clave de cast.json; pinta su retrato a escala 3.
//   ojos        {x,y,w,h} en píxeles del retrato de 40×40.
//   preguntas   clave de `preguntas` en night.json, o la lista directamente. Cada una:
//               {idioma, real, juanjo, loca?, ok, malas: [a, b]}
//   fondo       id del fondo.
//   rondas      respuestas buenas seguidas para ganar.
//   escapeTras  vueltas a la manzana tras las que sale la vía de escape.
//   maxVueltas  con estas se acaba solo: nunca se bloquea.
//   coste       coherencia de salir por la vía de escape.
//   minutos     lo que suma al reloj cada vuelta a la manzana.
//   textos      sobrescribe lo que se quiera de TEXTOS.
// result() es 'win' si entra por derecho y 'lose' si sale por la vía de escape.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, shake, vibrar } from '../screen.js';
import { text, wrap, measure, lineHeight } from '../text.js';
import { button, cifras, dither, outline, panel, pixelLine, rect } from '../draw.js';
import { S, UMBRAL, barajar } from '../state.js';
import { ebriedad, endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { DIR, drawSprite, preload } from '../sprites.js';
import { G } from '../game.js';
import { fondoTenue, retrato } from './dibujo.js';

const PANEL = { x: 3, y: 27, w: W - 6, h: 74 };
const ZONA = { x: 4, y: 398, w: W - 8, h: 78 };
const ESCAPE_W = 106;
const BARRA = { x: 259, y: 116, w: 8, h: 268 };
const CX = 129, CY = 248;      // centro de las órbitas: los ojos, con el portero quieto
const LADO = 120;              // retrato a escala 3
const ESCALA = 3;
const CHIP_W = 100;
const MARGEN = 4;              // la respuesta se alcanza un poco antes de su borde
const POSADA = 0.18;           // segundos sobre una respuesta para darla: pasar por encima no cuenta
const PACIENCIA = 1.6;         // tras una pregunta nueva, la barra no sube: hay que leer
const VUELTA_SEG = 3.2;
const SOBRE_DEDO = 18;         // la mirada va por encima de la yema: el pulgar no tapa por dónde va
// Radios de la órbita por intento: cada vuelta a la manzana, más cerca de los ojos.
const ORBITAS = [[80, 126], [70, 106], [60, 90], [52, 78], [48, 70]];

const TEXTOS = {
  escape: 'IR PEGADO A GENGAR',
  vueltaTitulo: '¡A LA MANZANA!',
  vueltas: [
    'Jairo señala la esquina con dos brazos. Con los otros dos se cruza de brazos.',
    'Segunda vuelta. Juanjo saluda a una farola. La farola le ha mirado. Cuenta como tejo mental.',
    'Tercera vuelta. Un señor del barrio le da las buenas noches. Ya es vecino. Le llega el recibo del agua.',
    'Cuarta vuelta. Lleva más kilómetros que Manolo al volante. Y Manolo no conduce.',
  ],
  win: { titulo: '¡PASA!', lineas: ['Jairo aparta un brazo. El de abajo a la izquierda.', 'Juanjo cree que eso ha sido un abrazo.'] },
  winVueltas: 'VUELTAS A LA MANZANA',
  escapado: {
    titulo: 'INVISIBLE',
    lineas: ['Jairo no ve a Gengar. Por lógica, tampoco a lo que Gengar lleva de la mano.', 'Juanjo entra tarde y flotando.'],
  },
  harto: {
    titulo: 'INVISIBLE',
    lineas: ['Jairo se ha olvidado de quién es Juanjo. Y de quién es él.', 'Gengar se lo lleva dentro de la mano, como a un niño.'],
  },
};

const sobre = (zona, q) => inRect({ x: q.sx, y: q.sy }, zona);

/** ¿Corta el segmento a-b al rectángulo? Por tramos: un dedo rápido no salta por encima. */
function cruza(a, b, r) {
  const pasos = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
  for (let i = 0; i <= pasos; i++) {
    const f = i / pasos;
    if (inRect({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, r)) return true;
  }
  return false;
}

export function sumaMinutos(hora, min) {
  const [h, m] = hora.split(':').map(Number);
  const t = (h * 60 + m + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export default class NoMires {
  static instruccion = '¡NO MIRES!';
  static ayuda = 'Tu dedo es la mirada. Ponlo en tus zapatos, abajo, y arrástralo hasta la respuesta buena. Sin cruzar sus ojos. Lo que Juanjo traduce en grande no es lo que preguntan: lo de verdad va en gris.';
  static carga = ['jairo', 'juanjo', 'gengar'];

  start({ params }) {
    this.actor = params.actor ?? 'jairo';
    preload([this.actor]);
    this.ojosBase = params.ojos ?? { x: 12, y: 12, w: 20, h: 10 };
    this.fondo = params.fondo ?? '06-alquimia-puerta';
    this.banco = this.leePreguntas(params.preguntas ?? 'jairo');
    this.rondas = params.rondas ?? 3;
    this.escapeTras = params.escapeTras ?? 3;
    this.maxVueltas = params.maxVueltas ?? 5;
    this.coste = params.coste ?? 6;
    this.minutos = params.minutos ?? 3;
    this.tx = { ...TEXTOS, ...params.textos };

    this.vel = endurece(0.6, 1.25);             // velocidad de la órbita, rad/s
    this.sube = endurece(0.024, 0.09);          // la barra sube sola: esperar también cuesta
    this.saltoOjos = endurece(0.26, 0.62);
    this.saltoMala = endurece(0.22, 0.42);
    this.vaiven = Math.max(0, (85 - S.coherencia) / 85) * 62;   // el portero se mueve
    this.pulso = ebriedad() * 15;                // y la mirada tiembla
    this.halo = Math.round(endurece(5, 15));     // y los ojos ocupan más de lo que parece

    this.anim = 0;
    this.fase = 'juego';
    this.t = 0;
    this.contacto = 0;
    this.vueltas = 0;
    this.aciertos = 0;
    this.res = null;
    this.motivo = null;
    this.ojo = null;             // la mirada: { x, y, rastro, pid }
    this.bloqueado = null;       // dedo que ya gastó su mirada: hay que levantarlo
    this.posada = 0;
    this.chipPosado = null;
    this.aviso = null;
    this.avisoT = 0;
    this.golpe = 0;              // destello de los ojos
    this.mueveCara(0);
    this.nuevaRonda();
  }

  leePreguntas(p) {
    const lista = Array.isArray(p) ? p : G.data.night.preguntas?.[p];
    if (!lista?.length) throw new Error(`Sin preguntas: ${p}`);
    return lista;
  }

  nuevaRonda() {
    this.fase = 'juego';
    this.contacto = 0;
    this.aciertos = 0;
    this.bolsa = barajar(this.banco);
    [this.rx, this.ry] = ORBITAS[Math.min(this.vueltas, ORBITAS.length - 1)];
    this.sentido = this.vueltas % 2 ? -1 : 1;
    this.soltarMirada();
    this.siguiente();
  }

  siguiente() {
    if (!this.bolsa.length) this.bolsa = barajar(this.banco);
    this.q = this.bolsa.pop();
    this.paciencia = PACIENCIA;
    const juanjo = S.coherencia < UMBRAL.loca && this.q.loca ? this.q.loca : this.q.juanjo;
    this.rotulo = {
      idioma: wrap(this.q.idioma.toUpperCase(), 'label', PANEL.w - 12).slice(0, 1),
      real: wrap(this.q.real.toUpperCase(), 'label', PANEL.w - 12).slice(0, 2),
      juanjo: wrap(juanjo, 'dialog', PANEL.w - 12).slice(0, 2),
    };
    const base = Math.random() * Math.PI * 2;
    const orden = barajar([{ txt: this.q.ok, ok: true }, ...this.q.malas.slice(0, 2).map((txt) => ({ txt, ok: false }))]);
    this.chips = orden.map((o, i) => {
      const lineas = wrap(o.txt, 'bold', CHIP_W - 8);
      return {
        ...o,
        lineas,
        ang: base + (i * Math.PI * 2) / orden.length,
        w: Math.min(CHIP_W, Math.max(...lineas.map((l) => measure(l, 'bold'))) + 14),
        h: lineas.length * lineHeight('bold') + 9,
      };
    });
  }

  // Geometría ----------------------------------------------------------------

  mueveCara(dt) {
    this.anim += dt;
    this.cx = CX + Math.sin(this.anim * 1.1) * this.vaiven;
    this.cy = CY + Math.sin(this.anim * 1.7) * this.vaiven * 0.3;
  }

  /** Rectángulo de la cara: los ojos quedan justo en el punto (cx, cy). */
  get cara() {
    const o = this.ojosBase;
    return {
      x: Math.round(this.cx - (o.x + o.w / 2) * ESCALA),
      y: Math.round(this.cy - (o.y + o.h / 2) * ESCALA),
    };
  }

  /** Lo que no se puede cruzar. */
  get ojos() {
    const o = this.ojosBase, c = this.cara;
    const h = this.halo;
    return { x: c.x + o.x * ESCALA - h, y: c.y + o.y * ESCALA - h, w: o.w * ESCALA + h * 2, h: o.h * ESCALA + h * 2 };
  }

  chip(o) {
    const x = CX + Math.cos(o.ang) * this.rx - o.w / 2;
    const y = CY + Math.sin(o.ang) * this.ry - o.h / 2;
    return {
      x: Math.round(Math.max(2, Math.min(BARRA.x - o.w - 3, x))),
      y: Math.round(Math.max(PANEL.y + PANEL.h + 2, Math.min(ZONA.y - o.h - 3, y))),
      w: o.w,
      h: o.h,
    };
  }

  get escapeVisible() { return this.vueltas >= this.escapeTras; }

  get zona() { return this.escapeVisible ? { ...ZONA, w: ZONA.w - ESCAPE_W - 3 } : ZONA; }

  get botonEscape() { return { x: ZONA.x + ZONA.w - ESCAPE_W, y: ZONA.y, w: ESCAPE_W, h: ZONA.h }; }

  // Juego ---------------------------------------------------------------------

  soltarMirada() {
    if (this.ojo) this.bloqueado = this.ojo.pid;
    this.ojo = null;
    this.posada = 0;
    this.chipPosado = null;
  }

  avisa(txt) { this.aviso = txt; this.avisoT = 1.1; }

  subir(v) {
    this.contacto += v;
    if (this.contacto >= 1) this.aLaManzana();
  }

  aLaManzana() {
    this.soltarMirada();
    this.contacto = 1;
    this.vueltas++;
    S.hora = sumaMinutos(S.hora, this.minutos);
    shake(0.3);
    vibrar();
    if (this.vueltas >= this.maxVueltas) { this.acaba('harto'); return; }
    audio.fallo();
    this.fase = 'vuelta';
    this.t = VUELTA_SEG;
    const l = this.tx.vueltas;
    this.vueltaLineas = wrap(l[Math.min(this.vueltas - 1, l.length - 1)], 'dialog', W - 44);
  }

  acaba(motivo) { this.motivo = motivo; this.res = 'lose'; }

  update(dt) {
    this.mueveCara(dt);
    this.golpe = Math.max(0, this.golpe - dt);
    this.avisoT = Math.max(0, this.avisoT - dt);
    if (this.fase === 'vuelta') {
      this.t -= dt;
      if (this.t <= 0 || (this.t < VUELTA_SEG - 0.6 && input.tap)) this.nuevaRonda();
      return;
    }
    for (const o of this.chips) o.ang += this.vel * this.sentido * dt;
    if (this.escapeVisible && input.tapIn(this.botonEscape)) { this.soltarMirada(); this.acaba('escapado'); return; }
    if (this.paciencia > 0) this.paciencia -= dt;
    else this.subir(this.sube * dt);
    if (this.fase === 'juego') this.mirada(dt);
  }

  temblor() {
    if (!this.pulso) return { x: 0, y: 0 };
    return { x: Math.sin(this.anim * 7.3) * this.pulso, y: Math.cos(this.anim * 5.9) * this.pulso };
  }

  mirada(dt) {
    if (this.bloqueado !== null && !input.points.some((p) => p.id === this.bloqueado)) this.bloqueado = null;
    if (!this.ojo) {
      const zona = this.zona;
      const q = input.points.find((p) => p.id !== this.bloqueado && sobre(zona, p));
      if (q) {
        const y = q.y - SOBRE_DEDO;
        this.ojo = { x: q.x, y, pid: q.id, rastro: [{ x: q.x, y }] };
        audio.toque();
      } else if (input.pressed && !inRect(input.pressed, zona) && !(this.escapeVisible && inRect(input.pressed, this.botonEscape))) {
        this.avisa('LA MIRADA SALE DE TUS ZAPATOS');
      }
      return;
    }
    const q = input.points.find((p) => p.id === this.ojo.pid);
    if (!q) { this.soltarMirada(); return; }   // al levantar el dedo vuelve a los zapatos
    const m = this.temblor();
    const b = { x: q.x + m.x, y: q.y - SOBRE_DEDO + m.y };
    const a = { x: this.ojo.x, y: this.ojo.y };
    this.ojo.x = b.x; this.ojo.y = b.y;
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 2) {
      this.ojo.rastro.push(b);
      if (this.ojo.rastro.length > 90) this.ojo.rastro.shift();
    }
    if (cruza(a, b, this.ojos)) { this.teVe(); return; }
    this.posarse(b, dt);
  }

  /** Cruzar los ojos: la barra salta y la mirada se va al suelo del susto. */
  teVe() {
    this.golpe = 0.35;
    this.soltarMirada();
    this.avisa('¡TE HA VISTO!');
    shake(0.2);
    vibrar();
    audio.fallo();
    this.subir(this.saltoOjos);
  }

  posarse(p, dt) {
    const o = this.chips.find((c) => {
      const r = this.chip(c);
      return inRect(p, { x: r.x - MARGEN, y: r.y - MARGEN, w: r.w + MARGEN * 2, h: r.h + MARGEN * 2 });
    });
    if (o !== this.chipPosado) { this.chipPosado = o ?? null; this.posada = 0; }
    if (!o) return;
    this.posada += dt;
    if (this.posada >= POSADA) this.responde(o);
  }

  responde(o) {
    this.soltarMirada();
    if (!o.ok) {
      this.avisa('ESO NO ES LO QUE HA DICHO');
      shake(0.2);
      vibrar();
      audio.fallo();
      this.subir(this.saltoMala);
      return;
    }
    audio.toque();
    if (++this.aciertos >= this.rondas) { this.res = 'win'; return; }
    this.avisa('CUELA');
    this.siguiente();
  }

  result() { return this.res; }

  tarjeta(res) {
    S.hora = sumaMinutos(S.hora, res === 'win' ? 5 : 10);   // entrar lleva su rato; colarse, más
    if (res === 'win') {
      return { ...this.tx.win, datos: this.vueltas ? [[this.tx.winVueltas, this.vueltas]] : [] };
    }
    const c = this.tx[this.motivo] ?? this.tx.escapado;
    return { ...c, datos: this.vueltas ? [[this.tx.winVueltas, this.vueltas]] : [], coste: this.coste };
  }

  // Dibujo --------------------------------------------------------------------

  draw(ctx) {
    fondoTenue(ctx, this.fondo, 2);
    const c = this.cara;
    retrato(ctx, this.actor, c.x, c.y, { lado: LADO });
    this.pintaChips(ctx);
    this.pintaOjos(ctx);
    this.pintaMirada(ctx);
    this.pintaBarra(ctx);
    this.pintaZona(ctx);
    this.pintaPregunta(ctx);
    if (this.avisoT > 0 && this.fase === 'juego') {
      const w = measure(this.aviso, 'label') + 12;
      panel(ctx, (W - w) >> 1, 104, w, 14, { edge: C.rosa_neon });
      text(ctx, this.aviso, W >> 1, 107, { font: 'label', color: C.marfil, align: 'center' });
    }
    if (this.fase === 'vuelta') this.pintaVuelta(ctx);
  }

  pintaChips(ctx) {
    for (const o of this.chips) {
      const r = this.chip(o);
      const encima = o === this.chipPosado;
      panel(ctx, r.x, r.y, r.w, r.h, { fill: encima ? C.morado : C.marfil, edge: encima ? C.cian_neon : C.rosa_neon });
      o.lineas.forEach((l, i) => text(ctx, l, r.x + (r.w >> 1), r.y + 4 + i * lineHeight('bold'), { font: 'bold', color: encima ? C.marfil : C.carbon, align: 'center' }));
      if (encima) rect(ctx, r.x + 2, r.y + r.h - 4, Math.round((r.w - 4) * Math.min(1, this.posada / POSADA)), 2, C.cian_neon);
    }
  }

  pintaOjos(ctx) {
    const o = this.ojos;
    const color = this.golpe > 0 ? C.amarillo_mural : C.rosa_neon;
    if (this.golpe > 0) dither(ctx, o.x, o.y, o.w, o.h, C.rosa_neon, 2);
    const paso = Math.floor(this.anim * 6) % 4;
    for (let x = o.x - paso; x < o.x + o.w; x += 8) {   // la franja prohibida, en marcha
      const a = Math.max(o.x, x), b = Math.min(o.x + o.w, x + 5);
      if (b > a) { rect(ctx, a, o.y, b - a, 2, color); rect(ctx, a, o.y + o.h - 2, b - a, 2, color); }
    }
    rect(ctx, o.x, o.y, 2, o.h, color);
    rect(ctx, o.x + o.w - 2, o.y, 2, o.h, color);
  }

  pintaMirada(ctx) {
    if (!this.ojo) return;
    const r = this.ojo.rastro;
    for (let i = 1; i < r.length; i++) pixelLine(ctx, r[i - 1].x, r[i - 1].y, r[i].x, r[i].y, C.carbon, 3);
    for (let i = 1; i < r.length; i++) pixelLine(ctx, r[i - 1].x, r[i - 1].y, r[i].x, r[i].y, C.cian_neon, 1);
    const x = Math.round(this.ojo.x), y = Math.round(this.ojo.y);
    panel(ctx, x - 6, y - 4, 13, 9, { fill: C.marfil, edge: C.cian_neon });
    rect(ctx, x - 1, y - 2, 3, 5, C.carbon);
  }

  pintaBarra(ctx) {
    const b = BARRA;
    rect(ctx, b.x - 2, b.y - 12, b.w + 4, b.h + 14, C.carbon);
    outline(ctx, b.x - 2, b.y - 12, b.w + 4, b.h + 14, C.morado);
    const ojoY = b.y - 9;                              // el ojo de arriba: esto mide la mirada
    rect(ctx, b.x, ojoY, b.w, 6, C.marfil);
    rect(ctx, b.x + 3, ojoY + 1, 2, 4, C.rosa_neon);
    rect(ctx, b.x, b.y, b.w, b.h, C.noche_clara);
    const h = Math.round(b.h * Math.min(1, this.contacto));
    rect(ctx, b.x, b.y + b.h - h, b.w, h, this.contacto > 0.66 ? C.rojo_extintor : C.rosa_neon);
    for (let i = 1; i < 4; i++) rect(ctx, b.x, b.y + Math.round((b.h * i) / 4), b.w, 1, C.carbon);
  }

  pintaZona(ctx) {
    const z = this.zona;
    const activa = !!this.ojo;
    panel(ctx, z.x, z.y, z.w, z.h, { fill: activa ? C.morado : C.noche_clara, edge: activa ? C.cian_neon : C.rosa_neon });
    const cx = z.x + (z.w >> 1);
    this.pintaVans(ctx, cx - 34, z.y + 26);
    this.pintaVans(ctx, cx + 4, z.y + 26);
    const parpadea = Math.floor(this.anim * 3) % 2 === 0;
    text(ctx, activa ? 'SUBE LA MIRADA' : 'PON EL DEDO EN TUS ZAPATOS', cx, z.y + 7, { font: 'label', color: activa ? C.marfil : parpadea ? C.rosa_claro : C.marfil, align: 'center' });
    for (let i = 0; i < this.rondas; i++) {
      const x = cx + (i - this.rondas / 2) * 14 + 2;
      rect(ctx, x, z.y + 60, 10, 10, C.carbon);
      rect(ctx, x + 1, z.y + 61, 8, 8, i < this.aciertos ? C.cian_neon : C.noche);
    }
    if (this.vueltas) {
      text(ctx, 'VUELTAS', z.x + 8, z.y + 61, { font: 'label', color: C.gris });
      cifras(ctx, this.vueltas, z.x + 8 + measure('VUELTAS', 'label') + 4, z.y + 60, { escala: 2, color: C.marfil });
    }
    if (this.escapeVisible) {
      button(ctx, this.botonEscape, this.tx.escape, { font: 'bold', fill: C.noche, edge: C.gris });
    }
  }

  /** Una Vans de cuadros, porque Juanjo se las ve mucho esta noche. */
  pintaVans(ctx, x, y) {
    rect(ctx, x, y + 6, 30, 16, C.carbon);
    rect(ctx, x + 1, y + 7, 28, 14, C.marfil);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 7; i++) if ((i + j) % 2 === 0) rect(ctx, x + 1 + i * 4, y + 7 + j * 4, 4, 4, C.carbon);
    rect(ctx, x, y + 20, 30, 3, C.blanco_extintor);
    rect(ctx, x + 2, y, 13, 7, C.carbon);
    rect(ctx, x + 3, y + 1, 11, 6, C.noche_clara);
  }

  pintaPregunta(ctx) {
    panel(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    let y = PANEL.y + 5;
    const x = PANEL.x + 6;
    for (const l of this.rotulo.idioma) { text(ctx, l, x, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    for (const l of this.rotulo.real) { text(ctx, l, x, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    y += 2;
    for (const l of this.rotulo.juanjo) { text(ctx, l, x, y, { color: C.marfil }); y += lineHeight('dialog'); }
  }

  pintaVuelta(ctx) {
    dither(ctx, 0, 25, W, 455, C.carbon, 3);
    const h = 66 + this.vueltaLineas.length * lineHeight('dialog') + 44;
    const y = 150;
    panel(ctx, 12, y, W - 24, h, { edge: C.rosa_neon });
    text(ctx, this.tx.vueltaTitulo, W >> 1, y + 14, { font: 'bold', color: C.rosa_neon, align: 'center' });
    this.vueltaLineas.forEach((l, i) => text(ctx, l, W >> 1, y + 36 + i * lineHeight('dialog'), { color: C.marfil, align: 'center' }));
    const f = 1 - this.t / VUELTA_SEG;
    const x = 30 + f * (W - 60);
    drawSprite(ctx, 'juanjo', 'Walk', DIR.derecha, this.anim * 60, x, y + h - 10, { sombra: true });
  }
}

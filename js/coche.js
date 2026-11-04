// El coche por dentro: la ciudad pasando como capa sobre el fondo 03, el reproductor,
// el móvil en el soporte, los asientos, que a la vuelta llevan uno vacío,
// y los gags del volumen y la litrona. El audio del primo llega como texto. El volumen que se ve
// es el volumen que suena: el deslizador manda sobre el dubstep de verdad.
import { C, img, bgPath } from './assets.js';
import { input, inRect } from './input.js';
import { W, H, shake } from './screen.js';
import { text } from './text.js';
import { button, cajaVacia, cifras, dither, outline, panel, rect } from './draw.js';
import { Aviso, Dialog } from './dialog.js';
import { traduce } from './night.js';
import { DIR, drawSprite } from './sprites.js';
import { S, coh, rellenar } from './state.js';
import { G } from './game.js';
import { audio } from './audio.js';
import { ciudadDeDia, pintaAmbiente } from './ambiente.js';

const BG = '03-coche';
const VP = { x: 138, y: 246 };                 // punto de fuga de la carretera
const CRISTAL = [[0, 138], [270, 138], [270, 279], [150, 279], [60, 270], [0, 262]];
const TAPA = [                                 // lo que está por delante del cristal
  { x: 100, y: 138, w: 90, h: 40 },            // retrovisor
  { x: 154, y: 250, w: 36, h: 32 },            // móvil
  { x: 197, y: 268, w: 34, h: 14 },            // cuello de la litrona
];
const RADIO = { x: 102, y: 323, w: 45, h: 14 };
const MOVIL = { x: 159, y: 257, w: 25, h: 44 };
const TOQUE_MOVIL = { x: 150, y: 250, w: 42, h: 62 };
const TOQUE_LITRONA = { x: 192, y: 268, w: 44, h: 114 };
const UI_Y = 384;
const SLIDER = { x: 12, y: 448, w: 150, h: 22 };
const ZONA_SLIDER = { x: 2, y: 436, w: 172, h: 44 };
const TRAGO = { x: 180, y: 442, w: 80, h: 30 };
const VOL_MAX = 11, VOL_MANOLO = 3, VOL_MOLESTA = 6;
const TRAGOS_LITRONA = 3;       // cada tramo trae litrona nueva: acabársela es llegar
const COSTE_TRAGO = 2;
const PRORROGA = 8;             // segundos de más si ya se ha empezado a beber

// Asientos -------------------------------------------------------------------

const TILE = { y: 29, w: 50, h: 66, gap: 3, x0: 5 };

/**
 * Fila de asientos con quien va en cada uno: quien conduce y S.coche (delante y tres
 * detrás). Un null pinta el asiento vacío, sin más: ese es el final del Buitre.
 */
function drawAsientos(ctx, ocupantes, { conductor = 'juanjo', t = 0, bote = 0 } = {}) {
  const fila = [conductor, ...ocupantes];
  const rotulos = G.data.night.textos.asientos;
  fila.forEach((who, i) => {
    const x = TILE.x0 + i * (TILE.w + TILE.gap);
    panel(ctx, x, TILE.y, TILE.w, TILE.h, { fill: C.carbon, edge: i < 2 ? C.morado : C.noche_clara });
    // Respaldo y reposacabezas.
    rect(ctx, x + 8, TILE.y + 24, TILE.w - 16, TILE.h - 26, C.noche_clara);
    outline(ctx, x + 8, TILE.y + 24, TILE.w - 16, TILE.h - 26, C.noche);
    rect(ctx, x + 16, TILE.y + 12, TILE.w - 32, 12, C.noche_clara);
    outline(ctx, x + 16, TILE.y + 12, TILE.w - 32, 12, C.noche);
    const c = who && G.data.cast[who];
    if (c?.sprite) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, TILE.y + 2, TILE.w - 4, TILE.h - 13);
      ctx.clip();
      const salto = bote && (i + Math.floor(t / 12)) % 2 ? 1 : 0;
      drawSprite(ctx, c.sprite, 'Idle', DIR.abajo, t + i * 9, x + (TILE.w >> 1), TILE.y + TILE.h - 8 - salto);
      ctx.restore();
    }
    rect(ctx, x + 2, TILE.y + TILE.h - 11, TILE.w - 4, 9, C.carbon);
    text(ctx, rotulos[Math.min(i, rotulos.length - 1)], x + (TILE.w >> 1), TILE.y + TILE.h - 11, { font: 'label', color: C.gris, align: 'center' });
  });
}

// La ciudad pasando ----------------------------------------------------------

/** Farolas que nacen en el punto de fuga y salen por los lados del cristal. */
class Ciudad {
  constructor(dia = false) {
    this.dia = dia;           // a la vuelta ya no es de noche: farolas apagadas y luz de mañana
    this.cosas = [];
    for (let i = 0; i < 8; i++) this.cosas.push({ z: i / 8, lado: i % 2 ? 1 : -1, });
    this.raya = 0;
    this.semaforo = null;     // profundidad del semáforo en rojo, mientras pasa
  }

  update(dt) {
    this.raya = (this.raya + dt * 1.6) % 1;
    for (const c of this.cosas) {
      c.z += dt * 0.42;
      if (c.z > 1) c.z -= 1;
    }
    if (this.semaforo !== null) {
      this.semaforo += dt * 0.34;
      if (this.semaforo >= 1) this.semaforo = null;
    }
  }

  /** Un semáforo en rojo a la derecha: crece, pasa y nadie frena. */
  pintaSemaforo(ctx) {
    const s = this.semaforo * this.semaforo;
    const x = Math.round(VP.x + 16 + s * 150);
    const y = Math.round(VP.y + 4 + s * 34);
    const alto = Math.round(12 + s * 90);
    const a = Math.round(3 + s * 9);
    rect(ctx, x, y - alto, Math.max(1, a >> 2), alto, C.carbon);
    const cx = x - (a >> 1), arriba = y - alto - a * 3;
    rect(ctx, cx - 1, arriba - 1, a + 2, a * 3 + 2, C.carbon);
    outline(ctx, cx - 1, arriba - 1, a + 2, a * 3 + 2, C.noche_clara);
    const luz = Math.max(1, a - 2);
    rect(ctx, cx + ((a - luz) >> 1), arriba + ((a - luz) >> 1), luz, luz, C.rojo_extintor);
  }

  draw(ctx) {
    const bg = img(bgPath(BG));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(CRISTAL[0][0], CRISTAL[0][1]);
    CRISTAL.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.clip();
    if (this.dia && bg) ctx.drawImage(ciudadDeDia(bg), 0, 130);
    // Rayas de la carretera: bajan hacia el coche y crecen.
    for (let i = 0; i < 3; i++) {
      const z = (i / 3 + this.raya) % 1;
      const s = z * z;
      const y = VP.y + Math.round(s * 34);
      rect(ctx, VP.x - 1 - Math.round(s), y, 2 + Math.round(s * 3), 1 + Math.round(s * 7), C.amarillo_mural);
    }
    const orden = [...this.cosas].sort((a, b) => a.z - b.z);
    for (const c of orden) {
      const s = c.z * c.z;
      const x = Math.round(VP.x + c.lado * (24 + s * 300));
      const y = Math.round(VP.y + 6 + s * 30);
      const alto = Math.round(10 + s * 130);
      const g = Math.round(1 + s * 3);
      rect(ctx, x, y - alto, g, alto, C.carbon);
      const b = Math.round(2 + s * 8);
      if (!this.dia) dither(ctx, x - b * 2, y - alto - b, b * 4, b * 3, C.naranja_farola, 1);
      rect(ctx, x - b, y - alto - b + 1, b * 2 + 1, b, this.dia ? C.gris : C.amarillo_mural);
      outline(ctx, x - b, y - alto - b + 1, b * 2 + 1, b, C.carbon);
    }
    if (this.semaforo !== null) this.pintaSemaforo(ctx);
    ctx.restore();
    if (!bg) return;
    TAPA.forEach((r, i) => {
      if (this.dia && i === 0) ctx.drawImage(ciudadDeDia(bg), r.x, r.y - 130, r.w, r.h, r.x, r.y, r.w, r.h);
      else ctx.drawImage(bg, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    });
  }
}

// La capa que sigue viva entre pasos ------------------------------------------

export class Coche {
  constructor({ dia = false } = {}) {
    this.ciudad = new Ciudad(dia);
    this.t = 0;
    this.vol = 9;      // Juanjo lo lleva así de serie
    this.movil = 0;    // 1: audio sin escuchar, parpadea
    this.mano = 0;     // brazo de Manolo camino del reproductor
    this.wubs = [];
    this.wubT = 0;
    this.oido = null;  // el volumen que tiene puesto el audio
  }

  /** El oído no es lineal: con esta curva, del 3 de Manolo al 9 de Juanjo hay un mundo. */
  volumenReal() {
    if (this.vol === this.oido) return;
    this.oido = this.vol;
    audio.nivelTema((this.vol / VOL_MAX) ** 1.7);
  }

  update(dt) {
    this.volumenReal();
    this.t += dt * 60;
    this.ciudad.update(dt);
    this.mano = Math.max(0, this.mano - dt);
    if (this.vol >= VOL_MOLESTA) {
      this.wubT -= dt;
      if (this.wubT <= 0) {
        this.wubT = 1.3 - this.vol * 0.08;
        this.wubs.push({ x: RADIO.x + Math.floor(Math.random() * RADIO.w), y: RADIO.y - 6, t: 1 });
      }
    }
    for (const w of this.wubs) { w.t -= dt; w.y -= dt * 24; }
    this.wubs = this.wubs.filter((w) => w.t > 0);
  }

  draw(ctx) {
    pintaAmbiente(ctx, BG);
    this.ciudad.draw(ctx);
    drawAsientos(ctx, S.coche, { t: this.t, bote: this.vol >= VOL_MOLESTA });
    this.pintaRadio(ctx);
    if (this.movil) this.pintaAvisoMovil(ctx);
    if (this.tragada) this.pintaLitrona(ctx);
    for (const w of this.wubs) text(ctx, 'WUB', w.x, w.y, { font: 'label', color: C.rosa_neon, shadow: C.carbon, align: 'center' });
    if (this.mano > 0) this.pintaBrazo(ctx);
  }

  pintaRadio(ctx) {
    const r = RADIO;
    rect(ctx, r.x, r.y, r.w, r.h, C.carbon);
    const beat = Math.floor(this.t / 7);
    for (let i = 0; i < 10; i++) {
      const v = ((beat * (i + 3) * 7) % 5) / 5;
      const h = Math.max(1, Math.round(((1 + v * 11) * this.vol) / VOL_MAX));
      rect(ctx, r.x + 2 + i * 3, r.y + r.h - 1 - h, 2, h, i > 6 ? C.rosa_neon : C.cian_neon);
    }
    cifras(ctx, this.vol, r.x + r.w - 2, r.y + 4, { color: C.amarillo_mural, align: 'right' });
  }

  pintaAvisoMovil(ctx) {
    const m = MOVIL;
    rect(ctx, m.x, m.y, m.w, m.h, C.noche);
    if (Math.floor(this.t / 20) % 2) outline(ctx, m.x, m.y, m.w, m.h, C.verde_ipa);
    // Nota de voz: botón de play y onda.
    const cx = m.x + 12, cy = m.y + 14;
    rect(ctx, cx - 6, cy - 6, 13, 13, C.verde_ipa);
    for (let i = 0; i < 5; i++) rect(ctx, cx - 2 + i, cy - 3 + (i >> 1), 1, 7 - i, C.carbon);
    for (let i = 0; i < 7; i++) rect(ctx, m.x + 3 + i * 3, m.y + 36 - (i * 5) % 7 - 1, 2, 1 + (i * 5) % 7, C.gris);
  }

  pintaLitrona(ctx) {
    // Marcas de tragos junto a la botella: el fondo no se toca.
    for (let i = 0; i < TRAGOS_LITRONA; i++) {
      const y = 372 - i * 5;
      rect(ctx, 236, y, 5, 4, C.carbon);
      rect(ctx, 237, y + 1, 3, 2, i < TRAGOS_LITRONA - this.tragada ? C.naranja_farola : C.noche_clara);
    }
  }

  pintaBrazo(ctx) {
    // El brazo de Manolo entra desde el copiloto hasta el reproductor.
    const f = Math.min(1, (0.8 - this.mano) * 6);
    const x = Math.round(W - (W - RADIO.x - RADIO.w + 2) * f);
    rect(ctx, x, 338, W - x, 11, C.carbon);
    rect(ctx, x + 1, 339, W - x, 9, C.gris);
    rect(ctx, x + 1, 345, W - x, 3, C.morado);
    rect(ctx, x - 7, 335, 12, 15, C.carbon);
    rect(ctx, x - 6, 336, 10, 13, C.gris);
    rect(ctx, x - 6, 345, 10, 4, C.morado);
  }
}

/** Actividad: el semáforo pasa por el cristal. No hay nada que tocar. */
export class Semaforo {
  constructor(coche) {
    this.c = coche;
    coche.ciudad.semaforo = 0;
  }

  get done() { return this.c.ciudad.semaforo === null; }

  update() {}

  draw(ctx) { cajaVacia(ctx); }
}

// Nota de voz ----------------------------------------------------------------

/** Audio de WhatsApp como texto. Se guarda en S.audios para la pestaña del móvil. */
export class AudioNota {
  constructor(id) {
    this.done = false;
    const a = G.data.audios[id];
    if (!a) throw new Error(`Audio desconocido: ${id}`);
    this.a = a;
    this.i = 0;
    if (!S.audios.some((x) => x.id === id)) {
      S.audios.push({ id, de: a.de, hora: S.hora, dur: a.dur, txt: a.lineas.map(rellenar) });
    }
    this.next();
  }

  next() {
    this.dlg = new Dialog({ nombre: this.a.de, texto: this.a.lineas[this.i] });
  }

  update(dt) {
    this.dlg.update(dt);
    if (this.dlg.done) {
      if (++this.i >= this.a.lineas.length) this.done = true;
      else this.next();
    }
  }

  draw(ctx) {
    const y = 356;
    panel(ctx, 2, y, W - 4, 24, { fill: C.noche_clara, edge: C.verde_ipa });
    text(ctx, `${G.data.night.textos.audio} · ${this.a.dur}`, 9, y + 8, { font: 'label', color: C.verde_ipa });
    const n = 16, hecho = Math.round(((this.i + 1) / this.a.lineas.length) * n);
    for (let i = 0; i < n; i++) {
      const h = 2 + (i * 7) % 11;
      rect(ctx, 168 + i * 6, y + 12 - (h >> 1), 3, h, i < hecho ? C.verde_ipa : C.gris);
    }
    this.dlg.draw(ctx);
  }
}

// Conducir: el tramo en el que el jugador tiene las manos libres (mal asunto) ---

export class Conducir {
  constructor(coche, s) {
    this.done = false;
    this.c = coche;
    this.seg = s.seg ?? 10;
    this.t = 0;
    this.audio = s.audio ?? null;   // id del audio del primo que llega en este tramo
    this.oido = !this.audio;
    this.sub = null;                // la nota de voz, cuando suena
    this.aviso = null;
    this.drag = false;
    this.litrona = s.litrona !== false;   // a la vuelta ya no hay litrona ni botón
    coche.tragada = 0;              // en cada tramo, litrona llena
    this.sed = true;                // un trago por cada subida del volumen a tope
    this.mira = 2;                // lo que tarda Manolo en reaccionar
    this.txt = G.data.night.coche;
    if (this.audio) coche.movil = 1;
  }

  get manolo() { return S.coche.includes('manolo'); }

  decir(lista, n) {
    if (!lista?.length) return;
    this.aviso = new Aviso(traduce(lista[n % lista.length]), W - 18);
  }

  update(dt) {
    if (this.sub) {
      this.sub.update(dt);
      if (this.sub.done) { this.sub = null; this.oido = true; }
      return;
    }
    this.t += dt;
    this.aviso?.update(dt);
    if (this.aviso?.done) this.aviso = null;
    this.controles();
    this.volumen(dt);
    if (!this.oido && (this.fin || input.tapIn(TOQUE_MOVIL))) {
      this.c.movil = 0;
      this.sub = new AudioNota(this.audio);
      return;
    }
    if (this.fin && this.oido && !this.aviso && this.c.mano <= 0) this.done = true;
  }

  get vacia() { return this.c.tragada >= TRAGOS_LITRONA; }

  /** Se llega al acabarse la litrona, o al pasar el tiempo; si ya se ha empezado a beber, da para acabarla. */
  get fin() { return this.vacia || this.t >= this.seg + (this.c.tragada ? PRORROGA : 0); }

  get aTope() { return this.c.vol >= VOL_MAX; }

  get puedeBeber() { return this.litrona && !this.vacia && this.aTope && this.sed; }

  controles() {
    const p = input.p();
    if (!p) this.drag = false;
    else if (input.pressed && inRect(p, ZONA_SLIDER)) this.drag = true;
    if (this.drag && p) {
      const f = (p.x - SLIDER.x) / SLIDER.w;
      this.c.vol = Math.max(0, Math.min(VOL_MAX, Math.round(f * VOL_MAX)));
    }
    if (input.hit('ArrowRight', 'ArrowUp')) this.c.vol = Math.min(VOL_MAX, this.c.vol + 1);
    if (input.hit('ArrowLeft', 'ArrowDown')) this.c.vol = Math.max(0, this.c.vol - 1);
    if (!this.aTope) this.sed = true;
    if (this.puedeBeber && (input.tapIn(TOQUE_LITRONA) || input.tapIn(TRAGO) || input.hit('KeyT'))) this.trago();
  }

  volumen(dt) {
    if (!this.manolo || this.c.vol < VOL_MOLESTA) { this.mira = 1.7 + Math.random() * 0.8; return; }
    this.mira -= dt;
    if (this.mira > 0) return;
    // Manolo baja el volumen. Siempre. No sirve de nada. Se cuenta igual.
    this.c.vol = VOL_MANOLO;
    this.drag = false;
    this.c.mano = 0.8;
    audio.clic();
    this.decir(this.txt.bajadas, S.bajadas);
    S.bajadas++;
  }

  trago() {
    this.sed = false;
    this.c.tragada++;
    S.tragos++;
    coh(-COSTE_TRAGO);
    shake(0.15);
    if (this.vacia) {
      S.copas++;                    // la litrona entera cuenta como una cerveza
      this.aviso = new Aviso({ texto: this.txt.vacia }, W - 18);
    } else if (this.manolo) this.decir(this.txt.tragos, S.tragos - 1);
  }

  draw(ctx) {
    if (this.sub) { this.sub.draw(ctx); return; }
    panel(ctx, 2, UI_Y, W - 4, H - UI_Y - 2);
    if (this.aviso) this.aviso.draw(ctx, 8, UI_Y + 6);
    else {
      const beber = this.puedeBeber ? this.txt.pista_beber : this.aTope ? this.txt.pista_otra : this.txt.pista;
      const pista = this.audio && !this.oido ? this.txt.pista_audio : this.litrona ? beber : this.txt.pista_vuelta;
      text(ctx, pista, W >> 1, UI_Y + 18, { font: 'label', color: C.gris, align: 'center' });
    }
    this.pintaSlider(ctx);
    if (!this.litrona) return;
    const etiqueta = this.vacia ? this.txt.boton_vacia : this.puedeBeber ? this.txt.boton_trago : this.txt.boton_espera;
    button(ctx, TRAGO, etiqueta, { color: this.puedeBeber ? C.naranja_farola : C.gris, active: this.puedeBeber });
  }

  pintaSlider(ctx) {
    const s = SLIDER;
    rect(ctx, s.x, s.y + 9, s.w, 4, C.carbon);
    outline(ctx, s.x, s.y + 9, s.w, 4, C.morado);
    const x = s.x + Math.round((this.c.vol / VOL_MAX) * s.w);
    rect(ctx, s.x + 1, s.y + 10, x - s.x - 1, 2, C.rosa_neon);
    panel(ctx, x - 6, s.y, 13, s.h, { fill: C.noche_clara, edge: this.drag ? C.rosa_neon : C.rosa_claro });
    text(ctx, G.data.night.textos.volumen, s.x, s.y - 10, { font: 'label', color: C.gris });
  }
}

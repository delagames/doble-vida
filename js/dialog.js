// Caja de diálogo con traducción doble y menús de opciones (banda inferior).
import { C } from './assets.js';
import { input, inRect } from './input.js';
import { W, H } from './screen.js';
import { text, wrap, lineHeight } from './text.js';
import { panel, button, outline, rect } from './draw.js';
import { S, UMBRAL, barajar, rellenar } from './state.js';
import { portrait } from './sprites.js';
import { audio } from './audio.js';
import { glifos, hayGlifos, partirGlifos } from './glifos.js';

const BOX_H = 100;
const CPS = 45;
const LETRAS_VOZ = 3;      // una nota de voz cada tantas letras: es un murmullo, no un tecleo

/** Parte un texto en tandas de perPage líneas, por frases; solo una frase que no quepa entera se parte. */
function tandas(txt, tw, perPage) {
  const pages = [];
  let actual = '';
  const cerrar = () => { if (actual) pages.push(wrap(actual, 'dialog', tw)); actual = ''; };
  for (const frase of txt.match(/[^.?!…]+[.?!…"]*\s*/g) ?? [txt]) {
    const junto = actual ? `${actual} ${frase.trim()}` : frase.trim();
    if (wrap(junto, 'dialog', tw).length <= perPage) { actual = junto; continue; }
    cerrar();
    const lines = wrap(frase.trim(), 'dialog', tw);
    while (lines.length > perPage) pages.push(lines.splice(0, perPage));
    actual = lines.join(' ');
  }
  cerrar();
  return pages;
}

/**
 * línea = { nombre, retrato:{actor,mood}, idioma, real, texto }
 * idioma y real solo existen en la traducción doble: idioma en Silkscreen gris,
 * real en pequeño y gris, y lo que entiende Juanjo en grande y marfil.
 * Con `glifos`, el idioma va en la escritura del Zorro y Gengar. `voz` es { f, tipo }, de cast.json.
 */
export class Dialog {
  constructor(linea) {
    this.done = false;
    this.l = linea;
    const hasP = !!linea.retrato;
    this.tx = hasP ? 52 : 10;
    this.tw = W - this.tx - 10;
    this.small = [];
    if (linea.real) this.small = wrap(rellenar(linea.real).toUpperCase(), 'label', this.tw);
    this.glifos = !!linea.glifos && hayGlifos();
    const idioma = linea.idioma ?? '';
    const langLines = !idioma ? [] : this.glifos ? partirGlifos(idioma, this.tw) : wrap(idioma.toUpperCase(), 'label', this.tw);
    this.lang = langLines;
    const head = (linea.nombre ? 15 : 0) + (langLines.length + this.small.length) * lineHeight('label');
    const perPage = Math.max(1, Math.floor((BOX_H - 12 - head) / lineHeight('dialog')));
    this.pages = tandas(rellenar(linea.texto), this.tw, perPage);
    this.page = 0;
    this.t = 0;
    this.vozN = 0;
  }

  get pageChars() { return this.pages[this.page].join('').length; }

  /** La voz va con las letras que salen: si se salta el texto, se calla. */
  murmura() {
    const { voz } = this.l;
    if (!voz) return;
    const n = Math.floor(this.t / LETRAS_VOZ);
    if (n === this.vozN) return;
    this.vozN = n;
    if (this.t < this.pageChars) audio.voz(voz, n);
  }

  update(dt) {
    this.t += dt * CPS;
    if (input.key('ShiftLeft')) this.t += 4;
    this.murmura();
    if (!input.confirm()) return;
    if (this.t < this.pageChars) { this.t = this.pageChars; return; }
    audio.pasa();
    if (++this.page >= this.pages.length) { this.done = true; this.page = this.pages.length - 1; } else { this.t = 0; this.vozN = 0; }
  }

  draw(ctx) {
    const y0 = H - BOX_H;
    panel(ctx, 2, y0, W - 4, BOX_H - 2);
    const { l } = this;
    if (l.retrato) {
      const pic = portrait(l.retrato.actor, l.retrato.mood);
      rect(ctx, 7, y0 + 7, 42, 42, C.carbon);
      if (pic) ctx.drawImage(pic, 8, y0 + 8, 40, 40);
      outline(ctx, 7, y0 + 7, 42, 42, C.morado);
    }
    let y = y0 + 6;
    if (l.nombre) { text(ctx, l.nombre, this.tx, y, { font: 'bold', color: C.rosa_claro }); y += 15; }
    for (const s of this.lang) {
      if (this.glifos) glifos(ctx, s, this.tx, y, C.gris); else text(ctx, s, this.tx, y, { font: 'label', color: C.gris });
      y += lineHeight('label');
    }
    for (const s of this.small) { text(ctx, s, this.tx, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    let left = Math.floor(this.t);
    for (const s of this.pages[this.page]) {
      text(ctx, s, this.tx, y, { font: 'dialog', color: C.marfil, chars: left });
      left -= s.length;
      y += lineHeight('dialog');
      if (left <= 0) break;
    }
    if (this.t >= this.pageChars && Math.floor(performance.now() / 350) % 2) {
      rect(ctx, W - 15, H - 13, 6, 2, C.rosa_neon);
      rect(ctx, W - 14, H - 11, 4, 2, C.rosa_neon);
      rect(ctx, W - 13, H - 9, 2, 1, C.rosa_neon);
    }
  }
}

/**
 * Frase que no detiene nada: el coche y la calle siguen mientras se lee.
 * Se pinta donde diga quien la usa, con su traducción doble, y dura lo que dura leerla.
 * Si no cabe en `alto`, se parte en tandas por frases y cada una se queda su rato.
 */
export class Aviso {
  constructor(l, w = W - 20, alto = 76) {
    this.l = l;
    this.pic = !!l.retrato;
    this.tw = w - (this.pic ? 46 : 0);
    this.small = l.real ? wrap(rellenar(l.real).toUpperCase(), 'label', this.tw) : [];
    const libre = alto - this.small.length * lineHeight('label');
    const perPage = Math.max(1, Math.floor(libre / lineHeight('dialog')));
    this.paginas = tandas(rellenar(l.texto), this.tw, perPage);
    this.page = 0;
    this.t = this.duracion(0);
  }

  duracion(i) {
    const chars = this.paginas[i].join(' ').length + (i === 0 ? this.l.real?.length ?? 0 : 0);
    return Math.max(2.4, chars * 0.05);
  }

  get done() { return this.t <= 0 && this.page >= this.paginas.length - 1; }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0 && this.page < this.paginas.length - 1) this.t = this.duracion(++this.page);
  }

  draw(ctx, x, y) {
    const { l } = this;
    if (this.pic) {
      const p = portrait(l.retrato.actor, l.retrato.mood);
      rect(ctx, x, y, 42, 42, C.carbon);
      if (p) ctx.drawImage(p, x + 1, y + 1, 40, 40);
      outline(ctx, x, y, 42, 42, C.morado);
      x += 46;
    }
    for (const s of this.small) { text(ctx, s, x, y, { font: 'label', color: C.gris }); y += lineHeight('label'); }
    for (const s of this.paginas[this.page]) { text(ctx, s, x, y, { color: C.marfil }); y += lineHeight('dialog'); }
  }
}

const GRACIA = 0.45;               // quien pasa diálogos deprisa toca dos veces por segundo
const MENU_H = 168;                // la caja de opciones mide siempre esto
const MENU_LINEAS = 2;             // líneas de texto arriba de la caja
const MENU_BANDA = MENU_H - 44;    // franja de los botones, pegada abajo: alcanza el pulgar
const BOTON_MAX = 46, HUECO = 3;

/** La lista de opciones. Con coherencia baja se barajan y bailan. La caja no cambia de alto. */
export class Menu {
  constructor(opts, { prompt = null, shuffle = null } = {}) {
    this.done = false;
    this.picked = null;
    this.paginas = prompt ? tandas(rellenar(prompt), W - 20, MENU_LINEAS) : [[]];
    this.page = 0;
    const barajable = shuffle ?? S.coherencia < UMBRAL.baraja;
    this.opts = (barajable ? barajar(opts) : [...opts]).map((o) => ({ ...o, label: rellenar(o.txt) }));
    this.sel = -1;
    this.swap = 0;
    this.gracia = GRACIA;   // el toque que cerró el diálogo de antes no elige por repetición
    this.layout();
  }

  /** Los rectángulos no cambian al bailar: solo cambia qué opción hay en cada uno. */
  layout() {
    const n = this.opts.length;
    const h = Math.min(BOTON_MAX, Math.floor((MENU_BANDA - HUECO * (n - 1)) / n));
    const y0 = H - 5 - n * h - HUECO * (n - 1);
    this.rects = this.opts.map((_, i) => ({ x: 6, y: y0 + i * (h + HUECO), w: W - 12, h }));
    this.fuentes();
  }

  /** La letra más grande con la que cabe cada opción en su botón. */
  fuentes() {
    this.opts.forEach((o, i) => {
      const r = this.rects[i];
      const cabe = (f) => wrap(o.label, f, r.w - 10).length * lineHeight(f) + 6 <= r.h;
      o.font = ['bold', 'dialog', 'label'].find(cabe);
      if (!o.font) { console.warn(`Opción demasiado larga: ${o.label}`); o.font = 'label'; }
    });
  }

  get leyendo() { return this.page < this.paginas.length - 1; }

  update(dt) {
    if (!this.opts.length) { this.done = true; return; }  // ninguna opción cumple: se sigue
    if (this.gracia > 0) { this.gracia -= dt; return; }
    if (this.leyendo) {
      if (input.confirm()) { this.page++; this.gracia = GRACIA; }
      return;
    }
    if (S.coherencia < UMBRAL.baila) {
      this.swap += dt;
      if (this.swap > 2.5 && this.opts.length > 1) {
        this.swap = 0;
        this.opts.push(this.opts.shift());
        this.fuentes();
      }
    }
    if (input.hit('ArrowDown')) this.sel = (this.sel + 1) % this.opts.length;
    if (input.hit('ArrowUp')) this.sel = (this.sel + this.opts.length - 1 + (this.sel < 0 ? 1 : 0)) % this.opts.length;
    if (input.tap) {
      const i = this.rects.findIndex((r) => inRect(input.tap, r));
      if (i >= 0) this.pick(i);
    } else if (input.hit('Enter', 'Space') && this.sel >= 0) this.pick(this.sel);
  }

  pick(i) { this.picked = this.opts[i]; this.done = true; audio.opcion(); }

  draw(ctx) {
    const y0 = H - MENU_H;
    panel(ctx, 2, y0, W - 4, MENU_H - 2);
    this.paginas[this.page].forEach((l, i) => text(ctx, l, 10, y0 + 7 + i * lineHeight('dialog'), { color: C.marfil }));
    if (this.leyendo) return;
    this.opts.forEach((o, i) => button(ctx, this.rects[i], o.label, { font: o.font, active: i === this.sel }));
  }
}

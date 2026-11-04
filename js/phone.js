// El móvil superpuesto.
// Movil: pestañas con el hilo de SMS, el álbum de tejos y los audios del primo.
// IncomingSms: llega un SMS de Laura y hay diez segundos para contestar.
//
// API para escenas y minijuegos (ids en data/sms.json):
//   recibirSms(id, { alTerminar })   para la escena hasta que se resuelve.
//   smsDeFondo(id, { alTerminar })   aviso arriba y la escena sigue; tocarlo abre las
//                                    respuestas (mismo reloj). Es el de ¡MARCA!.
//   escribirSms(id, { alTerminar })  lo manda Juanjo: las 04:30 y "ya me acuesto".
//   notaHilo(id)                     apunta `nota` en el hilo, sin más.
//   abrirMovil(tab)                  'hilo', 'tejos' o 'audios'.
// alTerminar recibe una vez { id, tipo, respondido, txt }, con tipo neutra, chula, mala,
// nada o propio. Sin responder: tipo 'nada' y respondido false.
import { C } from './assets.js';
import { input, inRect } from './input.js';
import { W, H, shake, vibrar } from './screen.js';
import { text, wrap, lineHeight, measure } from './text.js';
import { anchoCifras, cifras, panel, rect, bar, button, dither } from './draw.js';
import { S, TEJOS_CHULO, TEJOS_MUY_CHULO, UMBRAL, rellenar, barajar } from './state.js';
import { drawPolaroid, preload } from './sprites.js';
import { G } from './game.js';
import { audio } from './audio.js';

const FRAME = { x: 10, y: 30, w: 250, h: 444 };
const SCREEN = { x: 16, y: 44, w: 238, h: 420 };
const BUBBLE_W = 176;
const RECELO = 1.5;      // desde aquí Laura contesta seco aunque la respuesta sea buena
const ESCRIBE_SEG = 1.1;
const GRACIA = 0.5;      // un toque de más al llegar el SMS no contesta sin querer

const textos = () => G.data.night.movil;

/** Un móvil de los de entonces: esquinas romas, auricular, cámara y botones de canto. */
function carcasa(ctx) {
  const f = FRAME;
  rect(ctx, f.x - 2, f.y + 58, 2, 22, C.gris);      // volumen
  rect(ctx, f.x - 2, f.y + 84, 2, 22, C.gris);
  rect(ctx, f.x + f.w, f.y + 66, 2, 30, C.gris);    // bloqueo
  panel(ctx, f.x, f.y, f.w, f.h, { fill: C.carbon, edge: C.gris });
  for (const [x, y] of [[f.x, f.y], [f.x + f.w - 3, f.y], [f.x, f.y + f.h - 3], [f.x + f.w - 3, f.y + f.h - 3]]) dither(ctx, x, y, 3, 3, C.noche, 3);
  const cx = W >> 1, y = f.y + 5;
  rect(ctx, cx - 15, y, 30, 3, C.noche);            // auricular
  for (let i = 0; i < 14; i++) rect(ctx, cx - 14 + i * 2, y + 1, 1, 1, C.gris);
  rect(ctx, cx + 24, y, 3, 3, C.noche_clara);       // cámara
  rect(ctx, cx + 25, y + 1, 1, 1, C.azul_claro);
  rect(ctx, cx - 30, y + 1, 2, 2, C.noche_clara);   // sensor
  rect(ctx, cx - 16, f.y + f.h - 8, 32, 3, C.noche_clara);   // botón de inicio, del que se hundía
  rect(ctx, cx - 15, f.y + f.h - 7, 30, 1, C.carbon);
}

/** Cobertura, batería y hora. La batería baja con la noche: a las nueve no le queda nada. */
function barraEstado(ctx) {
  const x = SCREEN.x + SCREEN.w - 4, y = SCREEN.y + 4;
  cifras(ctx, S.hora, x, y, { color: C.gris, align: 'right' });
  const bx = x - anchoCifras(S.hora) - 18;
  rect(ctx, bx, y, 12, 5, C.gris);
  rect(ctx, bx + 12, y + 1, 1, 3, C.gris);
  rect(ctx, bx + 1, y + 1, 10, 3, C.noche);
  const carga = Math.max(1, 9 - Math.floor(S.stop / 2));
  rect(ctx, bx + 1, y + 1, carga, 3, carga < 3 ? C.rojo_extintor : C.verde_ipa);
  for (let i = 0; i < 4; i++) rect(ctx, bx - 14 + i * 3, y + 3 - i, 2, 2 + i, i < 3 ? C.gris : C.noche_clara);
}

export function drawPhoneFrame(ctx, titulo) {
  dither(ctx, 0, 25, W, H - 25, C.carbon, 2);
  carcasa(ctx);
  rect(ctx, SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, C.noche);
  text(ctx, titulo, SCREEN.x + 4, SCREEN.y + 3, { font: 'label', color: C.cian_neon });
  barraEstado(ctx);
  rect(ctx, SCREEN.x, SCREEN.y + 13, SCREEN.w, 1, C.morado);
}

const partidas = new WeakMap();    // mensaje -> líneas: partir el texto cuesta, y el hilo se pinta entero

function lineasDe(m) {
  let l = partidas.get(m);
  if (!l) partidas.set(m, l = wrap(m.txt, 'dialog', BUBBLE_W));
  return l;
}

/** Pinta el hilo pegado a yBottom, recortado por arriba; devuelve la altura total. */
export function drawHilo(ctx, yBottom, yTop, scroll = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(SCREEN.x, yTop, SCREEN.w, yBottom - yTop);
  ctx.clip();
  let y = yBottom + scroll;
  for (let i = S.hilo.length - 1; i >= 0; i--) {
    const m = S.hilo[i];
    if (m.de === 'nota') {
      const ancho = anchoCifras(m.hora), x = (W - ancho - 6 - measure(m.txt, 'label')) >> 1;
      y -= 15;
      if (y > yBottom || y + 15 < yTop) continue;
      cifras(ctx, m.hora, x, y + 4, { color: C.gris });
      text(ctx, m.txt, x + ancho + 6, y + 3, { font: 'label', color: C.gris });
      continue;
    }
    const mine = m.de === 'juanjo';
    const lines = lineasDe(m);
    const lh = lineHeight('dialog');
    const h = lines.length * lh + 8;
    y -= h + 11;
    if (y > yBottom || y + h + 20 < yTop) continue;
    const x = mine ? SCREEN.x + SCREEN.w - BUBBLE_W - 12 : SCREEN.x + 4;
    cifras(ctx, m.hora, mine ? x + BUBBLE_W + 8 : x, y + 2, { color: C.gris, align: mine ? 'right' : 'left' });
    panel(ctx, x, y + 9, BUBBLE_W + 8, h, { fill: mine ? C.morado : C.noche_clara, edge: mine ? C.rosa_neon : C.azul_mar });
    lines.forEach((l, j) => text(ctx, l, x + 4, y + 13 + j * lh, { color: C.marfil }));
  }
  ctx.restore();
  return yBottom + scroll - y;
}

// El móvil, abierto a mano ------------------------------------------------------

const TABS = ['hilo', 'tejos', 'audios'];
const TAB_Y = SCREEN.y + 15, TAB_H = 23;
const CERRAR = { x: SCREEN.x + 3, y: SCREEN.y + SCREEN.h - 26, w: 74, h: 23 };
const MUSICA = { x: CERRAR.x + CERRAR.w + 3, y: CERRAR.y, w: 78, h: 23 };
const EFECTOS = { x: MUSICA.x + MUSICA.w + 2, y: CERRAR.y, w: 78, h: 23 };
const VIEW = { x: SCREEN.x, y: TAB_Y + TAB_H + 2, w: SCREEN.w, h: CERRAR.y - TAB_Y - TAB_H - 5 };
const TEXTO_W = VIEW.w - 70;     // ancho del texto de las fichas, junto a la foto
const AUDIO_W = VIEW.w - 22;

function tabRect(i) {
  const w = Math.floor(SCREEN.w / TABS.length);
  return { x: SCREEN.x + i * w, y: TAB_Y, w, h: TAB_H };
}

function fichaTejo(e) {
  const nombre = G.data.cast[e.who]?.nombre ?? '';
  const pie = wrap(e.pie, 'dialog', TEXTO_W);
  const real = e.real ? wrap(e.real.toUpperCase(), 'label', TEXTO_W) : [];
  const alto = 26 + pie.length * lineHeight('dialog') + real.length * lineHeight('label');
  return { e, nombre, pie, real, h: Math.max(62, alto) };
}

function fichaAudio(a) {
  const lines = [];
  let y = 27;
  for (const parrafo of a.txt) {
    for (const l of wrap(parrafo, 'dialog', AUDIO_W)) { lines.push({ l, y }); y += lineHeight('dialog'); }
    y += 4;
  }
  return { a, lines, h: y + 1 };
}

export class Movil {
  constructor(tab = 'hilo') {
    this.done = false;
    this.tab = TABS.includes(tab) ? tab : 'hilo';
    this.off = { hilo: 0, tejos: 0, audios: 0 };  // cuánto se ha arrastrado cada pestaña
    this.alto = { hilo: 0, tejos: 0, audios: 0 };
    this.drag = null;
    this.vel = 0;
    this.fichas = {
      tejos: S.album.map(fichaTejo),
      audios: S.audios.map(fichaAudio),
    };
    preload(S.album.map((e) => e.who).filter(Boolean));
  }

  get max() { return Math.max(0, this.alto[this.tab] - VIEW.h); }

  /** El hilo está pegado abajo: arrastrar hacia abajo lee lo antiguo. */
  get signo() { return this.tab === 'hilo' ? 1 : -1; }

  mover(px) { this.off[this.tab] = Math.max(0, Math.min(this.max, this.off[this.tab] + px)); }

  cambiar(i) {
    this.tab = TABS[(i + TABS.length) % TABS.length];
    audio.toque();
    this.drag = null;
    this.vel = 0;
  }

  update(dt) {
    if (input.hit('KeyM', 'Escape')) { this.done = true; return; }
    if (input.tap) {
      const i = TABS.findIndex((_, n) => inRect(input.tap, tabRect(n)));
      if (i >= 0) { this.cambiar(i); return; }
      if (inRect(input.tap, MUSICA)) { audio.alternarMusica(); return; }
      if (inRect(input.tap, EFECTOS)) { audio.alternarEfectos(); return; }
      if (inRect(input.tap, CERRAR) || !inRect(input.tap, FRAME)) { this.done = true; return; }
    }
    if (input.hit('ArrowRight')) this.cambiar(TABS.indexOf(this.tab) + 1);
    if (input.hit('ArrowLeft')) this.cambiar(TABS.indexOf(this.tab) - 1);
    const teclas = (input.key('ArrowDown') ? 1 : 0) - (input.key('ArrowUp') ? 1 : 0);
    if (teclas) this.mover(-this.signo * teclas * 120 * dt);
    if (input.wheel) this.mover(-this.signo * input.wheel);
    this.arrastre(dt);
  }

  arrastre(dt) {
    const p = input.p();
    if (input.pressed && p && inRect(p, VIEW)) { this.drag = { y: p.y }; this.vel = 0; }
    if (!p) this.drag = null;
    if (this.drag) {
      const dy = p.y - this.drag.y;
      this.drag.y = p.y;
      this.mover(this.signo * dy);
      if (dt > 0) this.vel = this.vel * 0.6 + (this.signo * dy / dt) * 0.4;
    } else if (Math.abs(this.vel) > 8) {
      this.mover(this.vel * dt);    // suelta y sigue un poco
      this.vel *= Math.exp(-5 * dt);
    } else this.vel = 0;
  }

  draw(ctx) {
    const t = textos();
    drawPhoneFrame(ctx, t.titulo);
    TABS.forEach((id, i) => {
      const r = tabRect(i);
      const on = id === this.tab;
      rect(ctx, r.x, r.y, r.w, r.h - 1, on ? C.morado : C.noche);
      rect(ctx, r.x, r.y + r.h - 2, r.w, 1, on ? C.rosa_neon : C.morado);
      text(ctx, t.tabs[id], r.x + (r.w >> 1), r.y + 4, { font: 'bold', color: on ? C.marfil : C.gris, align: 'center' });
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.clip();
    if (this.tab === 'hilo') {
      const off = Math.round(this.off.hilo);
      this.alto.hilo = drawHilo(ctx, VIEW.y + VIEW.h, VIEW.y, off);
    } else if (this.tab === 'tejos') this.alto.tejos = this.pintaTejos(ctx);
    else this.alto.audios = this.pintaAudios(ctx);
    ctx.restore();
    this.pintaVacio(ctx);
    this.pintaBarra(ctx);
    button(ctx, CERRAR, t.cerrar);
    button(ctx, MUSICA, audio.musicaOn ? t.musica_si : t.musica_no, { font: 'label' });
    button(ctx, EFECTOS, audio.efectosOn ? t.efectos_si : t.efectos_no, { font: 'label' });
  }

  pintaVacio(ctx) {
    const vacio = { hilo: S.hilo, tejos: S.album, audios: S.audios }[this.tab].length === 0;
    if (!vacio) return;
    const lines = wrap(textos().vacio[this.tab], 'dialog', VIEW.w - 28);
    lines.forEach((l, i) => text(ctx, l, W >> 1, VIEW.y + 120 + i * lineHeight('dialog'), { color: C.gris, align: 'center' }));
  }

  pintaBarra(ctx) {
    if (this.max <= 0) return;
    const x = VIEW.x + VIEW.w - 3;
    const h = Math.max(14, Math.round((VIEW.h * VIEW.h) / this.alto[this.tab]));
    const f = this.off[this.tab] / this.max;
    const pos = this.tab === 'hilo' ? 1 - f : f;
    rect(ctx, x, VIEW.y, 2, VIEW.h, C.morado);
    rect(ctx, x, VIEW.y + Math.round((VIEW.h - h) * pos), 2, h, C.cian_neon);
  }

  pintaTejos(ctx) {
    const lhD = lineHeight('dialog'), lhL = lineHeight('label');
    const x = VIEW.x + 3, w = VIEW.w - 9, tx = x + 56;
    let y = VIEW.y + 2 - Math.round(this.off.tejos);
    const y0 = y;
    for (const f of this.fichas.tejos) {
      const { e } = f;
      panel(ctx, x, y, w, f.h, { fill: C.noche_clara, edge: e.anulado ? C.gris : C.morado });
      drawPolaroid(ctx, e, x + 4, y + 5);
      text(ctx, f.nombre, tx, y + 4, { font: 'bold', color: C.rosa_claro });
      cifras(ctx, e.hora, x + w - 5, y + 6, { color: C.gris, align: 'right' });
      let ty = y + 19;
      f.pie.forEach((l) => { text(ctx, l, tx, ty, { color: C.marfil }); ty += lhD; });
      ty += 2;
      f.real.forEach((l) => { text(ctx, l, tx, ty, { font: 'label', color: C.gris }); ty += lhL; });
      if (e.anulado) {
        dither(ctx, x + 2, y + 2, w - 4, f.h - 4, C.carbon, 2);
        const sello = { x: x + (w >> 1) - 44, y: y + (f.h >> 1) - 11, w: 88, h: 22 };
        panel(ctx, sello.x, sello.y, sello.w, sello.h, { fill: C.carbon, edge: C.rojo_extintor });
        text(ctx, textos().anulado, x + (w >> 1), sello.y + 4, { font: 'bold', color: C.rojo_extintor, align: 'center' });
      }
      y += f.h + 3;
    }
    return y - y0;
  }

  pintaAudios(ctx) {
    const x = VIEW.x + 3, w = VIEW.w - 9;
    let y = VIEW.y + 2 - Math.round(this.off.audios);
    const y0 = y;
    for (const f of this.fichas.audios) {
      const { a } = f;
      panel(ctx, x, y, w, f.h, { fill: C.noche_clara, edge: C.verde_ipa });
      // Botón de nota de voz, como en el soporte del coche.
      rect(ctx, x + 5, y + 5, 13, 13, C.verde_ipa);
      for (let i = 0; i < 5; i++) rect(ctx, x + 9 + i, y + 8 + (i >> 1), 1, 7 - i, C.carbon);
      text(ctx, a.de, x + 23, y + 3, { font: 'bold', color: C.verde_ipa });
      cifras(ctx, `${a.hora} · ${a.dur}`, x + w - 5, y + 19, { color: C.gris, align: 'right' });
      f.lines.forEach((q) => text(ctx, q.l, x + 6, y + q.y, { color: C.marfil }));
      y += f.h + 3;
    }
    return y - y0;
  }
}

export function abrirMovil(tab) {
  if (G.overlay) return null;
  audio.toque();
  G.overlay = new Movil(tab);
  return G.overlay;
}

// SMS -------------------------------------------------------------------------

/** Un SMS: de Laura con tres respuestas o, con `propio`, escrito por Juanjo. */
export class IncomingSms {
  constructor(id, { alTerminar = null } = {}) {
    const def = G.data.sms[id];
    this.done = false;
    this.id = id;
    this.def = def;
    this.alTerminar = alTerminar;
    this.resultado = null;
    this.pendiente = null;   // la contestación de Laura, mientras "escribe"
    this.fase = 'elige';     // elige → escribe → leida
    this.tf = 0;
    this.opts = [];
    this.sel = -1;
    this.gracia = GRACIA;
    this.t = def.tiempo ?? 10;
    this.total = this.t;
    if (def.propio) this.enviarPropio();
    else {
      S.hilo.push({ de: 'laura', hora: S.hora, txt: rellenar(def.laura) });
      this.montar();
      shake(0.3);
      audio.sms();
    }
  }

  /** Neutra y dos malas. Con coherencia baja se barajan y una mala se disfraza. */
  montar() {
    const { def } = this;
    const low = S.coherencia < UMBRAL.disfraz;
    const chulo = S.tejos >= TEJOS_CHULO && !!def.coletilla;
    const neutra = {
      txt: rellenar(chulo ? `${def.neutra} ${def.coletilla}` : def.neutra),
      tipo: chulo ? 'chula' : 'neutra',
    };
    const malas = def.malas.map((m, i) => {
      const base = typeof m === 'string' ? { txt: m } : m;
      const txt = low && i === 0 && def.disfraz ? def.disfraz : base.txt;
      return { txt: rellenar(txt), tipo: 'mala', resp: base.resp };
    });
    const opts = [neutra, ...malas];
    this.opts = low ? barajar(opts) : opts;
    this.rects = [];
    let y = SCREEN.y + SCREEN.h - 3;
    for (let i = this.opts.length - 1; i >= 0; i--) {
      const n = wrap(this.opts[i].txt, 'dialog', SCREEN.w - 18).length;
      const h = n * lineHeight('dialog') + 7;
      y -= h;
      this.rects[i] = { x: SCREEN.x + 3, y, w: SCREEN.w - 6, h };
      y -= 3;
    }
    this.barY = y - 7;
  }

  enviarPropio() {
    const { def } = this;
    const txt = rellenar(def.juanjo);
    S.hilo.push({ de: 'juanjo', hora: S.hora, txt });
    S.smsEnviados++;
    audio.enviado();
    S.sospecha += def.sospecha ?? 0;
    if (def.deMas) S.smsDeMas++;
    if (def.flag) S.flags[def.flag] = true;
    this.cerrarCon('propio', txt, def.respuesta);
  }

  responder(op) {
    const r = this.def.respuesta ?? {};
    let tipo = 'nada';
    if (op) {
      tipo = op.tipo;
      S.hilo.push({ de: 'juanjo', hora: S.hora, txt: op.txt });
      S.smsEnviados++;
      audio.enviado();
      if (tipo === 'mala') S.sospecha += 1;
      if (tipo === 'chula') S.sospecha += S.tejos >= TEJOS_MUY_CHULO ? 1 : 0.5;
    } else {
      S.smsSinResponder++;
      S.sospecha += 0.5;
      S.hilo.push({ de: 'nota', hora: S.hora, txt: textos().sin_responder });
      vibrar();
    }
    const fria = S.sospecha >= RECELO ? r.recelo?.[tipo] : null;
    this.cerrarCon(tipo, op?.txt ?? null, op?.resp ?? fria ?? r[tipo] ?? (tipo === 'chula' ? r.neutra : null));
  }

  cerrarCon(tipo, txt, contestacion) {
    S.respuestas[this.id] = tipo;
    this.resultado = { id: this.id, tipo, respondido: tipo !== 'nada', txt };
    this.opts = [];
    this.pendiente = contestacion ?? null;
    this.fase = this.pendiente ? 'escribe' : 'leida';
    this.tf = this.pendiente ? ESCRIBE_SEG : 0.9;
    this.gracia = GRACIA;
  }

  /** Llega lo que contesta Laura; se queda lo que se tarda en leerlo. */
  llega() {
    const txt = rellenar(this.pendiente);
    this.pendiente = null;
    S.hilo.push({ de: 'laura', hora: S.hora, txt });
    audio.sms();
    this.fase = 'leida';
    this.tf = Math.min(5, 2.2 + txt.length * 0.05);
    this.gracia = GRACIA;
  }

  terminar() {
    if (this.done) return;
    if (this.pendiente) this.llega();
    this.done = true;
    this.alTerminar?.(this.resultado);
  }

  update(dt) {
    if (this.fase !== 'elige') {
      this.tf -= dt;
      if (this.gracia > 0) { this.gracia -= dt; if (this.tf > 0) return; }   // el toque que contesta no se salta la respuesta
      else if (this.tf > 0 && !input.confirm()) return;
      if (this.fase === 'escribe') this.llega(); else this.terminar();
      return;
    }
    this.t -= dt;
    if (this.t <= 0) { this.responder(null); return; }
    if (this.gracia > 0) { this.gracia -= dt; return; }
    if (input.hit('ArrowDown')) this.sel = (this.sel + 1) % this.opts.length;
    if (input.hit('ArrowUp')) this.sel = (this.sel + this.opts.length - 1 + (this.sel < 0 ? 1 : 0)) % this.opts.length;
    if (input.tap) {
      const i = this.rects.findIndex((r) => inRect(input.tap, r));
      if (i >= 0) this.responder(this.opts[i]);
    } else if (input.hit('Enter', 'Space') && this.sel >= 0) this.responder(this.opts[this.sel]);
  }

  draw(ctx) {
    drawPhoneFrame(ctx, textos().laura);
    const eligiendo = this.fase === 'elige';
    const bottom = eligiendo ? this.barY - 3 : SCREEN.y + SCREEN.h - 16;
    drawHilo(ctx, bottom, SCREEN.y + 15);
    if (!eligiendo) {
      const pie = this.fase === 'escribe' ? textos().escribiendo : textos().seguir;
      text(ctx, pie, W >> 1, SCREEN.y + SCREEN.h - 12, { font: 'label', color: C.gris, align: 'center' });
      return;
    }
    bar(ctx, SCREEN.x + 3, this.barY, SCREEN.w - 6, 5, this.t / this.total, this.t < 3 ? C.rojo_extintor : C.cian_neon);
    this.opts.forEach((o, i) => button(ctx, this.rects[i], o.txt, { font: 'dialog', active: i === this.sel }));
  }
}

/**
 * SMS que no para la escena: el aviso va arriba mientras el minijuego sigue. Tocarlo
 * abre las respuestas con el reloj que quede; si se agota, cuenta como sin responder.
 */
class SmsFondo {
  constructor(sms) {
    this.sms = sms;
    this.done = false;
    this.lines = wrap(rellenar(sms.def.laura), 'dialog', W - 24);
    this.r = { x: 4, y: 27, w: W - 8, h: 31 + this.lines.length * lineHeight('dialog') };
  }

  update(dt) {
    const { sms } = this;
    if (input.tapIn(this.r) || input.hit('KeyM')) {
      input.consume();
      this.done = true;
      G.overlay = sms;
      return;
    }
    sms.t -= dt;
    if (sms.t > 0) return;
    sms.responder(null);
    sms.terminar();
    this.done = true;
  }

  draw(ctx) {
    const { r, sms } = this;
    const t = textos();
    panel(ctx, r.x, r.y, r.w, r.h, { fill: C.noche_clara, edge: C.cian_neon });
    text(ctx, t.laura, r.x + 7, r.y + 5, { font: 'label', color: C.cian_neon });
    cifras(ctx, S.hora, r.x + 7 + measure(t.laura, 'label') + 6, r.y + 6, { color: C.cian_neon });
    text(ctx, t.contestar, r.x + r.w - 7, r.y + 5, { font: 'label', color: C.gris, align: 'right' });
    this.lines.forEach((l, i) => text(ctx, l, r.x + 7, r.y + 15 + i * lineHeight('dialog'), { color: C.marfil }));
    bar(ctx, r.x + 6, r.y + r.h - 10, r.w - 12, 5, sms.t / sms.total, sms.t < 3 ? C.rojo_extintor : C.cian_neon);
  }
}

/** Un id que no existe no para la noche: se avisa y cuenta como que no ha llegado. */
function existe(id, opciones) {
  if (G.data.sms[id]) return true;
  console.warn(`SMS desconocido: ${id}`);
  opciones?.alTerminar?.({ id, tipo: 'nada', respondido: false, txt: null });
  return false;
}

export function recibirSms(id, opciones) {
  if (!existe(id, opciones)) return null;
  G.overlay = new IncomingSms(id, opciones);
  return G.overlay;
}

export function smsDeFondo(id, opciones) {
  if (!existe(id, opciones)) return null;
  G.aviso = new SmsFondo(new IncomingSms(id, opciones));
  return G.aviso;
}

export function escribirSms(id, opciones) { return recibirSms(id, opciones); }

export function notaHilo(id) {
  const nota = G.data.sms[id]?.nota;
  if (nota) S.hilo.push({ de: 'nota', hora: S.hora, txt: rellenar(nota) });
}

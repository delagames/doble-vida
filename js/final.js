// El final de la noche: la coartada, los cuadros de los tres finales, los créditos y los
// resultados. Todo el texto está en night.json (coartada, finales, creditos, resultados).
//   {"t":"coartada"}              Juanjo monta la respuesta con el hilo y el álbum.
//   {"t":"final"}                 elegirFinal() decide y sigue por sus pasos.
//   {"t":"cuadro","id":"cama"}    capa pintada: cama, sofa, falso, raya.
//   {"t":"pantalla_laura"}        el móvil de Laura con el SMS de Manolo.
//   {"t":"fundido","seg":2}       a negro.
//   {"t":"fin"}                   se acabó: créditos y resultados.
import { C, img, bgPath } from './assets.js';
import { input, inRect } from './input.js';
import { W, H } from './screen.js';
import { text, wrap, lineHeight, measure } from './text.js';
import { button, cifras, dither, outline, panel, rect } from './draw.js';
import { pintaAmbiente } from './ambiente.js';
import { S, barajar, elegirFinal, finalesVistos, reiniciar, borrar, rellenar, terminarNoche } from './state.js';
import { G } from './game.js';
import { NightRunner, registrarOps } from './night.js';
import { drawHud } from './hud.js';
import { abrirMovil, drawPhoneFrame } from './phone.js';
import { drawFoto } from './sprites.js';
import { Amanecer } from './amanecer.js';
import { Balance, registrarLogros } from './balance.js';
import { audio } from './audio.js';

const textos = () => G.data.night;

// La coartada -----------------------------------------------------------------

const TARJETA = { w: 132, h: 22, x0: 2, y0: 42, gap: 2 };
const FOTO = { lado: 40, marco: 44 };
const ALBUM_Y = 42 + 8 * (TARJETA.h + TARJETA.gap) + 3;
const CAJA = { x: 2, y: ALBUM_Y + 2 * FOTO.marco + 3, w: W - 4 };
const DECIRLO = { x: 40, y: H - 42, w: 190, h: 38 };
const CAE_SEG = 0.22, ENTRE = 0.05;
const ESPERA_MAX = 40;       // si nadie toca nada, Juanjo coge lo primero que pilla
const CUANTAS = 3;

/** Lo que cabe de un SMS en una tarjeta, cortado por palabras. */
function resumen(txt, ancho) {
  const t = txt.toUpperCase();
  if (measure(t, 'label') <= ancho) return t;
  const puntos = '...';
  let s = t;
  while (s && measure(s + puntos, 'label') > ancho) s = s.slice(0, s.lastIndexOf(' ') > 0 ? s.lastIndexOf(' ') : s.length - 1);
  return s + puntos;
}

/**
 * Gag de cosecha de la noche: todos los SMS con sus horas y el álbum, a la vez, encima de la
 * mesa, y Juanjo coge tres cosas para explicarse. No decide nada: lo deciden los medidores.
 */
class Coartada {
  constructor() {
    this.fullscreen = true;
    this.minijuego = true;      // aquí no se saca el móvil: ya está todo fuera
    this.done = false;
    this.t = 0;
    this.gracia = 0.5;
    this.elegidas = [];
    this.frase = [];
    const c = textos().coartada;
    const sms = S.hilo.filter((m) => m.de !== 'nota').slice(-16);
    const fotos = S.album.filter((e) => !e.anulado).slice(-12);
    this.items = [];
    sms.forEach((m, i) => {
      const col = i % 2, fila = i >> 1;
      const r = { x: TARJETA.x0 + col * (TARJETA.w + 2) , y: TARJETA.y0 + fila * (TARJETA.h + TARJETA.gap), w: TARJETA.w, h: TARJETA.h };
      this.items.push({ tipo: 'sms', m, r, txt: resumen(m.txt, TARJETA.w - 6), frase: this.fraseSms(c, m) });
    });
    fotos.forEach((e, i) => {
      const r = { x: 2 + (i % 6) * FOTO.marco, y: ALBUM_Y + (i >= 6 ? FOTO.marco : 0), w: FOTO.marco, h: FOTO.marco };
      this.items.push({ tipo: 'tejo', e, r, frase: rellenar((c.tejos[e.who] ?? c.tejo_otro).replaceAll('{hora}', e.hora)) });
    });
    const orden = barajar(this.items);
    orden.forEach((it, i) => { it.cae = i * ENTRE; });
    this.necesita = Math.min(CUANTAS, this.items.length);
    if (!this.necesita) this.done = true;
  }

  fraseSms(c, m) {
    const base = m.de === 'juanjo' ? c.sms_juanjo : c.sms_laura;
    return base.replaceAll('{hora}', m.hora).replaceAll('{txt}', m.txt);
  }

  get lista() { return this.elegidas.length >= this.necesita; }

  get entrada() { return Math.max(0, ...this.items.map((it) => it.cae)) + CAE_SEG; }

  update(dt) {
    this.t += dt;
    if (this.gracia > 0) { this.gracia -= dt; input.consume(); return; }
    if (this.lista) {
      if (input.tapIn(DECIRLO) || input.hit('Enter', 'Space')) this.done = true;
      return;
    }
    if (this.t > ESPERA_MAX) { this.items.filter((q) => !this.elegidas.includes(q)).slice(0, this.necesita - this.elegidas.length).forEach((q) => this.coge(q)); return; }
    if (this.t < this.entrada || !input.tap) return;
    const it = this.items.find((q) => inRect(input.tap, q.r) && !this.elegidas.includes(q));
    if (it) this.coge(it);
  }

  coge(it) {
    this.elegidas.push(it);
    this.frase = wrap(it.frase, 'dialog', CAJA.w - 16).slice(0, 4);
    audio.toque();
  }

  /** Lo que dice Juanjo, para los pasos de después. */
  get dichos() { return this.elegidas.map((it) => it.frase); }

  draw(ctx) {
    const c = textos().coartada;
    rect(ctx, 0, 0, W, H, C.noche);
    dither(ctx, 0, 25, W, H - 25, C.noche_clara, 1);
    text(ctx, c.pide, W >> 1, 30, { font: 'label', color: C.rosa_claro, align: 'center' });
    for (const it of this.items) this.pinta(ctx, it);
    drawHud(ctx);
    const y = CAJA.y;
    panel(ctx, CAJA.x, y, CAJA.w, H - y - 2);
    text(ctx, c.caja, 10, y + 6, { font: 'label', color: C.gris });
    cifras(ctx, `${this.elegidas.length}/${this.necesita}`, W - 10, y + 7, { color: C.rosa_claro, align: 'right' });
    this.frase.forEach((l, i) => text(ctx, l, 10, y + 18 + i * lineHeight('dialog'), { color: C.marfil }));
    if (this.lista) button(ctx, DECIRLO, c.boton, { edge: C.rosa_neon });
  }

  pinta(ctx, it) {
    const f = Math.min(1, Math.max(0, (this.t - it.cae) / CAE_SEG));
    if (f <= 0) return;
    const y = Math.round(it.r.y - (1 - f) * (1 - f) * 60);
    const puesto = this.elegidas.includes(it);
    if (it.tipo === 'sms') {
      const mio = it.m.de === 'juanjo';
      panel(ctx, it.r.x, y, it.r.w, it.r.h, { fill: mio ? C.morado : C.noche_clara, edge: puesto ? C.amarillo_mural : mio ? C.rosa_neon : C.azul_mar });
      cifras(ctx, it.m.hora, it.r.x + 4, y + 3, { color: C.amarillo_mural });
      text(ctx, it.txt, it.r.x + 3, y + 10, { font: 'label', color: C.marfil });
      return;
    }
    rect(ctx, it.r.x + 1, y + 1, FOTO.lado + 2, FOTO.lado + 2, puesto ? C.amarillo_mural : C.marfil);
    outline(ctx, it.r.x + 1, y + 1, FOTO.lado + 2, FOTO.lado + 2, C.carbon);
    drawFoto(ctx, it.e, it.r.x + 2, y + 2);
    rect(ctx, it.r.x + 2, y + FOTO.lado - 6, FOTO.lado, 8, C.carbon);
    cifras(ctx, it.e.hora, it.r.x + 2 + (FOTO.lado >> 1), y + FOTO.lado - 5, { color: C.marfil, align: 'center' });
  }
}

// Los cuadros de los finales -----------------------------------------------------

/** Un dormitorio de lado, a oscuras, con la mañana entrando por la persiana. */
function dormitorio(ctx) {
  rect(ctx, 0, 25, W, 359, C.noche);
  dither(ctx, 0, 25, W, 359, C.noche_clara, 1);
  rect(ctx, 18, 70, 92, 104, C.carbon);
  rect(ctx, 21, 73, 86, 98, C.noche_clara);
  for (let y = 75; y < 170; y += 8) rect(ctx, 21, y, 86, 3, C.amanecer);
  rect(ctx, 21, 73, 86, 1, C.carbon);
  rect(ctx, 0, 340, W, 44, C.madera);
  rect(ctx, 0, 340, W, 1, C.carbon);
  for (let x = 12; x < W; x += 46) rect(ctx, x, 341, 1, 43, C.noche_clara);
  rect(ctx, 236, 214, 28, 112, C.carbon);          // cabecero
  rect(ctx, 239, 217, 22, 109, C.madera_clara);
  rect(ctx, 14, 326, 8, 18, C.carbon);             // patas
  rect(ctx, 244, 326, 8, 18, C.carbon);
  rect(ctx, 8, 288, 232, 40, C.carbon);            // colchón
  rect(ctx, 10, 290, 228, 16, C.blanco_extintor);
  rect(ctx, 10, 306, 228, 20, C.morado);
  dither(ctx, 10, 306, 228, 20, C.noche_clara, 2);
  rect(ctx, 192, 274, 44, 18, C.carbon);           // almohada
  rect(ctx, 194, 276, 40, 14, C.marfil);
}

/** El sofá, en el pasillo, delante de la puerta cerrada. */
function sofa(ctx) {
  rect(ctx, 16, 306, 238, 62, C.carbon);
  rect(ctx, 18, 308, 234, 58, C.morado);
  rect(ctx, 18, 340, 234, 26, C.noche_clara);
  rect(ctx, 16, 340, 238, 1, C.carbon);
  rect(ctx, 6, 322, 26, 50, C.carbon);
  rect(ctx, 8, 324, 22, 46, C.morado);
  rect(ctx, 238, 322, 26, 50, C.carbon);
  rect(ctx, 240, 324, 22, 46, C.morado);
  rect(ctx, 24, 372, 8, 10, C.carbon);
  rect(ctx, 238, 372, 8, 10, C.carbon);
}

class Cuadro {
  constructor(id) { this.id = id; }

  update() {}

  draw(ctx) {
    if (this.id !== 'cama' && this.id !== 'falso' && G.scene?.bg) pintaAmbiente(ctx, G.scene.bg);
    if (this.id === 'cama' || this.id === 'falso') dormitorio(ctx);
    if (this.id === 'sofa') sofa(ctx);
    if (this.id === 'raya') dither(ctx, 60, 330, 150, 54, C.carbon, 3);
    if (this.id === 'falso') {                     // la cola del Zorro asoma por los pies
      rect(ctx, 66, 276, 30, 14, C.carbon);
      rect(ctx, 68, 278, 28, 11, C.noche_clara);
      rect(ctx, 50, 266, 26, 16, C.carbon);
      rect(ctx, 52, 268, 22, 12, C.noche_clara);
      rect(ctx, 40, 254, 20, 16, C.carbon);
      rect(ctx, 42, 256, 16, 12, C.rojo_extintor);
    }
  }
}

/** El móvil de Laura, sacado por el hueco de la puerta. Ella no se ve. */
class PantallaLaura {
  constructor() {
    this.fullscreen = true;
    this.minijuego = true;
    this.sinHud = true;
    this.done = false;
    this.gracia = 0.8;
    this.t = textos().finales.nocuela.movil;
    this.lineas = wrap(this.t.sms, 'bold', 176);
  }

  update(dt) {
    if (this.gracia > 0) { this.gracia -= dt; input.consume(); return; }
    if (input.confirm()) this.done = true;
  }

  draw(ctx) {
    const { t } = this;
    const pic = img(bgPath('01-pasillo-laura'));
    if (pic) ctx.drawImage(pic, 0, 0);
    const hora = S.hora;
    S.hora = t.hora;       // el reloj del móvil de Laura enseña lo que enseña
    drawPhoneFrame(ctx, t.titulo);
    S.hora = hora;
    const lh = lineHeight('bold');
    const y = 170, h = this.lineas.length * lh + 10;
    text(ctx, t.de, 28, y - 22, { font: 'bold', color: C.rosa_claro });
    cifras(ctx, t.hora, 28, y - 8, { color: C.gris, escala: 2 });
    panel(ctx, 26, y + 6, 208, h, { fill: C.noche_clara, edge: C.azul_mar });
    this.lineas.forEach((l, i) => text(ctx, l, 34, y + 11 + i * lh, { font: 'bold', color: C.marfil }));
    text(ctx, t.lugar, W >> 1, y + h + 14, { font: 'label', color: C.gris, align: 'center' });
    if (this.gracia <= 0) text(ctx, textos().movil.seguir, W >> 1, 444, { font: 'label', color: C.gris, align: 'center' });
  }
}

/** A negro, a tramas, y se queda en negro. */
class Fundido {
  constructor(seg) { this.seg = seg; this.t = 0; this.sinHud = true; this.minijuego = true; }

  get done() { return this.t >= this.seg + 0.6; }

  update(dt) { this.t += dt; }

  draw(ctx) {
    const n = Math.floor((this.t / this.seg) * 4);
    if (n >= 4) rect(ctx, 0, 0, W, H, C.carbon);
    else dither(ctx, 0, 0, W, H, C.carbon, n);
  }
}

// Créditos --------------------------------------------------------------------

const VEL_CREDITOS = 17;

class Creditos {
  constructor(final, alAcabar) {
    this.final = final;
    this.alAcabar = alAcabar;
    this.playa = final === 'doble' ? new Amanecer({ dia: true }) : null;
    audio.musica('amanecer');
    this.ventana = this.playa ? { y: 300, h: H - 324 } : { y: 0, h: H - 24 };
    this.t = 0;
    this.lineas = [];
    let y = 0;
    for (const l of textos().creditos) {
      const font = l.f ?? 'dialog';
      for (const s of wrap(rellenar(l.txt ?? ''), font, W - 28)) {
        if (s) this.lineas.push({ s, y, font, color: C[l.color ?? 'marfil'] });
        y += s ? lineHeight(font) + 1 : 10;
      }
    }
    this.alto = y;
    this.off = this.playa ? 12 : H - 60;
  }

  update(dt) {
    this.t += dt;
    this.playa?.update(dt);
    this.off -= dt * VEL_CREDITOS * (input.p() ? 5 : 1);
    if (this.t > 1 && input.hit('Escape', 'Enter', 'Space')) this.off = -this.alto - 13;
    if (this.off < -this.alto - 12) this.alAcabar();
  }

  draw(ctx) {
    const v = this.ventana;
    rect(ctx, 0, 0, W, H, C.carbon);
    if (this.playa) {
      ctx.drawImage(img(bgPath('14-malagueta-amanecer')), 0, 0);
      this.playa.draw(ctx);
      panel(ctx, 2, v.y, W - 4, H - v.y - 2, { fill: C.carbon });
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(6, v.y + 4, W - 12, v.h - 10);
    ctx.clip();
    const y0 = Math.round(v.y + this.off);
    for (const l of this.lineas) {
      const y = y0 + l.y;
      if (y > v.y - 20 && y < v.y + v.h) text(ctx, l.s, W >> 1, y, { font: l.font, color: l.color, align: 'center' });
    }
    ctx.restore();
    if (this.t > 1) text(ctx, textos().resultados.saltar, W >> 1, H - 14, { font: 'label', color: C.gris, align: 'center' });
  }
}

// Resultados ------------------------------------------------------------------

const TABS = ['balance', 'finales', 'hilo', 'tejos'];
const TAB = { y: 6, h: 30 };
const OTRA = { x: 30, y: H - 50, w: 210, h: 42 };

export class Resultados {
  constructor(final, nuevos = []) {
    this.final = final;
    this.tab = 'balance';
    this.balance = new Balance(final, nuevos);
    this.vistos = finalesVistos();
    const t = textos().resultados;
    this.finales = ['cuela', 'nocuela', 'doble'].map((id, i) => {
      const f = textos().finales[id];
      const visto = this.vistos.includes(id);
      const lineas = wrap(visto ? f.resumen : f.pista, 'dialog', W - 40);
      return { id, visto, lineas, titulo: visto ? f.titulo : t.oculto, r: { x: 6, y: 50 + i * 104, w: W - 12, h: 98 } };
    });
    this.volver();
  }

  /** Al llegar y al volver de repetir un final: la misma pantalla, con la misma noche. */
  volver() {
    G.sober = true;
    G.inclina = null;
    this.gracia = 0.4;
  }

  update(dt) {
    if (this.gracia > 0) { this.gracia -= dt; input.consume(); return; }
    const i = TABS.findIndex((_, n) => input.tapIn(this.rectTab(n)));
    if (i >= 0) { this.cambiar(TABS[i]); return; }
    if (input.tapIn(OTRA)) { this.otraNoche(); return; }
    if (this.tab === 'finales') {
      const f = this.finales.find((q) => q.visto && input.tapIn(q.r));
      if (f) G.setScene(new RepiteFinal(f.id, this));
    }
    if (this.tab === 'balance') this.balance.update(dt);
  }

  cambiar(id) {
    audio.toque();
    if (id === 'hilo' || id === 'tejos') { abrirMovil(id); return; }
    this.tab = id;
  }

  otraNoche() {
    borrar();
    reiniciar();
    G.sober = false;
    G.setScene(new NightRunner(0));
  }

  rectTab(i) {
    const w = Math.floor((W - 8) / TABS.length);
    return { x: 4 + i * w, y: TAB.y, w: w - 2, h: TAB.h };
  }

  draw(ctx) {
    const t = textos().resultados;
    rect(ctx, 0, 0, W, H, C.noche);
    dither(ctx, 0, 0, W, H, C.noche_clara, 1);
    TABS.forEach((id, i) => {
      button(ctx, this.rectTab(i), t.tabs[id] ?? G.data.final.tab, { active: id === this.tab, font: 'label' });
    });
    if (this.tab === 'balance') this.balance.draw(ctx);
    else this.pintaFinales(ctx);
    button(ctx, OTRA, t.otra, { edge: C.rosa_neon });
  }

  pintaFinales(ctx) {
    const t = textos().resultados;
    for (const f of this.finales) {
      const { r } = f;
      panel(ctx, r.x, r.y, r.w, r.h, { edge: f.visto ? C.rosa_neon : C.morado });
      text(ctx, f.titulo, r.x + 10, r.y + 8, { font: 'bold', color: f.visto ? C.rosa_claro : C.gris });
      f.lineas.forEach((l, i) => text(ctx, l, r.x + 10, r.y + 26 + i * lineHeight('dialog'), { color: f.visto ? C.marfil : C.gris }));
      if (f.visto) text(ctx, t.ver, r.x + r.w - 10, r.y + r.h - 13, { font: 'label', color: C.gris, align: 'right' });
    }
  }
}

/** Volver a ver un final desde resultados. No guarda nada: la partida ya está borrada. */
class RepiteFinal extends NightRunner {
  constructor(id, resultados) {
    super(-1, { pasos: textos().finales[id].pasos });
    audio.musica(null);
    this.repeticion = () => { resultados.volver(); G.setScene(resultados); };
  }
}

// Pasos ------------------------------------------------------------------------

registrarOps({
  coartada(r) {
    const c = new Coartada();
    r.wait = c;
    c.after = () => r.push(c.dichos.map((txt) => ({ t: 'di', who: 'juanjo', mood: 'Happy', txt })));
  },
  final(r) {
    S.final = elegirFinal();
    r.push(textos().finales[S.final].pasos);
  },
  cuadro(r, s) { r.capa = new Cuadro(s.id); },
  pantalla_laura(r) { r.wait = new PantallaLaura(); },
  fundido(r, s) { r.wait = new Fundido(s.seg ?? 2); },
  fin(r) {
    if (r.repeticion) { r.repeticion(); return; }
    const { final } = S;
    terminarNoche(final);
    r.finished = true;
    G.sober = true;
    const nuevos = registrarLogros(final);
    G.setScene(new Creditos(final, () => G.setScene(new Resultados(final, nuevos))));
  },
});

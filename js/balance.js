// La pestaña BALANCE de resultados: titular según la noche, cervezas, cordura, tejos, lo convencida
// que queda Laura, logros y los datos de siempre. Todo el texto está en data/final.json.
// Se mide y se reparte al crearla: la noche ya no cambia, ni al repetir un final desde sus pestañas.
import { C } from './assets.js';
import { input, inRect } from './input.js';
import { W } from './screen.js';
import { text, wrap, lineHeight } from './text.js';
import { anchoCifras, bar, cifras, heart, panel, rect } from './draw.js';
import { S, TEJOS_MAX, convencida, finalesVistos, guardarLogros, logrosGuardados, rellenar } from './state.js';
import { G } from './game.js';

const VISTA = { x: 0, y: 40, w: W, h: 374 };    // lo que se desplaza
const AVISO_Y = 416;                            // franja propia: el aviso no pisa nada
const X = 6, ANCHO = W - 16, PAD = 8, INT = ANCHO - 2 * PAD;   // a la derecha, el carril
const HUECO = 4;
const CARRIL = { x: W - 7, w: 4 };
const FRENADO = 5;                              // inercia del desplazamiento, por segundo
const COPAS_CAMARERA = 3, BAJADAS = 5;          // logros: tejos de barra y bajadas de Manolo
const JARRA_PASO = 9, JARRA_ALTO = 11, CORAZON_PASO = 11;
const MEDALLA = 22;

const HECHO = {
  centro: () => true,                           // se queda en el centro: todas las noches
  cuela: (s, vistos) => vistos.includes('cuela'),
  nocuela: (s, vistos) => vistos.includes('nocuela'),
  doble: (s, vistos) => vistos.includes('doble'),
  litrona: (s) => s.tragos === 0,
  camarera: (s) => s.album.filter((e) => e.parada === 'barra').length >= COPAS_CAMARERA,
  sms: (s) => s.smsEnviados > 0 && s.smsSinResponder === 0,
  s0430: (s) => !!s.flags.escribio0430,
  mitjana: (s) => !!s.flags.gritosMitjana,
  lacara: (s) => !!s.flags.coloLaCara,
  after: (s) => !!s.flags.huyoDelAfter,
  bajadas: (s) => s.bajadas >= BAJADAS,
  blanca: (s) => s.dinero <= 0,
  imposible: () => false,                       // DISEÑO, 11: Juanjo apunta uno siempre
};

/** Se acabó la noche: apunta sus logros, aparte de la partida. Devuelve los que son nuevos. */
export function registrarLogros(final, s = S) {
  const vistos = [...finalesVistos(), final];
  return guardarLogros(Object.keys(HECHO).filter((id) => HECHO[id](s, vistos)));
}

const tramo = (lista, v) => lista.find((q) => v >= q.de && v <= q.a) ?? lista[lista.length - 1];
const entre = (r, v) => !r || (v >= r[0] && v <= r[1]);

/** La primera regla que encaja. La última de cada final no pide nada más, así que siempre hay una. */
export function reglaTitular(lista, final, s = S) {
  return lista.find(({ si }) => si.final === final && entre(si.cor, s.coherencia) && entre(si.tej, s.tejos) && entre(si.cop, s.copas));
}

const color = (v) => (v >= 60 ? C.verde_ipa : v >= 30 ? C.naranja_farola : C.rojo_extintor);

/** Jarra de 8×10, con espuma y asa. */
function jarra(ctx, x, y) {
  rect(ctx, x, y, 6, 10, C.carbon);
  rect(ctx, x + 1, y + 1, 4, 3, C.marfil);
  rect(ctx, x + 1, y + 4, 4, 5, C.naranja_farola);
  rect(ctx, x + 6, y + 3, 2, 1, C.marfil);
  rect(ctx, x + 7, y + 3, 1, 4, C.marfil);
  rect(ctx, x + 6, y + 6, 2, 1, C.marfil);
}

const METAL = { oro: 'amarillo_mural', plata: 'blanco_extintor', bronce: 'naranja_farola' };

/** Medalla colgada de su cinta. Apagada, gris; conseguida, brilla de vez en cuando. */
function medalla(ctx, x, y, metal, luce) {
  const m = luce ? C[METAL[metal]] : C.gris, sombra = luce ? C.naranja_oscuro : C.noche_clara;
  rect(ctx, x + 6, y, 4, 8, C.carbon);
  rect(ctx, x + 12, y, 4, 8, C.carbon);
  rect(ctx, x + 7, y, 2, 7, luce ? C.rosa_neon : C.morado);
  rect(ctx, x + 13, y, 2, 7, luce ? C.azul_claro : C.morado);
  rect(ctx, x + 5, y + 8, 12, 14, C.carbon);
  rect(ctx, x + 3, y + 10, 16, 10, C.carbon);
  rect(ctx, x + 6, y + 9, 10, 12, m);
  rect(ctx, x + 4, y + 11, 14, 8, m);
  rect(ctx, x + 9, y + 12, 4, 6, sombra);
  rect(ctx, x + 7, y + 14, 8, 2, sombra);
  if (!luce) return;
  const k = Math.floor(G.time * 2 + x + y) % 6;
  if (k < 2) {
    rect(ctx, x + 5 + k * 10, y + 8, 1, 5, C.marfil);
    rect(ctx, x + 3 + k * 10, y + 10, 5, 1, C.marfil);
  }
}

export class Balance {
  constructor(final, nuevos = []) {
    this.final = final;
    this.t = G.data.final;
    this.scroll = 0;
    this.vel = 0;
    this.drag = null;
    this.laura = convencida(final);
    this.bloques = [];
    this.y = 2;
    const { t } = this;
    const regla = reglaTitular(t.titulares, final);
    const v = regla.v[Math.floor(Math.random() * regla.v.length)];
    this.bloque(this.medirTitular(v));
    this.bloque(this.medirCervezas());
    this.bloque(this.medirCordura());
    this.bloque(this.medirTejos());
    this.bloque(this.medirLaura());
    const tengo = new Set([...logrosGuardados(), ...nuevos]);
    this.bloque(this.medirCabeceraLogros(tengo.size, nuevos.length));
    for (const l of t.lista) this.bloque(this.medirLogro(l, tengo.has(l.id), nuevos.includes(l.id)));
    this.bloque(this.medirDatos());
    this.alto = this.y;
  }

  bloque(q) {
    q.y = this.y;
    this.bloques.push(q);
    this.y += q.h + HUECO;
  }

  vars(s) {
    const n = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
    return rellenar(String(s)
      .replaceAll('{cordura}', S.coherencia)
      .replaceAll('{copas_txt}', n(S.copas, 'cerveza', 'cervezas'))
      .replaceAll('{tejos_txt}', n(S.tejos, 'tejo', 'tejos'))
      .replaceAll('{max}', Math.max(TEJOS_MAX, S.tejos))
      .replaceAll('{laura_resto}', 100 - this.laura));
  }

  lineas(s, font = 'dialog', ancho = INT) { return wrap(this.vars(s), font, ancho); }

  medirTitular(v) {
    const grande = this.lineas(v.t, 'huge');
    const sub = this.lineas(v.s);
    const fin = `${this.t.final}: ${G.data.night.finales[this.final]?.titulo ?? ''}`;
    const ht = grande.length * lineHeight('huge'), hs = sub.length * lineHeight('dialog');
    const h = 15 + ht + 3 + hs + 6;
    return {
      h,
      pinta: (ctx, y) => {
        panel(ctx, X, y, ANCHO, h, { edge: C.rosa_neon });
        const cx = X + (ANCHO >> 1);
        text(ctx, fin, cx, y + 5, { font: 'label', color: C.rosa_claro, align: 'center' });
        grande.forEach((l, i) => text(ctx, l, cx, y + 15 + i * lineHeight('huge'), { font: 'huge', color: C.amarillo_mural, align: 'center' }));
        sub.forEach((l, i) => text(ctx, l, cx, y + 15 + ht + 3 + i * lineHeight('dialog'), { color: C.marfil, align: 'center' }));
      },
    };
  }

  /**
   * Tarjeta común: rótulo y, debajo, una franja de dibujo a la izquierda de la cifra grande;
   * luego la frase y un pie opcional. El dibujo recibe el ancho que le deja la cifra.
   */
  tarjeta({ label, cifra, escala = 3, tinta = C.marfil, franja = 8, dibuja = null, frase, pie = null }) {
    const ls = this.lineas(frase);
    const libre = INT - anchoCifras(cifra, escala) - 6;
    const yf = Math.max(5 * escala + 8, 15 + franja + 3);
    const yp = yf + ls.length * lineHeight('dialog');
    const h = yp + (pie ? 15 : 3);
    return {
      h,
      pinta: (ctx, y) => {
        panel(ctx, X, y, ANCHO, h);
        text(ctx, label, X + PAD, y + 5, { font: 'label', color: C.rosa_claro });
        cifras(ctx, cifra, X + ANCHO - PAD, y + 5, { color: tinta, align: 'right', escala });
        dibuja?.(ctx, y + 15, libre);
        ls.forEach((l, i) => text(ctx, l, X + PAD, y + yf + i * lineHeight('dialog'), { color: C.marfil }));
        if (pie) {
          text(ctx, pie.txt, X + PAD, y + yp + 3, { font: 'label', color: C.gris });
          cifras(ctx, pie.v, X + ANCHO - PAD, y + yp + 1, { color: C.marfil, align: 'right', escala: 2 });
        }
      },
    };
  }

  medirCervezas() {
    const c = this.t.cervezas;
    const fila = Math.floor((INT - anchoCifras(S.copas, 4) - 6) / JARRA_PASO);
    const n = Math.min(S.copas, 2 * fila);      // las que no caben las dice la cifra
    return this.tarjeta({
      label: c.label, cifra: S.copas, escala: 4, tinta: C.naranja_farola,
      franja: Math.ceil(n / fila) * JARRA_ALTO, frase: tramo(c.tramos, S.copas).txt,
      pie: S.tragos ? { txt: c.tragos, v: S.tragos } : null,
      dibuja: (ctx, y) => {
        for (let i = 0; i < n; i++) jarra(ctx, X + PAD + (i % fila) * JARRA_PASO, y + Math.floor(i / fila) * JARRA_ALTO);
      },
    });
  }

  medirCordura() {
    const c = this.t.cordura, v = S.coherencia;
    return this.tarjeta({
      label: c.label, cifra: `${v}/100`, tinta: color(v), frase: tramo(c.tramos, v).txt,
      dibuja: (ctx, y, ancho) => bar(ctx, X + PAD, y, ancho, 8, v / 100, color(v)),
    });
  }

  medirTejos() {
    const c = this.t.tejos, v = S.tejos, max = Math.max(TEJOS_MAX, v);
    return this.tarjeta({
      label: c.label, cifra: `${v}/${max}`, tinta: C.rosa_neon, frase: tramo(c.tramos, v).txt,
      dibuja: (ctx, y, ancho) => {
        const paso = Math.min(CORAZON_PASO, Math.floor(ancho / max));
        for (let i = 0; i < max; i++) heart(ctx, X + PAD + i * paso, y + 1, i < v ? C.rosa_neon : C.morado);
      },
    });
  }

  medirLaura() {
    const c = this.t.laura, v = this.laura, doble = this.final === 'doble';
    const tinta = doble ? C.rosa_neon : color(v);
    return this.tarjeta({
      label: c.label, cifra: `${v}%`, tinta, frase: tramo(c[this.final] ?? c.cuela, v).txt,
      pie: doble ? { txt: c.juanjo, v: '100%' } : null,
      dibuja: (ctx, y, ancho) => bar(ctx, X + PAD, y, ancho, 8, v / 100, tinta),
    });
  }

  medirCabeceraLogros(tengo, nuevos) {
    const l = this.t.logros;
    const total = `${tengo}/${this.t.lista.length}`;
    const h = nuevos ? 37 : 26;
    return {
      h,
      pinta: (ctx, y) => {
        panel(ctx, X, y, ANCHO, h, { edge: C.amarillo_mural });
        text(ctx, l.label, X + PAD, y + 6, { font: 'bold', color: C.amarillo_mural });
        cifras(ctx, total, X + ANCHO - PAD, y + 6, { color: C.amarillo_mural, align: 'right', escala: 3 });
        if (nuevos) {
          text(ctx, l.nuevos, X + PAD, y + 25, { font: 'label', color: C.gris });
          cifras(ctx, nuevos, X + ANCHO - PAD, y + 24, { color: C.rosa_neon, align: 'right', escala: 2 });
        }
      },
    };
  }

  medirLogro(l, luce, nuevo) {
    const txt = this.t.logros;
    const x = X + PAD + MEDALLA + 6;
    const ancho = X + ANCHO - PAD - x;
    const nombre = wrap(!luce && l.oculto ? txt.oculto : l.nombre, 'bold', ancho);
    const cuerpo = wrap(luce ? l.txt : l.pista, 'dialog', ancho);
    const lh = lineHeight('dialog');
    const yn = nuevo ? 13 : 4;            // la marca NUEVO va en su renglón, encima del nombre
    const h = Math.max(MEDALLA + 8, yn + (nombre.length + cuerpo.length) * lh + 5);
    return {
      h,
      pinta: (ctx, y) => {
        panel(ctx, X, y, ANCHO, h, { fill: luce ? C.noche_clara : C.noche, edge: luce ? C[METAL[l.metal]] : C.morado });
        medalla(ctx, X + PAD - 2, y + 4, l.metal, luce);
        if (nuevo) text(ctx, txt.nuevo, x, y + 4, { font: 'label', color: C.rosa_neon });
        nombre.forEach((s, i) => text(ctx, s, x, y + yn + i * lh, { font: 'bold', color: luce ? C.marfil : C.gris }));
        cuerpo.forEach((s, i) => text(ctx, s, x, y + yn + (nombre.length + i) * lh, { color: luce ? C.rosa_claro : C.gris }));
      },
    };
  }

  medirDatos() {
    const t = G.data.night.resultados;
    const filas = [[t.sms, S.smsEnviados], [t.bajadas, S.bajadas]];
    if (S.flags.escribio0430) filas.push([t.de_mas, S.smsDeMas]);
    const buitre = wrap(rellenar(t.buitre), 'dialog', INT);
    const FILA = 19;
    const h = 20 + filas.length * FILA + buitre.length * lineHeight('dialog') + 6;
    return {
      h,
      pinta: (ctx, y) => {
        panel(ctx, X, y, ANCHO, h);
        text(ctx, this.t.datos, X + PAD, y + 6, { font: 'label', color: C.rosa_claro });
        filas.forEach(([k, v], i) => {
          const yf = y + 18 + i * FILA;
          text(ctx, k, X + PAD, yf + 4, { font: 'label', color: C.gris });
          cifras(ctx, v, X + ANCHO - PAD, yf, { escala: 3, align: 'right' });
        });
        const yb = y + 20 + filas.length * FILA;
        buitre.forEach((l, i) => text(ctx, l, X + (ANCHO >> 1), yb + i * lineHeight('dialog'), { color: C.marfil, align: 'center' }));
      },
    };
  }

  get max() { return Math.max(0, this.alto - VISTA.h); }

  mover(d) { this.scroll = Math.max(0, Math.min(this.max, this.scroll + d)); }

  update(dt) {
    const p = input.p();
    if (input.pressed && p && inRect(p, VISTA)) { this.drag = { y: p.y }; this.vel = 0; }
    if (!p) this.drag = null;
    if (this.drag) {
      const dy = p.y - this.drag.y;
      this.drag.y = p.y;
      this.mover(-dy);
      if (dt > 0) this.vel = this.vel * 0.6 + (-dy / dt) * 0.4;
    } else if (this.vel) {
      this.mover(this.vel * dt);
      this.vel *= Math.max(0, 1 - FRENADO * dt);
      if (Math.abs(this.vel) < 4) this.vel = 0;
    }
    if (input.wheel) this.mover(input.wheel);
    if (input.key('ArrowDown')) this.mover(240 * dt);
    if (input.key('ArrowUp')) this.mover(-240 * dt);
  }

  draw(ctx) {
    const y0 = VISTA.y - Math.round(this.scroll);
    ctx.save();
    ctx.beginPath();
    ctx.rect(VISTA.x, VISTA.y, VISTA.w, VISTA.h);
    ctx.clip();
    for (const q of this.bloques) {
      const y = y0 + q.y;
      if (y < VISTA.y + VISTA.h && y + q.h > VISTA.y) q.pinta(ctx, y);
    }
    ctx.restore();
    if (!this.max) return;
    const alto = Math.max(20, Math.round((VISTA.h * VISTA.h) / this.alto));
    const yc = VISTA.y + Math.round((this.scroll / this.max) * (VISTA.h - alto));
    rect(ctx, CARRIL.x, VISTA.y, CARRIL.w, VISTA.h, C.carbon);
    rect(ctx, CARRIL.x, yc, CARRIL.w, alto, C.rosa_neon);
    if (this.scroll < this.max - 2) {
      rect(ctx, X, AVISO_Y - 1, ANCHO, 12, C.carbon);
      text(ctx, this.t.desliza, X + (ANCHO >> 1), AVISO_Y + 1, { font: 'label', color: C.amarillo_mural, align: 'center' });
    }
  }
}

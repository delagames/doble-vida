// ¡PIDE!: arriba está cada Pokémon con un bocadillo que dice lo que quiere, con dibujo y nombre.
// Se coge la copa de su grifo, abajo, y se arrastra hasta quien la pide: el grifo y el bocadillo
// llevan el mismo icono. Lo que quiere cada uno cambia cada pocos segundos y al servirle, y a
// veces justo cuando ya vas con su copa en la mano: el bocadillo tiembla antes de cambiar. Una
// copa soltada abajo vuelve al grifo sin coste. Si le das otra cosa, o se le acaba la paciencia,
// la copa te la bebes tú. El idioma de cada uno queda de adorno, en lo gris de la franja.
//
// Parámetros (todos opcionales), para reutilizarlo en ¡PIDE! II:
//   bebidas, pokemon   claves de data/pedidos.json. Hasta cinco bebidas.
//   extra              Pokémon que se suma con coherencia baja.
//   meta               copas bien servidas para ganar.
//   maxFallos          copas bebidas para perder.
//   ritmo              multiplica la paciencia y el tiempo entre cambios.
// Para añadir cosas, hereda: alServir(cliente, tipo) se llama con 'bien', 'mal' o 'cansa';
// fondo(ctx) pinta el local y `rotulos` da los textos de la franja de estado.
import { C } from '../assets.js';
import { input } from '../input.js';
import { W, vibrar } from '../screen.js';
import { text, wrap, measure, lineHeight } from '../text.js';
import { bar, cifras, dither, outline, panel, pixelLine, rect } from '../draw.js';
import { S, UMBRAL, barajar } from '../state.js';
import { copa, endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { G } from '../game.js';
import { Arrastre } from '../minigame.js';
import { drawBebida, drawGrifo, fondoTenue, grifos, retrato } from './dibujo.js';

const RET_Y = 50, BOC_Y = 96, BOC_H = 114, PAC_Y = 213;    // retrato, bocadillo y paciencia
const REVELA = { x: 4, y: 338, w: W - 8, h: 42 };          // la franja de lo que acaba de pasar
const REVELA_SEG = 1.8;
const SUELTA_Y = REVELA.y + REVELA.h;     // por encima se entrega; por debajo vuelve al grifo
const GRACIA_CAMBIO = 0.25;   // la copa soltada justo al cambiar aún vale: se vio el pedido viejo
const PAUSA_CAMBIAZO = 3;     // entre un cambio a mala idea y el siguiente
const COSTE_LOSE = 3;         // los vasos de la ronda mal hecha

export default class Pide {
  static instruccion = '¡PIDE!';
  static ayuda = 'Arriba ves qué quiere cada uno. Coge esa copa de su grifo y arrástrala hasta él, antes de que se le acabe la paciencia. Lo que quieren va cambiando: si tiembla, está a punto. Suéltala abajo y vuelve al grifo. Si te equivocas, te la bebes tú.';
  static carga = ['manolo', 'zorro', 'buitre'];

  start({ coh, params }) {
    this.p = {
      bebidas: ['cerveza', 'ipa', 'chupito'],
      pokemon: ['manolo', 'zorro'],
      extra: 'buitre',
      meta: 7,
      maxFallos: Math.round(endurece(4, 2)),
      ritmo: 1,
      ...params,
    };
    this.bebidas = G.data.pedidos.bebidas;
    for (const b of this.p.bebidas) if (!this.bebidas[b]) throw new Error(`Bebida desconocida: ${b}`);
    if (this.p.extra && coh < 50) this.p.pokemon = [...this.p.pokemon, this.p.extra];
    this.grifos = grifos(this.p.bebidas.length).map((r, i) => ({ r, id: this.p.bebidas[i] }));
    this.paciencia = endurece(12, 6) * this.p.ritmo;
    this.cambio = endurece(5.5, 2.8) * this.p.ritmo;
    this.aviso = endurece(0.8, 0.45);
    this.pCambiazo = endurece(0.2, 0.65);
    this.borroso = coh < UMBRAL.loca;
    const n = this.p.pokemon.length;
    const w = Math.floor((W - 8 - (n - 1) * 4) / n);
    this.clientes = [];
    this.p.pokemon.forEach((who, i) => {
      const c = { who, r: { x: 4 + i * (w + 4), w }, fase: i * 2.1, quiere: null, antes: null, graciaCambio: 0, flash: 0, pac: 0, cambia: 0 };
      this.clientes.push(c);
      this.pidePedido(c);
      c.pac = this.paciencia * (1 + i * 0.35);    // no se cansan todos a la vez
      c.cambia = this.proxCambio() + i * 0.9;
      c.flash = 0;
    });
    this.arr = new Arrastre();
    this.servidas = 0;
    this.fallos = 0;
    this.pausaCambiazo = 2;
    this.rev = null;
    this.destello = null;
    this.tiempo = 0;
  }

  proxCambio() { return this.cambio * (0.8 + Math.random() * 0.5); }

  /** Algo distinto de lo que quería y, si se puede, de lo que quieren los demás. */
  pidePedido(c) {
    const otros = this.clientes.filter((o) => o !== c).map((o) => o.quiere);
    const libres = this.p.bebidas.filter((b) => b !== c.quiere && !otros.includes(b));
    const vale = libres.length ? libres : this.p.bebidas.filter((b) => b !== c.quiere);
    c.antes = c.quiere;
    c.quiere = barajar(vale)[0];
    c.flash = 0.3;
  }

  /** Tras servirle, o tras fallarle, vuelve a empezar con otro pedido. */
  renueva(c) {
    this.pidePedido(c);
    c.antes = null;
    c.pac = this.paciencia;
    c.cambia = this.proxCambio();
  }

  update(dt) {
    this.tiempo += dt;
    if (this.rev && (this.rev.t -= dt) <= 0) this.rev = null;
    if (this.destello && (this.destello.t -= dt) <= 0) this.destello = null;
    this.pausaCambiazo -= dt;
    const antes = this.arr.obj;
    const suelto = this.arr.update(this.grifos, (g) => g.r, 1);
    if (!antes && this.arr.obj) this.alCoger(this.arr.obj);
    if (suelto) this.soltar(suelto);
    this.atajos();
    for (const c of this.clientes) {
      c.flash = Math.max(0, c.flash - dt);
      c.graciaCambio = Math.max(0, c.graciaCambio - dt);
      c.pac -= dt;
      c.cambia -= dt;
      if (c.cambia <= 0) {
        this.pidePedido(c);
        c.graciaCambio = GRACIA_CAMBIO;
        c.cambia = this.proxCambio();
        audio.compas(false);
      }
      if (c.pac <= 0) this.servir(c, c.quiere, 'cansa');
    }
  }

  /** El cambio a mala idea: quien quería esa copa se lo piensa mientras se la llevas. */
  alCoger(g) {
    const c = this.clientes.find((q) => q.quiere === g.id);
    if (!c || this.pausaCambiazo > 0 || Math.random() > this.pCambiazo) return;
    this.pausaCambiazo = PAUSA_CAMBIAZO;
    c.cambia = Math.min(c.cambia, this.aviso * (0.8 + Math.random() * 0.5));
  }

  /** En ordenador, las teclas 1 a 5 llevan esa copa a quien tenga menos paciencia. */
  atajos() {
    const i = this.grifos.findIndex((_, k) => input.hit(`Digit${k + 1}`));
    if (i < 0) return;
    this.entrega(this.clientes.reduce((a, b) => (b.pac < a.pac ? b : a)), this.grifos[i].id);
  }

  clienteBajo(x, y) {
    if (y >= SUELTA_Y) return null;
    return this.clientes.find((c) => x >= c.r.x - 2 && x < c.r.x + c.r.w + 2) ?? null;
  }

  soltar({ obj, x, y }) {
    const c = this.clienteBajo(x, y);
    if (c) this.entrega(c, obj.id);
  }

  entrega(c, bebida) {
    const vale = bebida === c.quiere || (c.graciaCambio > 0 && bebida === c.antes);
    this.servir(c, vale ? bebida : c.quiere, vale ? 'bien' : 'mal', bebida);
  }

  /** bebida: la que quería. dada: la que se le ha llevado, la que enciende su grifo. */
  servir(c, bebida, tipo, dada = bebida) {
    this.rev = { who: c.who, bebida, tipo, t: REVELA_SEG };
    this.destello = { id: dada, ok: tipo === 'bien', t: 0.22 };   // el grifo responde
    if (tipo === 'bien') { this.servidas++; audio.toque(); } else {
      this.fallos++;
      copa(1, 'copa');
      audio.fallo();
      vibrar();
    }
    this.alServir(c, tipo);
    this.renueva(c);
  }

  alServir() {}

  result() {
    if (this.servidas >= this.p.meta) return 'win';
    if (this.fallos >= this.p.maxFallos) return 'lose';
    return null;
  }

  tarjeta(res) {
    if (res === 'win') {
      return {
        titulo: '¡MARCHANDO!',
        lineas: ['Ronda completa.', this.fallos ? 'Alguna se ha quedado por el camino. En Juanjo.' : 'Y sin beberte ninguna. Juanjo lo llama no tiltear.'],
        datos: this.fallos ? [['TE HAS BEBIDO', this.fallos]] : [],
      };
    }
    S.dinero = Math.max(0, S.dinero - COSTE_LOSE);
    return {
      titulo: '¡QUÉ RONDA!',
      coste: 0,
      lineas: ['Mr. Mime señala los vasos rotos. Luego, tu cartera.', 'Juanjo traduce: «Dice que soy el cliente del siglo. Del XXI.»'],
      datos: [['COPAS BIEN', `${this.servidas}/${this.p.meta}`], ['TE HAS BEBIDO', this.fallos], ['LOS VASOS', COSTE_LOSE]],
    };
  }

  // Dibujo ---------------------------------------------------------------------

  fondo(ctx) { fondoTenue(ctx, '05-siglo-xxi', 3); }

  get rotulos() {
    return { fallos: 'BEBIDAS', pista: 'ARRASTRA LA COPA HASTA QUIEN LA PIDE', mal: 'NO ERA ESA. TE LA BEBES TÚ', cansa: 'SE HA CANSADO. TE LA BEBES TÚ' };
  }

  draw(ctx) {
    this.fondo(ctx);
    panel(ctx, 4, 27, W - 8, 19, { fill: C.carbon });
    text(ctx, 'COPAS', 10, 33, { font: 'label', color: C.gris });
    cifras(ctx, `${this.servidas}/${this.p.meta}`, 48, 31, { escala: 2, color: C.cian_neon });
    text(ctx, this.rotulos.fallos, 142, 33, { font: 'label', color: C.gris });
    cifras(ctx, `${this.fallos}/${this.p.maxFallos}`, 196, 31, { escala: 2, color: this.fallos ? C.rojo_extintor : C.gris });
    const encima = this.arr.obj ? this.clienteBajo(this.arr.x, this.arr.y) : null;
    for (const c of this.clientes) this.pintaCliente(ctx, c, c === encima);
    this.pintaRevela(ctx);
    for (const g of this.grifos) drawGrifo(ctx, g.r, g.id, { activo: g === this.arr.obj });
    const f = this.destello && this.grifos.find((g) => g.id === this.destello.id);
    if (f) {
      const { x, y, w, h } = f.r, c = this.destello.ok ? C.cian_neon : C.rojo_extintor, l = this.destello.t > 0.11 ? 3 : 1;
      outline(ctx, x - l, y - l, w + l * 2, h + l * 2, c);
    }
    if (!this.servidas && !this.fallos && !this.arr.obj) this.pintaGesto(ctx);
    // La copa va por encima del dedo: si no, la tapa el pulgar.
    if (this.arr.obj) drawBebida(ctx, this.arr.obj.id, Math.round(this.arr.x) - 21, Math.round(this.arr.y) - 66, { escala: 3 });
  }

  /** Hasta la primera copa, un fantasma enseña el gesto: de su grifo a quien la pide. */
  pintaGesto(ctx) {
    const c = this.clientes[0], g = this.grifos.find((q) => q.id === c.quiere);
    if (!g) return;
    const k = (this.tiempo % 1.6) / 1.6;
    const x0 = g.r.x + (g.r.w >> 1), y0 = g.r.y + 8, x1 = c.r.x + (c.r.w >> 1), y1 = 240;
    pixelLine(ctx, x0, y0, x1, y1, C.rosa_neon, 1, 3);
    drawBebida(ctx, c.quiere, Math.round(x0 + (x1 - x0) * k) - 14, Math.round(y0 + (y1 - y0) * k) - 18, { escala: 2 });
  }

  pintaCliente(ctx, c, encima) {
    const { x, w } = c.r, cx = x + (w >> 1);
    const beb = this.bebidas[c.quiere];
    const avisa = c.cambia < this.aviso;
    const amp = Math.round(endurece(0, 3)) + (avisa ? 2 : 0);
    const dx = amp ? Math.round(Math.sin(this.tiempo * 37 + c.fase) * amp) : 0;
    const dy = amp ? Math.round(Math.cos(this.tiempo * 29 + c.fase) * (amp >> 1)) : 0;
    retrato(ctx, c.who, cx - 20, RET_Y);
    const borde = encima ? C.rosa_neon : c.flash > 0 ? C.amarillo_mural : avisa ? C.rojo_extintor : C[beb.color];
    rect(ctx, cx - 3, BOC_Y - 4, 7, 5, borde);       // el pico del bocadillo
    rect(ctx, cx - 1, BOC_Y - 6, 3, 3, borde);
    panel(ctx, x, BOC_Y, w, BOC_H, { fill: C.marfil, edge: borde });
    if (encima || c.flash > 0) outline(ctx, x + 1, BOC_Y + 1, w - 2, BOC_H - 2, borde);
    drawBebida(ctx, c.quiere, cx - 28 + dx, BOC_Y + 5 + dy, { escala: 4 });
    const lineas = wrap(beb.nombre, 'bold', w - 6);
    const lh = lineHeight('bold');
    const y0 = BOC_Y + BOC_H - 3 - lineas.length * lh;
    lineas.forEach((l, i) => {
      if (this.borroso) text(ctx, l, cx + dx + 1, y0 + i * lh, { font: 'bold', color: C.gris, align: 'center' });
      text(ctx, l, cx + dx, y0 + i * lh, { font: 'bold', color: C.carbon, align: 'center' });
    });
    if (this.borroso) dither(ctx, x + 2, BOC_Y + 3, w - 4, 74, C.marfil, 1);
    const f = Math.max(0, c.pac / this.paciencia);
    bar(ctx, x, PAC_Y, w, 6, Math.min(1, f), f < 0.3 ? C.rojo_extintor : C.cian_neon);
  }

  pintaRevela(ctx) {
    const r = REVELA;
    panel(ctx, r.x, r.y, r.w, r.h, { fill: C.carbon, edge: C.morado });
    if (!this.rev) {
      text(ctx, this.rotulos.pista, W >> 1, r.y + 17, { font: 'label', color: C.gris, align: 'center' });
      return;
    }
    const { who, bebida, tipo } = this.rev;
    retrato(ctx, who, r.x + 6, r.y + 10, { lado: 20 });
    const grito = G.data.pedidos.palabras[who]?.[bebida] ?? '';     // su idioma: solo sabor
    text(ctx, grito, r.x + 31, r.y + 7, { font: 'bold', color: C.gris });
    const xb = r.x + 31 + measure(grito, 'bold') + 7;
    drawBebida(ctx, bebida, xb, r.y + 3);
    text(ctx, this.bebidas[bebida].nombre, xb + 18, r.y + 9, { font: 'label', color: C.amarillo_mural });
    const nota = { bien: '¡MARCHANDO!', mal: this.rotulos.mal, cansa: this.rotulos.cansa }[tipo];
    const color = tipo === 'bien' ? C.cian_neon : C.rojo_extintor;
    text(ctx, nota, r.x + 31, r.y + 27, { font: 'label', color });
    rect(ctx, r.x + 2, r.y + r.h - 3, Math.round((r.w - 4) * (this.rev.t / REVELA_SEG)), 1, color);
  }
}

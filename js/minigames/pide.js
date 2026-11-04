// ¡PIDE!: los pedidos suben como notas, cada una con la cara de su Pokémon, y hay que llevarlas
// a su grifo antes de que lleguen arriba. La nota dice de quién es; lo que quiere se mira en la
// lista de arriba, con su cara, dibujo y nombre, el mismo icono que el grifo. Lo que quiere va
// cambiando, también con la nota de camino, y vale lo que pida al soltarla: su fila da un
// destello al cambiar. Si no la llevas a tiempo o fallas el grifo, la copa te la bebes tú. Una
// nota soltada fuera de los grifos vuelve a su sitio sin coste. Lo que pone en la nota, en su
// idioma, es adorno: no hace falta entenderlo.
//
// Parámetros (todos opcionales), para reutilizarlo en ¡PIDE! II:
//   bebidas, pokemon   claves de data/pedidos.json. Hasta cinco bebidas.
//   extra              Pokémon que se suma con coherencia baja.
//   meta               copas bien servidas para ganar.
//   maxFallos          copas bebidas para perder.
//   aLaVez             notas que salen juntas (dos Pokémon a la vez).
//   ritmo              multiplica el tiempo entre notas y entre cambios.
// Para añadir cosas, hereda: alServir(nota, tipo) se llama con 'bien', 'mal' o 'cansa';
// fondo(ctx) pinta el local y `rotulos` da los textos de la franja de estado.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, H, vibrar } from '../screen.js';
import { text, wrap, measure, lineHeight } from '../text.js';
import { cifras, outline, panel, pixelLine, rect } from '../draw.js';
import { S, barajar } from '../state.js';
import { copa, endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { G } from '../game.js';
import { Arrastre } from '../minigame.js';
import { drawBebida, drawGrifo, fondoTenue, grifos, retrato } from './dibujo.js';

const LISTA = { x: 4, y: 48, w: W - 8, h: 92 };     // opaca: las notas no entran ahí
const NOTA = { w: 124, h: 28 };
const CARRILES = [7, 139];
const SALE_Y = 334 - NOTA.h, TOPE_Y = LISTA.y + LISTA.h + 2;
const SOBRE_DEDO = 24;        // la nota cogida va por encima del dedo, para que no la tape
const REVELA = { x: 4, y: 338, w: W - 8, h: 42 };   // la franja de lo que acaba de pasar
const REVELA_SEG = 1.8;
const DESTELLO_SEG = 0.6;
const GRACIA_CAMBIO = 0.2;    // la nota soltada justo al cambiar aún vale: el dedo ya iba
const COSTE_LOSE = 3;         // los vasos de la ronda mal hecha

export default class Pide {
  static instruccion = '¡PIDE!';
  static ayuda = 'Arrastra cada nota a su grifo antes de que llegue arriba. La nota dice de quién es; mira arriba qué quiere ahora. Lo que quieren va cambiando, y vale lo que pida al soltarla. Si fallas el grifo o se te escapa, te la bebes tú.';
  static carga = ['manolo', 'zorro', 'buitre'];

  start({ coh, params }) {
    this.p = {
      bebidas: ['cerveza', 'ipa', 'chupito'],
      pokemon: ['manolo', 'zorro'],
      extra: 'buitre',
      meta: 7,
      maxFallos: 3,
      aLaVez: 1,
      ritmo: 1,
      ...params,
    };
    this.bebidas = G.data.pedidos.bebidas;
    for (const b of this.p.bebidas) if (!this.bebidas[b]) throw new Error(`Bebida desconocida: ${b}`);
    if (this.p.extra && coh < 50) this.p.pokemon = [...this.p.pokemon, this.p.extra];
    this.grifos = grifos(this.p.bebidas.length).map((r, i) => ({ r, id: this.p.bebidas[i] }));
    this.intervalo = endurece(2.7, 1.7) * this.p.ritmo;
    this.velBase = endurece(1, 2.2);
    this.cambio = endurece(3.9, 2) * this.p.ritmo;
    this.pDoble = endurece(0, 0.35);     // con poca coherencia, a veces salen dos juntas
    const n = this.p.pokemon.length;
    const alto = n > 2 ? 28 : 43;
    this.alto = alto;
    this.clientes = [];
    this.p.pokemon.forEach((who, i) => {
      const c = { who, y: LISTA.y + 2 + i * (alto + 1), fase: i * 2.1, quiere: null, antes: null, graciaCambio: 0, flash: 0, cambia: 0 };
      this.clientes.push(c);
      this.pidePedido(c);
      c.flash = 0;
      c.cambia = this.proxCambio() + i * 0.9;
    });
    this.notas = [];
    this.bolsa = [];
    this.arr = new Arrastre();
    this.servidas = 0;
    this.fallos = 0;
    this.sale = 0.5;
    this.lanzadas = 0;
    this.carril = 0;
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
    c.flash = DESTELLO_SEG;
    c.graciaCambio = GRACIA_CAMBIO;
  }

  cliente(who) { return this.clientes.find((c) => c.who === who); }

  /** Al principio van lentas para dar tiempo a entenderlo, y luego ya no. */
  duracionNota(n) {
    const base = n < 3 ? 12 : n < 6 ? 10 : 8.5;
    return base / this.velBase;
  }

  /** Los Pokémon se turnan al azar, de bolsa: nadie encadena tres notas seguidas. */
  sacaWho() {
    if (!this.bolsa.length) this.bolsa = barajar(this.p.pokemon);
    return this.bolsa.pop();
  }

  lanza(dt) {
    this.sale -= dt;
    if (this.sale > 0) return;
    this.sale = this.intervalo;
    const cuantas = Math.min(2, this.p.aLaVez + (Math.random() < this.pDoble ? 1 : 0));
    for (let k = 0; k < cuantas; k++) this.notaNueva();
  }

  notaNueva() {
    const hueco = (x) => !this.notas.some((n) => n !== this.arr.obj && n.x === x && n.y > SALE_Y - NOTA.h - 2);
    const x = [CARRILES[this.carril % 2], CARRILES[(this.carril + 1) % 2]].find(hueco);
    if (x === undefined) return;       // el fondo está lleno: la siguiente tanda sale cuando quepa
    this.carril = CARRILES.indexOf(x) + 1;
    const who = this.sacaWho();
    const palabras = Object.values(G.data.pedidos.palabras[who] ?? {});
    this.notas.push({
      who, x, y: SALE_Y,
      palabra: barajar(palabras)[0] ?? '',       // su idioma: solo sabor
      v: (SALE_Y - TOPE_Y) / this.duracionNota(this.lanzadas),
      fase: Math.random() * 6,
    });
    this.lanzadas++;
  }

  zona(n) { return { x: n.x, y: n.y, w: NOTA.w, h: NOTA.h }; }

  /** Otra nota justo delante en su carril: espera detrás, para no pisarla. */
  tapada(n) {
    return this.notas.some((o) => o !== n && o !== this.arr.obj && o.x === n.x && o.y <= n.y && n.y - o.y < NOTA.h + 2 && (o.y < n.y || this.notas.indexOf(o) < this.notas.indexOf(n)));
  }

  update(dt) {
    this.tiempo += dt;
    this.lanza(dt);
    if (this.rev && (this.rev.t -= dt) <= 0) this.rev = null;
    if (this.destello && (this.destello.t -= dt) <= 0) this.destello = null;
    const suelto = this.arr.update(this.notas, (n) => this.zona(n));
    if (suelto) this.soltar(suelto);
    this.atajos();
    for (const c of this.clientes) {
      c.flash = Math.max(0, c.flash - dt);
      c.graciaCambio = Math.max(0, c.graciaCambio - dt);
      c.cambia -= dt;
      if (c.cambia <= 0) {
        this.pidePedido(c);
        c.cambia = this.proxCambio();
      }
    }
    for (const n of [...this.notas]) {
      if (n === this.arr.obj || this.tapada(n)) continue;
      n.y -= n.v * dt;
      if (n.y <= TOPE_Y) this.servir(n, 'cansa', this.cliente(n.who).quiere);
    }
  }

  /** En ordenador, las teclas 1 a 5 mandan la nota más alta a ese grifo. */
  atajos() {
    const i = this.grifos.findIndex((_, k) => input.hit(`Digit${k + 1}`));
    if (i < 0 || !this.notas.length) return;
    const n = this.notas.reduce((a, b) => (b.y < a.y ? b : a));
    this.entrega(n, this.grifos[i].id);
  }

  grifoBajo(x, y) {
    return this.grifos.find((g) => inRect({ x, y }, { x: g.r.x - 2, y: g.r.y - 4, w: g.r.w + 4, h: g.r.h + 6 }));
  }

  soltar({ obj, x, y }) {
    const g = this.grifoBajo(x, y);
    if (g) this.entrega(obj, g.id);    // si no, vuelve a su sitio y sigue subiendo
  }

  entrega(n, bebida) {
    const c = this.cliente(n.who);
    const vale = bebida === c.quiere || (c.graciaCambio > 0 && bebida === c.antes);
    this.servir(n, vale ? 'bien' : 'mal', vale ? bebida : c.quiere, bebida);
  }

  /** bebida: la que quería. dada: la del grifo al que ha ido, el que responde. */
  servir(n, tipo, bebida, dada = bebida) {
    this.notas = this.notas.filter((o) => o !== n);
    if (this.arr.obj === n) this.arr.obj = null;
    this.rev = { who: n.who, bebida, tipo, t: REVELA_SEG };
    this.destello = { id: dada, ok: tipo === 'bien', t: 0.22 };
    if (tipo === 'bien') { this.servidas++; audio.toque(); } else {
      this.fallos++;
      copa(1, 'copa');
      audio.fallo();
      vibrar();
    }
    this.alServir(n, tipo);
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
    return { fallos: 'BEBIDAS', pista: 'LLEVA CADA NOTA AL GRIFO DE LO QUE PIDE', mal: 'NO ERA ESA. TE LA BEBES TÚ', cansa: 'LLEGÓ ARRIBA. TE LA BEBES TÚ' };
  }

  draw(ctx) {
    this.fondo(ctx);
    pixelLine(ctx, 0, TOPE_Y - 1, W, TOPE_Y - 1, C.rojo_extintor, 1, 2);
    panel(ctx, 4, 27, W - 8, 19, { fill: C.carbon });
    text(ctx, 'COPAS', 10, 33, { font: 'label', color: C.gris });
    cifras(ctx, `${this.servidas}/${this.p.meta}`, 48, 31, { escala: 2, color: C.cian_neon });
    text(ctx, this.rotulos.fallos, 142, 33, { font: 'label', color: C.gris });
    cifras(ctx, `${this.fallos}/${this.p.maxFallos}`, 196, 31, { escala: 2, color: this.fallos ? C.rojo_extintor : C.gris });
    this.pintaLista(ctx);
    this.pintaRevela(ctx);
    const encima = this.arr.obj ? this.grifoBajo(this.arr.x, this.arr.y) : null;
    for (const g of this.grifos) drawGrifo(ctx, g.r, g.id, { activo: g === encima });
    const f = this.destello && this.grifos.find((g) => g.id === this.destello.id);
    if (f) {
      const { x, y, w, h } = f.r, c = this.destello.ok ? C.cian_neon : C.rojo_extintor, l = this.destello.t > 0.11 ? 3 : 1;
      outline(ctx, x - l, y - l, w + l * 2, h + l * 2, c);
    }
    for (const n of this.notas) if (n !== this.arr.obj) this.pintaNota(ctx, n, n.x, n.y);
    if (!this.servidas && !this.fallos && !this.arr.obj) this.pintaGesto(ctx);
    // La nota va por encima del dedo, y nunca sube a la lista.
    if (this.arr.obj) {
      const x = Math.max(4, Math.min(W - NOTA.w - 4, Math.round(this.arr.x) - (NOTA.w >> 1)));
      const y = Math.max(TOPE_Y, Math.min(H - NOTA.h, Math.round(this.arr.y) - NOTA.h - SOBRE_DEDO));
      this.pintaNota(ctx, this.arr.obj, x, y);
    }
  }

  /** Hasta la primera copa, un fantasma enseña el camino: de la nota a su fila y a su grifo. */
  pintaGesto(ctx) {
    const n = this.notas.reduce((a, b) => (!a || b.y < a.y ? b : a), null);
    const c = n && this.cliente(n.who), g = c && this.grifos.find((q) => q.id === c.quiere);
    if (!g) return;
    const x0 = n.x + (NOTA.w >> 1), y0 = Math.round(n.y), x1 = g.r.x + (g.r.w >> 1), y1 = g.r.y + 8;
    pixelLine(ctx, x0, y0, x0, c.y + this.alto, C.amarillo_mural, 1, 3);
    pixelLine(ctx, x0, y0 + NOTA.h, x1, y1, C.rosa_neon, 1, 3);
    const k = (this.tiempo % 1.6) / 1.6;
    drawBebida(ctx, c.quiere, Math.round(x0 + (x1 - x0) * k) - 7, Math.round(y0 + NOTA.h + (y1 - y0 - NOTA.h) * k) - 9);
  }

  pintaLista(ctx) {
    panel(ctx, LISTA.x, LISTA.y, LISTA.w, LISTA.h, { fill: C.carbon, edge: C.morado });
    for (const c of this.clientes) this.pintaFila(ctx, c);
  }

  /** Una fila: cara, dibujo y nombre. Al cambiar, destella. Sin coherencia, todo tiembla. */
  pintaFila(ctx, c) {
    const x = LISTA.x + 2, w = LISTA.w - 4, h = this.alto, grande = h > 30;
    const beb = this.bebidas[c.quiere];
    const luce = c.flash > 0 && Math.floor(c.flash * 10) % 2 === 1;
    panel(ctx, x, c.y, w, h, { fill: luce ? C.amarillo_mural : C.marfil, edge: c.flash > 0 ? C.rojo_extintor : C.morado });
    if (c.flash > 0) outline(ctx, x + 1, c.y + 1, w - 2, h - 2, C.rojo_extintor);
    const amp = Math.round(endurece(0, 3));
    const dx = amp ? Math.round(Math.sin(this.tiempo * 37 + c.fase) * amp) : 0;
    const dy = amp ? Math.round(Math.cos(this.tiempo * 29 + c.fase) * (amp >> 1)) : 0;
    const lado = grande ? 40 : 20, cy = c.y + (h >> 1);
    retrato(ctx, c.who, x + 4 + dx, cy - (lado >> 1) + dy, { lado });
    const xb = x + lado + 10 + dx;
    drawBebida(ctx, c.quiere, xb, cy - (grande ? 18 : 9) + dy, { escala: grande ? 2 : 1 });
    const xt = xb + (grande ? 34 : 19);
    const lineas = wrap(beb.nombre, 'bold', LISTA.x + LISTA.w - 8 - xt);
    const lh = lineHeight('bold');
    lineas.forEach((l, i) => text(ctx, l, xt, cy - ((lineas.length * lh) >> 1) + 1 + i * lh + dy, { font: 'bold', color: C.carbon }));
  }

  pintaNota(ctx, n, x, y) {
    const baila = n === this.arr.obj ? 0 : Math.round(Math.sin(this.tiempo * 3 + n.fase) * endurece(0, 3));
    x = Math.round(x + baila); y = Math.round(y);
    panel(ctx, x, y, NOTA.w, NOTA.h, { fill: C.marfil, edge: C.gris });
    retrato(ctx, n.who, x + 4, y + 4, { lado: 20 });
    const ancho = NOTA.w - 30, cabe = measure(n.palabra, 'bold') <= ancho;     // las largas, en pequeño
    text(ctx, n.palabra, x + 27 + (ancho >> 1), y + (cabe ? 7 : 10), { font: cabe ? 'bold' : 'label', color: C.carbon, align: 'center' });
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
    drawBebida(ctx, bebida, r.x + 31, r.y + 3);
    text(ctx, this.bebidas[bebida].nombre, r.x + 49, r.y + 9, { font: 'label', color: C.amarillo_mural });
    const nota = { bien: '¡MARCHANDO!', mal: this.rotulos.mal, cansa: this.rotulos.cansa }[tipo];
    const color = tipo === 'bien' ? C.cian_neon : C.rojo_extintor;
    text(ctx, nota, r.x + 31, r.y + 27, { font: 'label', color });
    rect(ctx, r.x + 2, r.y + r.h - 3, Math.round((r.w - 4) * (this.rev.t / REVELA_SEG)), 1, color);
  }
}

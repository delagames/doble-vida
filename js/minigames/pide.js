// ¡PIDE!: las comandas suben como notas, cada una en el idioma de su Pokémon, y hay que
// llevarlas a su grifo antes de que lleguen arriba. Sin chuleta: al servir se revela la
// palabra. La primera vez que fallas una palabra, Mr. Mime te corrige gratis; después, y
// si una nota llega arriba, la copa te la bebes tú.
//
// Parámetros (todos opcionales), para reutilizarlo en ¡PIDE! II:
//   bebidas, pokemon   claves de data/pedidos.json. Hasta cinco bebidas.
//   extra              Pokémon que se suma con coherencia baja.
//   meta               copas bien servidas para ganar.
//   maxFallos          copas bebidas para perder.
//   aLaVez             notas que salen juntas (dos Pokémon a la vez).
//   secuencia          lista fija de [who, bebida], si no se quiere la generada.
//   ritmo              multiplica el tiempo entre notas (con aLaVez 2 conviene subirlo).
// Para añadir cosas, hereda: alServir(nota, tipo) se llama con 'bien', 'corrige' o 'mal';
// fondo(ctx) pinta el local y `rotulos` da los textos de la barra de estado.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, vibrar } from '../screen.js';
import { text, measure } from '../text.js';
import { cifras, outline, panel, pixelLine, rect } from '../draw.js';
import { S, barajar } from '../state.js';
import { copa, endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { G } from '../game.js';
import { Arrastre } from '../minigame.js';
import { drawBebida, drawGrifo, fondoTenue, grifos, retrato } from './dibujo.js';

const NOTA = { w: 128, h: 28 };
const CARRILES = [6, 136];
const SALE_Y = 334 - NOTA.h, TOPE_Y = 48;
const REVELA = { x: 4, y: 338, w: W - 8, h: 42 };
const REVELA_SEG = 2.4;
const COSTE_LOSE = 3;         // los vasos de la ronda mal hecha

export default class Pide {
  static instruccion = '¡PIDE!';
  static ayuda = 'Arrastra cada nota a su grifo antes de que llegue arriba. Cada Pokémon tiene su palabra para cada copa. Si no la sabes, prueba: al soltarla verás qué significaba.';
  static carga = ['manolo', 'zorro', 'buitre', 'mrmime'];

  start({ coh, params }) {
    this.p = {
      bebidas: ['cerveza', 'ipa', 'chupito'],
      pokemon: ['manolo', 'zorro'],
      extra: 'buitre',
      meta: 5,
      maxFallos: Math.round(endurece(4, 2)),
      aLaVez: 1,
      ...params,
    };
    this.palabras = G.data.pedidos.palabras;
    this.bebidas = G.data.pedidos.bebidas;
    if (this.p.extra && coh < 50) this.p.pokemon = [...this.p.pokemon, this.p.extra];
    this.grifos = grifos(this.p.bebidas.length).map((r, i) => ({ r, id: this.p.bebidas[i] }));
    for (const b of this.p.bebidas) if (!this.bebidas[b]) throw new Error(`Bebida desconocida: ${b}`);
    this.colas = this.p.secuencia ? [...this.p.secuencia] : this.genera();
    this.total = this.colas.length;
    this.notas = [];
    this.arr = new Arrastre();
    this.servidas = 0;
    this.fallos = 0;
    this.sale = 0.5;
    this.intervalo = endurece(2.7, 1.3) * (this.p.ritmo ?? 1);
    this.velBase = endurece(1, 2.2);
    this.lanzadas = 0;
    this.carril = 0;
    this.rev = null;
    this.destello = null;
    this.tiempo = 0;
  }

  /**
   * Se presentan las palabras de una en una y con repaso (a b a c b): cada Pokémon entra
   * con sus palabras y se repiten antes de pasar al siguiente. Al final, mezcla.
   */
  genera() {
    const seq = [];
    const { bebidas, pokemon } = this.p;
    for (const who of pokemon) {
      const b = barajar(bebidas);
      const orden = [0, 1, 0, 2, 1, 2, 3, 0, 4, 3].filter((i) => i < b.length).slice(0, pokemon.length > 2 ? 4 : b.length + 2);
      for (const i of orden) seq.push([who, b[i]]);
    }
    return [...seq, ...barajar(seq).slice(0, 3)];
  }

  clave(who, b) { return `${who}.${b}`; }

  /** Al principio van lentas para dar tiempo a pensar, y luego ya no. */
  duracionNota(n) {
    const base = n < 3 ? 12 : n < 6 ? 10 : 8.5;
    return base / this.velBase;
  }

  lanza(dt) {
    this.sale -= dt;
    if (this.sale > 0 || !this.colas.length) return;
    this.sale = this.intervalo;
    for (let k = 0; k < this.p.aLaVez && this.colas.length; k++) {
      const [who, bebida] = this.colas.shift();
      const palabra = this.palabras[who]?.[bebida];
      if (!palabra) throw new Error(`Sin palabra: ${who}/${bebida}`);
      this.notas.push({
        who, bebida, palabra,
        x: CARRILES[this.carril++ % CARRILES.length], y: SALE_Y,
        v: (SALE_Y - TOPE_Y) / this.duracionNota(this.lanzadas),
        fase: Math.random() * 6,
      });
      this.lanzadas++;
    }
  }

  zona(n) { return { x: n.x, y: n.y, w: NOTA.w, h: NOTA.h }; }

  update(dt) {
    this.tiempo += dt;
    this.lanza(dt);
    if (this.rev) { this.rev.t -= dt; if (this.rev.t <= 0) this.rev = null; }
    if (this.destello && (this.destello.t -= dt) <= 0) this.destello = null;
    const suelto = this.arr.update(this.notas, (n) => this.zona(n));
    if (suelto) this.soltar(suelto);
    this.atajos();
    for (const n of [...this.notas]) {
      if (n === this.arr.obj) continue;
      n.y -= n.v * dt;
      if (n.y <= TOPE_Y) this.servir(n, 'mal');
    }
  }

  /** En ordenador, las teclas 1 a 5 mandan la nota más alta a ese grifo. */
  atajos() {
    const i = this.grifos.findIndex((_, k) => input.hit(`Digit${k + 1}`));
    if (i < 0 || !this.notas.length) return;
    const n = this.notas.reduce((a, b) => (b.y < a.y ? b : a));
    this.entrega(n, this.grifos[i].id);
  }

  soltar({ obj, x, y }) {
    const g = this.grifos.find((f) => inRect({ x, y }, f.r) || inRect({ x: x + this.arr.dx + (NOTA.w >> 1), y: y + this.arr.dy + NOTA.h }, f.r));
    if (g) this.entrega(obj, g.id);
    else { obj.x = Math.max(4, Math.min(W - NOTA.w - 4, x + this.arr.dx)); obj.y = Math.max(TOPE_Y + 1, Math.min(SALE_Y, y + this.arr.dy)); }
  }

  entrega(n, bebida) {
    if (bebida === n.bebida) { this.servir(n, 'bien'); return; }
    this.servir(n, S.palabras[this.clave(n.who, n.bebida)] ? 'mal' : 'corrige');
  }

  servir(n, tipo) {
    this.notas = this.notas.filter((o) => o !== n);
    if (this.arr.obj === n) this.arr.obj = null;
    S.palabras[this.clave(n.who, n.bebida)] = true;
    this.rev = { n, tipo, t: REVELA_SEG };
    this.destello = { id: n.bebida, ok: tipo === 'bien', t: 0.22 };   // el grifo responde
    if (tipo === 'bien') { this.servidas++; audio.toque(); }
    if (tipo === 'corrige') audio.compas(false);
    if (tipo === 'mal') {
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
    if (!this.colas.length && !this.notas.length) return 'lose';
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
    return { fallos: 'BEBIDAS', pista: 'ARRASTRA CADA NOTA A SU GRIFO', corrige: 'MR. MIME TE CORRIGE. ESTA VA GRATIS', mal: 'TE LA BEBES TÚ' };
  }

  draw(ctx) {
    this.fondo(ctx);
    pixelLine(ctx, 0, TOPE_Y - 1, W, TOPE_Y - 1, C.rojo_extintor, 1, 2);
    panel(ctx, 4, 27, W - 8, 19, { fill: C.carbon });
    text(ctx, 'COPAS', 10, 33, { font: 'label', color: C.gris });
    cifras(ctx, `${this.servidas}/${this.p.meta}`, 48, 31, { escala: 2, color: C.cian_neon });
    text(ctx, this.rotulos.fallos, 142, 33, { font: 'label', color: C.gris });
    cifras(ctx, `${this.fallos}/${this.p.maxFallos}`, 196, 31, { escala: 2, color: this.fallos ? C.rojo_extintor : C.gris });
    this.pintaRevela(ctx);
    const encima = this.arr.obj ? this.grifoBajo() : null;
    for (const g of this.grifos) drawGrifo(ctx, g.r, g.id, { activo: g === encima });
    const f = this.destello && this.grifos.find((g) => g.id === this.destello.id);
    if (f) {
      const { x, y, w, h } = f.r, c = this.destello.ok ? C.cian_neon : C.rojo_extintor, l = this.destello.t > 0.11 ? 3 : 1;
      outline(ctx, x - l, y - l, w + l * 2, h + l * 2, c);
      if (this.destello.ok) { rect(ctx, x + (w >> 1) - 1, y - 8 - l * 2, 3, 6, C.amarillo_mural); rect(ctx, x + 4, y - 5 - l, 3, 3, C.amarillo_mural); rect(ctx, x + w - 7, y - 5 - l, 3, 3, C.amarillo_mural); }
    }
    for (const n of this.notas) if (n !== this.arr.obj) this.pintaNota(ctx, n, n.x, n.y);
    if (this.arr.obj) this.pintaNota(ctx, this.arr.obj, this.arr.x + this.arr.dx, this.arr.y + this.arr.dy);
  }

  grifoBajo() {
    const { x, y } = this.arr;
    return this.grifos.find((f) => inRect({ x, y }, f.r) || inRect({ x: x + this.arr.dx + (NOTA.w >> 1), y: y + this.arr.dy + NOTA.h }, f.r));
  }

  pintaNota(ctx, n, x, y) {
    const baila = Math.round(Math.sin(this.tiempo * 3 + n.fase) * endurece(0, 6));
    x += n === this.arr.obj ? 0 : baila;
    panel(ctx, x, y, NOTA.w, NOTA.h, { fill: C.marfil, edge: C.gris });
    retrato(ctx, n.who, x + 4, y + 4, { lado: 20 });
    text(ctx, n.palabra, x + 29 + ((NOTA.w - 33 - measure(n.palabra, 'bold')) >> 1), y + 7, { font: 'bold', color: C.carbon });
  }

  pintaRevela(ctx) {
    const r = REVELA;
    panel(ctx, r.x, r.y, r.w, r.h, { fill: C.carbon, edge: C.morado });
    if (!this.rev) {
      text(ctx, this.rotulos.pista, W >> 1, r.y + 17, { font: 'label', color: C.gris, align: 'center' });
      return;
    }
    const { n, tipo } = this.rev;
    retrato(ctx, n.who, r.x + 6, r.y + 10, { lado: 20 });
    text(ctx, n.palabra, r.x + 31, r.y + 6, { font: 'bold', color: C.marfil });
    const xb = r.x + 31 + measure(n.palabra, 'bold') + 7;
    text(ctx, '=', xb, r.y + 6, { font: 'bold', color: C.gris });
    drawBebida(ctx, n.bebida, xb + 13, r.y + 3);
    text(ctx, this.bebidas[n.bebida].nombre, xb + 31, r.y + 8, { font: 'label', color: C.amarillo_mural });
    const nota = { bien: '¡MARCHANDO!', corrige: this.rotulos.corrige, mal: this.rotulos.mal }[tipo];
    const color = { bien: C.cian_neon, corrige: C.amarillo_mural, mal: C.rojo_extintor }[tipo];
    text(ctx, nota, r.x + 31, r.y + 26, { font: 'label', color });
    rect(ctx, r.x + 2, r.y + r.h - 3, Math.round((r.w - 4) * (this.rev.t / REVELA_SEG)), 1, color);
  }
}

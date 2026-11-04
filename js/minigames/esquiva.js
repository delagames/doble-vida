// ¡ESQUIVA!: Juanjo está convencido de que le han echado algo en la copa y ve a todo el mundo
// con dientes. Vienen de los bordes; hay que aguantar un minuto arrastrándole. Tres toques y huye.
// Con coherencia baja la pista es un laberinto: tabiques en una rejilla, y los de los dientes
// la recorren por los pasillos, buscando el camino más corto hasta él, aunque más despacio.
// Sin laberinto cruzan la pista casi en línea recta, y ahí la dificultad es la densidad.
//
// Siempre hay hueco, y no por suerte:
//   - Juanjo corre más que nadie, también al final.
//   - Nadie nace a menos de NACE_LEJOS de él.
//   - No se añade a nadie si alrededor de Juanjo quedan menos de SECTORES_LIBRES libres.
//   - En el laberinto toda celda tiene al menos dos salidas: no hay callejones sin fondo.
//   - Cada uno se cansa a los VIDA segundos, y tras un mordisco hay 1,4 s de gracia.
import { C } from '../assets.js';
import { W, H, shake, vibrar } from '../screen.js';
import { text, measure } from '../text.js';
import { cifras, dither, panel, rect } from '../draw.js';
import { S, UMBRAL, barajar } from '../state.js';
import { endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { DIR, drawSprite, pintaDientes } from '../sprites.js';
import { fondoTenue } from './dibujo.js';
import { Dedo, rumbo } from './dedo.js';

const TIEMPO = 60;
const TOQUES = 3;
const ZONA = { x: 5, y: 46, w: 260, h: 430 };
const COLS = 4, FILAS = 5;
const CW = ZONA.w / COLS, CH = ZONA.h / FILAS;
const GROSOR = 4;
const R_YO = 7;
const R_TOQUE = 15;
const NACE_LEJOS = 110;
const SECTORES = 8, SECTORES_LIBRES = 4, RADIO_SECTOR = 62;
const VIDA = 10;
const GRACIA = 1.4;
const DIENTES_DE = ['0067', '0094', '0571', '0124', '0058', '0281', '0428', '0122', '0407', '0052'];

// Lo que Juanjo oye en su cabeza mientras corre, con voz de locutor.
const BOCADOS = ['¡PRIMERA SANGRE! LA SUYA', '¡DOBLE BOCADO!', 'HAS SIDO EJECUTADO'];
const AVISOS = [[15, 'DIENTES: +100 %'], [30, '¡APARECE UN BARÓN! ES UN SEÑOR CON DIENTES'], [45, 'MANOLO: SIN CAMBIOS'], [55, '¡JUANJO ESTÁ IMPARABLE! NO PARA']];

const azar = (a, b) => a + Math.random() * (b - a);
const celda = (c, f) => f * COLS + c;

export default class Esquiva {
  static instruccion = '¡ESQUIVA!';
  static ayuda = 'Todos tienen dientes. Todos. Arrastra a Juanjo con el dedo, que puede ir donde quieras, y aguanta un minuto. Vienen de los bordes y cada vez son más. Tres toques y Juanjo sale corriendo del after.';
  static carga = ['juanjo', 'manolo', 'gengar', 'zorro', 'jynx', 'nacional1', 'sandrita', 'camarera', 'mrmime', 'amiga1', 'meowth'];

  start() {
    this.vel = endurece(108, 92);
    this.laberinto = S.coherencia < UMBRAL.loca;
    this.velBicho = this.laberinto ? endurece(28, 34) : endurece(43, 53);
    this.giro = endurece(0.25, 0.5);     // lo que corrigen el rumbo, rad/s: se les puede dejar atrás
    this.intervalo = this.laberinto ? [2.1, 1.0] : [endurece(1.15, 0.95), endurece(0.46, 0.36)];
    this.maxVivos = this.laberinto ? [3, 9] : [5, Math.round(endurece(11, 15))];
    this.muros = [];
    this.abierto = null;
    if (this.laberinto) this.hazLaberinto();

    this.t = 0;
    this.res = null;
    this.toques = 0;
    this.gracia = 0;
    this.yo = { x: ZONA.x + ZONA.w / 2, y: ZONA.y + ZONA.h / 2, dir: DIR.abajo, anda: false };
    if (this.laberinto) { this.yo.x = ZONA.x + 2.5 * CW; this.yo.y = ZONA.y + 2.5 * CH; }
    this.dedo = new Dedo(this.yo.x, this.yo.y);
    this.bichos = [];
    this.reloj = 1.4;
    this.bfs = 0;
    this.dist = null;
    this.anim = 0;
    this.susto = 0;
    this.rotulo = null;          // { txt, t }: lo que Juanjo cree que está pasando
  }

  // Laberinto ------------------------------------------------------------------

  /** Cierra tabiques al azar sin dejar ninguna celda con menos de dos salidas ni partir la pista. */
  hazLaberinto() {
    const n = COLS * FILAS;
    const a = Array.from({ length: n }, () => new Set());
    const lados = [];
    for (let f = 0; f < FILAS; f++) {
      for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) { lados.push([celda(c, f), celda(c + 1, f)]); a[celda(c, f)].add(celda(c + 1, f)); a[celda(c + 1, f)].add(celda(c, f)); }
        if (f < FILAS - 1) { lados.push([celda(c, f), celda(c, f + 1)]); a[celda(c, f)].add(celda(c, f + 1)); a[celda(c, f + 1)].add(celda(c, f)); }
      }
    }
    const cerrados = [];
    for (const [p, q] of barajar(lados)) {
      if (a[p].size <= 2 || a[q].size <= 2) continue;
      a[p].delete(q); a[q].delete(p);
      if (this.conexo(a)) cerrados.push([p, q]);
      else { a[p].add(q); a[q].add(p); }
    }
    this.abierto = a;
    this.muros = cerrados.map(([p, q]) => this.tabique(p, q));
  }

  conexo(a) {
    const visto = new Set([0]), pila = [0];
    while (pila.length) for (const v of a[pila.pop()]) if (!visto.has(v)) { visto.add(v); pila.push(v); }
    return visto.size === a.length;
  }

  tabique(p, q) {
    const c = p % COLS, f = Math.floor(p / COLS);
    if (q === p + 1) return { x: ZONA.x + (c + 1) * CW - GROSOR / 2, y: ZONA.y + f * CH - 2, w: GROSOR, h: CH + 4 };
    return { x: ZONA.x + c * CW - 2, y: ZONA.y + (f + 1) * CH - GROSOR / 2, w: CW + 4, h: GROSOR };
  }

  celdaDe(x, y) {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor((x - ZONA.x) / CW)));
    const f = Math.max(0, Math.min(FILAS - 1, Math.floor((y - ZONA.y) / CH)));
    return celda(c, f);
  }

  centro(i) { return { x: ZONA.x + ((i % COLS) + 0.5) * CW, y: ZONA.y + (Math.floor(i / COLS) + 0.5) * CH }; }

  /** Distancia en celdas hasta Juanjo. */
  calculaRutas() {
    const ini = this.celdaDe(this.yo.x, this.yo.y);
    const d = new Array(this.abierto.length).fill(Infinity);
    d[ini] = 0;
    const cola = [ini];
    for (let i = 0; i < cola.length; i++) for (const v of this.abierto[cola[i]]) if (d[v] === Infinity) { d[v] = d[cola[i]] + 1; cola.push(v); }
    this.dist = d;
  }

  // Juego ---------------------------------------------------------------------

  libre(x, y, r = R_YO) {
    if (x < ZONA.x + r || x > ZONA.x + ZONA.w - r || y < ZONA.y + r || y > ZONA.y + ZONA.h - r) return false;
    return !this.muros.some((m) => x > m.x - r && x < m.x + m.w + r && y > m.y - r && y < m.y + m.h + r);
  }

  get prog() { return Math.min(1, this.t / TIEMPO); }

  update(dt) {
    const antes = this.t;
    this.t += dt;
    this.anim += dt;
    if (this.rotulo && (this.rotulo.t -= dt) <= 0) this.rotulo = null;
    for (const [seg, txt] of AVISOS) if (antes < seg && this.t >= seg) this.rotulo = { txt, t: 1.8 };
    this.gracia = Math.max(0, this.gracia - dt);
    this.susto = Math.max(0, this.susto - dt);
    const { yo } = this;
    const x0 = yo.x, y0 = yo.y;
    yo.anda = this.dedo.mueve(yo, dt, this.vel, (x, y) => this.libre(x, y), ZONA);
    yo.dir = rumbo(yo.x - x0, yo.y - y0, yo.dir);
    if (this.laberinto && ((this.bfs -= dt) <= 0 || !this.dist)) { this.bfs = 0.2; this.calculaRutas(); }
    this.nacen(dt);
    this.mueveBichos(dt);
    if (this.t >= TIEMPO) this.res = 'win';
  }

  nacen(dt) {
    if ((this.reloj -= dt) > 0) return;
    const [i0, i1] = this.intervalo, [m0, m1] = this.maxVivos;
    const p = this.prog;
    this.reloj = i0 + (i1 - i0) * p;
    if (this.bichos.length >= m0 + (m1 - m0) * p) return;
    if (!this.hayHueco()) return;
    const sitio = this.sitioBorde();
    if (!sitio) return;
    this.bichos.push({
      ...sitio,
      id: barajar(DIENTES_DE)[0],
      v: this.velBicho * (1 + 0.5 * p) * azar(0.9, 1.1),
      vida: VIDA,
      dir: DIR.abajo,
      ang: Math.atan2(this.yo.y - sitio.y, this.yo.x - sitio.x) + azar(-0.3, 0.3),
    });
  }

  /** ¿Quedan bastantes direcciones libres alrededor de Juanjo? */
  hayHueco() {
    const ocupados = new Set();
    for (const b of this.bichos) {
      const dx = b.x - this.yo.x, dy = b.y - this.yo.y;
      if (Math.hypot(dx, dy) > RADIO_SECTOR) continue;
      ocupados.add(Math.floor(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * SECTORES));
    }
    return SECTORES - ocupados.size >= SECTORES_LIBRES;
  }

  sitioBorde() {
    for (let i = 0; i < 12; i++) {
      const lado = Math.floor(Math.random() * 4);
      let x = azar(ZONA.x + 8, ZONA.x + ZONA.w - 8), y = azar(ZONA.y + 8, ZONA.y + ZONA.h - 8);
      if (lado === 0) y = ZONA.y + 6;
      else if (lado === 1) y = ZONA.y + ZONA.h - 6;
      else if (lado === 2) x = ZONA.x + 6;
      else x = ZONA.x + ZONA.w - 6;
      if (this.laberinto) { const c = this.centro(this.celdaDe(x, y)); if (lado < 2) x = c.x; else y = c.y; }
      if (Math.hypot(x - this.yo.x, y - this.yo.y) >= NACE_LEJOS) return { x, y };
    }
    return null;
  }

  mueveBichos(dt) {
    const { yo } = this;
    for (const b of this.bichos) {
      b.vida -= dt;
      let mx, my;
      if (this.laberinto) {
        const obj = this.siguiente(b);
        const dx = obj.x - b.x, dy = obj.y - b.y, d = Math.hypot(dx, dy) || 1;
        mx = (dx / d) * b.v * dt; my = (dy / d) * b.v * dt;
      } else {
        // Cruzan la pista casi en línea recta y salen por el otro lado.
        let giro = Math.atan2(yo.y - b.y, yo.x - b.x) - b.ang;
        giro = Math.atan2(Math.sin(giro), Math.cos(giro));
        b.ang += Math.max(-this.giro * dt, Math.min(this.giro * dt, giro));
        mx = Math.cos(b.ang) * b.v * dt; my = Math.sin(b.ang) * b.v * dt;
      }
      b.x += mx; b.y += my;
      b.dir = rumbo(mx, my, b.dir);
      if (b.x < -20 || b.x > W + 20 || b.y < 10 || b.y > H + 20) b.vida = 0;
      if (this.gracia <= 0 && Math.hypot(b.x - yo.x, b.y - yo.y) < R_TOQUE) this.muerde();
    }
    this.bichos = this.bichos.filter((b) => b.vida > 0);
  }

  /** Al centro de la celda vecina más cerca de Juanjo; en la suya, a por él. */
  siguiente(b) {
    const aqui = this.celdaDe(b.x, b.y);
    if (aqui === this.celdaDe(this.yo.x, this.yo.y)) return this.yo;
    const c = this.centro(aqui);
    const lleva = this.dist[aqui];
    const v = [...this.abierto[aqui]].find((q) => this.dist[q] < lleva);
    if (v === undefined) return c;
    const n = this.centro(v);
    // Se va por el centro del pasillo: primero se alinea y luego avanza.
    if (Math.abs(n.x - c.x) > 1 && Math.abs(b.y - c.y) > 3) return { x: b.x, y: c.y };
    if (Math.abs(n.y - c.y) > 1 && Math.abs(b.x - c.x) > 3) return { x: c.x, y: b.y };
    return n;
  }

  muerde() {
    this.toques++;
    this.gracia = GRACIA;
    this.susto = 0.3;
    audio.mordisco();
    shake(0.3);
    vibrar();
    this.bichos = this.bichos.filter((b) => Math.hypot(b.x - this.yo.x, b.y - this.yo.y) > 48);
    this.rotulo = { txt: BOCADOS[Math.min(this.toques, BOCADOS.length) - 1], t: 1.3 };
    if (this.toques >= TOQUES) this.res = 'lose';
  }

  result() { return this.res; }

  tarjeta(res) {
    const datos = [['MORDISCOS', `${this.toques}/${TOQUES}`]];
    if (res === 'win') return { titulo: 'SIN BOCADO', lineas: ['Un minuto entero. Nadie quería morder a Juanjo. Es lo que más le ofende.', 'Notas del parche: Dientes +100 %. Juanjo: mejorado, según Juanjo.'], datos };
    return { titulo: '¡CORRE!', lineas: ['Juanjo sale de Onda Pasadena por donde no es, sin avisar a nadie, y sigue corriendo.', 'Lo llama rotar a bot.'], datos, coste: 0 };
  }

  // Dibujo --------------------------------------------------------------------

  draw(ctx) {
    fondoTenue(ctx, '13-onda-pasadena', 2);
    if (this.susto > 0) dither(ctx, 0, 25, W, H - 25, C.rojo_extintor, 1);
    for (const m of this.muros) {
      rect(ctx, m.x - 1, m.y - 1, m.w + 2, m.h + 2, C.carbon);
      rect(ctx, m.x, m.y, m.w, m.h, C.rosa_neon);
    }
    const lista = [...this.bichos, this.yo].sort((p, q) => p.y - q.y);
    for (const b of lista) {
      if (b === this.yo) {
        if (this.gracia > 0 && Math.floor(this.anim * 12) % 2) continue;
        drawSprite(ctx, 'juanjo', b.anda ? 'Walk' : 'Idle', b.dir, this.anim * 60, b.x, b.y + 7, { sombra: true });
      } else if (!drawSprite(ctx, b.id, 'Walk', b.dir, this.anim * 60 + b.x, b.x, b.y + 8, { sombra: true, dientes: true })) {
        pintaDientes(ctx, b.x - 9, b.y - 5, 18, 10);   // sin hoja cargada, solo la boca: nunca invisible
      }
    }
    this.pintaMarcador(ctx);
    if (this.rotulo) {
      const l = this.rotulo.txt;
      const w = Math.min(W - 8, measure(l, 'label') + 14);
      panel(ctx, (W - w) >> 1, 47, w, 15, { fill: C.carbon, edge: C.amarillo_mural });
      text(ctx, l, W >> 1, 51, { font: 'label', color: C.amarillo_mural, align: 'center' });
    }
  }

  pintaMarcador(ctx) {
    const queda = Math.max(0, Math.ceil(TIEMPO - this.t));
    panel(ctx, 2, 27, W - 4, 17, { fill: C.carbon });
    cifras(ctx, queda, 12, 31, { escala: 2, color: queda <= 10 ? C.cian_neon : C.marfil });
    for (let i = 0; i < TOQUES; i++) {
      const x = W - 28 - i * 26;
      if (i < this.toques) pintaDientes(ctx, x, 31, 20, 9);
      else rect(ctx, x, 31, 20, 9, C.noche_clara);
    }
  }
}

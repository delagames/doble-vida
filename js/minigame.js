// Marco común de los minijuegos. night.json los lanza con el paso
//   {"t":"mini","id":"calcula","params":{...},"win":[...],"lose":[...],"error":[...]}
// `win` y `lose` son pasos que siguen la noche; `error` (si falta, `win`) es la rama de
// cuando el módulo no carga o se rompe: nunca se bloquea y nunca se cobra nada.
//
// Un minijuego es js/minigames/<id>.js y exporta por defecto una clase:
//   static instruccion   '¡CALCULA!'. Pixelify Bold 32 rosa neón, un segundo.
//   static ayuda         explicación corta; sale la primera vez, antes de empezar.
//   static carga         personajes a precargar (claves de cast.json).
//   static musica        opcional: tema mientras se juega; null, sin tema. Si no está, sigue el de la parada.
//   start({ coh, params })  prepara la partida. Aún no corre el tiempo.
//   update(dt)           lee `input`; solo se llama mientras se juega.
//   draw(ctx)            pinta de y=25 para abajo; el HUD lo pone el marco.
//   result()             null mientras se juega; 'win' o 'lose' al acabar.
//   tarjeta(res)         opcional: { titulo, lineas, datos, coste }. datos son filas
//                        [etiqueta, valor] con el valor en cifras, para que los números
//                        se lean. Aquí se cobra lo propio
//                        (dinero...), porque se llama una sola vez, también con un
//                        resultado forzado. coste es la coherencia del fallo; sin él,
//                        COSTE.fallo; 0 si el fallo se paga de otra manera.
//   parar()              opcional: se llama siempre al cerrar.
// La dificultad sale de `endurece(sereno, borracho)` y `ebriedad()`, de medidores.js.
import { C } from './assets.js';
import { input, inRect } from './input.js';
import { W, H } from './screen.js';
import { text, wrap, measure, lineHeight } from './text.js';
import { button, cifras, dither, panel, rect } from './draw.js';
import { drawHud } from './hud.js';
import { S } from './state.js';
import { fallarMinijuego } from './medidores.js';
import { registrarOps } from './night.js';
import { preload } from './sprites.js';
import { audio } from './audio.js';

const INSTRUCCION = 1;      // segundos a pantalla completa
const CARGA_MAX = 12;       // lo que se espera a un módulo antes de darlo por perdido
const JUEGO_MAX = 180;      // ningún minijuego dura esto: si pasa, se ha quedado colgado
const GRACIA = 0.5;         // el toque frenético del final no pasa la tarjeta
const BOTON = { x: 40, y: 366, w: 190, h: 40 };
const FILA = 19;           // alto de una fila de `datos` en la tarjeta

export class Minijuego {
  static activo = null;     // el que está en marcha (DV.activo)
  static ultimo = null;     // { id, res } del último que acabó

  constructor(id, { params = {} } = {}) {
    this.id = id;
    this.params = params;
    this.fullscreen = true;
    this.minijuego = true;     // bloquea el móvil
    this.done = false;
    this.fase = 'carga';
    this.t = 0;
    this.mod = null;
    this.clase = null;
    this.resultado = null;     // 'win' | 'lose' | 'error'
    this.forzado = null;
    this.cartel = null;
    Minijuego.activo = this;
    this.cargar();
  }

  async cargar() {
    try {
      const m = await import(`./minigames/${this.id}.js`);
      await Promise.race([
        preload(m.default.carga ?? []),
        new Promise((ok) => { setTimeout(ok, 1500); }),
      ]);
      if (this.done) return;
      this.clase = m.default;
      this.mod = new m.default();
      this.mod.start({ coh: S.coherencia, params: this.params });
      this.preparaInstruccion();
    } catch (e) { this.romper(e); }
  }

  preparaInstruccion() {
    const txt = this.params.instruccion ?? this.clase.instruccion ?? this.id.toUpperCase();
    this.instr = wrap(txt, 'huge', W - 16);
    this.fase = 'instr';
    this.t = INSTRUCCION;
    input.soltarTodo();
    audio.entrada();
    if (this.clase.musica !== undefined) audio.mandaMini(this.clase.musica);
  }

  /** Cierra sin cobrar nada y la noche sigue. */
  romper(e) {
    console.error(`Minijuego ${this.id} cerrado por un error:`, e);
    this.cerrar('error');
  }

  cerrar(res) {
    if (this.done) return;
    try { this.mod?.parar?.(); } catch { /* ya se está cerrando */ }
    this.resultado = res;
    this.done = true;
    audio.mandaMini(undefined);
    Minijuego.ultimo = { id: this.id, res };
    if (Minijuego.activo === this) Minijuego.activo = null;
    input.soltarTodo();
  }

  /** Solo pruebas (DV.resultado): acaba como si se hubiera jugado. */
  forzar(res) { this.forzado = res; }

  empezar() {
    S.minisVistos[this.id] = true;
    this.fase = 'juego';
    this.t = 0;
    input.soltarTodo();
  }

  terminar(res) {
    let c = {};
    try { c = this.mod.tarjeta?.(res) ?? {}; } catch (e) { console.error(e); }
    const coste = c.coste ?? this.params.coste;
    if (res === 'lose') { fallarMinijuego(coste); audio.fallo(); } else audio.acierto();
    this.resultado = res;
    this.cartel = {
      titulo: c.titulo ?? (res === 'win' ? '¡BIEN!' : '¡FALLO!'),
      lineas: (c.lineas ?? []).flatMap((l) => wrap(l, 'dialog', W - 44)),
      datos: c.datos ?? [],
    };
    this.fase = 'tarjeta';
    this.t = GRACIA;
    input.soltarTodo();
  }

  update(dt) {
    try { this.paso(dt); } catch (e) { this.romper(e); }
  }

  paso(dt) {
    if (this.forzado && this.mod && this.fase !== 'tarjeta') {
      const f = this.forzado;
      this.forzado = null;
      this.terminar(f);
      return;
    }
    switch (this.fase) {
      case 'carga':
        this.t += dt;
        if (this.t > CARGA_MAX) this.romper(new Error('no carga'));
        break;
      case 'instr':
        input.consume();
        this.t -= dt;
        if (this.t > 0) break;
        input.soltarTodo();
        if (this.clase.ayuda && !S.minisVistos[this.id]) {
          this.fase = 'ayuda';
          this.t = GRACIA;
          this.ayuda = wrap(this.clase.ayuda, 'dialog', W - 44);
        } else this.empezar();
        break;
      case 'ayuda':
        if (this.t > 0) { this.t -= dt; input.consume(); break; }
        if (input.tapIn(BOTON) || input.hit('Enter', 'Space')) this.empezar();
        break;
      case 'juego': {
        this.t += dt;
        this.mod.update(dt);
        const res = this.mod.result();
        if (res) this.terminar(res);
        else if (this.t > JUEGO_MAX) this.romper(new Error('colgado'));
        break;
      }
      case 'tarjeta':
        if (this.t > 0) { this.t -= dt; input.consume(); break; }
        if (input.confirm()) this.cerrar(this.resultado);
        break;
      default:
    }
  }

  draw(ctx) {
    rect(ctx, 0, 0, W, H, C.carbon);
    if (this.fase === 'carga') return;
    if (this.fase === 'instr') {
      const lh = lineHeight('huge');
      const y0 = (H - this.instr.length * lh) >> 1;
      this.instr.forEach((l, i) => text(ctx, l, W >> 1, y0 + i * lh, { font: 'huge', color: C.rosa_neon, align: 'center' }));
      return;
    }
    try { this.mod.draw(ctx); } catch (e) { this.romper(e); return; }
    drawHud(ctx);
    if (this.fase === 'ayuda') this.pintaAyuda(ctx);
    if (this.fase === 'tarjeta') this.pintaTarjeta(ctx);
  }

  pintaAyuda(ctx) {
    dither(ctx, 0, 25, W, H - 25, C.carbon, 3);
    const lh = lineHeight('dialog');
    const h = 30 + this.ayuda.length * lh;
    const y = 110;
    panel(ctx, 12, y, W - 24, h, { edge: C.rosa_neon });
    text(ctx, 'CÓMO SE JUEGA', W >> 1, y + 8, { font: 'label', color: C.rosa_claro, align: 'center' });
    this.ayuda.forEach((l, i) => text(ctx, l, 22, y + 22 + i * lh, { color: C.marfil }));
    button(ctx, BOTON, 'EMPEZAR', { edge: C.rosa_neon });
  }

  pintaTarjeta(ctx) {
    dither(ctx, 0, 25, W, H - 25, C.carbon, 3);
    const { titulo, lineas, datos } = this.cartel;
    const grande = measure(titulo, 'huge') <= W - 36;
    const lh = lineHeight('dialog');
    const h = (grande ? 56 : 36) + lineas.length * lh + datos.length * FILA + 26;
    const y = (H - h) >> 1;
    const color = this.resultado === 'win' ? C.cian_neon : C.rosa_neon;
    panel(ctx, 12, y, W - 24, h, { edge: color });
    text(ctx, titulo, W >> 1, y + 12, { font: grande ? 'huge' : 'bold', color, align: 'center' });
    const y1 = y + (grande ? 52 : 32);
    lineas.forEach((l, i) => text(ctx, l, W >> 1, y1 + i * lh, { color: C.marfil, align: 'center' }));
    const y2 = y1 + lineas.length * lh + 3;
    datos.forEach(([k, v], i) => {
      text(ctx, k, 24, y2 + i * FILA + 4, { font: 'label', color: C.gris });
      cifras(ctx, v, W - 24, y2 + i * FILA, { escala: 3, color: C.marfil, align: 'right' });
    });
    if (this.t <= 0) text(ctx, 'TOCA PARA SEGUIR', W >> 1, y + h - 15, { font: 'label', color: C.gris, align: 'center' });
  }
}

/** Solo pruebas (DV.mini): un minijuego suelto, y al acabar se queda quieto. */
export class Banco {
  constructor(id, params) { this.m = new Minijuego(id, { params }); }

  update(dt) { if (!this.m.done) this.m.update(dt); }

  draw(ctx) {
    if (!this.m.done) { this.m.draw(ctx); return; }
    rect(ctx, 0, 0, W, H, C.carbon);
    text(ctx, `RESULTADO: ${this.m.resultado}`, W >> 1, 230, { font: 'bold', color: C.gris, align: 'center' });
  }
}

/**
 * Coger y soltar con el dedo. update(lista, zona) devuelve { obj, x, y } el fotograma
 * en que se suelta. Mientras, `obj`, `x` e `y` dicen qué se lleva y por dónde va, y
 * `dx`, `dy` lo que hay que sumar para que no salte bajo el dedo. zona(obj) da su rectángulo.
 */
export class Arrastre {
  constructor() { this.obj = null; this.pid = null; this.x = 0; this.y = 0; this.dx = 0; this.dy = 0; }

  update(lista, zona, margen = 6) {
    if (this.obj) {
      const p = input.points.find((q) => q.id === this.pid);
      if (p) { this.x = p.x; this.y = p.y; return null; }
      const suelto = { obj: this.obj, x: this.x, y: this.y };
      this.obj = null;
      return suelto;
    }
    if (!input.pressed) return null;
    const q = input.pressed;
    for (let i = lista.length - 1; i >= 0; i--) {
      const r = zona(lista[i]);
      const grande = { x: r.x - margen, y: r.y - margen, w: r.w + margen * 2, h: r.h + margen * 2 };
      if (!inRect(q, grande)) continue;
      this.obj = lista[i];
      this.pid = input.points[input.points.length - 1]?.id ?? null;
      this.x = q.x; this.y = q.y;
      this.dx = r.x - q.x; this.dy = r.y - q.y;
      break;
    }
    return null;
  }
}

registrarOps({
  mini(r, s) {
    const m = new Minijuego(s.id, { params: s.params ?? {} });
    r.wait = m;
    m.after = () => {
      const pasos = m.resultado === 'error' ? (s.error ?? s.win) : s[m.resultado];
      if (pasos) r.push(pasos);
    };
  },
});

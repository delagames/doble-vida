// La demo: cada parte de la historia y cada minijuego por separado, para probarlos sueltos.
// Corre sobre una partida de mentira: mientras dura, nada se guarda ni se borra (modoDemo).
import { C } from './assets.js';
import { input, inRect } from './input.js';
import { W, H } from './screen.js';
import { text } from './text.js';
import { button, panel, rect } from './draw.js';
import { S, reiniciar, modoDemo } from './state.js';
import { G } from './game.js';
import { audio } from './audio.js';
import { NightRunner } from './night.js';
import { Minijuego } from './minigame.js';

const NOMBRES = {
  regatea: '¡REGATEA!', pide: '¡PIDE!', callate: '¡CÁLLATE!', nomires: '¡NO MIRES!', alritmo: '¡AL RITMO!',
  barra: '¡PIDE! II', nolacagues: '¡NO LA CAGUES!', instantanea: 'LA INSTANTÁNEA', marca: '¡MARCA!',
  sal: '¡SAL!', lacara: '¡LA CARA!', baila: '¡BAILA!', esquiva: '¡ESQUIVA!', viabuena: 'LA VÍA BUENA',
};
const NIVELES = [100, 60, 25];
const FILA = 34;
const LISTA = { x: 6, y: 92, w: W - 12, h: H - 92 - 44 };
const PESTANAS = [{ id: 'historia', label: 'HISTORIA', x: 6 }, { id: 'minis', label: 'MINIJUEGOS', x: W >> 1 }];
const SALIR = { x: W - 58, y: 2, w: 22, h: 21 };
const VOLVER = { x: 30, y: H - 38, w: 210, h: 30 };

/** Todos los minijuegos de una parada, también los que van dentro de ramas. */
function* minisDe(pasos) {
  for (const s of pasos) {
    if (s?.t === 'mini') yield s;
    for (const v of Object.values(s ?? {})) if (Array.isArray(v)) yield* minisDe(v);
  }
}

function catalogo() {
  const { paradas } = G.data.night;
  const vistos = new Set();
  const minis = [];
  paradas.forEach((p, idx) => {
    for (const m of minisDe(p.pasos)) {
      const clave = `${m.id}|${m.params?.actor ?? ''}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      minis.push({ id: m.id, params: m.params ?? {}, idx, titulo: NOMBRES[m.id] ?? m.id.toUpperCase(), sub: p.nombre });
    }
  });
  const historia = paradas.map((p, idx) => ({ idx, titulo: p.nombre, sub: p.hora ?? '' }));
  return { historia, minis };
}

/** La noche tal como estaría al llegar a esa parada: quién va en el coche, la cara blanca… */
function preparar(idx, coherencia) {
  modoDemo(true);
  reiniciar();
  const id = (clave) => G.data.night.paradas.findIndex((p) => p.id === clave);
  S.stop = idx;
  S.coherencia = coherencia;
  S.excusa = { id: 'rankeds', frase: 'las rankeds' };
  const asientos = ['recogida-manolo', 'recogida-gengar', 'recogida-zorro', 'recogida-buitre'];
  ['manolo', 'gengar', 'zorro', 'buitre'].forEach((who, i) => { if (idx > id(asientos[i])) S.coche[i] = who; });
  if (idx >= id('amanecer')) S.coche = S.coche.map((w) => (w === 'buitre' ? null : w));
  if (idx > id('hotel')) S.flags.caraBlanca = true;
  G.sober = false;
  G.inclina = null;
  G.overlay = null;
  G.aviso = null;
  G.efectos = [];
}

/** Sale de lo que esté en marcha y vuelve a la lista, con la X o al acabar. */
function volverA(pestana, nivel) {
  Minijuego.activo?.mod?.parar?.();
  Minijuego.activo = null;
  audio.mandaMini(undefined);
  G.salida = null;
  G.overlay = null;
  G.aviso = null;
  G.inclina = null;
  G.setScene(new Demo(pestana, nivel));
}

function ponSalida(pestana, nivel) {
  G.salida = {
    r: SALIR,
    accion: () => volverA(pestana, nivel),
    draw: (ctx) => button(ctx, SALIR, 'X', { font: 'bold', color: C.rosa_neon, edge: C.rosa_neon }),
  };
}

class MiniSuelto {
  constructor(item, pestana, nivel) {
    this.m = new Minijuego(item.id, { params: item.params });
    this.fin = () => volverA(pestana, nivel);
  }

  update(dt) {
    this.m.update(dt);
    if (this.m.done) this.fin();
  }

  draw(ctx) { this.m.draw(ctx); }
}

export class Demo {
  constructor(pestana = 'historia', nivel = 0, alSalir = null) {
    Demo.alSalir = alSalir ?? Demo.alSalir;
    modoDemo(true);
    G.sober = true;
    audio.musica(null);
    this.datos = catalogo();
    this.pestana = pestana;
    this.nivel = nivel;
    this.scroll = 0;
    this.y0 = null;
  }

  get lista() { return this.datos[this.pestana]; }

  lanzar(item) {
    const coherencia = NIVELES[this.nivel];
    preparar(item.idx, coherencia);
    ponSalida(this.pestana, this.nivel);
    if (this.pestana === 'minis') {
      G.setScene(new MiniSuelto(item, this.pestana, this.nivel));
      return;
    }
    const noche = new NightRunner(item.idx);
    noche.alAcabarParada = () => volverA(this.pestana, this.nivel);
    G.setScene(noche);
  }

  update() {
    const max = Math.max(0, this.lista.length * FILA - LISTA.h);
    const p = input.p();
    if (p) {
      if (this.y0 === null) this.y0 = { y: p.y, s: this.scroll };
      this.scroll = this.y0.s + this.y0.y - p.y;
    } else this.y0 = null;
    this.scroll = Math.max(0, Math.min(max, this.scroll + input.wheel));
    if (!input.tap) return;
    if (inRect(input.tap, VOLVER)) {
      modoDemo(false);
      Demo.alSalir?.();
      return;
    }
    PESTANAS.forEach((t) => {
      if (input.tapIn({ x: t.x, y: 30, w: (W >> 1) - 6, h: 26 })) {
        this.pestana = t.id;
        this.scroll = 0;
      }
    });
    NIVELES.forEach((_, i) => { if (input.tapIn(this.rectNivel(i))) this.nivel = i; });
    if (inRect(input.tap, LISTA)) {
      const item = this.lista[Math.floor((input.tap.y - LISTA.y + this.scroll) / FILA)];
      if (item) this.lanzar(item);
    }
  }

  rectNivel(i) { return { x: 96 + i * 58, y: 62, w: 54, h: 24 }; }

  draw(ctx) {
    rect(ctx, 0, 0, W, H, C.noche);
    text(ctx, 'DEMO', W >> 1, 8, { font: 'bold', color: C.rosa_neon, align: 'center' });
    PESTANAS.forEach((t) => button(ctx, { x: t.x, y: 30, w: (W >> 1) - 6, h: 26 }, t.label, { font: 'label', active: this.pestana === t.id }));
    text(ctx, 'COHERENCIA', 10, 70, { font: 'label', color: C.gris });
    NIVELES.forEach((n, i) => button(ctx, this.rectNivel(i), String(n), { active: this.nivel === i }));
    ctx.save();
    ctx.beginPath();
    ctx.rect(LISTA.x, LISTA.y, LISTA.w, LISTA.h);
    ctx.clip();
    this.lista.forEach((it, i) => {
      const y = LISTA.y + i * FILA - this.scroll;
      if (y < LISTA.y - FILA || y > LISTA.y + LISTA.h) return;
      panel(ctx, LISTA.x, y, LISTA.w, FILA - 3, { fill: C.noche_clara });
      text(ctx, it.titulo, LISTA.x + 8, y + 3, { font: 'bold', color: C.marfil });
      text(ctx, it.sub, LISTA.x + 8, y + 19, { font: 'label', color: C.gris });
    });
    ctx.restore();
    button(ctx, VOLVER, 'VOLVER');
  }
}

// Pasos de night.json que mueven la escena: escenario, nube, mapa, calle, coche y carteles.
import { C } from './assets.js';
import { input } from './input.js';
import { W, H, shake } from './screen.js';
import { text, wrap, lineHeight } from './text.js';
import { cajaVacia, dither, panel, rect } from './draw.js';
import { registrarOps } from './night.js';
import { Llegada } from './stage.js';
import { Mapa } from './mapa.js';
import { Calle } from './calle.js';
import { Coche, Conducir, Semaforo } from './coche.js';
import { S, rellenar } from './state.js';
import { audio } from './audio.js';

class Espera {
  constructor(seg, limpio = false) { this.t = seg; this.limpio = limpio; }

  get done() { return this.t <= 0; }

  update(dt) { this.t -= dt; }

  /** limpio: sin caja vacía, para las pausas en las que solo se mira. */
  draw(ctx) { if (!this.limpio) cajaVacia(ctx); }
}

/** La nube del extintor: crece a bloques desde (x, y) hasta tapar la pantalla. */
class Nube {
  constructor(s) {
    this.x = s.x ?? 135;
    this.y = s.y ?? 240;
    this.t = 0;
    this.seg = s.seg ?? 1.5;
  }

  get done() { return this.t >= this.seg; }

  update(dt) { this.t += dt; }

  draw(ctx) {
    const r = (this.t / this.seg) * 560;
    const T = 12;
    for (let j = 24; j < H; j += T) {
      for (let i = 0; i < W; i += T) {
        const d = Math.hypot(i - this.x, j - this.y) + ((i * 7 + j * 13) % 29);
        if (d < r - 34) rect(ctx, i, j, T, T, C.blanco_extintor);
        else if (d < r) dither(ctx, i, j, T, T, C.blanco_extintor, 2);
      }
    }
  }
}

/** Cartel con un número enorme, de los que no sirven para nada. */
class Cartel {
  constructor(s) {
    this.done = false;
    this.s = s;
    this.pie = wrap(rellenar(s.pie), 'dialog', W - 44);
  }

  update() { if (input.confirm()) this.done = true; }

  draw(ctx) {
    const h = 120 + this.pie.length * lineHeight('dialog');
    const y = 130;
    cajaVacia(ctx);
    panel(ctx, 12, y, W - 24, h, { edge: C.rosa_neon });
    text(ctx, rellenar(this.s.titulo), W >> 1, y + 16, { font: 'label', color: C.gris, align: 'center' });
    text(ctx, rellenar(this.s.valor), W >> 1, y + 44, { font: 'huge', color: C.rosa_neon, align: 'center' });
    this.pie.forEach((l, i) => text(ctx, l, W >> 1, y + 92 + i * lineHeight('dialog'), { color: C.marfil, align: 'center' }));
  }
}

registrarOps({
  // Escenario
  colocar(r, s) { r.stage.colocar(s); },
  mover(r, s) {
    const a = r.stage.mover(s);
    if (s.espera !== false) r.wait = new Llegada(a);
  },
  retirar(r, s) { r.stage.retirar(s.id ?? s.who); },
  esperar(r, s) { r.wait = new Espera(s.seg ?? 1, s.limpio); },
  sacudir(r, s) { shake(s.seg ?? 0.3); audio.golpe(); },
  nube(r, s) { r.wait = new Nube(s); audio.extintor(); },

  // Trayectos
  mapa(r, s) { r.wait = new Mapa(s); },
  calle(r, s) { r.wait = new Calle(s); },

  // Coche
  coche(r, s) { r.capa = new Coche(s); },
  conducir(r, s) { r.wait = new Conducir(r.capa, s); },
  // {"t":"volumen","v":3}: lo toca la historia, no el jugador.
  volumen(r, s) { if (r.capa) r.capa.vol = s.v; },
  semaforo(r) { r.wait = new Semaforo(r.capa); },
  subir(r, s) { S.coche[s.asiento] = s.who; audio.puerta(true); },
  bajar(r, s) { S.coche = S.coche.map((w) => (w === s.who ? null : w)); audio.puerta(true); },

  // Carteles
  cartel(r, s) { r.wait = new Cartel(s); },
});

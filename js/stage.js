// Escenario: actores sobre el fondo, movidos con pasos de night.json (colocar, mover, retirar).
import { C } from './assets.js';
import { cajaVacia, rect } from './draw.js';
import { text, measure } from './text.js';
import { W } from './screen.js';
import { G } from './game.js';
import { DIR, drawShadow, drawSprite, figura } from './sprites.js';
import { pintaAmbiente } from './ambiente.js';

const SUELO = 372;

/** Placa de nombre sobre la cabeza. */
export function placa(ctx, txt, x, y) {
  const w = measure(txt, 'label') + 8;
  const px = Math.max(1, Math.min(W - w - 1, Math.round(x - w / 2)));
  rect(ctx, px, y, w, 11, C.carbon);
  text(ctx, txt, px + 4, y + 2, { font: 'label', color: C.amarillo_mural });
}

/** Actividad: espera a que un actor llegue a su destino. */
export class Llegada {
  constructor(a) { this.a = a; }

  get done() { return !this.a.dest; }

  update() {}

  draw(ctx) { cajaVacia(ctx); }
}

export class Stage {
  constructor() { this.actors = new Map(); }

  clear() { this.actors.clear(); }

  /**
   * s: { who, id?, x, y?, dir?, escala?, pose?, corte?, rotulo?, tumbado? }. pose 'escena' usa
   * la figura grande si la hay. corte: nada por debajo de esa y (alguien detrás de una barra).
   * rotulo: placa de nombre sobre la cabeza, como las de los campeones de Juanjo.
   * tumbado: 1 con la cabeza a la derecha, -1 a la izquierda; (x, y) son los pies. Un giro de
   * 90 grados exactos no crea píxeles nuevos.
   */
  colocar(s) {
    const a = {
      who: s.who,
      x: s.x ?? 135,
      y: s.y ?? SUELO,
      dir: DIR[s.dir] ?? DIR.abajo,
      anim: 'Idle',
      t: 0,
      escala: s.escala ?? 1,
      pose: s.pose ?? (G.data.cast[s.who]?.escena ? 'escena' : 'mapa'),
      corte: s.corte ?? null,
      rotulo: s.rotulo ?? null,
      tumbado: s.tumbado ?? 0,
      dest: null,
      vel: 50,
    };
    this.actors.set(s.id ?? s.who, a);
    return a;
  }

  get(id) {
    const a = this.actors.get(id);
    if (!a) throw new Error(`Actor no colocado: ${id}`);
    return a;
  }

  mover(s) {
    const a = this.get(s.id ?? s.who);
    a.dest = { x: s.x ?? a.x, y: s.y ?? a.y };
    a.vel = s.vel ?? 50;
    a.anim = 'Walk';
    return a;
  }

  retirar(id) { this.actors.delete(id); }

  update(dt) {
    for (const a of this.actors.values()) {
      a.t += dt * 60;
      if (!a.dest) continue;
      const dx = a.dest.x - a.x, dy = a.dest.y - a.y;
      const d = Math.hypot(dx, dy);
      const step = a.vel * dt;
      if (d <= step) {
        a.x = a.dest.x; a.y = a.dest.y;
        a.dest = null;
        a.anim = 'Idle';
        continue;
      }
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      if (Math.abs(dx) >= Math.abs(dy)) a.dir = dx > 0 ? DIR.derecha : DIR.izquierda;
      else a.dir = dy > 0 ? DIR.abajo : DIR.arriba;
    }
  }

  draw(ctx) {
    // Con capa (coche, amanecer, cuadro de final), la pinta ella antes de lo suyo.
    const r = G.scene;
    if (r?.bg && !r.capa) pintaAmbiente(ctx, r.bg);
    const order = [...this.actors.values()].sort((p, q) => p.y - q.y);
    for (const a of order) {
      const c = G.data.cast[a.who];
      const fig = a.pose === 'escena' && c?.escena ? figura(a.who, c.escena) : null;
      if (a.tumbado && c?.sprite) {
        ctx.save();
        ctx.translate(Math.round(a.x), Math.round(a.y));
        ctx.rotate((a.tumbado * Math.PI) / 2);
        drawSprite(ctx, c.sprite, 'Idle', a.dir, 0, 0, 0, { escala: a.escala });
        ctx.restore();
      } else if (fig) {
        const x = Math.round(a.x), y = Math.round(a.y);
        drawShadow(ctx, x, y, 44);
        ctx.drawImage(fig, x - (fig.width >> 1), y - fig.height);
      } else if (c?.sprite) {
        if (a.corte !== null) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, W, a.corte);
          ctx.clip();
        }
        drawSprite(ctx, c.sprite, a.anim, a.dir, a.t, a.x, a.y, { escala: a.escala, sombra: a.corte === null });
        if (a.corte !== null) ctx.restore();
      }
      if (a.rotulo) placa(ctx, a.rotulo, a.x + (a.tumbado ? 24 * a.escala : 0), a.y - (a.tumbado ? 18 : 44) * a.escala);
    }
  }
}

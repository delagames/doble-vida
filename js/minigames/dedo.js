// Mover a Juanjo arrastrando. Es relativo: el dedo puede ir en la banda del pulgar y el muñeco
// se mueve lo que se mueva el dedo, sin quedar tapado. Lo usan ¡SAL! y ¡ESQUIVA!.
import { input } from '../input.js';

const GANANCIA = 1.35;     // un poco más que el dedo: la pantalla es larga y el pulgar, no
const CORREA = 34;         // el objetivo no se aleja más de esto de Juanjo

export class Dedo {
  constructor(x, y) {
    this.pid = null;
    this.px = 0;
    this.py = 0;
    this.obj = { x, y };
  }

  /** Lo que ha andado el dedo este fotograma, y las flechas en el ordenador. */
  lee(dt, vel) {
    const p = this.pid !== null ? input.points.find((q) => q.id === this.pid) : null;
    let dx = 0, dy = 0;
    if (p) {
      dx = (p.x - this.px) * GANANCIA;
      dy = (p.y - this.py) * GANANCIA;
      this.px = p.x;
      this.py = p.y;
    } else {
      const q = input.points[0];
      this.pid = q?.id ?? null;
      if (q) { this.px = q.x; this.py = q.y; }
    }
    dx += ((input.key('ArrowRight') ? 1 : 0) - (input.key('ArrowLeft') ? 1 : 0)) * vel * dt;
    dy += ((input.key('ArrowDown') ? 1 : 0) - (input.key('ArrowUp') ? 1 : 0)) * vel * dt;
    return { dx, dy };
  }

  /** Lleva a `yo` ({x, y, dir}) hacia el dedo sin pasar de vel. libre(x, y) dice si cabe ahí. */
  mueve(yo, dt, vel, libre, zona) {
    const { dx, dy } = this.lee(dt, vel);
    const o = this.obj;
    o.x = Math.max(zona.x, Math.min(zona.x + zona.w, o.x + dx));
    o.y = Math.max(zona.y, Math.min(zona.y + zona.h, o.y + dy));
    const rx = o.x - yo.x, ry = o.y - yo.y;
    const d = Math.hypot(rx, ry);
    if (d > 0.5) {
      const paso = Math.min(d, vel * dt);
      desliza(yo, (rx / d) * paso, (ry / d) * paso, libre);
    }
    const r = Math.hypot(o.x - yo.x, o.y - yo.y);
    if (r > CORREA) { o.x = yo.x + ((o.x - yo.x) / r) * CORREA; o.y = yo.y + ((o.y - yo.y) / r) * CORREA; }
    return d > 1.5;
  }

  /** Tras un empujón: el objetivo se queda con Juanjo, para que no vuelva solo. */
  reubica(yo) { this.obj.x = yo.x; this.obj.y = yo.y; }
}

/** Avanza eje por eje: contra un obstáculo resbala en vez de pararse en seco. */
function desliza(yo, dx, dy, libre) {
  if (dx && libre(yo.x + dx, yo.y)) yo.x += dx;
  if (dy && libre(yo.x, yo.y + dy)) yo.y += dy;
}

/** Hacia dónde mira según por dónde va: 0 abajo, 2 derecha, 4 arriba, 6 izquierda. */
export function rumbo(dx, dy, dir) {
  if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return dir;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 2 : 6;
  return dy > 0 ? 0 : 4;
}

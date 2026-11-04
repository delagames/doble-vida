// Entrada unificada: dedos y ratón por Pointer Events, teclado para probar en ordenador.
// - tap: toque corto sin arrastrar
// - drag: posición viva de p()       - dos dedos: input.count === 2 (points)
import { toLogical, eventTarget } from './screen.js';

const TAP_MS = 500, TAP_MOVE = 8;
const active = new Map();

export const input = {
  count: 0,
  points: [],     // dedos activos, por orden de llegada
  pressed: null,  // {x,y} este frame
  released: null, // {x,y} este frame
  tap: null,      // {x,y} este frame
  keys: new Set(),
  hits: new Set(),
  wheel: 0,       // rueda del ratón este frame, en píxeles

  p() { return this.points[0] || null; },
  hit(...codes) { return codes.some((c) => this.hits.has(c)); },
  key(...codes) { return codes.some((c) => this.keys.has(c)); },
  confirm() { return !!this.tap || this.hit('Enter', 'Space'); },
  tapIn(r) { return !!this.tap && inRect(this.tap, r); },
  /** Olvida los dedos y teclas que ya estaban puestos: lo siguiente solo cuenta si es nuevo. */
  soltarTodo() { active.clear(); this.keys.clear(); sync(); this.consume(); },
  consume() { this.tap = null; this.pressed = null; this.released = null; this.wheel = 0; this.hits.clear(); },
  endFrame() { this.pressed = this.released = this.tap = null; this.wheel = 0; this.hits.clear(); },
};

export function inRect(p, r) { return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h; }

function sync() {
  input.points = [...active.values()];
  input.count = input.points.length;
}

export function initInput() {
  const el = eventTarget();
  const down = (e) => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
    const q = toLogical(e.clientX, e.clientY);
    active.set(e.pointerId, { id: e.pointerId, x: q.x, y: q.y, sx: q.x, sy: q.y, t0: e.timeStamp, moved: 0 });
    input.pressed = q;
    sync();
  };
  const move = (e) => {
    const a = active.get(e.pointerId);
    if (!a) return;
    const q = toLogical(e.clientX, e.clientY);
    a.x = q.x; a.y = q.y;
    a.moved = Math.max(a.moved, Math.abs(q.x - a.sx) + Math.abs(q.y - a.sy));
  };
  const up = (e) => {
    const a = active.get(e.pointerId);
    if (!a) return;
    active.delete(e.pointerId);
    const q = { x: a.x, y: a.y };
    input.released = q;
    // Con la hora del evento: crear el audio en el primer toque puede parar el hilo un buen rato,
    // y eso no debe convertir un toque en un dedo mantenido.
    if (e.timeStamp - a.t0 < TAP_MS && a.moved < TAP_MOVE) input.tap = q;
    sync();
  };
  const cancel = (e) => { active.delete(e.pointerId); sync(); };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => { e.preventDefault(); input.wheel += Math.sign(e.deltaY) * 24; }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;   // una tecla ya olvidada no vuelve por la repetición del sistema
    input.hits.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { active.clear(); input.keys.clear(); sync(); });
  // Al irse de la pestaña no quedan dedos fantasma apretando un minijuego.
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.soltarTodo(); });
}

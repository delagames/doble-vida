// Núcleo compartido: datos cargados, escena activa y capas por encima.
import { fx } from './screen.js';
import { input } from './input.js';
import { ebriedad } from './state.js';

export const G = {
  data: {},
  scene: null,
  overlay: null,   // el móvil, cuando está abierto, congela la escena de debajo
  aviso: null,     // SMS de fondo: la escena (un minijuego) sigue viva debajo
  efectos: [],     // detalles breves ({update, draw, done}) que nunca paran nada
  respiro: 0,      // tras cerrar el móvil, un doble toque no pulsa lo de debajo
  time: 0,
  sober: true,     // título y resultados no se tambalean
  inclina: null,   // inclinación forzada, en píxeles: la vía buena

  salida: null,    // botón de salir de la demo, por encima de todo: { r, draw, accion }

  setScene(s) { this.scene = s; },

  update(dt) {
    this.time += dt;
    if (this.salida && input.tapIn(this.salida.r)) { this.salida.accion(); input.consume(); return; }
    const e = this.sober ? 0 : ebriedad();
    // Se queda un rato en cada lado, para que se note inclinada y no solo meciéndose.
    const lado = Math.max(-1, Math.min(1, Math.sin(this.time * 0.6) * 1.7));
    fx.tilt = this.inclina ?? (e > 0.3 ? Math.round(lado * (e - 0.3) * 20) : 0);
    fx.wobble = e > 0.6 ? Math.round((e - 0.6) * 10) : 0;
    this.efectos.forEach((f) => f.update(dt));
    this.efectos = this.efectos.filter((f) => !f.done);
    if (!this.overlay && this.aviso) {
      this.aviso.update(dt);
      if (this.aviso?.done) this.aviso = null;
    }
    if (this.overlay) {
      this.overlay.update(dt);
      if (this.overlay.done) { this.overlay = null; this.respiro = 0.25; }
    } else {
      if (this.respiro > 0) { this.respiro -= dt; input.consume(); }
      this.scene?.update(dt);
    }
  },

  draw(ctx) {
    this.scene?.draw(ctx);
    this.aviso?.draw(ctx);
    this.overlay?.draw(ctx);
    this.efectos.forEach((f) => f.draw(ctx));
    this.salida?.draw(ctx);
  },
};

// Cortinilla entre paradas: cae la persiana del bar, sin alfa, y un rótulo con la hora y el sitio.
// Dura menos de un segundo, un toque la quita y la noche sigue preparándose debajo.
import { C } from './assets.js';
import { input } from './input.js';
import { W, H, foto } from './screen.js';
import { text, wrap, lineHeight } from './text.js';
import { cifras, outline, rect } from './draw.js';

const LAMA = 6;                          // alto de cada lama de la persiana
const CIERRA = 0.2, ROTULO = 0.55, ABRE = 0.18;

/** La persiana del bar: baja hasta f (de 0 a 1) a golpes de lama, con el faldón abajo. */
function persiana(ctx, f) {
  const alto = Math.round(f * H);
  if (alto <= 0) return;
  ctx.fillStyle = C.noche;
  ctx.fillRect(0, 0, W, alto);
  ctx.fillStyle = C.noche_clara;
  // Las lamas bajan con ella: se ven correr.
  for (let y = alto % LAMA; y < alto; y += LAMA) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = C.carbon;
  ctx.fillRect(0, Math.max(0, alto - 5), W, 5);
  ctx.fillStyle = C.gris;
  ctx.fillRect(0, Math.max(0, alto - 5), W, 1);
  ctx.fillRect(126, Math.max(0, alto - 3), 18, 1);
}

export class Cortinilla {
  constructor({ hora, nombre }) {
    this.hora = hora;
    this.lineas = wrap(nombre, 'bold', W - 60);
    this.t = 0;
    this.done = false;
  }

  /** Se come los toques: el que la salta no pulsa lo de debajo. */
  update(dt) {
    this.t += dt;
    if (input.confirm() || this.t >= CIERRA + ROTULO + ABRE) this.done = true;
    input.consume();
  }

  draw(ctx) {
    const { t } = this;
    if (t < CIERRA) {
      ctx.drawImage(foto, 0, 0);
      persiana(ctx, (t / CIERRA) ** 2);       // cae, no baja
      return;
    }
    if (t < CIERRA + ROTULO) {
      persiana(ctx, 1);
      this.rotulo(ctx, t - CIERRA);
      return;
    }
    persiana(ctx, 1 - (t - CIERRA - ROTULO) / ABRE);
  }

  /** Un cartel de neón colgado de la persiana, que tarda un instante en prender. */
  rotulo(ctx, t) {
    const lh = lineHeight('bold');
    const alto = 34 + this.lineas.length * lh;
    const y = (H - alto) >> 1;
    const borde = t < 0.14 && Math.floor(t * 40) % 2 ? C.morado : C.rosa_neon;
    rect(ctx, 22, y - 12, W - 44, alto + 24, C.carbon);
    outline(ctx, 22, y - 12, W - 44, alto + 24, borde);
    outline(ctx, 24, y - 10, W - 48, alto + 20, C.morado);
    rect(ctx, 60, 0, 1, y - 12, C.gris);          // las cadenas de las que cuelga
    rect(ctx, W - 61, 0, 1, y - 12, C.gris);
    cifras(ctx, this.hora, W >> 1, y, { color: t < 0.08 ? C.naranja_oscuro : C.naranja_farola, escala: 4, align: 'center' });
    this.lineas.forEach((l, i) => text(ctx, l, W >> 1, y + 30 + i * lh, { font: 'bold', color: C.marfil, align: 'center' }));
  }
}

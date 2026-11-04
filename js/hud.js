// Banda superior: reloj, coherencia (línea que se vuelve ondulada), tejos y móvil.
import { C } from './assets.js';
import { W } from './screen.js';
import { text } from './text.js';
import { cifras, rect, heart, outline } from './draw.js';
import { S, ebriedad } from './state.js';
import { G } from './game.js';

const PHONE_BTN = { x: W - 22, y: 2, w: 20, h: 20 };
export const PHONE_TOQUE = { x: W - 34, y: 0, w: 34, h: 28 };  // el dedo es más gordo que el icono
const LINE_X = 46, LINE_W = 130, LINE_Y = 13;
let pulsoHasta = 0;

/** El contador de tejos da un salto. */
export function pulsoTejo(seg = 1) { pulsoHasta = G.time + seg; }

export function drawHud(ctx) {
  rect(ctx, 0, 0, W, 24, C.noche);
  rect(ctx, 0, 24, W, 1, C.carbon);
  cifras(ctx, S.hora, 5, 7, { color: C.naranja_farola, escala: 2 });

  text(ctx, 'COHERENCIA', LINE_X, 2, { font: 'label', color: C.gris });
  const e = ebriedad();
  const amp = e * 4.5;
  const len = Math.round((S.coherencia / 100) * LINE_W);
  const color = S.coherencia > 60 ? C.cian_neon : S.coherencia > 30 ? C.naranja_farola : C.rojo_extintor;
  rect(ctx, LINE_X, LINE_Y + 4, LINE_W, 1, C.morado);
  ctx.fillStyle = color;
  for (let i = 0; i < len; i++) {
    const y = LINE_Y + 4 + Math.round(Math.sin(i * 0.45 + G.time * 3) * amp);
    ctx.fillRect(LINE_X + i, y - 1, 1, 2);
  }

  const pulso = G.time < pulsoHasta && Math.floor(G.time * 8) % 2 === 0;
  if (pulso) heart(ctx, 181, 1, C.rosa_neon, 2);
  else heart(ctx, 188, 4, C.rosa_neon);
  cifras(ctx, S.tejos, 198, 2, { color: pulso ? C.amarillo_mural : C.rosa_claro, escala: 2 });
  text(ctx, 'TEJOS', 188, 13, { font: 'label', color: C.gris });

  const b = PHONE_BTN;
  rect(ctx, b.x + 4, b.y + 1, 12, 18, C.carbon);
  outline(ctx, b.x + 4, b.y + 1, 12, 18, C.gris);
  rect(ctx, b.x + 6, b.y + 3, 8, 12, S.hilo.length ? C.cian_neon : C.azul_mar);
  rect(ctx, b.x + 9, b.y + 16, 2, 1, C.gris);
}

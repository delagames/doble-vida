// API de los medidores para escenas y minijuegos: tejos, álbum y costes.
// Coherencia:  coh(delta), copa(n, 'copa'|'trago'|'chupito'|'jager'), ebriedad(), endurece(a, b).
// Tejos:       sumarTejo({...}), tejosDeParada(clave), anularTejos(clave).
// Fallos:      fallarMinijuego(coste).
import { C } from './assets.js';
import { W, shake, vibrar } from './screen.js';
import { text } from './text.js';
import { cifras, heart, panel } from './draw.js';
import { pulsoTejo } from './hud.js';
import { drawPolaroid, preload } from './sprites.js';
import { COSTE, S, coh, copa, ebriedad, endurece, rellenar } from './state.js';
import { G } from './game.js';
import { audio } from './audio.js';

export { coh, copa, ebriedad, endurece };

const paradaActual = () => G.data.night.paradas[S.stop]?.id ?? String(S.stop);

/**
 * Juanjo cree que una Pokémon se le ha insinuado: sube un tejo y entra en el álbum.
 * who: clave de cast.json. mood: retrato. foto: 'sprite' para usar el sprite.
 * pie: lo que escribe Juanjo. real: lo que pasó de verdad, si procede.
 * parada: clave del conteo; por defecto la parada actual. Un minijuego puede usar la
 * suya (p. ej. 'barra') para que anularTejos no toque los demás tejos de la parada.
 */
export function sumarTejo({ who = null, mood = 'Normal', foto = 'retrato', pie = '', real = null, hora = S.hora, parada = paradaActual() } = {}) {
  const e = { who, mood, foto, hora, pie: rellenar(pie), real: real ? rellenar(real) : null, parada, anulado: false };
  S.tejos++;
  S.tejosParada[parada] = (S.tejosParada[parada] ?? 0) + 1;
  S.album.push(e);
  if (who) preload([who]);
  G.efectos.push(new TejoFx(e, G.efectos.length * 0.7));
  return e;
}

export function tejosDeParada(parada = paradaActual()) { return S.tejosParada[parada] ?? 0; }

/** Deja a cero los tejos de una parada. Las fotos siguen en el álbum, tachadas. */
export function anularTejos(parada = paradaActual()) {
  const n = tejosDeParada(parada);
  S.tejos = Math.max(0, S.tejos - n);
  S.tejosParada[parada] = 0;
  for (const e of S.album) if (e.parada === parada) e.anulado = true;
  return n;
}

/** Coste común de un minijuego fallado: coherencia, sacudida y vibración corta. */
export function fallarMinijuego(coste = COSTE.fallo) {
  S.fallos++;
  coh(-coste);
  shake(0.3);
  vibrar();
}

// Efecto al sumar: la foto baja bajo el marcador y los corazones suben al contador --

const TOAST = { w: 142, h: 58, y: 29 };
const ENTRA = 0.15, DURA = 1.6;
const HUD_X = 191, HUD_Y = 6;

class TejoFx {
  constructor(e, espera) {
    this.e = e;
    this.espera = espera;
    this.t = 0;
    this.done = false;
    this.lanzado = false;
    this.x = (W - TOAST.w) >> 1;
  }

  update(dt) {
    if (this.espera > 0) { this.espera -= dt; return; }
    if (!this.lanzado) { this.lanzado = true; pulsoTejo(1.2); audio.tejo(); }
    this.t += dt;
    if (this.t >= DURA) this.done = true;
  }

  draw(ctx) {
    if (!this.lanzado) return;
    const { t, x } = this;
    const salida = DURA - ENTRA;
    const f = t < ENTRA ? t / ENTRA : t > salida ? (DURA - t) / ENTRA : 1;
    const y = Math.round(TOAST.y - (1 - f) * (TOAST.h + TOAST.y));
    panel(ctx, x, y, TOAST.w, TOAST.h, { edge: C.rosa_neon });
    drawPolaroid(ctx, this.e, x + 4, y + 3);
    text(ctx, G.data.night.movil.mas_tejo, x + 58, y + 11, { font: 'bold', color: C.rosa_neon });
    cifras(ctx, this.e.hora, x + 58, y + 31, { color: C.gris, escala: 2 });
    for (let i = 0; i < 5; i++) {
      const k = (t - i * 0.12) / 0.8;
      if (k < 0 || k > 1) continue;
      const sx = x + 24 + i * 20, sy = y - 4;   // salen del borde: el texto se lee
      heart(ctx, Math.round(sx + (HUD_X - sx) * k), Math.round(sy + (HUD_Y - sy) * k), C.rosa_neon);
    }
  }
}

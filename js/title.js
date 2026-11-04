// Pantalla de inicio: fondo 08 con el título. Si nadie toca nada en 30 segundos, suena el dubstep.
import { C, img, bgPath } from './assets.js';
import { input, inRect } from './input.js';
import { W, H } from './screen.js';
import { text, wrap, lineHeight } from './text.js';
import { button, panel } from './draw.js';
import { S, hayPartida, cargar, reiniciar, borrar, nocheTerminada } from './state.js';
import { G } from './game.js';
import { miga } from './diag.js';
import { audio } from './audio.js';
import { apagarImagen, pintaAmbiente } from './ambiente.js';
import { DIR, drawSprite, preload } from './sprites.js';
import { NightRunner } from './night.js';
import { ModoBuitre } from './buitre.js';
import { Demo } from './demo.js';
import { cerrarConsejoIphone, hayConsejoIphone, pantallaCompleta } from './pwa.js';

const LOGO = 'assets/logo/title-doble-vida-270x140.png';
const MUSICA = { x: 6, y: H - 124, w: 86, h: 24 };
const EFECTOS = { x: W - 92, y: H - 124, w: 86, h: 24 };
const BUITRE = { x: 94, y: H - 128, w: 82, h: 30 };   // entre música y efectos: el premio
const DEMO = { x: 94, y: H - 156, w: 82, h: 24 };
const CONSEJO_Y = 146;
const ARMADO = 3;              // segundos para confirmar que se borra la partida guardada
const PACIENCIA = 30;          // segundos sin tocar nada hasta que Juanjo pone lo suyo

// Juanjo da vueltas bajo el neón: anda, se para a mirar el móvil y vuelve.
const PASEO = { desde: 34, hasta: 122, y: 354, seg: 16 };
const FALLO_LETRAS = { x: 150, w: 70, per: 6.5 };

function paseo(t) {
  const q = t % PASEO.seg;
  const tramo = PASEO.hasta - PASEO.desde;
  if (q < 2) return { x: PASEO.desde, anda: false, dir: DIR.abajo };
  if (q < 7) return { x: PASEO.desde + ((q - 2) / 5) * tramo, anda: true, dir: DIR.derecha };
  if (q < 9) return { x: PASEO.hasta, anda: false, dir: DIR.abajo };
  if (q < 14) return { x: PASEO.hasta - ((q - 9) / 5) * tramo, anda: true, dir: DIR.izquierda };
  return { x: PASEO.desde, anda: false, dir: DIR.abajo };
}

export class Title {
  constructor() {
    G.sober = true;
    audio.musica(null);
    this.save = hayPartida();
    this.quieto = 0;
    this.armado = 0;
    this.t = 0;
    preload(['juanjo']);
    const y = H - 86;
    this.buttons = [];
    if (this.save) this.buttons.push({ id: 'seguir', label: `SEGUIR (${this.save.hora})`, r: { x: 30, y, w: 210, h: 28 } });
    this.buttons.push({ id: 'nueva', label: 'NUEVA NOCHE', r: { x: 30, y: y + 32, w: 210, h: 28 } });
    this.buitre = nocheTerminada();
    this.consejo = hayConsejoIphone() ? wrap(G.data.night.textos.consejo_iphone, 'dialog', W - 28) : null;
    this.consejoH = (this.consejo?.length ?? 0) * lineHeight('dialog') + 10;
  }

  start(id) {
    miga(`start ${id}`);
    if (id === 'seguir') cargar(); else { borrar(); reiniciar(); }
    miga('partida lista');
    G.sober = false;
    pantallaCompleta();
    miga('creando noche');
    const noche = new NightRunner(S.stop);
    miga('noche creada');
    G.setScene(noche);
  }

  /** NUEVA NOCHE borra la que hay: con partida guardada pide un segundo toque, y el doble toque no vale. */
  pulsa(b) {
    miga(`pulsa ${b.id} save=${!!this.save}`);
    if (b.id !== 'nueva' || !this.save) { this.start(b.id); return; }
    if (this.armado <= 0) {
      this.armado = ARMADO;
      this.etiqueta = b.label;
      b.label = G.data.night.textos.borrar_noche;
    } else if (this.armado < ARMADO - 0.4) this.start(b.id);
  }

  desarma(dt) {
    if (!(this.armado > 0)) return;
    this.armado -= dt;
    if (this.armado <= 0) this.buttons.find((b) => b.id === 'nueva').label = this.etiqueta;
  }

  /** Lleva la cuenta: cualquier toque o tecla la pone a cero y corta el dubstep. */
  paciencia(dt) {
    if (input.count || input.pressed || input.tap || input.hits.size) {
      this.quieto = 0;
      audio.musica(null);
      return;
    }
    this.quieto += dt;
    if (this.quieto >= PACIENCIA - 8) audio.prepara('dubstep');
    if (this.quieto >= PACIENCIA) audio.musica('dubstep');
  }

  update(dt) {
    this.t += dt;
    if (input.tap) miga(`toque ${input.tap.x},${input.tap.y}`);
    this.paciencia(dt);
    if (input.tapIn(MUSICA)) { audio.alternarMusica(); return; }
    if (input.tapIn(EFECTOS)) { audio.alternarEfectos(); return; }
    if (input.tapIn(DEMO)) { audio.opcion(); G.setScene(new Demo('historia', 0, () => G.setScene(new Title()))); return; }
    if (this.buitre && input.tapIn(BUITRE)) { audio.opcion(); G.setScene(new ModoBuitre(() => G.setScene(new Title()))); return; }
    if (this.consejo && input.tap && inRect(input.tap, { x: 2, y: CONSEJO_Y, w: W - 4, h: this.consejoH })) {
      cerrarConsejoIphone();
      this.consejo = null;
      return;
    }
    this.desarma(dt);
    for (const b of this.buttons) if (input.tapIn(b.r)) { audio.opcion(); this.pulsa(b); return; }
    if (input.hit('Enter', 'Space')) this.start(this.buttons[0].id);
  }

  /** El rótulo se enciende a trompicones al entrar y luego le falla alguna letra. */
  neon(ctx) {
    const logo = img(LOGO);
    ctx.drawImage(logo, 0, 4);
    this.oscuro ??= apagarImagen(logo);
    const { t } = this;
    const entra = t < 1.1 && Math.floor(t * 9) % 3 !== 2;
    const todo = (t % 17) > 16.7 && Math.floor(t * 14) % 2 === 0;
    if (entra || todo) { ctx.drawImage(this.oscuro, 0, 4); return; }
    const q = t % FALLO_LETRAS.per;
    if (q < 0.5 && Math.floor(q * 14) % 3 !== 1) {
      const { x, w } = FALLO_LETRAS;
      ctx.drawImage(this.oscuro, x, 0, w, logo.height, x, 4, w, logo.height);
    }
  }

  draw(ctx) {
    ctx.drawImage(img(bgPath('08-modernicolas-puerta')), 0, 0);
    pintaAmbiente(ctx, '08-modernicolas-puerta');
    ctx.drawImage(ctx.canvas, 0, 25, W, 25, 0, 0, W, 25);   // sin marcadores, la banda de arriba también sigue
    const j = paseo(this.t);
    drawSprite(ctx, 'juanjo', j.anda ? 'Walk' : 'Idle', j.dir, this.t * 60, j.x, PASEO.y, { sombra: true });
    this.neon(ctx);
    if (this.consejo) {
      panel(ctx, 2, CONSEJO_Y, W - 4, this.consejoH, { fill: C.noche_clara });
      this.consejo.forEach((l, i) => text(ctx, l, W >> 1, CONSEJO_Y + 5 + i * lineHeight('dialog'), { color: C.marfil, align: 'center' }));
    }
    panel(ctx, 2, H - 96, W - 4, 94);
    for (const b of this.buttons) button(ctx, b.r, b.label);
    const m = G.data.night.movil;
    button(ctx, MUSICA, audio.musicaOn ? m.musica_si : m.musica_no, { font: 'label' });
    button(ctx, EFECTOS, audio.efectosOn ? m.efectos_si : m.efectos_no, { font: 'label' });
    button(ctx, DEMO, 'DEMO', { font: 'label', color: C.cian_neon, edge: C.cian_neon });
    if (this.buitre) button(ctx, BUITRE, 'MODO BUITRE', { font: 'label', color: C.rosa_claro, edge: C.rosa_neon });
    text(ctx, G.data.night.textos.aviso_inicio, W / 2, H - 14, { font: 'label', color: C.gris, align: 'center' });
  }
}

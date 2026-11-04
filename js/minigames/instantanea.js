// La instantánea de Sandrita. Gag sin dificultad: pantalla congelada, dos pies de foto, y al
// álbum va siempre el de Juanjo. Si se elige el de verdad, el pulgar de Juanjo lo corrige.
//   Parámetros: tejo { who, mood, pie, pieLuz, real }; real, juanjo: textos de los botones.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W } from '../screen.js';
import { text } from '../text.js';
import { button, dither, outline, panel, rect } from '../draw.js';
import { S } from '../state.js';
import { sumarTejo } from '../medidores.js';
import { audio } from '../audio.js';
import { DIR, drawSprite } from '../sprites.js';
import { fondoTenue } from './dibujo.js';

const FLASH_SEG = 0.5;
const ESPERA_MAX = 25;       // sin tocar nada, se apunta solo
const CIERRA_SEG = 1.4;
const FOTO = { x: 45, y: 48, w: 180, h: 200 };
const BOTON_A = { x: 6, y: 300, w: W - 12, h: 80 };
const BOTON_B = { x: 6, y: 386, w: W - 12, h: 80 };

export default class Instantanea {
  static instruccion = '¡PATATA!';
  static ayuda = 'Sandrita ha hecho una foto. Elige el pie de foto. Tranquilo: no se puede hacer mal.';
  static carga = ['sandrita', 'juanjo', 'buitre'];

  start({ params }) {
    this.p = params;
    this.t = 0;
    this.flash = FLASH_SEG;
    this.elegida = null;      // 'real' | 'juanjo'
    this.cierra = 0;
    this.luz = S.coherencia < 50;
    this.res = null;
    this.ops = Math.random() < 0.5 ? [['real', BOTON_A], ['juanjo', BOTON_B]] : [['juanjo', BOTON_A], ['real', BOTON_B]];
  }

  update(dt) {
    this.t += dt;
    if (this.flash > 0) { this.flash -= dt; input.consume(); return; }
    if (this.elegida) {
      this.cierra -= dt;
      if (this.cierra <= 0) this.res = 'win';
      return;
    }
    const op = this.ops.find(([, r]) => input.tap && inRect(input.tap, r));
    if (op) this.elige(op[0]);
    else if (this.t > ESPERA_MAX) this.elige('juanjo');
  }

  elige(cual) {
    this.elegida = cual;
    this.cierra = CIERRA_SEG;
    audio.toque();
  }

  result() { return this.res; }

  tarjeta() {
    const { tejo } = this.p;
    if (tejo) sumarTejo({ ...tejo, pie: this.luz && tejo.pieLuz ? tejo.pieLuz : tejo.pie });
    return {
      titulo: '¡AL ÁLBUM!',
      lineas: [this.elegida === 'real' ? 'Juanjo ha corregido el pie con el pulgar.' : 'Juanjo no ve motivo para cambiar nada.', 'Es la foto más bonita de su vida.'],
    };
  }

  draw(ctx) {
    fondoTenue(ctx, '09-modernicolas-dentro', 2);
    this.pintaFoto(ctx);
    if (this.flash > 0) {
      rect(ctx, 0, 25, W, 455, C.marfil);
      return;
    }
    text(ctx, this.luz ? 'LA PRIMERA LUZ DEL QUINTO DÍA' : 'IMAGEN CONGELADA', W >> 1, 280, { font: 'label', color: this.luz ? C.amarillo_mural : C.cian_neon, align: 'center' });
    for (const [cual, r] of this.ops) {
      const quitado = this.elegida && cual === 'real';
      const txt = quitado ? this.p.juanjo : this.p[cual];
      button(ctx, r, txt, { font: 'dialog', active: this.elegida === cual || quitado, color: C.marfil });
      if (this.elegida === 'real' && cual === 'real') text(ctx, 'CORREGIDO POR JUANJO', r.x + (r.w >> 1), r.y + r.h - 13, { font: 'label', color: C.gris, align: 'center' });
    }
  }

  pintaFoto(ctx) {
    const f = FOTO;
    rect(ctx, f.x + 3, f.y + 3, f.w, f.h, C.carbon);
    rect(ctx, f.x, f.y, f.w, f.h, C.marfil);
    outline(ctx, f.x, f.y, f.w, f.h, C.carbon);
    const dx = f.x + 8, dy = f.y + 8, dw = f.w - 16, dh = f.h - 42;
    panel(ctx, dx, dy, dw, dh, { fill: C.morado, edge: C.morado });
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    if (this.luz) dither(ctx, dx, dy, dw, dh, C.amarillo_mural, 2);
    drawSprite(ctx, '0630', 'Idle', DIR.abajo, 0, dx + 26, dy + 92, { escala: 2 });
    rect(ctx, dx + 25, dy + 76, 3, 2, C.rosa_neon);      // la lengüilla
    drawSprite(ctx, 'juanjo', 'Idle', DIR.abajo, 0, dx + 112, dy + dh - 2, { escala: 2 });
    drawSprite(ctx, '0281', 'Idle', DIR.abajo, 0, dx + 62, dy + dh - 2, { escala: 3 });
    ctx.restore();
    text(ctx, 'MODERNÍCOLAS', f.x + (f.w >> 1), f.y + f.h - 26, { font: 'label', color: C.gris, align: 'center' });
  }
}

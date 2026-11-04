// ¡MARCA!: futbolín en vertical a tres goles, tu barra abajo y Gengar arriba.
// Justicia: el rebote depende de dónde pegue, la bola nunca va recta del todo ni de lado del
// todo (MIN_VX, MIN_VY), acelera en cada golpe y hay límite de tiempo. Si se llega empatado,
// gol de oro; si ni eso, gana Gengar, que ya ha apuntado su marcador.
// Lo de Gengar: atraviesa la mesa para parar una bola perdida (pocas veces), echa humo que
// esconde la bola (nunca cerca de tu barra), cambia su marcador por un 21 y manda un SMS falso.
// Con coherencia baja, dos bolas. A media partida, el SMS de las 01:30 de verdad: contestar
// es gol de Gengar; 10 s sin contestar, SMS sin responder.
//   Parámetros: sms (id, o false para jugar sin él), hora.
import { C } from '../assets.js';
import { input } from '../input.js';
import { W, vibrar, shake } from '../screen.js';
import { text, wrap, lineHeight } from '../text.js';
import { button, cifras, dither, outline, panel, rect } from '../draw.js';
import { S, barajar } from '../state.js';
import { copa, endurece } from '../medidores.js';
import { smsDeFondo } from '../phone.js';
import { audio } from '../audio.js';
import { G } from '../game.js';
import { DIR, drawSprite } from '../sprites.js';
import { fondoTenue } from './dibujo.js';

const CAMPO = { x: 16, y: 44, w: 238, h: 378 };
const IZQ = CAMPO.x + 6, DER = CAMPO.x + CAMPO.w - 6;
const CX = CAMPO.x + (CAMPO.w >> 1), CY = CAMPO.y + (CAMPO.h >> 1);
const YO_Y = CAMPO.y + CAMPO.h - 30, EL_Y = CAMPO.y + 54;   // por debajo del aviso de Laura
const LADO = 6;              // lado de la bola
const BARRA_H = 7;
const META = 3;
const LIMITE = 75, ORO = 25;
const ANGULO = 1.05;         // rebote máximo, unos 60° sobre la vertical
const MIN_VX = 0.17, MIN_VY = 0.45;
const VEL_YO = 620;
const HUMO_MAX_Y = YO_Y - 95;  // el humo nunca llega a la zona de reacción del jugador
const REVELA_SEG = 3.2;
const FALSO_Y = 27;
const FALSOS = ['Soy Laura. La de verdad. Jejejeje.', '¿Me pasas la bola? Firmado: Laura. Jejejeje.'];
const REVELACION = { x: 70, y: 430, w: 130, h: 42 };

const LOCUTOR_YO = ['¡PRIMERA SANGRE!', '¡DOBLE GOL!', '¡VICTORIA! SEGÚN JUANJO'];
const LOCUTOR_EL = ['HAS SIDO EJECUTADO', 'GENGAR ESTÁ IMPARABLE', 'DERROTA. CULPA DEL JUNGLA'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const azar = (a, b) => a + Math.random() * (b - a);

export default class Marca {
  static instruccion = '¡MARCA!';
  static ayuda = 'Arrastra el dedo a los lados y tu barra lo sigue. Da a la bola con el borde de la barra y sale torcida: así pillas a Gengar. Gana quien marque tres. Si Laura escribe, tocar el aviso y contestar es gol de Gengar.';
  static carga = ['gengar', 'juanjo'];

  start({ coh, params }) {
    this.p = { sms: '01:30', hora: '01:30', ...params };
    this.yoW = Math.round(endurece(54, 38));
    this.elW = 46;
    this.vel0 = endurece(165, 205);
    this.velMax = endurece(300, 350);
    this.velIA = endurece(122, 165);
    this.errIA = endurece(16, 8);
    this.humoH = Math.round(endurece(56, 120));
    this.cruces = Math.round(endurece(1, 2));
    this.yo = { x: CX, g: 0 };
    this.el = { x: CX, g: 0 };
    this.yoGoles = 0;
    this.elGoles = 0;
    this.t = 0;
    this.limite = LIMITE;
    this.oro = false;
    this.acabado = null;
    this.err = 0;
    this.bolas = [this.bola(1)];
    this.segunda = coh < 55 ? 7 : Infinity;
    this.humo = { y: CY - 40, dir: 1, on: false, t: 6 };
    this.falso = null;
    this.tFalso = 4.5;
    this.falsos = barajar(FALSOS);
    this.nFalso = 0;
    this.veintiuno = 0;
    this.tVeintiuno = azar(7, 10);
    this.cruce = null;
    this.msg = null;
    this.smsId = this.p.sms;
    this.tSms = this.smsId ? azar(11, 15) : Infinity;
    this.smsLanzado = !this.smsId;
    this.smsResuelto = !this.smsId;
    this.contesto = false;
    this.revela = 0;
    this.revelada = false;
    this.flashGol = 0;
    this.colorGol = C.marfil;
    this.chispa = null;          // { x, y, t }: el golpe de la barra
  }

  bola(hacia) {
    const b = { x: CX, y: CY, vx: 0, vy: 0, v: this.vel0, espera: 0.9, cola: [] };
    this.saca(b, hacia);
    return b;
  }

  saca(b, hacia) {
    b.x = CX + azar(-24, 24); b.y = CY; b.v = this.vel0; b.espera = 0.9;
    const a = azar(0.32, 0.65) * (Math.random() < 0.5 ? -1 : 1);
    b.vx = Math.sin(a) * b.v;
    b.vy = Math.cos(a) * b.v * hacia;
  }

  /** Reparte la velocidad sin dejar que vaya recta ni de lado eternamente. */
  rebota(b, f, hacia) {
    b.v = Math.min(this.velMax, b.v * 1.07);
    let vx = Math.sin(clamp(f, -1, 1) * ANGULO + azar(-0.05, 0.05)) * b.v;
    if (Math.abs(vx) < MIN_VX * b.v) vx = (vx >= 0 ? 1 : -1) * MIN_VX * b.v;
    const vy = Math.max(Math.sqrt(Math.max(0, b.v * b.v - vx * vx)), MIN_VY * b.v);
    b.vx = vx;
    b.vy = vy * hacia;
  }

  update(dt) {
    if (this.revela > 0) {
      this.revela -= dt;
      input.consume();
      return;
    }
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; }
    this.flashGol = Math.max(0, this.flashGol - dt);
    if (this.chispa && (this.chispa.t -= dt) <= 0) this.chispa = null;
    this.mueveYo(dt);
    this.quizaSms();
    if (this.acabado) return;     // esperando a que se resuelva el SMS
    this.t += dt;
    if (this.quizaRevela()) return;
    this.trampas(dt);
    this.mueveEl(dt);
    if (this.t >= this.segunda && this.bolas.length < 2) this.bolas.push(this.bola(-1));
    for (const b of this.bolas) this.mueve(b, dt);
    this.yo.g = Math.max(0, this.yo.g - dt);
    this.el.g = Math.max(0, this.el.g - dt);
    this.compruebaFin();
  }

  mueveYo(dt) {
    const p = input.p();
    let meta = p ? p.x : null;
    const flechas = (input.key('ArrowRight') ? 1 : 0) - (input.key('ArrowLeft') ? 1 : 0);
    if (flechas) meta = this.yo.x + flechas * VEL_YO;
    if (meta === null) return;
    const paso = VEL_YO * dt;
    const m = clamp(meta, IZQ + (this.yoW >> 1), DER - (this.yoW >> 1));
    this.yo.x += clamp(m - this.yo.x, -paso, paso);
  }

  quizaSms() {
    if (this.smsLanzado || !(this.acabado || this.t >= this.tSms)) return;
    this.smsLanzado = true;
    S.hora = this.p.hora;
    S.flags.sms0130 = true;
    this.falso = null;
    smsDeFondo(this.smsId, { alTerminar: (r) => this.finSms(r) });
  }

  finSms(r) {
    this.smsResuelto = true;
    if (!r.respondido) { this.aviso('SMS SIN RESPONDER. SIGUE EL PARTIDO'); return; }
    this.contesto = true;
    this.gol('el', 'CONTESTAS A LAURA. GOL DE GENGAR');
  }

  quizaRevela() {
    if (this.revelada || this.yoGoles > 0 || this.elGoles !== 2) return false;
    if (!input.tapIn(REVELACION)) return false;
    this.revelada = true;
    this.revela = REVELA_SEG;
    this.yoGoles = 1;
    for (const b of this.bolas) this.saca(b, 1);
    return true;
  }

  trampas(dt) {
    const h = this.humo;
    h.t -= dt;
    if (h.t <= 0) { h.on = !h.on; h.t = h.on ? 7 : 5; }
    if (h.on) {
      h.y += h.dir * 14 * dt;
      if (h.y < EL_Y + 50) h.dir = 1;
      if (h.y + this.humoH > HUMO_MAX_Y) h.dir = -1;
      h.y = clamp(h.y, EL_Y + 50, HUMO_MAX_Y - this.humoH);
    }
    this.tVeintiuno -= dt;
    if (this.veintiuno > 0) this.veintiuno -= dt;
    if (this.tVeintiuno <= 0) { this.veintiuno = 1.1; this.tVeintiuno = azar(8, 12); }
    if (this.falso) {
      this.falso.t -= dt;
      if (this.falso.t <= 0) this.falso = null;
    } else {
      this.tFalso -= dt;
      if (this.tFalso <= 0 && !G.aviso && this.nFalso < 3) {
        const lineas = wrap(this.falsos[this.nFalso++ % this.falsos.length], 'dialog', W - 24);
        this.falso = { t: 2.2, lineas };
        this.tFalso = azar(13, 18);
      }
    }
    if (this.cruce) { this.cruce.t -= dt; if (this.cruce.t <= 0) this.cruce = null; }
  }

  /** La bola que le llega antes; si no le viene ninguna, se recoloca en el centro. */
  mueveEl(dt) {
    const viene = this.bolas.filter((b) => b.vy < 0 && b.espera <= 0).sort((p, q) => p.y - q.y)[0];
    const meta = viene ? viene.x + this.err : CX;
    const paso = this.velIA * dt;
    const m = clamp(meta, IZQ + (this.elW >> 1), DER - (this.elW >> 1));
    this.el.x += clamp(m - this.el.x, -paso, paso);
    if (!viene || this.cruces <= 0 || viene.y > EL_Y + 34) return;
    if (Math.abs(viene.x - this.el.x) <= (this.elW >> 1) + 14) return;
    // Bola perdida: Gengar se hunde en la mesa y sale donde hace falta.
    this.cruces--;
    this.cruce = { t: 0.8, de: this.el.x, a: viene.x };
    this.el.x = clamp(viene.x, IZQ + (this.elW >> 1), DER - (this.elW >> 1));
    this.aviso('GENGAR ATRAVIESA LA MESA');
  }

  mueve(b, dt) {
    if (b.espera > 0) { b.espera -= dt; b.cola.length = 0; return; }
    const prev = b.y;
    b.cola.push({ x: b.x, y: b.y });
    if (b.cola.length > 5) b.cola.shift();
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < IZQ + LADO / 2) { b.x = IZQ + LADO / 2; b.vx = Math.abs(b.vx); }
    if (b.x > DER - LADO / 2) { b.x = DER - LADO / 2; b.vx = -Math.abs(b.vx); }
    if (b.vy > 0 && prev <= YO_Y && b.y >= YO_Y) this.choque(b, this.yo, this.yoW, YO_Y, -1);
    if (b.vy < 0 && prev >= EL_Y && b.y <= EL_Y) this.choque(b, this.el, this.elW, EL_Y, 1);
    if (b.y > CAMPO.y + CAMPO.h - 2) { this.gol('el'); this.saca(b, 1); }
    if (b.y < CAMPO.y + 2) { this.gol('yo'); this.saca(b, -1); }
  }

  choque(b, barra, w, y, hacia) {
    const d = b.x - barra.x;
    if (Math.abs(d) > (w >> 1) + LADO / 2 + 1) return;
    b.y = y;
    this.rebota(b, d / (w / 2), hacia);
    barra.g = 0.12;
    this.chispa = { x: b.x, y, t: 0.14, fuerte: Math.abs(d) > w * 0.32 };
    audio.compas(hacia < 0);
    if (hacia < 0) this.err = azar(-this.errIA, this.errIA);
  }

  /** El locutor de la ranked vive en la cabeza de Juanjo y canta el futbolín. */
  gol(quien, msg = null) {
    this.flashGol = 0.35;
    this.colorGol = quien === 'yo' ? C.cian_neon : C.rosa_neon;
    if (quien === 'yo') {
      this.yoGoles++;
      audio.acierto();
      shake(0.12);
      this.aviso(msg ?? LOCUTOR_YO[Math.min(this.yoGoles, LOCUTOR_YO.length) - 1]);
    } else {
      this.elGoles++;
      audio.fallo();
      vibrar();
      shake(0.2);
      this.aviso(msg ?? LOCUTOR_EL[Math.min(this.elGoles, LOCUTOR_EL.length) - 1]);
    }
    this.compruebaFin();
  }

  aviso(txt) { this.msg = { txt, t: 1.6 }; }

  compruebaFin() {
    if (this.acabado) return;
    if (this.yoGoles >= META || this.elGoles >= META) { this.acabado = this.yoGoles >= META ? 'win' : 'lose'; return; }
    if (this.t < this.limite) return;
    if (this.yoGoles !== this.elGoles) { this.acabado = this.yoGoles > this.elGoles ? 'win' : 'lose'; return; }
    if (this.oro) { this.acabado = 'lose'; return; }
    this.oro = true;
    this.limite += ORO;
    this.aviso('GOL DE ORO');
  }

  /** La partida no se cierra con el SMS a medias. */
  result() { return this.acabado && this.smsResuelto ? this.acabado : null; }

  parar() {
    if (!this.smsResuelto && G.aviso?.sms) {
      G.aviso.sms.responder(null);
      G.aviso.sms.terminar();
      G.aviso = null;
    }
  }

  tarjeta(res) {
    if (res === 'lose') copa(1, 'copa');
    return {
      titulo: res === 'win' ? '¡GOLAZO!' : '¡TE HA MARCADO!',
      coste: 0,
      lineas: [
        '«21 a 20 clarísimo y sin discusión.»',
        res === 'win' ? 'Lo dice Gengar. El marcador dice otra cosa. Nadie discute.' : 'Quien pierde se bebe la del otro. Juanjo pide remake.',
      ],
      datos: [['JUANJO', this.yoGoles], ['GENGAR', this.elGoles]],
    };
  }

  // Dibujo ---------------------------------------------------------------------

  draw(ctx) {
    fondoTenue(ctx, '09-modernicolas-dentro', 3);
    const c = CAMPO;
    panel(ctx, c.x - 4, c.y - 4, c.w + 8, c.h + 8, { fill: C.madera, edge: C.madera_clara });
    rect(ctx, c.x, c.y, c.w, c.h, C.jager);
    outline(ctx, c.x + 4, c.y + 4, c.w - 8, c.h - 8, C.verde_ipa);
    rect(ctx, c.x + 4, CY, c.w - 8, 1, C.verde_ipa);
    outline(ctx, CX - 24, CY - 24, 48, 48, C.verde_ipa);
    // Las porterías, a lo ancho: aquí no hay palos que valgan.
    rect(ctx, c.x + 4, c.y, c.w - 8, 3, C.rosa_neon);
    rect(ctx, c.x + 4, c.y + c.h - 3, c.w - 8, 3, C.cian_neon);
    this.pintaMarcador(ctx);
    this.pintaGengar(ctx);
    this.pintaBarra(ctx, this.el, this.elW, EL_Y, C.rosa_neon);
    this.pintaBarra(ctx, this.yo, this.yoW, YO_Y, C.cian_neon);
    for (const b of this.bolas) this.pintaBola(ctx, b);
    if (this.chispa) this.pintaChispa(ctx);
    if (this.humo.on) this.pintaHumo(ctx);
    if (this.flashGol > 0) {
      dither(ctx, c.x, c.y, c.w, c.h, this.colorGol, this.flashGol > 0.2 ? 1 : 2);
      rect(ctx, c.x + 4, c.y, c.w - 8, 3, C.marfil);
      rect(ctx, c.x + 4, c.y + c.h - 3, c.w - 8, 3, C.marfil);
    }
    this.pintaPie(ctx);
    if (this.msg) this.pintaMsg(ctx);
    if (this.falso) this.pintaFalso(ctx);
    if (this.revela > 0) this.pintaRevelacion(ctx);
  }

  pintaMarcador(ctx) {
    const el = this.veintiuno > 0 ? 21 : this.elGoles;
    const x = CAMPO.x + 12;
    cifras(ctx, el, x, CY - 26, { escala: 3, color: this.veintiuno > 0 ? C.amarillo_mural : C.rosa_neon });
    cifras(ctx, this.yoGoles, x, CY + 12, { escala: 3, color: C.cian_neon });
    const q = Math.max(0, Math.ceil(this.limite - this.t));
    cifras(ctx, q, W - 8, 30, { escala: 2, color: q <= 10 ? C.rojo_extintor : C.marfil, align: 'right' });
    if (this.oro) text(ctx, 'GOL DE ORO', 8, 31, { font: 'label', color: C.amarillo_mural });
  }

  pintaGengar(ctx) {
    if (this.cruce) {
      // Cuando no está, queda su mancha.
      const f = this.cruce.t / 0.8;
      const x = Math.round(this.cruce.a + (this.cruce.de - this.cruce.a) * f);
      rect(ctx, x - 12, EL_Y + 12, 24, 8, C.carbon);
      rect(ctx, x - 8, EL_Y + 9, 16, 14, C.carbon);
      rect(ctx, x - 5, EL_Y + 13, 3, 2, C.rosa_neon);
      rect(ctx, x + 2, EL_Y + 13, 3, 2, C.rosa_neon);
      return;
    }
    drawSprite(ctx, '0094', 'Idle', DIR.abajo, this.t * 60, this.el.x, EL_Y + 2);
  }

  pintaBarra(ctx, b, w, y, color) {
    const x = Math.round(b.x - w / 2);
    rect(ctx, CAMPO.x, y + 3, CAMPO.w, 1, C.gris);       // la varilla
    rect(ctx, x, y, w, BARRA_H, C.carbon);
    rect(ctx, x + 1, y + 1, w - 2, BARRA_H - 2, b.g > 0 ? C.marfil : color);
    for (let i = 0; i < 3; i++) rect(ctx, x + 6 + i * ((w - 15) >> 1), y + 2, 3, 3, C.carbon);
  }

  enHumo(b) { return this.humo.on && b.y >= this.humo.y && b.y <= this.humo.y + this.humoH; }

  pintaBola(ctx, b) {
    if (this.enHumo(b)) return;
    if (b.espera > 0 && Math.floor(b.espera * 8) % 2) return;
    // Rastro: la velocidad se lee sin mirar el marcador.
    if (b.v > this.vel0 * 1.25) {
      const c = b.v > this.velMax * 0.85 ? C.amarillo_mural : C.verde_ipa;
      b.cola.forEach((q, i) => { if (i % 2 === 0) rect(ctx, Math.round(q.x - 1), Math.round(q.y - 1), 3, 3, c); });
    }
    const x = Math.round(b.x - LADO / 2), y = Math.round(b.y - LADO / 2);
    rect(ctx, x - 1, y, LADO + 2, LADO, C.carbon);
    rect(ctx, x, y - 1, LADO, LADO + 2, C.carbon);
    rect(ctx, x, y, LADO, LADO, C.marfil);
    rect(ctx, x + 1, y + 1, 2, 2, C.gris);
  }

  pintaChispa(ctx) {
    const { x, y, t, fuerte } = this.chispa;
    const l = Math.round((0.14 - t) * 70) + (fuerte ? 5 : 2);
    const c = fuerte ? C.amarillo_mural : C.marfil;
    const cx = Math.round(x);
    rect(ctx, cx - l - 2, y, 3, 2, c);
    rect(ctx, cx + l, y, 3, 2, c);
    rect(ctx, cx - (l >> 1) - 1, y - l, 2, 3, c);
    rect(ctx, cx + (l >> 1), y - l, 2, 3, c);
  }

  pintaHumo(ctx) {
    const { y } = this.humo;
    const h = this.humoH;
    dither(ctx, CAMPO.x, y, CAMPO.w, h, C.gris, 3);
    dither(ctx, CAMPO.x, y - 5, CAMPO.w, 5, C.gris, 1);
    dither(ctx, CAMPO.x, y + h, CAMPO.w, 5, C.gris, 1);
  }

  pintaPie(ctx) {
    if (!this.revelada && this.yoGoles === 0 && this.elGoles === 2) {
      button(ctx, REVELACION, 'REVELACIÓN', { edge: C.amarillo_mural });
      return;
    }
    text(ctx, 'ARRASTRA PARA MOVER LA BARRA', W >> 1, 448, { font: 'label', color: C.gris, align: 'center' });
  }

  pintaMsg(ctx) {
    const y = CY - 11;
    panel(ctx, 14, y, W - 28, 22, { fill: C.carbon, edge: C.amarillo_mural });
    text(ctx, this.msg.txt, W >> 1, y + 7, { font: 'label', color: C.amarillo_mural, align: 'center' });
  }

  /** Igual que el aviso de Laura. Gengar se ha tomado la molestia. */
  pintaFalso(ctx) {
    const { lineas } = this.falso;
    const t = G.data.night.movil;
    const r = { x: 4, y: FALSO_Y, w: W - 8, h: 21 + lineas.length * lineHeight('dialog') };
    panel(ctx, r.x, r.y, r.w, r.h, { fill: C.noche_clara, edge: C.cian_neon });
    text(ctx, t.laura, r.x + 7, r.y + 5, { font: 'label', color: C.cian_neon });
    cifras(ctx, S.hora, r.x + 44, r.y + 6, { color: C.cian_neon });
    text(ctx, t.contestar, r.x + r.w - 7, r.y + 5, { font: 'label', color: C.gris, align: 'right' });
    lineas.forEach((l, i) => text(ctx, l, r.x + 7, r.y + 15 + i * lineHeight('dialog'), { color: C.marfil }));
  }

  pintaRevelacion(ctx) {
    rect(ctx, 0, 25, W, 455, C.marfil);
    const lineas = wrap('Juanjo enseña algo a la mesa. Nunca habías visto algo tan brillante.', 'dialog', W - 44);
    lineas.forEach((l, i) => text(ctx, l, W >> 1, 170 + i * lineHeight('dialog'), { color: C.carbon, align: 'center' }));
    const y = 170 + lineas.length * lineHeight('dialog') + 14;
    wrap('La mesa entera llora y se abrazan ante semejante revelación.', 'dialog', W - 44)
      .forEach((l, i) => text(ctx, l, W >> 1, y + i * lineHeight('dialog'), { color: C.morado, align: 'center' }));
    text(ctx, 'UN GOL PARA JUANJO. Y SOSPECHAS.', W >> 1, y + 60, { font: 'label', color: C.gris, align: 'center' });
  }
}

// La noche: ejecuta la secuencia de data/night.json, paso a paso.
// Cada paso es una operación; las que esperan al jugador dejan una "actividad"
// ({update, draw, done}) en this.wait y la secuencia sigue cuando acaba.
import { C, img, bgPath } from './assets.js';
import { W, H, congelar } from './screen.js';
import { rect } from './draw.js';
import { input } from './input.js';
import { S, UMBRAL, guardar, coh, copa } from './state.js';
import { Dialog, Menu } from './dialog.js';
import { PHONE_TOQUE, drawHud } from './hud.js';
import { abrirMovil, escribirSms, notaHilo, recibirSms } from './phone.js';
import { sumarTejo } from './medidores.js';
import { G } from './game.js';
import { miga } from './diag.js';
import { Stage } from './stage.js';
import { preload } from './sprites.js';
import { audio } from './audio.js';
import { Cortinilla } from './cortinilla.js';

export function cumple(c) {
  if (!c) return true;
  if (c.flag && !S.flags[c.flag]) return false;
  if (c.noflag && S.flags[c.noflag]) return false;
  if (c.cohMenor !== undefined && !(S.coherencia < c.cohMenor)) return false;
  if (c.cohMayor !== undefined && !(S.coherencia >= c.cohMayor)) return false;
  if (c.tejosMin !== undefined && !(S.tejos >= c.tejosMin)) return false;
  if (c.tejosMenor !== undefined && !(S.tejos < c.tejosMenor)) return false;
  if (c.excusa && S.excusa?.id !== c.excusa) return false;
  if (c.dineroMin !== undefined && !(S.dinero >= c.dineroMin)) return false;
  if (c.dineroMenor !== undefined && !(S.dinero < c.dineroMenor)) return false;
  return true;
}

function linea(who, mood) {
  const a = G.data.cast[who];
  if (!a) return { nombre: who || null, retrato: null };
  return {
    nombre: a.nombre,
    retrato: a.retrato ? { actor: a.retrato, mood: mood || 'Normal' } : null,
    voz: a.voz,
  };
}

/** Entrada de translations.json lista para pintar; apunta el eco para los SMS. */
export function traduce(id, mood) {
  const t = G.data.translations[id];
  if (!t) throw new Error(`Traducción desconocida: ${id}`);
  const texto = S.coherencia < UMBRAL.loca && t.loca ? t.loca : t.juanjo;
  if (t.eco && t.eco !== S.eco) { S.eco2 = S.eco; S.eco = t.eco; }
  return { ...linea(t.quien, mood || t.mood), idioma: t.idioma, real: t.real, texto };
}

const ops = {
  bg(r, s) { r.bg = s.id; r.stage.clear(); r.capa = null; poneMusica(s.id, s.musica); r.guardaPaso(); },
  hora(r, s) { S.hora = s.v; },
  // Solo el Zorro y Gengar hablan entre ellos con `di` e `idioma`: va en su escritura.
  di(r, s) { r.wait = new Dialog({ ...linea(s.who, s.mood), idioma: s.idioma, glifos: !!s.idioma, texto: s.txt }); },
  // Traducción doble: lo dice un Pokémon y Juanjo entiende lo que quiere.
  tr(r, s) { r.wait = new Dialog(traduce(s.id, s.mood)); },
  choice(r, s) {
    const m = new Menu(s.opts.filter((o) => cumple(o.when)), { prompt: s.prompt, shuffle: s.shuffle });
    r.wait = m;
    m.after = () => {
      const o = m.picked;
      if (!o) return;
      if (o.set) Object.assign(S.flags, o.set);
      if (o.excusa) S.excusa = o.excusa;
      if (o.run) r.push(o.run);
    };
  },
  set(r, s) { Object.assign(S.flags, s.flags); },
  coh(r, s) { coh(s.v); },
  // {"t":"copa","tipo":"chupito","n":2}: tipo es copa, trago, chupito o jager; o "por":7.
  copa(r, s) { copa(s.n ?? 1, s.por ?? s.tipo ?? 'copa'); },
  // {"t":"tejo","who":"nerea","mood":"Happy","pie":"...","real":"...","foto":"sprite"}
  tejo(r, s) { sumarTejo(s); },
  // {"t":"pagar","v":15,"si":[...],"no":[...]}: si no llega, Manolo pone lo que falta.
  pagar(r, s) {
    const llega = S.dinero >= s.v;
    S.dinero = llega ? S.dinero - s.v : 0;
    if (!llega) S.flags.manoloPaga = true;
    const pasos = llega ? s.si : s.no;
    if (pasos) r.push(pasos);
  },
  sms(r, s) { S.hora = s.hora ?? S.hora; recibirSms(s.id); },
  // Los que escribe Juanjo por su cuenta: las 04:30 y "ya me acuesto".
  sms_propio(r, s) { S.hora = s.hora ?? S.hora; escribirSms(s.id); },
  // Lo que queda en el hilo cuando Laura no escribe.
  sms_nota(r, s) { S.hora = s.hora ?? S.hora; notaHilo(s.id); },
  // {"t":"movil","tab":"tejos"}: abre el móvil y la noche sigue al cerrarlo.
  movil(r, s) { abrirMovil(s.tab); },
  run(r, s) { if (cumple(s.if)) r.push(s.then || []); else r.push(s.else || []); },
  // {"t":"sonido","id":"puerta"}: un efecto de audio.js, en mitad de la historia.
  sonido(r, s) { audio[s.id]?.(s.v); },
};

const MAX_ESPERA = 1500;

/** El tema de un fondo, de `musica` en night.json. Un paso `bg` o una parada pueden pedir otro. */
function temaDe(bg, pide) {
  const m = pide !== undefined ? pide : G.data.night.musica[bg] ?? null;
  if (m === null || typeof m === 'string') return { tema: m, tapado: false };
  return { tema: m.tema ?? null, tapado: !!m.tapado };
}

function poneMusica(bg, pide) {
  const { tema, tapado } = temaDe(bg, pide);
  audio.musica(tema, { tapado });
}

export function registrarOps(extra) { Object.assign(ops, extra); }

export class NightRunner {
  /** suelto: { pasos } corre esos pasos sin parada ni guardado (repetir un final). */
  constructor(idx, suelto = null) {
    this.bg = '01-pasillo-laura';
    this.wait = null;
    this.frames = [];
    this.stage = new Stage();
    this.capa = null;       // lo que sigue vivo entre pasos (el coche)
    this.cortina = null;    // la cortinilla de entrada a una parada
    this.cargando = false;
    preload(S.album.map((e) => e.who).filter(Boolean));  // las fotos, al seguir partida
    this.suelto = !!suelto;
    if (suelto) { this.frames = [{ steps: suelto.pasos, i: 0 }]; return; }
    const n = Math.min(idx, G.data.night.paradas.length - 1);   // un guardado de otra versión
    const paso = n === S.stop ? S.paso : 0;
    this.enter(n, G.data.night.paradas[n].pasos[paso]?.t === 'bg' ? paso : 0);
  }

  /** desde: el `bg` de esta parada por el que se sigue, si se recargó a mitad. */
  enter(idx, desde = 0) {
    const stops = G.data.night.paradas;
    if (idx >= stops.length) { this.finished = true; return; }
    S.stop = idx;
    S.paso = desde;
    const stop = stops[idx];
    if (stop.hora && !desde) S.hora = stop.hora;
    if (stop.bg) this.bg = stop.bg;
    this.stage.clear();
    this.capa = null;
    guardar();
    this.frames = [{ steps: stop.pasos, i: desde }];
    miga('cargar');
    this.cargar(stop, stops[idx + 1]);
    miga('congelar');
    congelar();
    this.cortina = new Cortinilla({ hora: S.hora, nombre: stop.nombre });
    miga('música');
    poneMusica(this.bg, stop.musica);
    const luego = stops[idx + 1];
    miga('prepara tema');
    if (luego) audio.prepara(temaDe(luego.bg, luego.musica).tema);
    miga('enter hecho');
  }

  /** Espera a lo de esta parada, pero poco; lo de la siguiente se adelanta sin esperar. */
  cargar(stop, next) {
    preload(next?.carga);
    this.cargando = true;
    const fin = () => { this.cargando = false; };
    Promise.race([preload(stop.carga), new Promise((ok) => { setTimeout(ok, MAX_ESPERA); })]).then(fin);
  }

  push(steps) { this.frames.push({ steps, i: 0 }); }

  /**
   * Un `bg` en lo más alto de la parada deja la escena limpia y nada vivo debajo: es un punto
   * seguro para volver. Lo ya cobrado queda guardado con él, y se sigue por ahí: no se repite.
   */
  guardaPaso() {
    if (this.suelto || this.frames.length !== 1) return;
    S.paso = this.frames[0].i - 1;
    guardar();
  }

  pump() {
    while (!this.wait && !G.overlay && !this.finished && !this.cargando) {
      const fr = this.frames[this.frames.length - 1];
      if (!fr) { this.enter(S.stop + 1); continue; }
      if (fr.i >= fr.steps.length) { this.frames.pop(); continue; }
      const s = fr.steps[fr.i++];
      if (s.when && !cumple(s.when)) continue;
      // Un paso roto se salta: la noche sigue, que es lo que no puede parar.
      try {
        const op = ops[s.t];
        if (!op) throw new Error('paso desconocido');
        op(this, s);
      } catch (e) { console.error(`Paso ${s.t} saltado:`, e); }
    }
  }

  /** El móvil se abre con todo menos con los minijuegos. */
  movilPedido() {
    if (this.wait?.fullscreen || this.wait?.minijuego) return false;
    return input.tapIn(PHONE_TOQUE) || input.hit('KeyM');
  }

  /** La cortinilla nunca detiene la noche: debajo se monta la escena y un toque la quita. */
  bajoCortina(dt) {
    this.cortina.update(dt);
    this.stage.update(dt);
    this.capa?.update(dt);
    this.pump();
    if (this.cortina.done || G.overlay) this.cortina = null;
  }

  update(dt) {
    if (this.cortina) { this.bajoCortina(dt); return; }
    if (this.movilPedido()) {
      abrirMovil();
      input.consume();
      return;
    }
    this.stage.update(dt);
    this.capa?.update(dt);
    if (this.wait) {
      const w = this.wait;
      try {
        w.update(dt);
        if (w.done) {
          this.wait = null;
          w.after?.();
        }
      } catch (e) {
        console.error('Actividad cerrada por un error:', e);
        if (this.wait === w) this.wait = null;
      }
    }
    this.pump();
  }

  /** main.js la llama si la escena falla varios fotogramas seguidos: se quita lo que falla. */
  rescate() {
    this.wait = null;
    this.capa = null;
    this.cortina = null;
    this.stage.clear();
  }

  draw(ctx) {
    this.escena(ctx);
    this.cortina?.draw(ctx);
  }

  escena(ctx) {
    const pic = img(bgPath(this.bg));
    if (this.wait?.fullscreen) { this.wait.draw(ctx); return; }
    if (pic) ctx.drawImage(pic, 0, 0); else rect(ctx, 0, 0, W, H, C.noche);
    if (this.finished) { rect(ctx, 0, 0, W, H, C.noche); }
    this.capa?.draw(ctx);
    this.stage.draw(ctx);
    this.wait?.draw(ctx);
    if (!this.wait?.sinHud) drawHud(ctx);
  }
}

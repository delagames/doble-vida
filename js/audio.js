// El sonido del juego: música y efectos, con interruptores separados. Sin sonido, o sin Web Audio,
// todo se juega igual: nada del juego espera a un sonido, y los ritmos van con el reloj del juego.
//
//   audio.musica(id, { tapado })   tema de fondo (js/musica.js); null es silencio. Si ya suena, sigue.
//   audio.mandaMini(id)            un minijuego lo cambia mientras dura; undefined devuelve el de fondo.
//   audio.prepara(id)              lo adelanta, para que entre a tiempo.
//   audio.nivelTema(f)             volumen del tema de 0 a 1: el deslizador del coche.
//   audio.alternarMusica() · alternarEfectos() · musicaOn · efectosOn    guardados en localStorage
//   audio.toque() · opcion() · pasa() · acierto() · fallo() · tejo() · sms() · enviado() · bebida()
//   audio.puerta(coche) · golpe() · clic() · extintor() · grito() · foto() · voz(voz, n)
//   audio.compas(fuerte, retardo) · faro(cerca, pan) · canta(i, retardo) · mordisco() · entrada()
//   audio.pistaBaila(n, p, retardo) · pistaChupitos(n, p, retardo, fuerte)
//   new Pulso(bpm, { compas, alBatir, alPrever })  llama a update(dt) desde el minijuego
// `retardo` es cuánto falta para el golpe según el reloj del juego. Los ritmos se piden ANTICIPO
// segundos antes y a Web Audio se le da la hora exacta, descontando lo que tarda en salir el sonido:
// así no se nota el fotograma y no se acumula desfase, porque cada golpe sale del reloj del juego.
import { TEMAS, crearCadena, pistaBaila, pistaChupitos, renderTema, voces } from './musica.js';

const KEY_MUSICA = 'doble-vida.musica';
const KEY_EFECTOS = 'doble-vida.efectos';
const KEY_ANTIGUA = 'doble-vida.sonido';
const VOL_EFECTOS = 0.35;
const FUNDIDO = 0.5;
const MAX_BUCLES = 3;            // en memoria: cada uno ocupa unos 3 MB
export const ANTICIPO = 0.12;

let ctx = null;
let cadena = null;
let musicaOn = leer(KEY_MUSICA);
let efectosOn = leer(KEY_EFECTOS);
let fondo = { id: null, tapado: false };    // lo que pide la noche
let mandaMini;                              // lo que pide un minijuego; undefined si no pide nada
let sonando = null;                         // { id, fuente, ganancia, nivel }
let ajuste = 1;
const bucles = new Map();                   // id -> AudioBuffer, el más viejo primero
const pendientes = new Map();               // id -> promesa

function leer(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v !== '0';
    return localStorage.getItem(KEY_ANTIGUA) !== '0';    // el interruptor único de antes
  } catch { return true; }
}

function escribir(key, v) {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* se queda para esta sesión */ }
}

/** El móvil no deja sonar hasta que hay un gesto: el contexto se crea y se reanuda ahí. */
function desbloquear() {
  try {
    if (!ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      ctx = new A();
      cadena = crearCadena(ctx);
      cadena.efectos.gain.value = efectosOn ? VOL_EFECTOS : 0;
      ctx.onstatechange = sincroniza;
    }
    if (ctx.state !== 'running' && !document.hidden) ctx.resume()?.then?.(sincroniza, () => {});
  } catch { /* sin audio: se juega igual */ }
}

export function initAudio() {
  for (const ev of ['pointerdown', 'pointerup', 'keydown']) window.addEventListener(ev, desbloquear, true);
  document.addEventListener('visibilitychange', () => {
    try {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume()?.then?.(sincroniza, () => {});
    } catch { /* nada */ }
  });
}

// Música --------------------------------------------------------------------------------------

// En iPhone no se monta la música por código: se usan los mismos temas ya renderizados
// (tools/render_musica.mjs). Sin red o sin audio, simplemente no suena.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

async function desdeArchivo(id) {
  if (!ctx) return null;
  const datos = await (await fetch(`assets/audio/${id}.wav`)).arrayBuffer();
  return new Promise((ok, mal) => { ctx.decodeAudioData(datos, ok, mal); });
}

function conseguir(id) {
  if (bucles.has(id)) return Promise.resolve(bucles.get(id));
  if (!pendientes.has(id)) {
    const p = (IOS ? desdeArchivo(id) : renderTema(id)).then((b) => {
      pendientes.delete(id);
      if (!b) return null;
      bucles.delete(id);
      bucles.set(id, b);
      pendientes.delete(id);
      for (const k of bucles.keys()) {
        if (bucles.size <= MAX_BUCLES) break;
        if (k !== sonando?.id && k !== objetivo().id) bucles.delete(k);
      }
      return b;
    }).catch(() => { pendientes.delete(id); return null; });
    pendientes.set(id, p);
  }
  return pendientes.get(id);
}

const objetivo = () => (mandaMini !== undefined ? { id: mandaMini, tapado: false } : fondo);

function nivelDe(id) { return TEMAS[id].nivel * ajuste; }

function apaga() {
  if (!sonando) return;
  const { fuente, ganancia } = sonando;
  sonando = null;
  try {
    const t = ctx.currentTime;
    ganancia.gain.cancelScheduledValues(t);
    ganancia.gain.setTargetAtTime(0, t, FUNDIDO / 4);
    fuente.stop(t + FUNDIDO * 1.5);
    fuente.onended = () => { fuente.disconnect(); ganancia.disconnect(); };
  } catch { /* ya estaba parada */ }
}

function arranca(id, buffer) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(cadena.musica);
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.connect(g);
  const t = ctx.currentTime + 0.02;
  s.start(t);
  g.gain.setTargetAtTime(nivelDe(id), t, FUNDIDO / 4);
  sonando = { id, fuente: s, ganancia: g };
}

/** Deja sonando lo que toca, sea lo que sea que haya cambiado. */
function sincroniza() {
  try {
    if (!ctx || ctx.state !== 'running') return;
    const o = objetivo();
    const quiere = musicaOn ? o.id : null;
    cadena.tapa.frequency.setTargetAtTime(o.tapado ? 420 : 16000, ctx.currentTime, 0.08);
    if (sonando?.id === quiere) return;
    apaga();
    if (!quiere || !TEMAS[quiere]) return;
    conseguir(quiere).then((b) => {
      if (!b || !ctx || ctx.state !== 'running' || sonando?.id === quiere) return;
      if ((musicaOn ? objetivo().id : null) !== quiere) return;
      apaga();
      arranca(quiere, b);
    });
  } catch { /* la música no para la noche */ }
}

// Efectos -------------------------------------------------------------------------------------

const listo = () => !!ctx && efectosOn && ctx.state === 'running';
const mesa = () => ({ ctx, out: cadena.efectos });

/** Cuánto antes hay que darle la nota para que se oiga a su hora. */
function aHora(retardo) {
  const lat = ctx.outputLatency || ctx.baseLatency || 0;
  return ctx.currentTime + Math.max(0, retardo - Math.min(0.25, lat));
}

function nota(freq, dur, { tipo = 'square', vol = 0.5, hasta = null, retardo = 0, pan = 0, exacto = false } = {}) {
  if (!listo()) return;
  try {
    const t = exacto ? aHora(retardo) : ctx.currentTime + retardo;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(cadena.efectos);
    } else o.connect(g).connect(cadena.efectos);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* un efecto perdido no importa */ }
}

/** Una voz de js/musica.js como efecto. */
function voz(nombre, ...args) {
  if (!listo()) return;
  try { voces[nombre](mesa(), ctx.currentTime, ...args); } catch { /* no importa */ }
}

/** Los acompañamientos van con la música, no con los efectos. */
function pista(fn, n, p, retardo, extra) {
  try {
    if (!ctx || !musicaOn || ctx.state !== 'running') return;
    fn({ ctx, out: cadena.musica }, n, p, aHora(retardo), extra);
  } catch { /* el golpe sigue en los efectos */ }
}

export const audio = {
  get musicaOn() { return musicaOn; },
  get efectosOn() { return efectosOn; },
  get tema() { return sonando?.id ?? null; },
  get contexto() { return ctx; },
  get pedido() { return objetivo(); },

  alternarMusica() {
    musicaOn = !musicaOn;
    escribir(KEY_MUSICA, musicaOn);
    if (musicaOn) desbloquear();
    sincroniza();
    return musicaOn;
  },

  alternarEfectos() {
    efectosOn = !efectosOn;
    escribir(KEY_EFECTOS, efectosOn);
    if (cadena) cadena.efectos.gain.value = efectosOn ? VOL_EFECTOS : 0;
    if (efectosOn) { desbloquear(); audio.toque(); }
    return efectosOn;
  },

  musica(id, { tapado = false } = {}) {
    if (fondo.id === id && fondo.tapado === tapado) return;
    if (fondo.id !== id) ajuste = 1;
    fondo = { id, tapado };
    sincroniza();
  },

  mandaMini(id) { mandaMini = id; sincroniza(); },

  prepara(id) { if (musicaOn && id && TEMAS[id] && window.OfflineAudioContext) conseguir(id); },

  nivelTema(f) {
    ajuste = f / TEMAS.dubstep.nivel;
    if (sonando && ctx) sonando.ganancia.gain.setTargetAtTime(nivelDe(sonando.id), ctx.currentTime, 0.05);
  },

  toque() { nota(660, 0.05, { vol: 0.3 }); },
  opcion() { nota(520, 0.05, { vol: 0.3 }); nota(780, 0.08, { vol: 0.3, retardo: 0.05 }); },
  pasa() { nota(420, 0.025, { vol: 0.12, tipo: 'triangle' }); },
  acierto() { nota(660, 0.08); nota(990, 0.14, { retardo: 0.08 }); },
  fallo() { nota(220, 0.25, { tipo: 'sawtooth', hasta: 90 }); },
  /** Sube un corazón: tres notas que suenan más seguras que Juanjo. */
  tejo() { for (const [f, r] of [[659, 0], [880, 0.07], [1319, 0.14]]) nota(f, 0.12, { tipo: 'triangle', vol: 0.55, retardo: r }); },
  /** El SMS de Laura, dos pitidos de móvil viejo. */
  sms() { nota(1760, 0.09, { vol: 0.3 }); nota(1760, 0.11, { vol: 0.3, retardo: 0.14 }); },
  enviado() { nota(880, 0.05, { vol: 0.2, tipo: 'triangle', hasta: 1400 }); },
  bebida() {
    for (let i = 0; i < 3; i++) nota(170 + i * 45, 0.07, { tipo: 'sine', vol: 0.7, hasta: 300 + i * 60, retardo: i * 0.085 });
  },
  puerta(coche = false) {
    voz('bombo', coche ? 0.6 : 0.8, coche ? 70 : 55);
    nota(coche ? 900 : 300, 0.03, { tipo: 'square', vol: 0.15, retardo: 0.02 });
  },
  golpe() { voz('bombo', 0.7, 50); },
  clic() { nota(1400, 0.02, { vol: 0.25 }); nota(700, 0.02, { vol: 0.2, retardo: 0.03 }); },
  extintor() { voz('subida', 1.1, 1.2); },
  grito() { nota(330, 0.3, { tipo: 'sawtooth', vol: 0.3, hasta: 520 }); },
  foto() { voz('charles', 1.4); nota(1200, 0.03, { vol: 0.2, retardo: 0.06 }); },
  entrada() { nota(990, 0.06, { vol: 0.25, tipo: 'triangle' }); nota(1320, 0.1, { vol: 0.25, tipo: 'triangle', retardo: 0.06 }); },
  /** Cada personaje con su tono, muy bajo. Sube y baja un poco para que parezca que habla. */
  voz({ f, tipo = 'square' }, n) {
    const k = [1, 1.09, 0.94, 1.14, 1.03][n % 5];
    nota(f * k, 0.035, { tipo, vol: 0.09 });
  },

  compas(fuerte = false, retardo = 0) {
    nota(fuerte ? 180 : 120, 0.07, { tipo: 'triangle', vol: fuerte ? 0.9 : 0.6, hasta: 50, retardo, exacto: true });
  },
  /** La salida de ¡SAL!: cerca es 0 lejos y 1 encima; pan, -1 izquierda y 1 derecha. */
  faro(cerca, pan = 0) { nota(420 + cerca * 620, 0.09, { tipo: 'triangle', vol: 0.2 + cerca * 0.7, pan }); },
  /** Jynx canta: cada palabra de ¡BAILA! tiene su nota. */
  canta(i, retardo = 0) { nota([294, 349, 440, 523][i % 4], 0.16, { tipo: 'sine', vol: 0.8, retardo, exacto: true }); },
  /** Un mordisco de ¡ESQUIVA!. */
  mordisco() { nota(140, 0.12, { tipo: 'sawtooth', vol: 0.7, hasta: 70 }); nota(110, 0.1, { tipo: 'square', vol: 0.5, retardo: 0.09 }); },

  pistaBaila(n, p, retardo) { pista(pistaBaila, n, p, retardo); },
  pistaChupitos(n, p, retardo, fuerte) { pista(pistaChupitos, n, p, retardo, fuerte); },
};

/**
 * Pulso rítmico con el reloj del juego (dt), no con el del audio: si el audio está
 * bloqueado o apagado, el ritmo sigue siendo exacto. alBatir(n, fuerte) en cada golpe, ya en
 * hora; alPrever(n, retardo) un poco antes, para que el sonido salga en el momento justo.
 */
export class Pulso {
  constructor(bpm, { compas = 4, alBatir = null, alPrever = null } = {}) {
    this.bpm = bpm;
    this.compas = compas;
    this.alBatir = alBatir;
    this.alPrever = alPrever;
    this.t = 0;
    this.n = -1;
    this.previsto = -1;
  }

  get periodo() { return 60 / this.bpm; }

  /** Segundos hasta el golpe más cercano: sirve para puntuar un toque a ritmo. */
  get error() { return Math.min(this.t, this.periodo - this.t); }

  prever() {
    const n = this.n + 1;
    const falta = this.n < 0 ? 0 : this.periodo - this.t;
    if (this.previsto >= n || falta > ANTICIPO) return;
    this.previsto = n;
    audio.compas(n % this.compas === 0, Math.max(0, falta));
    this.alPrever?.(n, Math.max(0, falta));
  }

  update(dt) {
    this.t += dt;
    this.prever();
    if (this.n >= 0 && this.t < this.periodo) return;
    if (this.n >= 0) this.t -= this.periodo;
    this.n++;
    this.alBatir?.(this.n, this.n % this.compas === 0);
    this.prever();
  }
}

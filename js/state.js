// Estado de la noche y guardado por parada en localStorage.
import { audio } from './audio.js';

const KEY = 'doble-vida.partida.v1';
// Aparte de la partida: sobreviven a su borrado. `nocheTerminada` es la bandera que usará el
// Modo Buitre desde el título; `finales` son los finales ya vistos, para la pestaña de resultados.
const KEY_TERMINADA = 'doble-vida.nocheTerminada';
const KEY_FINALES = 'doble-vida.finales';

function pad(n) { return String(n).padStart(2, '0'); }

function horaBuitre() {
  // "El Buitre se fue a las [hora al azar]": entre que se duerme y el amanecer.
  const m = 3 * 60 + 30 + Math.floor(Math.random() * 200);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function nuevaPartida() {
  return {
    stop: 0,
    paso: 0,                          // dentro de la parada: el último `bg` guardado (night.js)
    hora: '23:00',
    coherencia: 100,
    tejos: 0,
    tejosParada: {},                  // tejos por clave de parada: ¡PIDE! II los anula
    album: [],                        // {who, mood, foto, hora, pie, real, parada, anulado}
    hilo: [],
    audios: [],
    excusa: null,
    eco: null,                        // lo último que Juanjo ha traducido con `eco`
    eco2: null,                       // el anterior, para que las dos malas no repitan
    dinero: 30,
    pagado: 0,                        // lo que costó el chino: {pagado} en los textos
    minisVistos: {},                  // minijuegos ya explicados
    palabras: {},                     // palabras de ¡PIDE! ya reveladas ("manolo.ipa")
    copas: 0,
    bajadas: 0,
    tragos: 0,
    fallos: 0,                        // minijuegos fallados
    coche: [null, null, null, null],  // delante y tres detrás; null es asiento vacío
    // Sospecha: lo que Laura va atando. No se enseña nunca. Mala +1, chula +0,5 (+1 desde
    // TEJOS_MUY_CHULO), sin responder +0,5, SMS de las 04:30 +1. Decide el final: elegirFinal().
    sospecha: 0,
    smsEnviados: 0,
    smsSinResponder: 0,
    smsDeMas: 0,                      // "SMS que no debiste mandar" (las 04:30)
    respuestas: {},                   // id de SMS -> neutra | chula | mala | nada | propio
    flags: {},
    buitreHora: horaBuitre(),
    final: null,                      // 'cuela' | 'nocuela' | 'doble', al llegar a casa
  };
}

export let S = nuevaPartida();

export function reiniciar() { S = nuevaPartida(); return S; }

export function guardar() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sin almacenamiento: se juega igual */ }
}

/**
 * Una partida guardada solo vale si tiene la forma de la de ahora. Los campos que falten
 * (versión vieja) se rellenan al cargar; lo que tenga otro tipo se descarta entera: mejor
 * una noche nueva que un SEGUIR que deja la pantalla parada.
 */
function sana(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (!Number.isInteger(p.stop) || p.stop < 0) return false;
  for (const [k, v] of Object.entries(nuevaPartida())) {
    const g = p[k];
    if (g === undefined || v === null) continue;
    if (typeof g !== typeof v || g === null || Array.isArray(g) !== Array.isArray(v)) return false;
    if (typeof v === 'number' && !Number.isFinite(g)) return false;
  }
  const lista = (a) => a === undefined || a.every((e) => e && typeof e === 'object');
  return lista(p.album) && lista(p.hilo) && lista(p.audios);
}

export function hayPartida() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return sana(p) ? p : null;
  } catch { return null; }
}

export function cargar() {
  const p = hayPartida();
  if (p) S = { ...nuevaPartida(), ...p };
  return S;
}

export function borrar() {
  try { localStorage.removeItem(KEY); } catch { /* nada que borrar */ }
}

/** La bandera del Modo Buitre: alguien ha visto ya un final en este navegador. */
export function nocheTerminada() {
  try { return localStorage.getItem(KEY_TERMINADA) === '1'; } catch { return false; }
}

export function finalesVistos() {
  try {
    const f = JSON.parse(localStorage.getItem(KEY_FINALES));
    return Array.isArray(f) ? f : [];
  } catch { return []; }
}

/** Se acabó la noche: borra la partida y deja la constancia, que no se borra. */
export function terminarNoche(final) {
  borrar();
  try {
    localStorage.setItem(KEY_TERMINADA, '1');
    localStorage.setItem(KEY_FINALES, JSON.stringify([...new Set([...finalesVistos(), final])]));
  } catch { /* sin almacenamiento: se juega igual */ }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Por debajo de cada valor de coherencia se activa ese efecto. */
export const UMBRAL = { inclina: 70, baraja: 60, loca: 50, disfraz: 50, baila: 30 };

/** Lo que cuesta cada cosa en coherencia. */
export const COSTE = { copa: 2, trago: 3, chupito: 3, jager: 5, fallo: 4 };

/** Por debajo de esto, la camarera de Modernícolas no sirve a Juanjo (ver DECISIONES.md). */
export const DINERO_BARRA = 6;

// Final Doble vida. El máximo posible al salir de Onda Pasadena es 11 (Nerea 1, Roserade 1,
// camarera 3, ticket 1, amigas 2, Sandrita 1, la silueta de la nube 1, Jynx 1): 10 pide casi todos.
export const TEJOS_DOBLE_VIDA = 10;

// Cuela o No cuela. Ver elegirFinal() y DECISIONES.md.
export const CREDIBILIDAD_CUELA = 35;

export const TEJOS_CHULO = 4;       // desde aquí la respuesta buena lleva coletilla
export const TEJOS_MUY_CHULO = 7;   // y desde aquí Laura la nota el doble

/** Lo que le queda a Juanjo de creíble: coherencia menos lo que Laura ha ido atando. */
export function credibilidad(s = S) {
  return s.coherencia - 12 * s.sospecha - 3 * Math.max(0, s.tejos - 3);
}

/** Los tres finales de DISEÑO, 6. Los tejos máximos mandan sobre todo: Juanjo lo cuenta. */
export function elegirFinal(s = S) {
  if (s.tejos >= TEJOS_DOBLE_VIDA) return 'doble';
  return credibilidad(s) >= CREDIBILIDAD_CUELA ? 'cuela' : 'nocuela';
}

export function coh(delta) { S.coherencia = clamp(S.coherencia + delta, 0, 100); }

/** Cuenta en resultados y baja la coherencia. `por`: 'copa', 'chupito', 'jager'… o un número. */
export function copa(n = 1, por = 'copa') {
  S.copas += n;
  coh(-n * (COSTE[por] ?? por));
  if (n > 0) audio.bebida();
}

/** 0 sereno, 1 sin coherencia: el parámetro común de todos los minijuegos. */
export function ebriedad(c = S.coherencia) { return clamp((100 - c) / 100, 0, 1); }

/** Interpola un parámetro de minijuego: `sereno` a coherencia 100, `borracho` a 0. */
export function endurece(sereno, borracho) { return sereno + (borracho - sereno) * ebriedad(); }

/** Sustituye {excusa}, {eco}, {buitre}… en los textos de los JSON. */
export function rellenar(str) {
  return String(str)
    .replaceAll('{excusa}', S.excusa?.frase ?? 'la partida')
    .replaceAll('{eco}', S.eco ?? 'lo de antes')
    .replaceAll('{eco2}', S.eco2 ?? S.eco ?? 'lo de antes')
    .replaceAll('{buitre}', S.buitreHora)
    .replaceAll('{dinero}', S.dinero)
    .replaceAll('{pagado}', S.pagado)
    .replaceAll('{tejos}', S.tejos)
    .replaceAll('{fallos}', S.fallos)
    .replaceAll('{copas}', S.copas)
    .replaceAll('{bajadas}', S.bajadas)
    .replaceAll('{tragos}', S.tragos);
}

export function barajar(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// Lo que hace del juego una app: service worker, pantalla encendida, pantalla completa y el consejo
// de iPhone. Nada de esto es imprescindible. Por http en la wifi no hay service worker ni Wake Lock
// (solo funcionan en localhost o HTTPS) y el juego va igual, sin más que comprobarlo aquí.
const KEY_CONSEJO = 'doble-vida.consejoIphone';

const nativa = () => window.matchMedia?.('(display-mode: fullscreen)').matches
  || window.matchMedia?.('(display-mode: standalone)').matches
  || navigator.standalone === true;

const esIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const esAndroid = () => /Android/.test(navigator.userAgent);

let cerrojo = null;

/** Que no se apague la pantalla mientras se juega. El sistema lo suelta al ocultar la pestaña. */
async function pantallaEncendida() {
  if (cerrojo || document.hidden || !navigator.wakeLock) return;
  try {
    cerrojo = await navigator.wakeLock.request('screen');
    cerrojo.addEventListener('release', () => { cerrojo = null; });
  } catch { /* poca batería o sin permiso: se juega igual */ }
}

export function initPWA() {
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin caché: pide por red */ });
  }
  window.addEventListener('pointerup', pantallaEncendida, true);
  document.addEventListener('visibilitychange', pantallaEncendida);
}

/** En Android, dentro del navegador, se pide al empezar la noche: hace falta un toque reciente. */
export function pantallaCompleta() {
  if (!esAndroid() || nativa() || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => { /* otra vez será */ });
}

/** En iPhone no hay aviso de instalar: se sugiere una vez, en el título, hasta que se quite. */
export function hayConsejoIphone() {
  try { return esIphone() && !nativa() && !localStorage.getItem(KEY_CONSEJO); } catch { return false; }
}

export function cerrarConsejoIphone() {
  try { localStorage.setItem(KEY_CONSEJO, '1'); } catch { /* volverá a salir */ }
}

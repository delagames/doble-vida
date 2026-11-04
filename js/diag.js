// Mientras se prueba en local o en la wifi, un error se ve en la pantalla: en un móvil no hay consola.
const PUBLICADO = /github\.io$/.test(location.hostname);
let caja = null;

export function avisaError(e) {
  if (PUBLICADO && !DIAG) return;
  if (!caja) {
    caja = document.createElement('pre');
    caja.style.cssText = 'position:fixed;left:0;right:0;top:0;margin:0;padding:6px;z-index:9;max-height:45%;overflow:auto;'
      + 'background:#15111F;color:#FF46A0;font:12px monospace;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(caja);
  }
  const txt = `${e?.message ?? e}\n${String(e?.stack ?? '').split('\n').slice(0, 4).join('\n')}`;
  if (!caja.textContent.includes(txt)) caja.textContent += `${txt}\n\n`;
}

window.addEventListener('error', (ev) => avisaError(ev.error ?? ev.message));
window.addEventListener('unhandledrejection', (ev) => avisaError(ev.reason));

// ?diag: rastro de lo que hace el juego, guardado al momento para que sobreviva a un cierre de pestaña.
const DIAG = new URLSearchParams(location.search).has('diag');
const ACTIVO = DIAG;
const visible = DIAG;
const CLAVE = 'doble-vida.migas';
let migas = [];
let panel = null;

function pinta(estado = '') {
  if (!visible) { if (panel) panel.style.display = 'none'; return; }
  if (!panel) {
    panel = document.createElement('pre');
    panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;margin:0;padding:6px;z-index:9;max-height:55%;overflow:hidden;'
      + 'background:#15111F;color:#4FD8E8;font:12px monospace;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(panel);
  }
  panel.style.display = 'block';
  panel.textContent = `${estado}\n${migas.join('\n')}`;
}

export function miga(t) {
  if (!ACTIVO) return;
  migas.push(`${(performance.now() / 1000).toFixed(1)} ${t}`);
  migas = migas.slice(-14);
  try { localStorage.setItem(CLAVE, JSON.stringify(migas)); } catch { /* sin almacenamiento */ }
  pinta();
}

export function vigilaDiag(estado) {
  if (!ACTIVO) return;
  try { migas = (JSON.parse(localStorage.getItem(CLAVE)) ?? []).slice(-6).map((m) => `ANTES ${m}`); } catch { migas = []; }
  miga('página cargada');
  setInterval(() => pinta(estado()), 500);
}

// Arranque y bucle principal.
import { loadCore, loadJSON } from './assets.js';
import { ctx, fit, present } from './screen.js';
import { atlasTexto } from './text.js';
import { cargarGlifos } from './glifos.js';
import { initPWA } from './pwa.js';
import { initInput, input } from './input.js';
import { loadPortraits, setManifest } from './sprites.js';
import { avisaError, vigilaDiag } from './diag.js';
import { G } from './game.js';
import * as state from './state.js';
import { NightRunner } from './night.js';
import { Title } from './title.js';
import * as movil from './phone.js';
import * as medidores from './medidores.js';
import './escena.js';
import './amanecer.js';
import { Resultados } from './final.js';
import { registrarLogros } from './balance.js';
import { Minijuego, Banco } from './minigame.js';
import { audio, initAudio } from './audio.js';

const ERRORES_MAX = 20;    // fotogramas seguidos con error antes de quitar lo que falla
const JUANJO_MOODS = ['Normal', 'Happy', 'Surprised', 'Angry', 'Dizzy', 'Sad', 'Worried'];

async function boot() {
  fit();
  window.addEventListener('resize', fit);
  // Al girar, algunos móviles dan las medidas nuevas un poco después.
  window.addEventListener('orientationchange', () => { fit(); setTimeout(fit, 350); });
  initInput();
  initAudio();
  initPWA();
  await loadCore();
  await cargarGlifos();
  const [night, translations, sms, cast, audios, mapa, sprites, final] = await Promise.all(
    ['night', 'translations', 'sms', 'cast', 'audios', 'mapa', 'sprites', 'final'].map((n) => loadJSON(`data/${n}.json`)),
  );
  // Sin la tabla de ¡PIDE! el juego arranca igual: el minijuego se cierra solo y la noche sigue.
  const pedidos = await loadJSON('data/pedidos.json').catch(() => null);
  G.data = { night, translations, sms, cast, audios, mapa, pedidos, final };
  setManifest(sprites);
  await loadPortraits('juanjo', JUANJO_MOODS);
  G.setScene(new Title());

  // Solo en local: ?debug expone window.DV; ?debug&stop=N salta a esa parada (para probar).
  const q = new URLSearchParams(location.search);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && q.has('debug')) {
    window.DV = {
      G, state, input, movil, medidores, audio, medida: { atlasTexto, muestras: new Float32Array(4096), n: 0 },
      get S() { return state.S; },
      ir: (n) => { G.sober = false; G.setScene(new NightRunner(n)); },
      // DV.mini('regatea', { coh: 25, params: {...} }): minijuego suelto, sin tocar la noche.
      mini: (id, { coh, params } = {}) => {
        if (coh !== undefined) state.S.coherencia = coh;
        G.sober = false;
        G.setScene(new Banco(id, params));
      },
      // DV.resultados('cuela'): la pantalla de resultados con el estado de ahora.
      resultados: (f) => { G.setScene(new Resultados(f, registrarLogros(f))); },
      // DV.resultado('win'|'lose'): acaba el minijuego en curso con ese resultado.
      resultado: (res) => Minijuego.activo?.forzar(res),
      get activo() { return Minijuego.activo; },
      get ultimo() { return Minijuego.ultimo; },
    };
    if (q.has('stop')) window.DV.ir(Number(q.get('stop')));
  }

  let last = performance.now();
  let errores = 0;
  let fotogramas = 0;
  vigilaDiag(() => `escena ${G.scene?.constructor?.name} móvil ${!!G.overlay} t ${G.time.toFixed(1)} f ${fotogramas}
cargando ${G.scene?.cargando} espera ${G.scene?.wait?.constructor?.name} cortina ${!!G.scene?.cortina}
${innerWidth}x${innerHeight} dpr ${devicePixelRatio} lienzo ${document.getElementById('game').width}`);
  const frame = (now) => {
    const t0 = performance.now();
    fotogramas++;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // Un error no puede congelar la pantalla: el bucle sigue y, si insiste, se quita lo que falla.
    try {
      G.update(dt);
      G.draw(ctx);
      present(G.time, dt);
      errores = 0;
    } catch (e) {
      if (errores++ === 0) { console.error('Fotograma fallido:', e); avisaError(e); }
      if (errores >= ERRORES_MAX) { errores = 0; G.overlay = null; G.aviso = null; G.efectos = []; G.scene?.rescate?.(); }
    }
    input.endFrame();
    const m = window.DV?.medida;
    if (m) m.muestras[m.n++ % 4096] = performance.now() - t0;   // ?debug: lo que cuesta un fotograma
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Sin datos (primera vez, sin red) la pantalla no se queda negra: lo dice, y un toque reintenta.
boot().catch((e) => {
  console.error(e);
  const lienzo = document.getElementById('game');
  const c = lienzo.getContext('2d');
  c.fillStyle = '#ffffff';
  c.font = '14px sans-serif';
  c.textAlign = 'center';
  c.fillText('No se ha podido cargar el juego.', 135, 230);
  c.fillText('Comprueba la conexión y toca aquí.', 135, 250);
  lienzo.addEventListener('pointerup', () => location.reload());
});

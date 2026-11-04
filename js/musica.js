// La música, hecha por código con Web Audio y sin archivos. Cada tema se renderiza una vez con un
// OfflineAudioContext a un bucle corto, y luego solo se reproduce: en el móvil no cuesta nada por
// fotograma y lo que se analiza en las pruebas (tools/oye.mjs) es exactamente lo que suena.
//
//   renderTema(id)          promesa de un AudioBuffer en bucle perfecto. Se monta por compases.
//   TEMAS                   dubstep, calle, bar, modernicolas, onda, hotel, malagueta, amanecer.
//   crearCadena(ctx)        buses de música y efectos, con el limitador.
//   pistaBaila/pistaChupitos  lo que acompaña a ¡BAILA! y ¡AL RITMO!: un golpe cada vez, porque ahí
//                           manda el reloj del juego y un bucle se iría desfasando.
//   voces                   los instrumentos, que audio.js usa también para los efectos.
// Este archivo no toca el DOM ni el estado del juego: funciona con cualquier contexto de audio.

const SR = 24000;           // de sobra en el altavoz de un móvil, y ocupa la mitad que a 44,1 kHz
const COLA = 3;             // segundos que se renderizan de más y se pliegan sobre el principio
const PICO = 0.89;          // cada bucle se normaliza a este pico

const mtof = (n) => 440 * 2 ** ((n - 69) / 12);

/** Azar con semilla: el mismo tema suena siempre igual. */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ruidos = new WeakMap();

function ruido(ctx) {
  let b = ruidos.get(ctx);
  if (b) return b;
  const n = Math.floor(ctx.sampleRate * 2);
  b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0), r = azar(7);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  ruidos.set(ctx, b);
  return b;
}

/** Ganancia con ataque y caída: la envolvente de casi todo. */
function env(ctx, t, ataque, pico, caida) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(pico, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + caida);
  return g;
}

function filtro(ctx, tipo, f, q = 0.7) {
  const n = ctx.createBiquadFilter();
  n.type = tipo;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

function osc(ctx, tipo, f, t, fin) {
  const o = ctx.createOscillator();
  o.type = tipo;
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(fin);
  return o;
}

function fuenteRuido(ctx, t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = ruido(ctx);
  s.loop = true;
  s.start(t, (t * 13.7) % 1.9);
  s.stop(t + dur);
  return s;
}

function paneado(ctx, pan, out) {
  if (!pan || !ctx.createStereoPanner) return out;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  return p;
}

function curvaSaturada(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return c;
}

// Voces. `o` es { ctx, out }. Todas se apagan solas -----------------------------------------

export const voces = {
  bombo(o, t, v = 1, grave = 44) {
    const { ctx } = o;
    const g = env(ctx, t, 0.002, v, 0.3);
    const s = osc(ctx, 'sine', 150, t, t + 0.36);
    s.frequency.exponentialRampToValueAtTime(grave, t + 0.09);
    s.connect(g).connect(o.out);
    // El golpe de arriba: el altavoz de un móvil no da 50 Hz, y sin esto el bombo no se oiría.
    const c = env(ctx, t, 0.001, v * 0.5, 0.05);
    const k = osc(ctx, 'triangle', 320, t, t + 0.08);
    k.frequency.exponentialRampToValueAtTime(130, t + 0.05);
    k.connect(c).connect(o.out);
  },

  caja(o, t, v = 1, larga = 0.17) {
    const { ctx } = o;
    const g = env(ctx, t, 0.001, v * 0.8, larga);
    fuenteRuido(ctx, t, larga + 0.05).connect(filtro(ctx, 'bandpass', 2100, 0.6)).connect(g).connect(o.out);
    const c = env(ctx, t, 0.001, v * 0.5, 0.1);
    osc(ctx, 'triangle', 196, t, t + 0.14).connect(c).connect(o.out);
  },

  palmas(o, t, v = 1) {
    const { ctx } = o;
    for (const d of [0, 0.011, 0.023]) {
      const g = env(ctx, t + d, 0.001, v * 0.6, d === 0.023 ? 0.15 : 0.03);
      fuenteRuido(ctx, t + d, 0.2).connect(filtro(ctx, 'bandpass', 1300, 1)).connect(g).connect(o.out);
    }
  },

  charles(o, t, v = 1, abierto = false, pan = 0) {
    const { ctx } = o;
    const dur = abierto ? 0.2 : 0.04;
    const g = env(ctx, t, 0.001, v * 0.6, dur);
    fuenteRuido(ctx, t, dur + 0.03).connect(filtro(ctx, 'highpass', 7000)).connect(g).connect(paneado(ctx, pan, o.out));
  },

  bajo(o, t, f, dur, v = 1, tipo = 'sawtooth', corte = 500) {
    const { ctx } = o;
    const g = env(ctx, t, 0.006, v * 0.7, dur);
    osc(ctx, tipo, f, t, t + dur + 0.05).connect(filtro(ctx, 'lowpass', corte, 1.2)).connect(g).connect(o.out);
  },

  /** Cuerda punteada: un triángulo con un poco de sierra que se apaga enseguida. */
  punteo(o, t, f, dur, v = 1, pan = 0, corte = 2400) {
    const { ctx } = o;
    const dest = paneado(ctx, pan, o.eco ?? o.out);
    const g = env(ctx, t, 0.003, v * 0.5, dur);
    const lp = filtro(ctx, 'lowpass', corte);
    lp.frequency.setValueAtTime(corte, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, corte * 0.3), t + dur);
    osc(ctx, 'triangle', f, t, t + dur + 0.05).connect(lp);
    const s = ctx.createGain();
    s.gain.value = 0.25;
    osc(ctx, 'sawtooth', f * 1.003, t, t + dur + 0.05).connect(s).connect(lp);
    lp.connect(g).connect(dest);
  },

  /** Piano eléctrico: frecuencia modulada con una sinusoide que se apaga antes que la nota. */
  epiano(o, t, f, dur, v = 1, pan = 0) {
    const { ctx } = o;
    const g = env(ctx, t, 0.004, v * 0.45, dur);
    const c = osc(ctx, 'sine', f, t, t + dur + 0.05);
    const m = osc(ctx, 'sine', f * 2, t, t + dur + 0.05);
    const prof = ctx.createGain();
    prof.gain.setValueAtTime(f * 1.4, t);
    prof.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.6);
    m.connect(prof).connect(c.frequency);
    c.connect(g).connect(paneado(ctx, pan, o.eco ?? o.out));
  },

  campana(o, t, f, dur, v = 1, pan = 0) {
    const { ctx } = o;
    const dest = paneado(ctx, pan, o.eco ?? o.out);
    const g = env(ctx, t, 0.003, v * 0.34, dur);
    osc(ctx, 'sine', f, t, t + dur + 0.05).connect(g).connect(dest);
    const h = env(ctx, t, 0.002, v * 0.1, dur * 0.35);
    osc(ctx, 'sine', f * 3.01, t, t + dur + 0.05).connect(h).connect(dest);
  },

  /** Colchón: dos sierras desafinadas en cada nota, con ataque y salida lentos. */
  colchon(o, t, notas, dur, v = 1, corte = 900) {
    const { ctx } = o;
    const entra = Math.min(1.2, dur * 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.1, t + entra);
    g.gain.setValueAtTime(v * 0.1, t + dur - entra);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = filtro(ctx, 'lowpass', corte, 0.5);
    for (const n of notas) {
      osc(ctx, 'sawtooth', mtof(n) * 0.997, t, t + dur + 0.02).connect(lp);
      osc(ctx, 'sawtooth', mtof(n) * 1.003, t, t + dur + 0.02).connect(lp);
    }
    lp.connect(g).connect(o.out);
  },

  /** Acorde de discoteca: sierras gordas y cortas. */
  golpeAcorde(o, t, notas, dur, v = 1, corte = 1800) {
    const { ctx } = o;
    const g = env(ctx, t, 0.004, v * 0.14, dur);
    const lp = filtro(ctx, 'lowpass', corte, 1);
    lp.frequency.setValueAtTime(corte, t);
    lp.frequency.exponentialRampToValueAtTime(corte * 0.35, t + dur);
    for (const n of notas) {
      for (const d of [0.994, 1, 1.006]) osc(ctx, 'sawtooth', mtof(n) * d, t, t + dur + 0.05).connect(lp);
    }
    lp.connect(g).connect(o.eco ?? o.out);
  },

  /** El wobble de verdad: filtro resonante barrido por un LFO, y todo saturado. */
  wobble(o, t, f, dur, hz, v = 1) {
    const { ctx } = o;
    const fin = t + dur + 0.05;
    const lp = filtro(ctx, 'lowpass', 1150, 13);
    const lp2 = filtro(ctx, 'lowpass', 2600, 1.5);
    const lfo = osc(ctx, 'sine', hz, t, fin);
    const prof = ctx.createGain();
    prof.gain.value = 1050;
    lfo.connect(prof);
    prof.connect(lp.frequency);
    osc(ctx, 'sawtooth', f, t, fin).connect(lp);
    osc(ctx, 'sawtooth', f * 1.012, t, fin).connect(lp);
    const sub = ctx.createGain();
    sub.gain.value = 0.4;
    osc(ctx, 'square', f / 2, t, fin).connect(sub).connect(lp);
    const sat = ctx.createWaveShaper();
    sat.curve = curvaSaturada(5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.34, t + 0.008);
    g.gain.setValueAtTime(v * 0.34, t + dur - 0.02);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(lp2).connect(sat).connect(g).connect(o.out);
  },

  /** Cae en picado: el láser que todo dubstep malo lleva de serie. */
  laser(o, t, v = 1) {
    const { ctx } = o;
    const g = env(ctx, t, 0.002, v * 0.2, 0.16);
    const s = osc(ctx, 'square', 2300, t, t + 0.2);
    s.frequency.exponentialRampToValueAtTime(170, t + 0.16);
    s.connect(g).connect(o.eco ?? o.out);
  },

  subida(o, t, dur, v = 1) {
    const { ctx } = o;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.26, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    const hp = filtro(ctx, 'bandpass', 400, 1.5);
    hp.frequency.setValueAtTime(400, t);
    hp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    fuenteRuido(ctx, t, dur + 0.05).connect(hp).connect(g).connect(o.out);
  },

  /** Ruido de fondo que sube y baja: mar, murmullo o tráfico. Da `olas` vueltas en `dur`. */
  fondo(o, t, dur, olas, v, f, tipo = 'lowpass', q = 0.5) {
    const { ctx } = o;
    const g = ctx.createGain();
    g.gain.value = v * 0.62;
    const lfo = osc(ctx, 'sine', olas / dur, t, t + dur + 0.05);
    const prof = ctx.createGain();
    prof.gain.value = v * 0.38;
    lfo.connect(prof).connect(g.gain);
    fuenteRuido(ctx, t, dur + 0.05).connect(filtro(ctx, tipo, f, q)).connect(g).connect(o.out);
  },
};

const V = voces;

// Eco sencillo, para que no suene todo seco. Devuelve el nodo por el que entra lo que lleva eco.
function eco(ctx, out, tiempo, realimenta, mezcla) {
  const entra = ctx.createGain();
  const d = ctx.createDelay(1.5);
  d.delayTime.value = tiempo;
  const fb = ctx.createGain();
  fb.gain.value = realimenta;
  const w = ctx.createGain();
  w.gain.value = mezcla;
  const lp = filtro(ctx, 'lowpass', 2600);
  entra.connect(out);
  entra.connect(d);
  d.connect(lp);
  lp.connect(fb);
  fb.connect(d);
  lp.connect(w);
  w.connect(out);
  return entra;
}

// Los temas. `pinta(o, b)` programa las notas del bucle, un compás por `yield`: b.t(compás, paso) da el segundo.
// `nivel` es lo fuerte que suena en el juego; el dubstep va muy por encima a propósito.

export const TEMAS = {
  // Dubstep malo a todo volumen: medio tiempo a 140, un wobble que cambia de velocidad sin motivo,
  // láseres y una nota que no pega en el tercer compás. Es un chiste y debe parecerlo.
  dubstep: {
    bpm: 140, compases: 8, nivel: 0.74, gordo: true,
    * pinta(o, b) {
      const q = b.bpm / 60;     // golpes por segundo
      const riffs = [
        [[0, 4, 50, 2], [4, 4, 50, 4], [8, 8, 53, 3]],
        [[0, 6, 50, 2], [6, 2, 62, 8], [8, 8, 48, 6]],
        [[0, 4, 50, 2], [4, 4, 56, 4], [8, 8, 55, 3]],
        [[0, 2, 50, 8], [2, 2, 50, 8], [4, 2, 62, 8], [6, 2, 50, 8], [8, 4, 53, 1], [12, 4, 50, 12]],
      ];
      for (let c = 0; c < b.compases; c++) {
        for (const [p, l, n, div] of riffs[c % 4]) V.wobble(o, b.t(c, p), mtof(n), l * b.paso, q * div / 2, 1);
        V.bombo(o, b.t(c, 0), 1.1, 40);
        if (c % 2) V.bombo(o, b.t(c, 6), 0.9, 40);
        V.caja(o, b.t(c, 8), 1.2, 0.22);
        for (let p = 0; p < 16; p += 2) V.charles(o, b.t(c, p), p % 4 ? 0.5 : 0.9, false, p % 4 ? 0.3 : -0.3);
        if (c % 4 === 3) { V.laser(o, b.t(c, 10), 1); V.laser(o, b.t(c, 13), 1); V.caja(o, b.t(c, 14), 0.8); V.caja(o, b.t(c, 15), 1); }
        if (c === 1 || c === 5) V.laser(o, b.t(c, 14), 0.8);
        yield;
      }
      V.subida(o, b.t(6, 0), b.t(8, 0) - b.t(6, 0), 0.9);
    },
  },

  // Calle y noche: piano eléctrico lejano, un bajo que apenas se oye y el tráfico al fondo.
  calle: {
    bpm: 76, compases: 8, nivel: 0.36,
    * pinta(o, b) {
      const acordes = [[50, 60, 65, 69, 72], [46, 58, 62, 65, 69], [43, 58, 62, 65, 70], [45, 57, 61, 64, 67]];
      const m = { ...o, eco: eco(o.ctx, o.out, b.paso * 3, 0.3, 0.3) };
      const r = azar(3);
      for (let c = 0; c < b.compases; c++) {
        const [raiz, ...notas] = acordes[c % 4];
        V.bajo(o, b.t(c, 0), mtof(raiz), b.paso * 7, 0.42, 'triangle', 420);
        V.bajo(o, b.t(c, 10), mtof(raiz), b.paso * 4, 0.3, 'triangle', 420);
        notas.forEach((n, i) => V.epiano(m, b.t(c, 0) + i * 0.02, mtof(n), 1.8, 0.8, i % 2 ? 0.2 : -0.2));
        const eco2 = notas[(c * 2 + 1) % notas.length];
        V.epiano(m, b.t(c, 11), mtof(eco2), 0.9, 0.6, 0.3);
        if (c % 2) V.epiano(m, b.t(c, 14), mtof(notas[2] + 12), 0.8, 0.4, -0.3);
        for (let p = 2; p < 16; p += 4) V.charles(o, b.t(c, p) + (r() - 0.5) * 0.01, 0.18, false, 0.2);
        V.caja(o, b.t(c, 8), 0.1, 0.08);
        yield;
      }
      V.fondo(o, 0, b.dur + COLA, 3, 0.05, 420);
    },
  },

  // Bar: funk de gramola con murmullo de gente. Sirve para Siglo XXI y Alquimia.
  bar: {
    bpm: 104, compases: 8, nivel: 0.5,
    * pinta(o, b) {
      const acordes = [[45, 60, 64, 67], [50, 60, 65, 69], [43, 59, 65, 67], [48, 59, 64, 67]];
      const m = { ...o, eco: eco(o.ctx, o.out, b.paso * 3, 0.22, 0.2) };
      for (let c = 0; c < b.compases; c++) {
        const [raiz, ...notas] = acordes[c % 4];
        for (const p of [3, 6, 11]) notas.forEach((n) => V.epiano(m, b.t(c, p), mtof(n), p === 11 ? 0.5 : 0.28, 0.8, 0.15));
        V.bajo(o, b.t(c, 0), mtof(raiz), b.paso * 3, 0.55, 'sawtooth', 620);
        V.bajo(o, b.t(c, 6), mtof(raiz + 12), b.paso * 1.5, 0.35, 'sawtooth', 620);
        V.bajo(o, b.t(c, 8), mtof(raiz + 7), b.paso * 3, 0.5, 'sawtooth', 620);
        V.bajo(o, b.t(c, 14), mtof(raiz + 10), b.paso * 1.8, 0.38, 'sawtooth', 620);
        for (const p of [0, 7, 10]) V.bombo(o, b.t(c, p), 0.4, 60);
        for (const p of [4, 12]) V.caja(o, b.t(c, p), 0.5, 0.11);
        for (let p = 0; p < 16; p += 2) V.charles(o, b.t(c, p) + (p % 4 ? 0.016 : 0), p % 4 ? 0.28 : 0.42);
        yield;
      }
      V.fondo(o, 0, b.dur + COLA, 5, 0.09, 520, 'bandpass', 0.8);
    },
  },

  // Modernícolas: pop de sintetizadores de los ochenta, como el neón de la puerta.
  modernicolas: {
    bpm: 118, compases: 8, nivel: 0.5,
    * pinta(o, b) {
      const acordes = [[40, 55, 59, 64], [36, 55, 60, 64], [43, 55, 59, 62], [38, 54, 57, 62]];
      const voz = [76, 74, 71, 74, 72, 71, 67, 69, 71, 74, 76, 79, 78, 76, 74, 71];
      const m = { ...o, eco: eco(o.ctx, o.out, b.paso * 3, 0.32, 0.26) };
      for (let c = 0; c < b.compases; c++) {
        const [raiz, ...notas] = acordes[c % 4];
        for (let p = 0; p < 16; p += 2) V.bajo(o, b.t(c, p), mtof(raiz + (p % 4 ? 12 : 0)), b.paso * 1.7, 0.6, 'square', 900);
        for (let p = 0; p < 16; p++) V.punteo(m, b.t(c, p), mtof(notas[p % 3] + (p % 8 > 4 ? 12 : 0)), 0.22, 0.42, p % 2 ? 0.35 : -0.35, 2800);
        V.bombo(o, b.t(c, 0), 0.6, 55);
        V.bombo(o, b.t(c, 8), 0.6, 55);
        if (c % 2) V.bombo(o, b.t(c, 6), 0.42, 55);
        for (const p of [4, 12]) { V.caja(m, b.t(c, p), 0.62, 0.3); }
        for (let p = 2; p < 16; p += 4) V.charles(o, b.t(c, p), 0.55);
        if (c >= 4) {
          for (let k = 0; k < 4; k++) V.campana(m, b.t(c, k * 4), mtof(voz[((c - 4) * 4 + k) % voz.length]), 0.7, 0.6, 0);
        }
        yield;
      }
    },
  },

  // Onda Pasadena: el after. Bombo a negras, bajo a contratiempo y acordes de brazos en alto.
  onda: {
    bpm: 126, compases: 8, nivel: 0.56,
    * pinta(o, b) {
      const acordes = [[41, 56, 60, 65], [37, 56, 61, 65], [44, 56, 60, 63], [39, 55, 58, 63]];
      const m = { ...o, eco: eco(o.ctx, o.out, b.paso * 3, 0.36, 0.24) };
      for (let c = 0; c < b.compases; c++) {
        const [raiz, ...notas] = acordes[c % 4];
        for (let p = 0; p < 16; p += 4) V.bombo(o, b.t(c, p), 0.8, 50);
        for (const p of [4, 12]) V.palmas(o, b.t(c, p), 0.7);
        for (let p = 2; p < 16; p += 4) { V.charles(o, b.t(c, p), 0.75, true); V.bajo(o, b.t(c, p), mtof(raiz), b.paso * 1.6, 0.75, 'sawtooth', 620); }
        for (let p = 0; p < 16; p++) V.charles(o, b.t(c, p), 0.22, false, p % 2 ? 0.25 : -0.25);
        for (const p of [0, 3, 6, 10, 13]) V.golpeAcorde(m, b.t(c, p), notas, 0.2, c >= 4 ? 1.5 : 1, c >= 4 ? 3000 : 1800);
        yield;
      }
      V.subida(o, b.t(7, 0), b.t(8, 0) - b.t(7, 0), 0.6);
    },
  },

  // El hotel: dos notas graves que se rozan, viento y metal lejano. Sin ritmo que agarrar.
  hotel: {
    bpm: 60, compases: 6, nivel: 0.3,
    * pinta(o, b) {
      const dur = b.dur;
      const r = azar(11);
      const seg = dur / 2;
      const m = { ...o, eco: eco(o.ctx, o.out, 0.77, 0.45, 0.4) };
      for (let i = 0; i < 2; i++) {
        V.colchon(o, i * seg, [33, 34], seg + 2.5, 1.2, 260);
        V.colchon(o, i * seg + seg * 0.5, [57, 58, 63], seg + 2.5, 1, 800);
      }
      V.fondo(o, 0, dur + COLA, 4, 0.1, 340, 'bandpass', 3);
      for (let i = 0; i < 9; i++) {
        const t = (i + r() * 0.8) * (dur / 9);
        V.campana(m, t, mtof(84 + [0, 1, 6, 7, 13][Math.floor(r() * 5)]), 1.6, 0.26 + r() * 0.2, r() * 1.2 - 0.6);
      }
      V.bombo(o, dur * 0.31, 0.45, 34);
      V.bombo(o, dur * 0.36, 0.3, 34);
      V.bombo(o, dur * 0.79, 0.4, 34);
    },
  },

  // La Malagueta de noche: una guitarra sola, el mar y poco más. Sencillo.
  malagueta: {
    bpm: 66, compases: 8, pasos: 12, nivel: 0.38,
    * pinta(o, b) {
      const acordes = [[43, 55, 59, 62, 67], [40, 55, 59, 64, 67], [36, 55, 60, 64, 67], [38, 54, 57, 62, 66]];
      const figura = [0, 2, 3, 4, 3, 2];
      const canto = [[], [], [79, 78, 76], [74, 76, 78], [79, 81, 79], [76, 74, 76], [72, 74, 76], [74, 78, 74]];
      const m = { ...o, eco: eco(o.ctx, o.out, b.paso * 3, 0.25, 0.22) };
      for (let c = 0; c < b.compases; c++) {
        const acorde = acordes[c % 4];
        for (let p = 0; p < 12; p++) {
          const n = acorde[figura[p % 6]];
          V.punteo(m, b.t(c, p), mtof(p % 6 === 0 ? acorde[0] : n), 1.1, p % 6 === 0 ? 0.8 : 0.5, (p % 6) * 0.08 - 0.2, 1700);
        }
        canto[c].forEach((n, i) => V.campana(m, b.t(c, i * 4), mtof(n), 1.7, 0.5, 0.12));
        yield;
      }
      V.fondo(o, 0, b.dur + COLA, 5, 0.17, 900);
    },
  },

  // El amanecer: lo mismo que la Malagueta, en mayor, con la melodía entera. Se ha hecho de día.
  amanecer: {
    bpm: 72, compases: 8, pasos: 12, nivel: 0.4,
    * pinta(o, b) {
      const acordes = [[36, 55, 60, 64, 67], [43, 55, 59, 62, 67], [45, 57, 60, 64, 69], [41, 57, 60, 65, 69]];
      const figura = [0, 2, 3, 4, 3, 2];
      const canto = [[84, 83, 79], [79, 81, 83], [84, 88, 86], [84, 81, 77], [79, 83, 86], [86, 84, 83], [81, 84, 88], [89, 86, 84]];
      const m = { ...o, eco: eco(o.ctx, o.out, b.paso * 3, 0.32, 0.26) };
      for (let c = 0; c < b.compases; c++) {
        const acorde = acordes[c % 4];
        V.colchon(o, b.t(c, 0), acorde.slice(1).map((n) => n + 12), b.t(1, 0) + 0.8, 0.6, 1500);
        V.bajo(o, b.t(c, 0), mtof(acorde[0] + 12), b.t(1, 0) * 0.8, 0.5, 'triangle', 500);
        for (let p = 0; p < 12; p++) V.punteo(m, b.t(c, p), mtof(p % 6 === 0 ? acorde[0] + 12 : acorde[figura[p % 6]] + 12), 0.9, 0.34, (p % 6) * 0.1 - 0.25, 2100);
        canto[c].forEach((n, i) => V.campana(m, b.t(c, i * 4), mtof(n - 12), 2, 0.75, 0));
        yield;
      }
      V.fondo(o, 0, b.dur + COLA, 4, 0.08, 1100);
    },
  },
};

function offline(canales, frames, sr) {
  const O = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  try { return new O(canales, frames, sr); } catch { return new O(canales, frames, 44100); }
}

/** startRendering con promesa o, en Safari antiguo, con su evento. */
function renderizar(ctx) {
  return new Promise((ok, mal) => {
    ctx.oncomplete = (e) => ok(e.renderedBuffer);
    const p = ctx.startRendering();
    p?.then?.(ok, mal);
  });
}

/** Duración del bucle de un tema, en segundos. */
export function duracion(id) {
  const t = TEMAS[id];
  return (t.compases * (t.pasos ?? 16) * 60) / t.bpm / ((t.pasos ?? 16) / 4);
}

const respiro = () => new Promise((ok) => { setTimeout(ok, 0); });

/** Pinta el tema en un AudioBuffer: lo que se pasa del final se suma al principio. */
export async function renderTema(id, sr = SR) {
  const tema = TEMAS[id];
  const dur = duracion(id);
  const ctx = offline(2, Math.ceil((dur + COLA) * sr), sr);
  const rate = ctx.sampleRate;
  let out = ctx.destination;
  if (tema.gordo) {
    // Apretado a propósito: el dubstep de un coche no tiene dinámica.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.08;
    const limpio = filtro(ctx, 'highpass', 32);     // la saturación deja continua: fuera
    comp.connect(limpio).connect(out);
    out = comp;
  }
  const paso = dur / tema.compases / (tema.pasos ?? 16);
  const notas = tema.pinta({ ctx, out }, { bpm: tema.bpm, paso, dur, compases: tema.compases, t: (c, p = 0) => (c * (tema.pasos ?? 16) + p) * paso });
  // Montar un compás son cientos de nodos en el hilo del juego: se hace de uno en uno, sin parar el fotograma.
  while (!notas.next().done) await respiro();
  const hecho = await renderizar(ctx);
  await respiro();
  const L = Math.round(dur * rate);
  const bucle = ctx.createBuffer(2, L, rate);
  let pico = 0;
  for (let c = 0; c < 2; c++) {
    const a = hecho.getChannelData(c), d = bucle.getChannelData(c);
    for (let i = 0; i < L; i++) {
      const v = a[i] + (i + L < a.length ? a[i + L] : 0);
      d[i] = v;
      pico = Math.max(pico, Math.abs(v));
    }
  }
  const k = pico > 0 ? PICO / pico : 1;
  for (let c = 0; c < 2; c++) {
    const d = bucle.getChannelData(c);
    for (let i = 0; i < L; i++) d[i] *= k;
  }
  return bucle;
}

/**
 * La cadena de salida, igual en el juego y en las pruebas: música (con un filtro para oírla desde
 * la puerta) y efectos, a un limitador y a un recorte suave que no deja pasar de 0,98.
 */
export function crearCadena(ctx, destino = ctx.destination) {
  const musica = ctx.createGain();
  const efectos = ctx.createGain();
  const tapa = filtro(ctx, 'lowpass', 16000, 0.5);
  const suma = ctx.createGain();
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -5;
  lim.knee.value = 3;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.12;
  const recorte = ctx.createGain();
  recorte.gain.value = 0.8;     // el compresor sube el nivel por su cuenta: esto lo devuelve
  const tope = ctx.createWaveShaper();
  const n = 2049, curva = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    curva[i] = Math.sign(x) * (a < 0.72 ? a : 0.72 + 0.26 * Math.tanh((a - 0.72) / 0.26));
  }
  tope.curve = curva;
  musica.connect(tapa).connect(suma);
  efectos.connect(suma);
  suma.connect(lim).connect(recorte).connect(tope).connect(destino);
  return { musica, efectos, tapa, salida: tope };
}

// Lo que acompaña a los minijuegos de ritmo: un golpe cada vez ----------------------------------

/** ¡BAILA!: n es el golpe, p su periodo y t cuándo suena. Va sobre el bombo de los efectos. */
export function pistaBaila(o, n, p, t) {
  const raices = [41, 37, 44, 39];
  const raiz = raices[Math.floor(n / 4) % 4];
  V.bajo(o, t + p * 0.5, mtof(raiz), p * 0.42, 0.7, 'sawtooth', 620);
  V.charles(o, t + p * 0.5, 0.8, true);
  V.charles(o, t, 0.3);
  V.charles(o, t + p * 0.25, 0.2, false, 0.3);
  V.charles(o, t + p * 0.75, 0.2, false, -0.3);
  if (n % 2) V.palmas(o, t, 0.5);
  if (n % 4 === 0) V.golpeAcorde(o, t, [raiz + 12, raiz + 15, raiz + 19], p * 0.8, 0.7, 1500);
}

/** ¡AL RITMO!: la barra de Gengar lleva debajo un bajo y un charles a contratiempo. */
export function pistaChupitos(o, n, p, t, fuerte) {
  const raices = [45, 45, 43, 40];
  V.bajo(o, t, mtof(raices[Math.floor(n / 8) % 4] + (fuerte ? 0 : 12)), p * 0.6, 0.6, 'sawtooth', 650);
  V.charles(o, t + p * 0.5, 0.45);
}

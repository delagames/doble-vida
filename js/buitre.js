// Modo Buitre: el reverso de la noche, tras acabarla. Lo cuenta data/buitre.json con su propio
// corredor de pasos. No escribe en S ni en el guardado: al terminar, se vuelve al título y ya.
import { C, img, bgPath, loadJSON } from './assets.js';
import { input, inRect } from './input.js';
import { W, H, congelar, shake } from './screen.js';
import { text, wrap, lineHeight } from './text.js';
import { bar, button, cajaVacia, cifras, dither, outline, panel, pixelPoly, rect } from './draw.js';
import { Dialog } from './dialog.js';
import { Llegada, Stage } from './stage.js';
import { Cortinilla } from './cortinilla.js';
import { drawSilueta, drawSprite, DIR, preload } from './sprites.js';
import { audio } from './audio.js';
import { G } from './game.js';

const CAJA_Y = H - 100;
const SALIR = { x: W - 26, y: 0, w: 26, h: 28 };
const TOSTADA = { x: 8, y: 30, w: W - 16, h: 32 };
const MAX_ESPERA = 1500;
const ACTORES = ['buitre', 'meowth', 'mrmime', 'nerea', 'amiga1', 'amiga2', 'gengar', 'zorro', 'manolo', 'juanjo', 'jairo', 'camarera', 'sandrita', 'nacional1', 'nacional2'];
const COLOR_LOGRO = { bronce: 'naranja_farola', plata: 'marfil', oro: 'amarillo_mural', arcoiris: 'rosa_neon' };

/** Una pausa que no pide nada. Sin caja si es `limpio`. */
class Pausa {
  constructor(seg, limpio) { this.t = seg; this.limpio = limpio; }

  get done() { return this.t <= 0; }

  update(dt) { this.t -= dt; }

  draw(ctx) { if (!this.limpio) cajaVacia(ctx); }
}

/** Dos opciones con su porcentaje, como en la web. Se dibuja aquí porque Menu baila con S. */
class Opcion {
  constructor(prompt, opts) {
    this.done = false;
    this.picked = null;
    this.lineas = prompt ? wrap(prompt, 'dialog', W - 20) : [];
    this.y0 = H - 49 * opts.length - 8 - this.lineas.length * lineHeight('dialog') - 12;
    this.opts = opts;
    this.rects = opts.map((_, i) => ({ x: 6, y: H - 5 - (opts.length - i) * 49, w: W - 12, h: 46 }));
    this.gracia = 0.25;   // el toque que cerró el diálogo de antes no elige
  }

  update(dt) {
    if (this.gracia > 0) { this.gracia -= dt; return; }
    const i = input.tap ? this.rects.findIndex((r) => inRect(input.tap, r)) : input.hit('Enter', 'Space') ? 0 : -1;
    if (i >= 0) { this.picked = this.opts[i]; this.done = true; audio.opcion(); }
  }

  draw(ctx) {
    panel(ctx, 2, this.y0, W - 4, H - this.y0 - 2);
    this.lineas.forEach((l, i) => text(ctx, l, 10, this.y0 + 7 + i * lineHeight('dialog'), { color: C.marfil }));
    this.opts.forEach((o, i) => {
      const cabe = wrap(o.txt, 'bold', W - 22).length <= 2;
      button(ctx, this.rects[i], o.txt, { font: cabe ? 'bold' : 'dialog' });
    });
  }
}

/** «Sale bien» o «No sale como esperaba»: se va solo o con un toque. */
class Veredicto {
  constructor(bien, txt) {
    this.bien = bien;
    this.txt = txt;
    this.t = 1.6;
    this.gracia = 0.2;
    if (bien) audio.acierto(); else audio.fallo();
  }

  get done() { return this.t <= 0; }

  update(dt) {
    this.t -= dt;
    this.gracia -= dt;
    if (this.gracia <= 0 && input.confirm()) this.t = 0;
  }

  draw(ctx) {
    panel(ctx, 2, CAJA_Y, W - 4, 98, { edge: this.bien ? C.cian_neon : C.rojo_extintor });
    text(ctx, this.txt, W >> 1, CAJA_Y + 40, { font: 'bold', color: this.bien ? C.cian_neon : C.rojo_extintor, align: 'center' });
  }
}

/** La instrucción de todo minijuego: un segundo a pantalla completa, sin heredar el toque. */
class Mini {
  constructor(esc, instruccion) {
    this.esc = esc;
    this.instruccion = wrap(instruccion, 'huge', W - 20);
    this.intro = 1;
    this.done = false;
    input.soltarTodo();
  }

  update(dt) {
    if (this.intro > 0) {
      this.intro -= dt;
      if (this.intro <= 0) input.soltarTodo();
      return;
    }
    this.juega(dt);
  }

  draw(ctx) {
    if (this.intro > 0) {
      rect(ctx, 0, 0, W, H, C.noche);
      const lh = lineHeight('huge');
      const y0 = (H - this.instruccion.length * lh) >> 1;
      this.instruccion.forEach((l, i) => text(ctx, l, W >> 1, y0 + i * lh, { font: 'huge', color: C.rosa_neon, align: 'center' }));
      return;
    }
    this.pinta(ctx);
  }
}

/** Mantener el dedo para no parpadear. El reloj corre treinta veces más que la vergüenza. */
class NoParpadees extends Mini {
  static MAX = 6;

  static BUENO = 3.5;

  constructor(esc) {
    super(esc, 'NO PARPADEES');
    this.mirando = 0;     // segundos reales con los ojos abiertos
    this.ocioso = 0;
    this.empezado = false;
  }

  juega(dt) {
    const dedo = input.count > 0 || input.key('Space', 'Enter');
    if (dedo) {
      this.empezado = true;
      this.mirando += dt;
      if (this.mirando >= NoParpadees.MAX) { shake(0.2); this.cierra(); }
    } else if (this.empezado) this.cierra();
    else if ((this.ocioso += dt) > 8) this.cierra();    // nadie toca: se parpadea solo
  }

  cierra() {
    this.esc.res.mirada = this.mirando >= NoParpadees.BUENO;
    this.esc.sumar(Math.floor(this.mirando));
    this.done = true;
  }

  pinta(ctx) {
    const seco = this.mirando / NoParpadees.MAX;
    const x = 75, y = 150, w = 120, h = 60;
    panel(ctx, x - 6, y - 6, w + 12, h + 12);
    if (this.empezado) {
      rect(ctx, x, y, w, h, C.blanco_extintor);
      for (let i = 0; i < Math.round(seco * 24); i++) rect(ctx, x + ((i * 37) % (w - 7)), y + ((i * 23) % h), 7, 1, C.rojo_extintor);
      rect(ctx, x + 66, y + 14, 34, 34, C.rojo_extintor);
      rect(ctx, x + 72, y + 20, 22, 22, C.carbon);
      rect(ctx, x + 76, y + 24, 5, 5, C.blanco_extintor);
    } else {
      rect(ctx, x, y + 28, w, 4, C.piel_sombra);
    }
    panel(ctx, 2, CAJA_Y, W - 4, 98);
    const seg = Math.floor(this.mirando * 30);
    const reloj = `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
    cifras(ctx, reloj, W >> 1, CAJA_Y + 8, { color: C.rosa_neon, escala: 4, align: 'center' });
    text(ctx, 'MANTÉN EL DEDO. SI LO SUELTAS, PARPADEAS', W >> 1, CAJA_Y + 36, { font: 'label', color: C.gris, align: 'center' });
    text(ctx, 'SEQUEDAD OCULAR', 10, CAJA_Y + 56, { font: 'label', color: C.gris });
    bar(ctx, 10, CAJA_Y + 68, W - 20, 12, seco, C.rojo_extintor);
  }
}

/** Arrastrar al Buitre hacia la Roserade. Ella se aparta; él lo apunta como una conversación. */
class DemasiadoCerca extends Mini {
  static SEG = 14;

  static VECES = 5;

  constructor(esc) {
    super(esc, 'DEMASIADO CERCA');
    this.b = esc.stage.get('buitre');
    this.r = esc.stage.get('amiga1');
    this.t = 0;
    this.toques = 0;
    this.d = 999;
  }

  juega(dt) {
    this.t += dt;
    const p = input.p();
    const kx = (input.key('ArrowRight') ? 1 : 0) - (input.key('ArrowLeft') ? 1 : 0);
    const ky = (input.key('ArrowDown') ? 1 : 0) - (input.key('ArrowUp') ? 1 : 0);
    const dest = p ? { x: p.x, y: p.y - 26 } : kx || ky ? { x: this.b.x + kx * 40, y: this.b.y + ky * 40 } : null;
    if (dest) {
      const dx = Math.max(16, Math.min(W - 16, dest.x)) - this.b.x;
      const dy = Math.max(300, Math.min(372, dest.y)) - this.b.y;
      const d = Math.hypot(dx, dy);
      const paso = Math.min(d, 150 * dt);
      if (d > 1) {
        this.b.x += (dx / d) * paso;
        this.b.y += (dy / d) * paso;
        this.b.anim = 'Walk';
        if (Math.abs(dx) >= Math.abs(dy)) this.b.dir = dx > 0 ? DIR.derecha : DIR.izquierda;
        else this.b.dir = dy > 0 ? DIR.abajo : DIR.arriba;
      }
    } else this.b.anim = 'Idle';
    this.d = Math.hypot(this.b.x - this.r.x, this.b.y - this.r.y);
    if (this.d < 34 && !this.r.dest) this.apartarse();
    if (this.toques >= DemasiadoCerca.VECES || this.t >= DemasiadoCerca.SEG) {
      this.b.anim = 'Idle';
      this.esc.res.cerca = this.toques > 0;
      this.done = true;
    }
  }

  apartarse() {
    this.toques++;
    this.esc.sumar(7);
    audio.fallo();
    // Se va al lado contrario, o por lo menos todo lo lejos que deja la pared.
    const x = this.r.x < W / 2 ? 190 + (this.toques * 13) % 60 : 20 + (this.toques * 17) % 60;
    this.r.dest = { x, y: 304 + (this.toques * 29) % 68 };
    this.r.vel = 190;
    this.r.anim = 'Walk';
  }

  etiqueta() {
    if (this.d > 110) return ['DISTANCIA CORDIAL', C.cian_neon];
    if (this.d > 70) return ['CERCA', C.marfil];
    if (this.d > 42) return ['DEMASIADO CERCA', C.naranja_farola];
    return ['RESPIRAS EN SU BEBIDA', C.rojo_extintor];
  }

  pinta(ctx) {
    panel(ctx, 2, CAJA_Y, W - 4, 98);
    const [e, color] = this.etiqueta();
    text(ctx, e, W >> 1, CAJA_Y + 14, { font: 'label', color, align: 'center' });
    bar(ctx, 10, CAJA_Y + 28, W - 20, 12, 1 - Math.min(1, this.d / 200), color);
    text(ctx, 'ARRASTRA AL BUITRE HACIA ELLA', W >> 1, CAJA_Y + 50, { font: 'label', color: C.gris, align: 'center' });
    cifras(ctx, `${this.toques}/${DemasiadoCerca.VECES}`, W >> 1, CAJA_Y + 66, { color: C.rosa_neon, escala: 3, align: 'center' });
  }
}

/** Portada: «Salir de casa», como la web. */
class Portada {
  constructor(p) {
    this.p = p;
    this.lineas = wrap(p.sub, 'dialog', W - 40);
    this.done = false;
    this.r = { x: 40, y: H - 90, w: W - 80, h: 44 };
    this.t = 0;
    this.gracia = 0.3;
    this.pantalla = true;
  }

  update(dt) {
    this.t += dt * 60;
    this.gracia -= dt;
    if (this.gracia <= 0 && (input.tapIn(this.r) || input.hit('Enter', 'Space'))) { this.done = true; audio.opcion(); }
  }

  draw(ctx) {
    rect(ctx, 0, 0, W, H, C.noche);
    text(ctx, this.p.titulo, W >> 1, 60, { font: 'huge', color: C.rosa_neon, align: 'center' });
    drawSprite(ctx, '0630', 'Idle', DIR.abajo, this.t, W >> 1, 250, { escala: 3, dientes: false });
    this.lineas.forEach((l, i) => text(ctx, l, W >> 1, 285 + i * lineHeight('dialog'), { color: C.marfil, align: 'center' }));
    button(ctx, this.r, this.p.boton, { edge: C.rosa_neon });
  }
}

/** El único botón del final. */
class Nido {
  constructor(txt, alPulsar) {
    this.txt = txt;
    this.alPulsar = alPulsar;
    this.done = false;
    this.r = { x: 40, y: H - 62, w: W - 80, h: 44 };
    this.gracia = 0.4;
  }

  update(dt) {
    this.gracia -= dt;
    if (this.gracia <= 0 && (input.tapIn(this.r) || input.hit('Enter', 'Space'))) { this.done = true; audio.opcion(); this.alPulsar(); }
  }

  draw(ctx) { button(ctx, this.r, this.txt, { edge: C.rosa_neon }); }
}

/** Oscurece o aclara por tramas: sin alfa. */
class Fundido {
  constructor(esc, a, seg) {
    this.esc = esc;
    this.de = esc.oscuro;
    this.a = a;
    this.seg = seg;
    this.t = 0;
  }

  get done() { return this.t >= this.seg; }

  update(dt) {
    this.t = Math.min(this.seg, this.t + dt);
    this.esc.oscuro = Math.round(this.de + (this.a - this.de) * (this.t / this.seg));
  }

  draw() {}
}

/** El armario de Ismael: lo único que no estaba en la noche. */
function armario(ctx, t) {
  rect(ctx, 0, 0, W, H, C.noche);
  rect(ctx, 28, 66, W - 56, 314, C.madera);
  outline(ctx, 28, 66, W - 56, 314, C.carbon);
  rect(ctx, 40, 78, W - 80, 290, C.carbon);
  rect(ctx, 28, 66, 12, 314, C.madera_clara);
  rect(ctx, W - 40, 66, 12, 314, C.madera_clara);
  rect(ctx, 44, 92, W - 88, 3, C.gris);                 // la barra
  rect(ctx, 134, 95, 2, 12, C.gris);                    // la percha
  pixelPoly(ctx, [[106, 108], [122, 104], [148, 104], [164, 108], [180, 136], [164, 146], [158, 136], [158, 226], [112, 226], [112, 136], [106, 146], [90, 136]], C.blanco_extintor, C.gris);
  cifras(ctx, '4', 135, 146, { color: C.morado, escala: 8, align: 'center' });
  rect(ctx, 40, 314, W - 80, 6, C.madera_clara);        // la balda
  for (let i = 0; i < 7; i++) {
    const x = 58 + i * 25;
    const alto = 14 + ((i * 5) % 3) * 3;
    rect(ctx, x, 314 - alto, 6, alto, C.marfil);
    outline(ctx, x, 314 - alto, 6, alto, C.gris);
    const baila = Math.floor(t * 7 + i * 3) % 3;
    rect(ctx, x + 1, 314 - alto - 7 + baila, 4, 6 - baila, C.naranja_farola);
    rect(ctx, x + 2, 314 - alto - 4, 2, 3, C.amarillo_mural);
  }
  text(ctx, 'EL CAPITÁN SIEMPRE', W >> 1, 342, { font: 'label', color: C.amarillo_mural, align: 'center' });
}

export class ModoBuitre {
  /** volver: lo que se hace al acabar (el título no se importa aquí: se importaría a sí mismo). */
  constructor(volver) {
    this.volver = volver;
    this.listo = false;
    this.bg = null;
    this.stage = new Stage();
    this.frames = [];
    this.wait = null;
    this.cortina = null;
    this.res = {};
    this.coins = 0;
    this.fama = 40;
    this.hora = '23:10';
    this.hud = false;
    this.pulso = 0;
    this.tostada = null;
    this.colas = [];
    this.pinchados = 0;
    this.oscuro = 0;      // 0 nada, 4 negro
    this.nube = false;
    this.silueta = null;
    this.luces = [];
    this.hueco = false;
    this.t = 0;
    this.cargar();
  }

  async cargar() {
    try {
      this.d = await loadJSON('data/buitre.json');
      await Promise.race([preload(ACTORES), new Promise((ok) => { setTimeout(ok, MAX_ESPERA); })]);
      this.frames = [{ steps: this.d.pasos, i: 0 }];
      this.listo = true;
    } catch { this.salir(); }   // sin datos no hay modo, pero nunca una espera sin fin
  }

  salir() {
    audio.musica(null);
    this.volver();
  }

  sumar(v) { this.coins += v; this.pulso = 1; }

  /** Los pasos de data/buitre.json. */
  paso(s) {
    switch (s.t) {
      case 'portada': this.wait = new Portada(this.d.portada); break;
      case 'parada':
        congelar();
        this.fondo(s.bg, s.musica);
        if (s.hora) this.hora = s.hora;
        this.hud = true;
        this.cortina = new Cortinilla({ hora: this.hora, nombre: s.nombre });
        break;
      case 'bg': this.fondo(s.id, s.musica); break;
      case 'hora': this.hora = s.v; break;
      case 'n': this.wait = new Dialog({ texto: s.txt }); break;
      case 'di': {
        const a = G.data.cast[s.who];
        this.wait = new Dialog({ nombre: a.nombre, retrato: a.retrato ? { actor: a.retrato, mood: s.mood || 'Normal' } : null, voz: a.voz, texto: s.txt });
        break;
      }
      case 'col': this.stage.colocar(s); break;
      case 'mov': {
        const a = this.stage.mover(s);
        if (s.espera !== false) this.wait = new Llegada(a);
        break;
      }
      case 'ret': this.stage.retirar(s.who); break;
      case 'esp': this.wait = new Pausa(s.seg ?? 1, s.limpio); break;
      case 'op': this.opcion(s); break;
      case 'veredicto': this.wait = new Veredicto(s.bien, s.bien ? this.d.bien : this.d.mal); break;
      case 'si': this.frames.push({ steps: (this.res[s.res] ? s.bien : s.mal) ?? [], i: 0 }); break;
      case 'coins': this.sumar(s.v); break;
      case 'fama': this.fama = Math.max(0, this.fama + s.v); this.pulso = 1; break;
      case 'logro': this.colas.push(this.d.logros[s.id]); break;
      case 'mini': this.wait = s.id === 'mirada' ? new NoParpadees(this) : new DemasiadoCerca(this); break;
      case 'nube': this.nube = !!s.on; if (s.on) audio.extintor(); break;
      case 'silueta': this.silueta = s.on ? { t: 0 } : null; break;
      case 'luces': this.luces = this.d.ventanas.slice(0, s.n); audio.clic(); break;
      case 'hud': this.hud = !!s.on; break;
      case 'fundido': this.wait = new Fundido(this, s.a, s.seg ?? 1.5); break;
      case 'hueco': this.hueco = true; break;
      case 'musica': audio.musica(s.id ?? null); break;
      case 'nido': this.wait = new Nido(this.d.nido, () => this.salir()); break;
      default: throw new Error(`Paso desconocido: ${s.t}`);
    }
  }

  fondo(id, pide) {
    this.bg = id;
    this.stage.clear();
    this.luces = [];
    this.nube = false;
    this.silueta = null;
    this.hueco = false;
    if (id === 'armario') return;
    const m = pide !== undefined ? pide : G.data.night.musica[id] ?? null;
    if (m === null || typeof m === 'string') audio.musica(m); else audio.musica(m.tema ?? null, { tapado: !!m.tapado });
  }

  /** `siempre` amaña el dado; sin porcentaje no hay veredicto. */
  opcion(s) {
    const o = new Opcion(s.prompt, s.opts);
    this.wait = o;
    o.after = () => {
      const e = o.picked;
      if (!e) return;
      if (e.siempre === undefined && e.pct === undefined) { this.frames.push({ steps: e.pasos ?? [], i: 0 }); return; }
      const bien = e.siempre ?? Math.random() * 100 < e.pct;
      this.frames.push({ steps: [...(e.pasos ?? []), { t: 'veredicto', bien }, ...((bien ? e.bien : e.mal) ?? [])], i: 0 });
    };
  }

  /** Los logros salen de uno en uno y nunca paran nada. Pinchar siete veces lo nota el Buitre. */
  tostadas(dt) {
    if (!this.tostada && this.colas.length) {
      this.tostada = { ...this.colas.shift(), t: 3.2 };
      audio.tejo();
    }
    if (!this.tostada) return;
    this.tostada.t -= dt;
    if (input.tapIn(TOSTADA)) {
      input.consume();
      if (++this.pinchados === 7) this.colas.push(this.d.siete);
    }
    if (this.tostada.t <= 0) this.tostada = null;
  }

  pump() {
    while (!this.wait && !this.cortina) {
      const fr = this.frames[this.frames.length - 1];
      if (!fr) { this.salir(); return; }
      if (fr.i >= fr.steps.length) { this.frames.pop(); continue; }
      this.paso(fr.steps[fr.i++]);
    }
  }

  update(dt) {
    this.t += dt;
    if (!this.listo) return;
    if (this.cortina) {
      this.cortina.update(dt);
      this.stage.update(dt);
      if (this.cortina.done) this.cortina = null;
      return;
    }
    if (this.hud && input.tapIn(SALIR)) { this.salir(); return; }
    this.pulso = Math.max(0, this.pulso - dt);
    this.tostadas(dt);
    this.stage.update(dt);
    if (this.silueta) this.silueta.t += dt * 60;
    if (this.wait) {
      this.wait.update(dt);
      if (this.wait.done) {
        const w = this.wait;
        this.wait = null;
        w.after?.();
      }
    }
    this.pump();
  }

  marcador(ctx) {
    rect(ctx, 0, 0, W, 24, C.noche);
    rect(ctx, 0, 24, W, 1, C.carbon);
    cifras(ctx, this.hora, 5, 7, { color: C.naranja_farola, escala: 2 });
    text(ctx, 'FAMA CON LAS MUJERES', 46, 2, { font: 'label', color: C.gris });
    bar(ctx, 46, 13, 118, 7, this.fama / 100, C.rosa_neon);
    text(ctx, 'BUITRECOINS', 170, 2, { font: 'label', color: C.gris });
    cifras(ctx, this.coins, 170, 13, { color: this.pulso > 0 ? C.amarillo_mural : C.rosa_claro, escala: 2 });
    text(ctx, 'X', W - 13, 8, { font: 'bold', color: C.gris, align: 'center' });
  }

  capas(ctx) {
    for (const [x, y, w, h] of this.luces) dither(ctx, x, y, w, h, C.amarillo_mural, 2);
    if (this.hueco) {
      const [x, y] = this.d.hueco;
      dither(ctx, x, y, 38, 10, C.carbon, 3);
      dither(ctx, x + 4, y - 2, 30, 14, C.madera, 2);
      rect(ctx, x + 44, y + 2, 8, 6, C.madera);        // la rodilla
      rect(ctx, x + 45, y + 3, 6, 4, C.carbon);
    }
    this.stage.draw(ctx);
    if (this.nube) {
      dither(ctx, 0, 25, W, 357, C.blanco_extintor, 3);
      if (this.silueta) {
        const baile = Math.round(Math.sin(this.silueta.t * 0.18) * 14);
        drawSilueta(ctx, '0068', 'Idle', DIR.abajo, this.silueta.t, 135 + baile, 300, C.gris, { escala: 3 });
      }
    }
  }

  draw(ctx) {
    if (!this.listo) { rect(ctx, 0, 0, W, H, C.noche); return; }
    if (this.wait?.pantalla) { this.wait.draw(ctx); return; }
    if (this.bg === 'armario') armario(ctx, this.t);
    else {
      const pic = this.bg && img(bgPath(this.bg));
      if (pic) ctx.drawImage(pic, 0, 0); else rect(ctx, 0, 0, W, H, C.noche);
    }
    this.capas(ctx);
    if (!this.hud) {           // sin marcador, las bandas del fondo no deben quedar a la vista
      rect(ctx, 0, 0, W, 25, C.noche);
      rect(ctx, 0, 382, W, H - 382, C.noche);
    }
    if (this.oscuro > 0) dither(ctx, 0, 0, W, H, C.noche, this.oscuro);
    this.wait?.draw(ctx);
    if (this.hud) this.marcador(ctx);
    if (this.tostada) this.pintaTostada(ctx);
    this.cortina?.draw(ctx);
  }

  pintaTostada(ctx) {
    const l = this.tostada;
    const color = C[COLOR_LOGRO[l.nivel]];
    panel(ctx, TOSTADA.x, TOSTADA.y, TOSTADA.w, TOSTADA.h, { edge: color });
    text(ctx, l.pie ?? this.d.logro_pie, 16, TOSTADA.y + 5, { font: 'label', color: C.gris });
    text(ctx, l.txt, 16, TOSTADA.y + 16, { font: 'label', color });
  }
}

// ¡CALCULA! en el chino: las litronas de la nevera al mostrador y el total en el teclado.
// La dificultad es la oferta y el tiempo. Las etiquetas medio borradas tienen siempre una
// gemela legible del mismo color; los números, si no están borrados a propósito, se leen.
import { C } from '../assets.js';
import { input, inRect } from '../input.js';
import { W, shake, vibrar } from '../screen.js';
import { text, wrap, lineHeight } from '../text.js';
import { anchoCifras, bar, cifras, dither, outline, panel, rect } from '../draw.js';
import { S, barajar } from '../state.js';
import { endurece } from '../medidores.js';
import { audio } from '../audio.js';
import { drawSprite, DIR } from '../sprites.js';
import { Arrastre } from '../minigame.js';
import { drawLitrona } from './dibujo.js';

const RECARGO = 6;           // lo que te clava Meowth si te equivocas
const MIN_TOTAL = 4, MAX_TOTAL = 9;  // con 9 aún llega: 30 - 9 - 15 de la ronda = 6
const TIPOS = ['naranja_farola', 'verde_ipa', 'azul_claro'];

const REGLA = { x: 4, y: 27, w: W - 8, h: 58 };
const NEVERA = { x: 4, y: 88, w: W - 8, h: 136 };
const MOSTRADOR = { x: 4, y: 228, w: W - 8, h: 92 };
const BARRA = { x: 8, y: 323, w: W - 16, h: 6 };
const TECLAS = { y: 332, h: 35, gap: 2 };
const CELDA = { w: 62, h: 66 };

const OFERTAS = {
  tercera: {
    titulo: '2X1 EN LA TERCERA',
    sub: 'LA BOTELLA 3 NO SE PAGA',
    aplica: (precios) => { if (precios.length > 2) precios[2] = 0; },
  },
  grande: {
    titulo: 'LA DE LITRO Y MEDIO CUENTA COMO DOS',
    corto: 'LITRO Y MEDIO CUENTA COMO DOS',
    sub: 'LA GRANDE PAGA DOS VECES SU PRECIO',
    aplica: (precios, botellas) => botellas.forEach((b, i) => { if (b.grande) precios[i] *= 2; }),
  },
  casco: {
    titulo: 'CASCO NO RETORNABLE',
    sub: 'SUMA 1 EURO POR BOTELLA',
    aplica: (precios) => precios.forEach((_, i) => { precios[i] += 1; }),
  },
};

export default class Calcula {
  static instruccion = '¡CALCULA!';
  static ayuda = 'Arrastra las botellas que pide el mostrador. Luego suma con la oferta y teclea el total. Mismo color, mismo precio: si una etiqueta está borrada, mira la otra.';
  static carga = ['meowth'];

  start({ params }) {
    this.arr = new Arrastre();
    this.fase = 'coge';
    this.tCoge = params.tCoge ?? Math.round(endurece(12, 8));
    this.tCoge0 = this.tCoge;
    this.pega = 0;                // sacudida del mostrador al acertar con la botella
    this.esaNo = 0;               // aviso de botella que no toca
    this.tiempo = params.tiempo ?? endurece(6.5, 3.5);
    this.t = this.tiempo;
    this.res = null;
    this.tecleo = '';
    this.motivo = null;
    this.montar(params);
    this.teclado();
  }

  /** Busca un pedido cuyo total quepa en el rango del dinero. Siempre termina. */
  montar(params) {
    const n = params.botellas ?? Math.round(endurece(3, 4.4));
    const ids = params.ofertas ?? this.eligeOfertas();
    this.ofertas = ids.map((id) => OFERTAS[id]);
    for (let i = 0; i < 300; i++) {
      this.precios = Object.fromEntries(barajar(TIPOS).map((t, k) => [t, k + 1]));
      this.pedido = this.pidePedido(n, ids);
      this.total = this.calcula();
      if (this.total >= MIN_TOTAL && this.total <= MAX_TOTAL) break;
    }
    this.total = Math.min(MAX_TOTAL, this.total);
    this.llenaNevera(params);
  }

  eligeOfertas() {
    const [a] = barajar(['tercera', 'grande']);
    if (endurece(0, 1) < 0.3) return [a];
    if (endurece(0, 1) < 0.5) return [a, 'casco'];
    return ['tercera', 'grande'];
  }

  pidePedido(n, ids) {
    const p = Array.from({ length: n }, () => ({ tipo: TIPOS[Math.floor(Math.random() * TIPOS.length)], grande: false, puesta: null }));
    if (ids.includes('grande')) {
      // Nunca en la tercera: si no, las dos ofertas juntas no dirían cuál manda.
      const sitios = [0, 1, 3].filter((i) => i < n);
      p[sitios[Math.floor(Math.random() * sitios.length)]].grande = true;
    }
    return p;
  }

  calcula() {
    const precios = this.pedido.map((b) => this.precios[b.tipo]);
    this.ofertas.forEach((o) => o.aplica(precios, this.pedido));
    this.desglose = precios;
    return precios.reduce((s, v) => s + v, 0);
  }

  llenaNevera(params) {
    const cosas = this.pedido.map((b) => ({ tipo: b.tipo, grande: b.grande }));
    while (cosas.length < 8) cosas.push({ tipo: TIPOS[cosas.length % 3], grande: false });
    this.nevera = barajar(cosas).map((b, i) => ({
      ...b, id: i, ox: NEVERA.x + 6 + (i % 4) * CELDA.w, oy: NEVERA.y + 2 + (i >> 2) * CELDA.h, sitio: null, borrada: false,
    }));
    // Se borra solo si queda otra etiqueta legible de ese color y tamaño normal o no.
    const quiere = params.borradas ?? Math.round(endurece(1, 3.4));
    let hechas = 0;
    for (const b of barajar(this.nevera)) {
      if (hechas >= quiere) break;
      const legibles = this.nevera.filter((o) => o.tipo === b.tipo && !o.borrada);
      if (legibles.length < 2) continue;
      b.borrada = true;
      hechas++;
    }
  }

  teclado() {
    const w = Math.floor((W - 8 - 2 * TECLAS.gap) / 3);
    const etiquetas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BORRA', '0', 'OK'];
    this.teclas = etiquetas.map((k, i) => ({
      k, r: { x: 4 + (i % 3) * (w + TECLAS.gap), y: TECLAS.y + Math.floor(i / 3) * (TECLAS.h + TECLAS.gap), w, h: TECLAS.h },
    }));
  }

  sitioDe(i) {
    const n = this.pedido.length;
    const w = Math.min(44, Math.floor(170 / n));
    return { x: MOSTRADOR.x + 6 + i * w, y: MOSTRADOR.y + 22, w: w - 2, h: 62 };
  }

  /** La botella va a su sitio si el mostrador la pide; si no, vuelve a la nevera. */
  soltar({ obj, y }) {
    if (y < MOSTRADOR.y - 26) return;
    const i = this.pedido.findIndex((p) => !p.puesta && p.tipo === obj.tipo && p.grande === obj.grande);
    if (i < 0) { audio.fallo(); this.esaNo = 0.8; return; }
    this.pedido[i].puesta = obj;
    obj.sitio = i;
    this.pega = 0.12;
    audio.toque();
    if (this.pedido.every((p) => p.puesta)) this.empiezaCuenta();
  }

  empiezaCuenta() {
    this.fase = 'cuenta';
    this.t = this.tiempo;
    audio.compas(true);
  }

  /** Si no las coges, te las pone Meowth de mala gana; la cuenta empieza igual. */
  meowthPone() {
    for (const p of this.pedido) {
      if (p.puesta) continue;
      const b = this.nevera.find((o) => o.sitio === null && o.tipo === p.tipo && o.grande === p.grande);
      p.puesta = b;
      b.sitio = this.pedido.indexOf(p);
    }
    this.arr.obj = null;
    this.empiezaCuenta();
  }

  update(dt) {
    this.pega = Math.max(0, this.pega - dt);
    this.esaNo = Math.max(0, this.esaNo - dt);
    if (this.fase === 'coge') {
      const libres = this.nevera.filter((b) => b.sitio === null);
      const suelto = this.arr.update(libres, (b) => this.caja(b), 4);
      if (suelto) this.soltar(suelto);
      this.tCoge -= dt;
      if (this.fase === 'coge' && this.tCoge <= 0) this.meowthPone();
      return;
    }
    this.t -= dt;
    if (this.t <= 0) { this.motivo = 'tiempo'; this.res = 'lose'; return; }
    this.teclea();
  }

  caja(b) {
    const w = b.grande ? 18 : 14, h = b.grande ? 50 : 40;
    return { x: b.ox + 16, y: b.oy + 2, w, h: h + 16 };
  }

  teclea() {
    let k = null;
    for (let d = 0; d <= 9; d++) if (input.hit(`Digit${d}`, `Numpad${d}`)) k = String(d);
    if (input.hit('Backspace')) k = 'BORRA';
    if (input.hit('Enter')) k = 'OK';
    if (input.pressed) k = this.teclas.find((t) => inRect(input.pressed, t.r))?.k ?? k;
    if (k === null) return;
    audio.toque();
    if (k === 'BORRA') this.tecleo = this.tecleo.slice(0, -1);
    else if (k === 'OK') { if (this.tecleo) this.confirma(); } else if (this.tecleo.length < 2) this.tecleo += k;
  }

  confirma() {
    if (Number(this.tecleo) === this.total) { this.res = 'win'; return; }
    this.motivo = 'mal';
    this.res = 'lose';
    shake(0.2);
    vibrar();
  }

  result() { return this.res; }

  tarjeta(res) {
    const paga = res === 'win' ? this.total : this.total + RECARGO;
    S.pagado = paga;
    S.dinero = Math.max(0, S.dinero - paga);
    if (res === 'win') {
      return { titulo: '¡CUADRA!', lineas: ['Meowth cuenta dos veces. Cuadra.', 'Juanjo guarda el ticket: dice que es su mejor build.'], datos: [['PAGAS', paga], ['TE QUEDAN', S.dinero]] };
    }
    S.flags.chinoCaro = true;
    return {
      titulo: '¡TE HA VISTO!',
      coste: 0,
      lineas: [this.motivo === 'tiempo' ? 'Juanjo se queda leyendo la oferta como si fuera el parche.' : 'Eso no es lo que sale. Meowth lo sabe. Juanjo no.', 'Meowth te cobra lo que le parece. Impuesto de bajo elo.'],
      datos: [['ERA', `${this.desglose.join('+')}=${this.total}`], ['PAGAS', paga], ['TE QUEDAN', S.dinero]],
    };
  }

  // Dibujo ---------------------------------------------------------------------

  draw(ctx) {
    rect(ctx, 0, 25, W, 455, C.noche);
    this.pintaRegla(ctx);
    this.pintaNevera(ctx);
    this.pintaMostrador(ctx);
    if (this.fase === 'cuenta') bar(ctx, BARRA.x, BARRA.y, BARRA.w, BARRA.h, this.t / this.tiempo, this.t < 1.5 ? C.rojo_extintor : C.cian_neon);
    else bar(ctx, BARRA.x, BARRA.y, BARRA.w, BARRA.h, this.tCoge / this.tCoge0, this.tCoge < 2.5 ? C.rojo_extintor : C.naranja_farola);
    this.pintaTeclado(ctx);
    if (this.arr.obj) {
      const b = this.arr.obj;
      this.pintaBotella(ctx, b, this.arr.x - 8, this.arr.y - 30);
    }
  }

  pintaRegla(ctx) {
    panel(ctx, REGLA.x, REGLA.y, REGLA.w, REGLA.h, { fill: C.carbon, edge: C.amarillo_mural });
    let y = REGLA.y + 4;
    const dos = this.ofertas.length > 1;
    if (!dos) { text(ctx, 'NOTAS DEL PARCHE 11.4', W >> 1, y, { font: 'label', color: C.gris, align: 'center' }); y += 10; }
    for (const o of this.ofertas) {
      for (const l of wrap(dos ? o.corto ?? o.titulo : o.titulo, dos ? 'dialog' : 'bold', REGLA.w - 12)) {
        text(ctx, l, W >> 1, y, { font: dos ? 'dialog' : 'bold', color: C.amarillo_mural, align: 'center' });
        y += lineHeight('dialog') - 1;
      }
      text(ctx, o.sub, W >> 1, y + 1, { font: 'label', color: C.marfil, align: 'center' });
      y += 10;
    }
  }

  pintaEtiqueta(ctx, b, x, y) {
    rect(ctx, x, y, 22, 14, C.marfil);
    outline(ctx, x, y, 22, 14, C.carbon);
    cifras(ctx, this.precios[b.tipo], x + 11, y + 2, { color: C.carbon, escala: 2, align: 'center' });
    if (b.borrada) {
      rect(ctx, x + 1, y + 6, 20, 7, C.marfil);
      dither(ctx, x + 1, y + 1, 20, 12, C.marfil, 2);
      dither(ctx, x + 1, y + 7, 20, 6, C.gris, 1);
    }
  }

  pintaBotella(ctx, b, x, y) {
    drawLitrona(ctx, x, y, C[b.tipo], { grande: b.grande });
    this.pintaEtiqueta(ctx, b, x + (b.grande ? -2 : -4), y + (b.grande ? 38 : 28));
  }

  pintaNevera(ctx) {
    const n = NEVERA;
    panel(ctx, n.x, n.y, n.w, n.h, { fill: C.azul_mar, edge: C.cian_neon });
    dither(ctx, n.x + 2, n.y + 2, n.w - 4, n.h - 4, C.noche, 1);
    rect(ctx, n.x + 2, n.y + 66, n.w - 4, 2, C.cian_neon);
    for (const b of this.nevera) {
      if (b.sitio !== null || b === this.arr.obj) continue;
      this.pintaBotella(ctx, b, b.ox + 18, b.oy + (b.grande ? 0 : 8));
    }
  }

  pintaMostrador(ctx) {
    const m = this.pega > 0 ? { ...MOSTRADOR, y: MOSTRADOR.y + 2 } : MOSTRADOR;
    drawSprite(ctx, '0052', 'Idle', DIR.abajo, performance.now() * 0.06, m.x + m.w - 18, m.y + 2, { escala: 1 });
    panel(ctx, m.x, m.y, m.w, m.h, { fill: C.madera, edge: C.madera_clara });
    this.pedido.forEach((p, i) => {
      const r = this.sitioDe(i);
      cifras(ctx, i + 1, r.x + (r.w >> 1), m.y + 6, { escala: 2, color: C.marfil, align: 'center' });
      if (p.puesta) { this.pintaBotella(ctx, p.puesta, r.x + 13 - (p.grande ? 2 : 0), r.y + (p.grande ? -9 : 1)); return; }
      this.pintaHueco(ctx, r, p);
    });
    if (this.esaNo > 0) {
      panel(ctx, 34, m.y - 15, 150, 14, { edge: C.rosa_neon });
      text(ctx, 'ESA NO ESTÁ EN EL PEDIDO', 109, m.y - 12, { font: 'label', color: C.rosa_claro, align: 'center' });
    }
    const c = { x: m.x + m.w - 76, y: m.y + 26, w: 70, h: 58 };
    panel(ctx, c.x, c.y, c.w, c.h, { fill: C.carbon, edge: this.fase === 'cuenta' ? C.cian_neon : C.gris });
    text(ctx, 'TOTAL', c.x + (c.w >> 1), c.y + 5, { font: 'label', color: C.gris, align: 'center' });
    const v = this.tecleo || (this.fase === 'cuenta' ? '?' : '');
    if (this.tecleo) cifras(ctx, v, c.x + ((c.w - anchoCifras(v, 5)) >> 1), c.y + 20, { escala: 5, color: C.cian_neon });
    else if (v) text(ctx, v, c.x + (c.w >> 1), c.y + 20, { font: 'huge', color: C.gris, align: 'center' });
  }

  pintaHueco(ctx, r, p) {
    const w = p.grande ? 18 : 14, h = p.grande ? 40 : 34;
    const x = r.x + ((r.w - w) >> 1), y = r.y + 60 - h;
    rect(ctx, x, y, w, h, C[p.tipo]);
    dither(ctx, x, y, w, h, C.madera, 2);
    outline(ctx, x, y, w, h, C[p.tipo]);
  }

  pintaTeclado(ctx) {
    const activo = this.fase === 'cuenta';
    for (const { k, r } of this.teclas) {
      const pulsada = activo && input.points.some((q) => inRect(q, r));
      const escala = 3;
      panel(ctx, r.x, r.y, r.w, r.h, { fill: pulsada ? C.morado : C.noche_clara, edge: activo ? C.morado : C.carbon });
      if (k === 'BORRA' || k === 'OK') {
        text(ctx, k, r.x + (r.w >> 1), r.y + 10, { font: 'bold', color: activo ? C.rosa_claro : C.gris, align: 'center' });
      } else cifras(ctx, k, r.x + (r.w >> 1), r.y + 10, { escala, color: activo ? C.marfil : C.gris, align: 'center' });
    }
    if (activo) return;
    const y = TECLAS.y + 34;
    panel(ctx, 24, y, W - 48, 40, { fill: C.carbon, edge: C.rosa_neon });
    text(ctx, 'ARRASTRA LAS BOTELLAS', W >> 1, y + 8, { font: 'bold', color: C.rosa_claro, align: 'center' });
    text(ctx, 'DE LA NEVERA AL MOSTRADOR', W >> 1, y + 25, { font: 'label', color: C.marfil, align: 'center' });
  }
}

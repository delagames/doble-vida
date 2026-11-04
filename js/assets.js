// Carga de imágenes y JSON con caché. C es la paleta de assets/ui/palette.json.
export const C = {};
const images = new Map();
const pending = new Map();

export function loadImage(path) {
  if (images.has(path)) return Promise.resolve(images.get(path));
  if (pending.has(path)) return pending.get(path);
  const p = new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => { images.set(path, im); pending.delete(path); resolve(im); };
    im.onerror = () => { pending.delete(path); reject(new Error(`No se pudo cargar ${path}`)); };
    im.src = path;
  });
  pending.set(path, p);
  return p;
}

export function img(path) { return images.get(path) || null; }

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`No se pudo cargar ${path}`);
  return r.json();
}

const BG = [
  '01-pasillo-laura', '02-chino', '03-coche', '04-portal', '05-siglo-xxi',
  '06-alquimia-puerta', '07-alquimia-dentro', '08-modernicolas-puerta',
  '09-modernicolas-dentro', '10-hotel', '11-mitjana', '12-malagueta-noche',
  '13-onda-pasadena', '14-malagueta-amanecer', '15-control',
];
/** '#RRGGBB' a [r, g, b]. */
export const rgbDe = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export const bgPath = (id) => `assets/bg/${id}.png`;

export async function loadCore() {
  Object.assign(C, await loadJSON('assets/ui/palette.json'));
  await Promise.all([
    ...BG.map((id) => loadImage(bgPath(id))),
    loadImage('assets/logo/title-doble-vida-270x140.png'),
  ]);
  await Promise.all([
    document.fonts.load('16px Pixelify'),
    document.fonts.load('bold 16px Pixelify'),
    document.fonts.load('bold 32px Pixelify'),
    document.fonts.load('8px Silkscreen'),
  ]);
}

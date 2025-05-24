// src/collision.js
import heightmapSrc from './assets/heightmap.png';

const img = new Image();
img.src = heightmapSrc;

const canvas = document.createElement('canvas');
let ctx, imgData, w, h;

// Dès que l’image est chargée, on la dessine dans le canvas
img.onload = () => {
  w = img.width;
  h = img.height;
  canvas.width = w;
  canvas.height = h;
  ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  imgData = ctx.getImageData(0, 0, w, h).data;
};

/**
 * Teste si la position (x,z) en monde est walkable.
 * - worldSize doit correspondre à la taille du terrain (ici 50).
 */
const worldSize = 50;
export function isWalkable(x, z) {
  if (!imgData) return false; // pas encore prêt
  // convertir coordonnées monde [-size/2, +size/2] en UV [0..w-1],[0..h-1]
  const u = Math.floor(((x + worldSize/2) / worldSize) * w);
  const v = Math.floor(((z + worldSize/2) / worldSize) * h);
  if (u < 0 || u >= w || v < 0 || v >= h) return false;
  const idx = (v * w + u) * 4;
  const r = imgData[idx]; // niveaux de gris → R=G=B
  return r === 0;
}

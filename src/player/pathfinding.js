// src/pathfinding.js
import * as THREE from 'three';
import { isWalkable } from '../world/collision.js';

// Taille du monde (doit être la même que dans collision.js)
const WORLD_SIZE = 100;
// Nombre de cellules par côté (grille WORLD_SIZE×WORLD_SIZE subdivisée)
const GRID_DIVS  = 200;
const CELL_SIZE  = WORLD_SIZE / GRID_DIVS;

// Directions 8-voisines avec contrôle de diagonale
const NEIGHBORS = [];
for (let i = 0; i < 16; i++) {
  const angle = (i / 16) * 2 * Math.PI;
  NEIGHBORS.push({
    dx: Math.round(Math.cos(angle)),
    dz: Math.round(Math.sin(angle))
  });
}
// Filtrer les doublons, car cos/sin arrondis peuvent donner plusieurs fois le même (0,1), (1,0), etc.
const unique = {};
const ND = [];
for (const d of NEIGHBORS) {
  const key = `${d.dx},${d.dz}`;
  if (!unique[key] && (d.dx !== 0 || d.dz !== 0)) {
    unique[key] = true;
    ND.push(d);
  }
}
NEIGHBORS.length = 0;
NEIGHBORS.push(...ND);

// Convertit coord monde → i,j sur grille
function worldToGrid(x, z) {
  const gi = Math.floor(((x + WORLD_SIZE/2) / WORLD_SIZE) * GRID_DIVS);
  const gj = Math.floor(((z + WORLD_SIZE/2) / WORLD_SIZE) * GRID_DIVS);
  return { gi, gj };
}

// Convertit i,j sur grille → point monde (au centre de la cellule)
function gridToWorld(gi, gj) {
  const x = (gi + 0.5) * CELL_SIZE - WORLD_SIZE/2;
  const z = (gj + 0.5) * CELL_SIZE - WORLD_SIZE/2;
  return new THREE.Vector3(x, 0.5, z);
}

export function hasLineOfSight(a, b) {
  const steps = Math.ceil(a.distanceTo(b) / (CELL_SIZE * 0.5));
  for (let i = 1; i < steps; ++i) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (!isWalkable(x, z)) return false;
  }
  return true;
}

export function findPath(startX, startZ, endX, endZ) {
  const { gi: si, gj: sj } = worldToGrid(startX, startZ);
  const { gi: ei, gj: ej } = worldToGrid(endX, endZ);

  // Hors grille ou cible non marchable ?
  if (
    si < 0|| si >= GRID_DIVS|| sj < 0|| sj >= GRID_DIVS ||
    ei < 0|| ei >= GRID_DIVS|| ej < 0|| ej >= GRID_DIVS ||
    !isWalkable(endX, endZ)
  ) {
    return [];
  }

  const size     = GRID_DIVS;
  const visited  = new Array(size * size).fill(false);
  const parent   = new Array(size * size).fill(-1);
  const queue    = [];

  function idx(i, j) { return j * size + i; }

  visited[idx(si,sj)] = true;
  queue.push({ i: si, j: sj });

  let found = false;
  while (queue.length > 0) {
    const { i, j } = queue.shift();
    if (i === ei && j === ej) { found = true; break; }

    for (let {dx, dz} of NEIGHBORS) {
      const ni = i + dx, nj = j + dz;
      if (ni < 0 || ni >= size || nj < 0 || nj >= size) continue;
      const nIdx = idx(ni, nj);
      if (visited[nIdx]) continue;

      // Vérif collision simple
      const worldP = gridToWorld(ni, nj);
      if (!isWalkable(worldP.x, worldP.z)) continue;

      // Empêche le découpage de coin : pour diagonales
      if (dx !== 0 && dz !== 0) {
        // on exige que les deux côtés orthogonaux soient ok
        const w1 = gridToWorld(i+dx, j);
        const w2 = gridToWorld(i, j+dz);
        if (!isWalkable(w1.x, w1.z) || !isWalkable(w2.x, w2.z)) {
          continue;
        }
      }

      visited[nIdx] = true;
      parent[nIdx]  = idx(i, j);
      queue.push({ i: ni, j: nj });
    }
  }

  if (!found) return [];

    // Reconstruction du chemin
    const path = [];
    let cur = idx(ei, ej);
    while (cur !== idx(si, sj) && cur !== -1) {
      const i = cur % size;
      const j = Math.floor(cur / size);
      path.push(gridToWorld(i, j));
      cur = parent[cur];
    }
    // Ajoute le point de départ réel (vraie position du perso, et non le centre de cellule)
    path.push(new THREE.Vector3(startX, 0.5, startZ));
    path.reverse();



function smoothPath(path) {
  if (path.length <= 2) return path;
  const result = [path[0]];
  let anchor = 0;
  for (let i = 1; i < path.length; ++i) {
    if (
      i === path.length - 1 ||
      !hasLineOfSight(result[result.length - 1], path[i])
    ) {
      result.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  result.push(path[path.length - 1]);
  return result.filter((pt, idx, arr) => idx === 0 || !pt.equals(arr[idx - 1]));
}

  return smoothPath(path);
}

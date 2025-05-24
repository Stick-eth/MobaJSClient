import * as THREE from 'three';
import { renderer, camera } from './scene.js';
import { terrainMesh } from './terrain.js';
import { setPath,character } from './character.js';
import { isWalkable } from './collision.js';
import { showMarker } from './marker.js';
import { findPath } from './pathfinding.js';
import { hasLineOfSight } from './pathfinding.js'; 


const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

export function initInput() {
  const canvas = renderer.domElement;

  // 1. Clic droit pressé → déplacement immédiat du personnage + affichage du marker
  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) { // bouton droit pressé
      e.preventDefault();

      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const hits = raycaster.intersectObject(terrainMesh);
      if (hits.length > 0) {
        const point = hits[0].point;
        if (isWalkable(point.x, point.z)) {
          if (hasLineOfSight(character.position, point)) {
            const flatPoint = point.clone();
            flatPoint.y = character.position.y;
            setPath([flatPoint]);
            showMarker(flatPoint);
          } else {
            // Sinon on calcule le chemin BFS
            const path = findPath(
              character.position.x, character.position.z,
              point.x, point.z
            );
            if (path.length > 0) {
              setPath(path);
              showMarker(point);
            }
          }
        }
      }
    }
    // Toujours bloquer scroll molette natif
    if (e.button === 1) {
      e.preventDefault();
    }
  });

  // 2. Empêcher l'apparition du menu contextuel
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
  });

  // 3. Bloquer le scroll natif au passage de la molette
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
  }, { passive: false });
}

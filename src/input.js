import * as THREE from 'three';
import { renderer, camera } from './scene.js';
import { terrainMesh } from './terrain.js';
import { setTarget } from './character.js';
import { isWalkable } from './collision.js';
import { showMarker } from './marker.js';

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

export function initInput() {
  const canvas = renderer.domElement;

  // 1. Clic droit → déplacement du personnage + affichage du marker
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();

    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObject(terrainMesh);
    if (hits.length > 0) {
      const point = hits[0].point;
     //if (isWalkable(point.x, point.z)) {
       setTarget(point);
       showMarker(point);
     //};
    }
  });

  // 2. Bloquer le scroll natif au clic molette
  canvas.addEventListener('mousedown', e => {
    if (e.button === 1) {
      e.preventDefault();
    }
  });

  // 3. Bloquer le scroll natif au passage de la molette
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
  }, { passive: false });
}

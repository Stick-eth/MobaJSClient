import * as THREE from 'three';
import { renderer } from './scene.js';
import { camera, scene, plane } from './scene.js';
import { setTarget } from './character.js';

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
let isPointerLocked = false;

export function initInput() {
  const canvas = renderer.domElement;

  // 1. Clic droit → déplacement du personnage
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(plane);
    if (hits.length > 0) setTarget(hits[0].point);
  });

  // 2. Demande de verrouillage du pointeur sur molette enfoncée
  canvas.addEventListener('mousedown', e => {
    if (e.button === 1) {
      e.preventDefault();
      canvas.requestPointerLock();
    }
  });

  // 3. Sortie du pointeur quand on relâche la molette
  document.addEventListener('mouseup', e => {
    if (e.button === 1 && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  });

  // 4. Suivi de l’état de verrouillage
  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === canvas;
  });

  // 5. Bloquer le scroll natif au passage de la molette (toujours)
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
  }, { passive: false });
}

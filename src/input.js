import * as THREE from 'three'; 
import { renderer, camera } from './scene.js';
import { terrainMesh } from './terrain.js';
import { setPath, character, moveToAttackTarget, attackTarget } from './character.js';
import { isWalkable } from './collision.js';
import { showMarker } from './marker.js';
import { findPath, hasLineOfSight } from './pathfinding.js';
import { remotePlayers } from './remotePlayers.js';
import { socket } from './socket.js';

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

let lastAutoAttackTime = 0;
const AUTOATTACK_COOLDOWN = 600; // en ms

let hoveredEnemy = null;
let currentAttackTarget = null;
let autoAttackInterval = null;


// -- Survol souris sur joueurs ennemis --
function updateHoverEnemy() {
  raycaster.setFromCamera(mouse, camera);
  const meshes = Object.values(remotePlayers);

  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    const mesh = hits[0].object;
    if (hoveredEnemy !== mesh) {
      if (hoveredEnemy) hoveredEnemy.material.emissive?.set(0x000000);
      hoveredEnemy = mesh;
      hoveredEnemy.material.emissive?.set(0xff2222); // rouge
    }
  } else {
    if (hoveredEnemy) hoveredEnemy.material.emissive?.set(0x000000);
    hoveredEnemy = null;
  }
}

// -- Attaque auto sur joueur ciblé (juste la poursuite, toujours pathfinding) --
function startAttackingEnemy(enemyMesh) {
  stopAttacking();
  currentAttackTarget = enemyMesh;
  moveToAttackTarget(enemyMesh);
}


function stopAttacking() {
  currentAttackTarget = null;
  if (autoAttackInterval) clearInterval(autoAttackInterval);
  autoAttackInterval = null;
  if (attackTarget) {
    moveToAttackTarget(null);
  }
}

// Permet à remotePlayers.js de signaler si une cible disparaît
export function onRemotePlayerRemoved(id) {
  if (currentAttackTarget && currentAttackTarget.userData.id === id) {
    stopAttacking();
  }
}

// -- Gestion souris globale (track en temps réel pour hover) --
window.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

export function initInput() {
  const canvas = renderer.domElement;

  canvas.addEventListener('mousedown', e => {
    if (e.button === 2) { // bouton droit
      e.preventDefault();

      raycaster.setFromCamera(mouse, camera);

      // -- Clic sur un joueur ennemi --
      const enemyMeshes = Object.values(remotePlayers);
      const hitEnemies = raycaster.intersectObjects(enemyMeshes);
      if (hitEnemies.length > 0) {
        const enemyMesh = hitEnemies[0].object;
        startAttackingEnemy(enemyMesh);
        return; // On n'autorise pas déplacement sur clic joueur
      }

      // -- Clic droit sur le terrain pour déplacer --
      const hits = raycaster.intersectObject(terrainMesh);
      if (hits.length > 0) {
        stopAttacking(); // Annule attaque en cours si on clique le sol
        const point = hits[0].point;
        if (isWalkable(point.x, point.z)) {
          const dist = character.position.distanceTo(point);
          if (dist < 2 && hasLineOfSight(character.position, point)) {
            // Ligne droite seulement pour petits déplacements sans obstacle
            const flatPoint = point.clone();
            flatPoint.y = character.position.y;
            setPath([flatPoint]);
            showMarker(flatPoint);
          } else {
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
    if (e.button === 1) {
      e.preventDefault();
    }
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
  }, { passive: false });
}

// Appelé à chaque frame depuis main.js pour gérer hover en temps réel
export function updateInput(delta = 1/60) {
  updateHoverEnemy();

  // -- Gestion autoattack (cooldown géré proprement) --
  if (currentAttackTarget) {
    const dist = character.position.distanceTo(currentAttackTarget.position);
    const now = Date.now();
    if (dist <= 6 && (now - lastAutoAttackTime) >= AUTOATTACK_COOLDOWN) {
      // Peut attaquer
      socket.emit("autoattack", {
        targetId: currentAttackTarget.userData.id,
        from: socket.id,
        pos: {
          x: character.position.x,
          y: character.position.y,
          z: character.position.z,
        }
      });
      lastAutoAttackTime = now;
    }
  }
}


import * as THREE from 'three'; 
import { renderer, camera } from '../world/scene.js';
import { terrainMesh } from '../world/terrain.js';
import { setPath, character, moveToAttackTarget, attackTarget, isDead, isGameActive, areControlsEnabled, getAttackRange, getCurrentDestination, getCurrentPath } from '../player/character.js';
import { isWalkable } from '../world/collision.js';
import { showMarker } from '../ui/marker.js';
import { findPath, hasLineOfSight } from '../player/pathfinding.js';
import { remotePlayers } from '../network/remotePlayers.js';
import { socket } from '../network/socket.js';
import { onClassChange } from '../player/classes.js';
import { isEnemyTeam, getMyTeam } from '../core/teams.js';
import { getMinionMeshes } from '../world/minions.js';

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

const AUTOATTACK_RETRY_MS = 120;

let lastAutoAttackTime = 0;
let autoAttackCooldownMs = 650; // en ms, dépend de la classe
let pendingAutoAttack = false;
let lastAutoAttackAttempt = 0;

let hoveredEnemy = null;
let currentAttackTarget = null;
let autoAttackInterval = null;


// -- Survol souris sur joueurs ennemis --
function resolveTargetableMesh(object) {
  let node = object;
  while (node) {
    const hasId = node.userData && node.userData.id !== undefined && node.userData.id !== null;
    const hasType = typeof node.userData?.type === 'string';
    const hasUnitType = typeof node.userData?.unitType === 'string';
    if (hasId && (hasType || hasUnitType)) {
      return node;
    }
    node = node.parent;
  }
  return null;
}

function getTargetType(mesh) {
  if (!mesh?.userData) return 'player';
  const { type, unitType } = mesh.userData;
  if (type === 'minion' || unitType === 'minion') {
    return 'minion';
  }
  if (type === 'player' || unitType === 'player') {
    return 'player';
  }
  return 'player';
}

function setHoverHighlight(mesh, highlighted) {
  if (!mesh) return;
  if (highlighted) {
    if (!mesh.userData.__hoverOriginalMaterial) {
      mesh.userData.__hoverOriginalMaterial = mesh.material;
    }
    if (!mesh.userData.__hoverMaterial) {
      const cloned = mesh.material?.clone ? mesh.material.clone() : null;
      if (cloned) {
        if (cloned.emissive) {
          cloned.emissive.setHex(0xff2222);
          cloned.emissiveIntensity = Math.max(cloned.emissiveIntensity ?? 0.65, 0.65);
        } else if (cloned.color) {
          cloned.color.setHex(0xff2222);
        }
        mesh.userData.__hoverMaterial = cloned;
      }
    }
    if (mesh.userData.__hoverMaterial) {
      mesh.material = mesh.userData.__hoverMaterial;
    }

    const indicator = mesh.userData?.indicator;
    if (indicator) {
      indicator.userData = indicator.userData || {};
      if (!indicator.userData.__hoverOriginalMaterial) {
        indicator.userData.__hoverOriginalMaterial = indicator.material;
      }
      if (!indicator.userData.__hoverMaterial) {
        const indicatorClone = indicator.material?.clone ? indicator.material.clone() : null;
        if (indicatorClone) {
          if (indicatorClone.emissive) {
            indicatorClone.emissive.setHex(0xff5555);
            indicatorClone.emissiveIntensity = Math.max(indicatorClone.emissiveIntensity ?? 0.75, 0.75);
          }
          if (indicatorClone.color) {
            indicatorClone.color.setHex(0xff5555);
          }
          indicator.userData.__hoverMaterial = indicatorClone;
        }
      }
      if (indicator.userData.__hoverMaterial) {
        indicator.material = indicator.userData.__hoverMaterial;
      }
    }
  } else {
    if (mesh.userData.__hoverOriginalMaterial) {
      mesh.material = mesh.userData.__hoverOriginalMaterial;
    }
    const indicator = mesh.userData?.indicator;
    if (indicator?.userData?.__hoverOriginalMaterial) {
      indicator.material = indicator.userData.__hoverOriginalMaterial;
    }
  }
}

function getTargetableEnemyMeshes() {
  const players = Object.values(remotePlayers)
    .filter(mesh => mesh && mesh.visible && isEnemyMesh(mesh));
  const minions = getMinionMeshes()
    .filter(mesh => mesh && mesh.visible && isEnemyMesh(mesh));
  return [...players, ...minions];
}

function updateHoverEnemy() {
  raycaster.setFromCamera(mouse, camera);
  const meshes = getTargetableEnemyMeshes();

  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length > 0) {
    const mesh = resolveTargetableMesh(hits[0].object);
    if (mesh && hoveredEnemy !== mesh) {
      if (hoveredEnemy) setHoverHighlight(hoveredEnemy, false);
      hoveredEnemy = mesh;
      setHoverHighlight(hoveredEnemy, true);
    } else if (!mesh && hoveredEnemy) {
      setHoverHighlight(hoveredEnemy, false);
      hoveredEnemy = null;
    }
  } else if (hoveredEnemy) {
    setHoverHighlight(hoveredEnemy, false);
    hoveredEnemy = null;
  }
}

// -- Attaque auto sur joueur ciblé (juste la poursuite, toujours pathfinding) --
function startAttackingEnemy(enemyMesh) {
  const resolved = resolveTargetableMesh(enemyMesh);
  if (!resolved || !isEnemyMesh(resolved)) {
    return;
  }
  stopAttacking();
  currentAttackTarget = resolved;
  moveToAttackTarget(resolved);
}


function stopAttacking() {
  currentAttackTarget = null;
  if (autoAttackInterval) clearInterval(autoAttackInterval);
  autoAttackInterval = null;
  pendingAutoAttack = false;
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
    if (isDead || !isGameActive || !areControlsEnabled()) {
      e.preventDefault();
      return;
    }
    if (e.button === 2) { // bouton droit
      e.preventDefault();

      raycaster.setFromCamera(mouse, camera);

      // -- Clic sur un joueur ennemi --
      const enemyMeshes = getTargetableEnemyMeshes();
      const hitEnemies = raycaster.intersectObjects(enemyMeshes, true);
      if (hitEnemies.length > 0) {
        const enemyMesh = resolveTargetableMesh(hitEnemies[0].object);
        if (enemyMesh) {
          startAttackingEnemy(enemyMesh);
        }
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
  if (!isGameActive || !areControlsEnabled()) {
    if (currentAttackTarget) stopAttacking();
    return;
  }
  if (isDead) {
    if (currentAttackTarget) stopAttacking();
    return;
  }
  updateHoverEnemy();

  if (currentAttackTarget && !isEnemyMesh(currentAttackTarget)) {
    stopAttacking();
    return;
  }
  if (currentAttackTarget && (!currentAttackTarget.visible || !currentAttackTarget.parent)) {
    stopAttacking();
    return;
  }

  // -- Gestion autoattack (cooldown géré proprement) --
  if (currentAttackTarget) {
    const dist = character.position.distanceTo(currentAttackTarget.position);
    const now = Date.now();
    if (pendingAutoAttack && (now - lastAutoAttackAttempt) >= AUTOATTACK_RETRY_MS) {
      pendingAutoAttack = false;
    }
    const aaRange = getAttackRange();
    if (
      dist <= aaRange + 0.05 &&
      !pendingAutoAttack &&
      (now - lastAutoAttackTime) >= autoAttackCooldownMs
    ) {
      // Peut attaquer
      pendingAutoAttack = true;
      lastAutoAttackAttempt = now;
      socket.emit("autoattack", {
        targetId: currentAttackTarget.userData.id,
        from: socket.id,
        targetType: getTargetType(currentAttackTarget),
        pos: {
          x: character.position.x,
          y: character.position.y,
          z: character.position.z,
        }
      });
    }
  }
}

export function getInputDebugState() {
  return {
    attackTargetId: currentAttackTarget?.userData?.id ?? null,
    pendingAutoAttack,
    lastAutoAttackTime,
    lastAutoAttackAttempt,
    autoAttackCooldownMs,
    hoveredEnemyId: hoveredEnemy?.userData?.id ?? null,
    currentPath: getCurrentPath(),
    destination: getCurrentDestination(),
  };
}

function isEnemyMesh(mesh) {
  if (!mesh) return false;
  const team = mesh.userData?.team;
  const myTeam = getMyTeam();
  if (!team || !myTeam) {
    return true;
  }
  return isEnemyTeam(team);
}

export function resetAutoAttackCooldown() {
  lastAutoAttackTime = Date.now() - autoAttackCooldownMs;
  pendingAutoAttack = false;
}

onClassChange((definition) => {
  const cooldown = definition?.stats?.autoAttack?.cooldownMs;
  if (typeof cooldown === 'number') {
    autoAttackCooldownMs = cooldown;
  }
  lastAutoAttackTime = Date.now() - autoAttackCooldownMs;
  pendingAutoAttack = false;
});

window.addEventListener('autoattackConfirmed', () => {
  pendingAutoAttack = false;
  lastAutoAttackTime = Date.now();
});

window.addEventListener('enemyDied', (event) => {
  const { id } = event.detail || {};
  if (!id) return;
  if (currentAttackTarget && currentAttackTarget.userData?.id === id) {
    stopAttacking();
  }
});


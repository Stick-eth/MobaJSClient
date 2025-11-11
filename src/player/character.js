import * as THREE from 'three';
import { isWalkable } from '../world/collision.js';
import { socket } from "../network/socket.js";
import { findPath,hasLineOfSight } from './pathfinding.js'; // ← à ne pas oublier !
import { onClassChange } from './classes.js';

export let attackTarget = null;
let attackRange = 4; // portée d’attaque

let lastAttackTargetPos = null;
export let isGameActive = false;
let controlsEnabled = false;

export function moveToAttackTarget(targetMesh) {
  if (!controlsEnabled) return;
  attackTarget = targetMesh;
  // A chaque updateCharacter, on va se rapprocher automatiquement
}

export function getAttackRange() {
  return attackRange;
}

export const character = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x2194ce })
);
character.userData.moveSpeed = 4.5;

// position initiale
character.position.set(0, 0.5, 0);
let lastSafePos = new THREE.Vector3(0, 0.5, 0);
export let isDead = false;

export function setDeadState(value) {
  isDead = value;
  if (value) {
    setControlsEnabled(false);
  }
}

export function setGameActive(value) {
  isGameActive = value;
  if (!value) {
    controlsEnabled = false;
    attackTarget = null;
    setPath([]);
    lastAttackTargetPos = null;
  }
}

export function setControlsEnabled(value) {
  controlsEnabled = value && isGameActive && !isDead;
  if (!controlsEnabled) {
    attackTarget = null;
    setPath([]);
    lastAttackTargetPos = null;
  }
}

export function areControlsEnabled() {
  return controlsEnabled;
}

let path = [];
let moveSpeed = 4.5; // unités/seconde (3) après ajustement serveur

export function initCharacter(scene) {
  scene.add(character);
}

export function setPath(newPath) {
  path = newPath.map(v => v.clone());
}

export function updateCharacter(delta) {
  if (!isGameActive || !controlsEnabled || isDead) return;
  if (attackTarget) {
    const targetPos = attackTarget.position.clone();
    targetPos.y = character.position.y;
    const dist = character.position.distanceTo(targetPos);

    if (dist > attackRange) {
      // On enlève totalement la logique ligne de vue directe (pour éviter le bug)
      if (
        !lastAttackTargetPos ||
        targetPos.distanceTo(lastAttackTargetPos) > 0.3 ||
        path.length === 0
      ) {
        // Toujours utiliser le pathfinding !
        const bfsPath = findPath(
          character.position.x, character.position.z,
          targetPos.x, targetPos.z
        ).map(v => v.clone());
        if (bfsPath.length > 1) {
          setPath(bfsPath);
        } else {
          setPath([]); // Rien à faire si vraiment bloqué
        }
        lastAttackTargetPos = targetPos.clone();
      }
      // Sinon on suit le path courant
    } else {
      setPath([]);
      lastAttackTargetPos = null;
    }
  }

  // Si pas de cible d'attaque, on suit le path défini
  if (path.length === 0) return;

  // prochaine cible sur le chemin
  const target = path[0];
  const dir = new THREE.Vector3().subVectors(target, character.position);
  const dist = dir.length();

  if (dist > 0.1) {
    dir.normalize();
    const step = Math.min(moveSpeed * delta, dist);
    character.position.addScaledVector(dir, step);
    // orientation
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir
    );
    character.quaternion.slerp(q, 0.2);
  } else {
    // waypoint atteint : on le retire
    path.shift();
  }
}

export function checkCharacterPosition() {
  // Correction si bloqué dans un mur (walkable = noir)
  if (!isWalkable(character.position.x, character.position.z)) {
    // Recherche locale d'un point walkable autour de la position actuelle
    const safe = findNearestWalkable(character.position.x, character.position.z);
    if (safe) {
      character.position.set(safe.x, character.position.y, safe.z);
    } else {
      // Si aucun point walkable trouvé : revient à la dernière safe pos
      character.position.copy(lastSafePos);
    }
  } else {
    // On stocke la dernière position walkable connue
    lastSafePos.copy(character.position);
  }
}

// Fonction utilitaire de recherche locale (identique à la précédente)
function findNearestWalkable(x, z) {
  const RADIUS = 1.5;
  const STEPS = 24;
  const INCR  = 0.18;
  for (let r = INCR; r <= RADIUS; r += INCR) {
    for (let a = 0; a < STEPS; ++a) {
      const theta = (a / STEPS) * Math.PI * 2;
      const nx = x + Math.cos(theta) * r;
      const nz = z + Math.sin(theta) * r;
      if (isWalkable(nx, nz)) {
        return { x: nx, z: nz };
      }
    }
  }
  return null;
}

let lastSentPosition = new THREE.Vector2(character.position.x, character.position.z);
let posSeq = 0; // sequence number for movement updates

function positionsAreEqual(a, b, epsilon = 0.001) {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}

function maybeSendPosition() {
  if (!isGameActive || !controlsEnabled || isDead) return;
  if (!socket.connected) return;
  const current = new THREE.Vector2(character.position.x, character.position.z);
  if (!positionsAreEqual(current, lastSentPosition)) {
    socket.emit('playerPosition', {
      x: character.position.x,
      z: character.position.z,
      seq: ++posSeq,
    });
    lastSentPosition.copy(current);
  }
}

const tickrate = 1/20; // 20 updates par seconde
setInterval(maybeSendPosition, tickrate * 1000);

onClassChange((definition) => {
  const range = definition?.stats?.autoAttack?.range;
  if (typeof range === 'number') {
    attackRange = range;
  }
});

export function setMoveSpeed(value) {
  if (typeof value === 'number' && !Number.isNaN(value) && value > 0) {
    moveSpeed = value;
    character.userData.moveSpeed = moveSpeed;
  }
}

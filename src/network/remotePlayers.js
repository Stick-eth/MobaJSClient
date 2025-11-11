import * as THREE from 'three';
import { scene } from '../world/scene.js';
import { onRemotePlayerRemoved } from '../core/input.js';
import { trackHealthBar, untrackHealthBar, setHealthBarValue, setHealthBarVisible } from '../ui/healthBars.js';

// Map des joueurs distants : id -> mesh
export const remotePlayers = {};


// Création d’un mesh pour un autre joueur
function createRemotePlayerMesh(classId) {
  const color = classId === 'melee' ? 0xf1c40f : 0xf95d9b;
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color }) // couleur différente selon la classe
  );
}

// Ajoute un joueur à la scène
export function addRemotePlayer(id, x, z, hp = 100, maxHp = 100, classId = 'marksman') {
  if (remotePlayers[id]) return; // existe déjà
  const mesh = createRemotePlayerMesh(classId);
  mesh.position.set(x, 0.5, z);
  scene.add(mesh);
  remotePlayers[id] = mesh;
  mesh.userData.id = id; // stocke l'ID pour référence
  mesh.userData.classId = classId;
  mesh.userData.moveSpeed = 4.5;

  trackHealthBar(id, mesh, { color: '#c0392b', max: maxHp });
  setHealthBarValue(id, hp ?? maxHp, maxHp);
  setHealthBarVisible(id, true);
}

// Met à jour la position du joueur
export function updateRemotePlayer(id, x, z, { hp, maxHp, classId } = {}) {
  if (!remotePlayers[id]) {
    addRemotePlayer(id, x, z, hp, maxHp, classId);
  } else {
    remotePlayers[id].position.set(x, 0.5, z);
  }
}

export function updateRemotePlayerClass(id, classId) {
  const mesh = remotePlayers[id];
  if (!mesh) return;
  mesh.userData.classId = classId;
  const material = mesh.material;
  if (material && material.color) {
    const color = classId === 'melee' ? 0xf1c40f : 0xf95d9b;
    material.color.setHex(color);
  }
}

// Retire le mesh d’un joueur (quand il quitte)
export function removeRemotePlayer(id) {
  if (remotePlayers[id]) {
    scene.remove(remotePlayers[id]);
    remotePlayers[id].geometry.dispose();
    remotePlayers[id].material.dispose();
    delete remotePlayers[id];
    onRemotePlayerRemoved(id);
    untrackHealthBar(id);
  }
}

export function clearRemotePlayers() {
  Object.keys(remotePlayers).forEach(removeRemotePlayer);
}

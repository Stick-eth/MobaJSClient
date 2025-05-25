import * as THREE from 'three';
import { scene } from './scene.js';
import { onRemotePlayerRemoved } from './input.js';

// Map des joueurs distants : id -> mesh
export const remotePlayers = {};


// Création d’un mesh pour un autre joueur
function createRemotePlayerMesh() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xf95d9b }) // couleur différente
  );
}

// Ajoute un joueur à la scène
export function addRemotePlayer(id, x, z) {
  if (remotePlayers[id]) return; // existe déjà
  const mesh = createRemotePlayerMesh();
  mesh.position.set(x, 0.5, z);
  scene.add(mesh);
  remotePlayers[id] = mesh;
  mesh.userData.id = id; // stocke l'ID pour référence
}

// Met à jour la position du joueur
export function updateRemotePlayer(id, x, z) {
  if (!remotePlayers[id]) {
    addRemotePlayer(id, x, z);
  } else {
    remotePlayers[id].position.set(x, 0.5, z);
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
  }
}

import * as THREE from 'three';
import { scene } from '../world/scene.js';
import { onRemotePlayerRemoved } from '../core/input.js';
import { trackHealthBar, untrackHealthBar, setHealthBarValue, setHealthBarVisible, setHealthBarColor, setHealthBarLevel } from '../ui/healthBars.js';
import {
  setPlayerTeam,
  clearPlayerTeam,
  getPlayerTeam,
  getTeamMeshColor,
  getHealthBarColorForTeam,
} from '../core/teams.js';

// Map des joueurs distants : id -> mesh
export const remotePlayers = {};


// Création d’un mesh pour un autre joueur
function createRemotePlayerMesh() {
  const color = 0x9ca3af;
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color }) // couleur différente selon la classe
  );
}

// Ajoute un joueur à la scène
export function addRemotePlayer(id, x, z, hp = 100, maxHp = 100, classId = 'marksman', team = null) {
  if (remotePlayers[id]) return; // existe déjà
  const mesh = createRemotePlayerMesh(classId);
  mesh.position.set(x, 0.5, z);
  scene.add(mesh);
  remotePlayers[id] = mesh;
  mesh.userData.id = id; // stocke l'ID pour référence
  mesh.userData.type = 'player';
  mesh.userData.classId = classId;
  mesh.userData.moveSpeed = 4.5;
  mesh.userData.radius = 0.45;
  mesh.userData.hitRadius = 0.45;

  const normalizedTeam = setPlayerTeam(id, team);
  applyTeamVisuals(mesh, normalizedTeam);

  const barColor = getHealthBarColorForTeam(normalizedTeam);
  trackHealthBar(id, mesh, { color: barColor, max: maxHp });
  setHealthBarValue(id, hp ?? maxHp, maxHp);
  setHealthBarVisible(id, true);
  setHealthBarLevel(id, 1);
}

// Met à jour la position du joueur
export function updateRemotePlayer(id, x, z, { hp, maxHp, classId, team } = {}) {
  if (!remotePlayers[id]) {
    addRemotePlayer(id, x, z, hp, maxHp, classId, team);
  } else {
    remotePlayers[id].position.set(x, 0.5, z);
    if (team) {
      updateRemotePlayerTeam(id, team);
    }
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

export function updateRemotePlayerTeam(id, team) {
  const normalized = setPlayerTeam(id, team);
  const mesh = remotePlayers[id];
  if (mesh) {
    applyTeamVisuals(mesh, normalized);
  }
  const barColor = getHealthBarColorForTeam(normalized);
  setHealthBarColor(id, barColor);
  return normalized;
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
    clearPlayerTeam(id);
  }
}

export function clearRemotePlayers() {
  Object.keys(remotePlayers).forEach(removeRemotePlayer);
}

function applyTeamVisuals(mesh, team) {
  if (!mesh) return;
  mesh.userData.team = team || null;
  const material = mesh.material;
  if (material && typeof material.color?.setHex === 'function') {
    material.color.setHex(getTeamMeshColor(team));
  }
  if (material && material.emissive) {
    material.emissive.setHex(0x000000);
  }
}

function refreshAllRemoteTeamStyles() {
  Object.entries(remotePlayers).forEach(([id, mesh]) => {
    const team = getPlayerTeam(id);
    applyTeamVisuals(mesh, team);
    const barColor = getHealthBarColorForTeam(team);
    setHealthBarColor(id, barColor);
  });
}

window.addEventListener('teamChanged', () => {
  refreshAllRemoteTeamStyles();
});

window.addEventListener('playerTeamUpdated', (event) => {
  const { id } = event.detail || {};
  if (!id || id === 'self') return;
  const mesh = remotePlayers[id];
  if (!mesh) return;
  const team = getPlayerTeam(id);
  applyTeamVisuals(mesh, team);
  const barColor = getHealthBarColorForTeam(team);
  setHealthBarColor(id, barColor);
});

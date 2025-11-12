import * as THREE from 'three';
import { getTeamMeshColor } from '../core/teams.js';

const MINION_HEIGHT = 0.8;
const MINION_HALF_HEIGHT = MINION_HEIGHT * 0.5;
const DEFAULT_MINION_SPEED = 2.6;
const NETWORK_PREDICTION_S = 0.2;

const minionMeshes = new Map();
let sceneRef = null;

const sharedGeometry = new THREE.BoxGeometry(0.8, MINION_HEIGHT, 0.8);
const materialCache = new Map();

function getMaterialForTeam(team) {
  const key = team || 'neutral';
  if (materialCache.has(key)) {
    return materialCache.get(key);
  }
  const color = getTeamMeshColor(team);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.1,
    roughness: 0.5,
    metalness: 0.1
  });
  materialCache.set(key, material);
  return material;
}

function updateMeshPosition(mesh, x, z) {
  if (typeof x === 'number') {
    mesh.position.x = x;
  }
  if (typeof z === 'number') {
    mesh.position.z = z;
  }
  mesh.position.y = MINION_HALF_HEIGHT;
}

function computePredictedTarget(minion) {
  const vx = typeof minion.vx === 'number' ? minion.vx : 0;
  const vz = typeof minion.vz === 'number' ? minion.vz : 0;
  return {
    x: typeof minion.x === 'number' ? minion.x + vx * NETWORK_PREDICTION_S : 0,
    z: typeof minion.z === 'number' ? minion.z + vz * NETWORK_PREDICTION_S : 0,
    vx,
    vz
  };
}

function applyMinionData(entry, minion, { snap = false } = {}) {
  if (!minion) return;

  const predicted = computePredictedTarget(minion);
  entry.team = minion.team || null;
  entry.arrived = Boolean(minion.arrived);
  entry.speed = typeof minion.speed === 'number' && !Number.isNaN(minion.speed)
    ? minion.speed
    : (entry.speed || DEFAULT_MINION_SPEED);
  entry.velocity.x = predicted.vx;
  entry.velocity.z = predicted.vz;
  entry.target.x = predicted.x;
  entry.target.z = predicted.z;
  const timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  entry.lastUpdate = timestamp;

  if (entry.mesh.userData.team !== entry.team) {
    entry.mesh.userData.team = entry.team;
    entry.mesh.material = getMaterialForTeam(entry.team);
  }

  entry.mesh.visible = true;

  if (snap) {
    updateMeshPosition(entry.mesh,
      typeof minion.x === 'number' ? minion.x : entry.mesh.position.x,
      typeof minion.z === 'number' ? minion.z : entry.mesh.position.z
    );
  }
}

function upsertMinion(minion, { snap = false } = {}) {
  if (!sceneRef || !minion || typeof minion.id !== 'number') {
    return;
  }
  const id = minion.id;
  let entry = minionMeshes.get(id);
  if (!entry) {
    const mesh = new THREE.Mesh(sharedGeometry, getMaterialForTeam(minion.team));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = 'minion';
    mesh.userData.team = minion.team || null;
    mesh.position.y = MINION_HALF_HEIGHT;
    sceneRef.add(mesh);
    const timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    entry = {
      mesh,
      team: minion.team || null,
      arrived: Boolean(minion.arrived),
      target: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      speed: DEFAULT_MINION_SPEED,
      lastUpdate: timestamp
    };
    minionMeshes.set(id, entry);
    snap = true; // ensure new mesh starts at the provided location
  }

  applyMinionData(entry, minion, { snap });
}

export function initMinions(scene) {
  sceneRef = scene;
}

export function handleMinionSnapshot(minions = []) {
  if (!sceneRef) return;
  const validIds = new Set();
  minions.forEach(minion => {
    if (typeof minion?.id !== 'number') return;
    validIds.add(minion.id);
    upsertMinion(minion, { snap: true });
  });

  minionMeshes.forEach((entry, id) => {
    if (!validIds.has(id)) {
      if (sceneRef && entry.mesh.parent === sceneRef) {
        sceneRef.remove(entry.mesh);
      }
      minionMeshes.delete(id);
    }
  });
}

export function handleMinionsSpawned(minions = []) {
  minions.forEach(minion => upsertMinion(minion, { snap: true }));
}

export function handleMinionsUpdated(minions = []) {
  minions.forEach(minion => {
    if (!minionMeshes.has(minion.id)) {
      upsertMinion(minion, { snap: true });
      return;
    }
    const entry = minionMeshes.get(minion.id);
    applyMinionData(entry, minion, { snap: false });
  });
}

export function updateMinions(delta) {
  if (!sceneRef || delta <= 0) return;
  const catchUpMultiplier = 1.35;
  minionMeshes.forEach(entry => {
    if (!entry.target) return;
    const mesh = entry.mesh;
    const dx = entry.target.x - mesh.position.x;
    const dz = entry.target.z - mesh.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < 1e-4) {
      updateMeshPosition(mesh, entry.target.x, entry.target.z);
      return;
    }
    const distance = Math.sqrt(distSq);
    const maxStep = (entry.speed || DEFAULT_MINION_SPEED) * delta * catchUpMultiplier;
    const step = Math.min(distance, maxStep);
    const nx = dx / distance;
    const nz = dz / distance;
    mesh.position.x += nx * step;
    mesh.position.z += nz * step;
    mesh.position.y = MINION_HALF_HEIGHT;
  });
}

export function clearMinions() {
  minionMeshes.forEach(entry => {
    if (sceneRef && entry.mesh.parent === sceneRef) {
      sceneRef.remove(entry.mesh);
    }
  });
  minionMeshes.clear();
}
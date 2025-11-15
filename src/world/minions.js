import * as THREE from 'three';
import { getTeamMeshColor, getHealthBarColorForTeam } from '../core/teams.js';
import {
  trackHealthBar,
  setHealthBarValue,
  setHealthBarVisible,
  setHealthBarColor,
  untrackHealthBar
} from '../ui/healthBars.js';

const MINION_HEIGHT = 0.8;
const MINION_HALF_HEIGHT = MINION_HEIGHT * 0.5;
const DEFAULT_MINION_SPEED = 2.6;
const NETWORK_PREDICTION_S = 0.24;
const TARGET_INTERPOLATION = 0.24;
const VELOCITY_INTERPOLATION = 0.45;
const CATCH_UP_MULTIPLIER = 1.22;
const FRAME_DESYNC_THRESHOLD = 0.35;
const SERVER_DESYNC_THRESHOLD_MS = 550;
const SNAP_DISTANCE_THRESHOLD = 3.25;
const SNAP_DISTANCE_SQ = SNAP_DISTANCE_THRESHOLD * SNAP_DISTANCE_THRESHOLD;

const minionMeshes = new Map();
let sceneRef = null;

const sharedGeometry = new THREE.BoxGeometry(0.8, MINION_HEIGHT, 0.8);
const materialCache = new Map();
const typeIndicatorMaterials = new Map();
const TYPE_INDICATOR_HEIGHT = 0.32;
const TYPE_INDICATOR_GEOMETRY = new THREE.ConeGeometry(0.18, TYPE_INDICATOR_HEIGHT, 6);
const projectileGeometry = new THREE.SphereGeometry(0.12, 8, 8);
const projectileMaterialCache = new Map();

const activeProjectiles = new Map();
const MINION_BAR_PREFIX = 'minion-';

export function getMinionMeshById(id) {
  const entry = minionMeshes.get(id);
  return entry ? entry.mesh : null;
}

export function getMinionMeshes() {
  return Array.from(minionMeshes.values()).map(entry => entry.mesh);
}

function getScaleForType(type) {
  if (type === 'cannon') return 0.95;
  if (type === 'ranged') return 0.8;
  return 0.85;
}

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

function getTypeIndicatorMaterial(type) {
  const key = type || 'default';
  if (typeIndicatorMaterials.has(key)) {
    return typeIndicatorMaterials.get(key);
  }
  let colorHex = 0x95a5a6;
  if (type === 'melee') colorHex = 0xc0392b;
  else if (type === 'ranged') colorHex = 0x2980b9;
  else if (type === 'cannon') colorHex = 0xf39c12;
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.6
  });
  typeIndicatorMaterials.set(key, material);
  return material;
}

function getProjectileMaterial(type) {
  const key = type || 'default';
  if (projectileMaterialCache.has(key)) {
    return projectileMaterialCache.get(key);
  }
  let colorHex = 0x95a5a6;
  if (type === 'ranged') colorHex = 0x5dade2;
  else if (type === 'cannon') colorHex = 0xf1c40f;
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.9
  });
  projectileMaterialCache.set(key, material);
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

function ensureMinionHealthBar(entry) {
  if (!entry || !entry.mesh) return;
  if (!entry.healthBarId) {
    const barId = `${MINION_BAR_PREFIX}${entry.id}`;
    const maxHp = typeof entry.maxHp === 'number' ? entry.maxHp : 1;
    const color = getHealthBarColorForTeam(entry.team);
    trackHealthBar(barId, entry.mesh, { color, max: maxHp });
    entry.healthBarId = barId;
  }
  if (!entry.healthBarId) return;
  const color = getHealthBarColorForTeam(entry.team);
  if (color) {
    setHealthBarColor(entry.healthBarId, color);
  }
  if (typeof entry.hp === 'number' || typeof entry.maxHp === 'number') {
    setHealthBarValue(entry.healthBarId, entry.hp ?? entry.maxHp ?? 0, entry.maxHp);
  }
  setHealthBarVisible(entry.healthBarId, Boolean(entry.mesh.visible));
}

function removeMinionHealthBar(entry) {
  if (!entry?.healthBarId) return;
  untrackHealthBar(entry.healthBarId);
  entry.healthBarId = null;
}

function cleanupProjectilesForIds(idSet) {
  if (!idSet || !idSet.size) return;
  const toDelete = [];
  activeProjectiles.forEach((projectile, projectileId) => {
    if (idSet.has(projectile.fromId) || idSet.has(projectile.targetId)) {
      if (sceneRef && projectile.mesh.parent === sceneRef) {
        sceneRef.remove(projectile.mesh);
      }
      toDelete.push(projectileId);
    }
  });
  toDelete.forEach(projectileId => activeProjectiles.delete(projectileId));
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
  if (typeof entry.id !== 'number') {
    entry.id = typeof minion.id === 'number' ? minion.id : entry.id;
  }
  if (entry.mesh && typeof entry.id === 'number') {
    entry.mesh.userData.id = entry.id;
  }
  entry.team = minion.team || null;
  entry.arrived = Boolean(minion.arrived);
  entry.type = typeof minion.type === 'string' ? minion.type : (entry.type || 'melee');
  entry.speed = typeof minion.speed === 'number' && !Number.isNaN(minion.speed)
    ? minion.speed
    : (entry.speed || DEFAULT_MINION_SPEED);
  if (snap) {
    entry.velocity.x = predicted.vx;
    entry.velocity.z = predicted.vz;
    entry.target.x = predicted.x;
    entry.target.z = predicted.z;
  } else {
    entry.velocity.x += (predicted.vx - entry.velocity.x) * VELOCITY_INTERPOLATION;
    entry.velocity.z += (predicted.vz - entry.velocity.z) * VELOCITY_INTERPOLATION;
    entry.target.x += (predicted.x - entry.target.x) * TARGET_INTERPOLATION;
    entry.target.z += (predicted.z - entry.target.z) * TARGET_INTERPOLATION;
  }
  entry.targetId = typeof minion.targetId === 'number' ? minion.targetId : null;
  if (typeof minion.maxHp === 'number') {
    entry.maxHp = minion.maxHp;
  }
  if (typeof minion.hp === 'number') {
    entry.hp = Math.max(0, minion.hp);
  }
  const timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  entry.lastUpdate = timestamp;

  entry.mesh.userData.unitType = 'minion';
  if (entry.mesh.userData.minionRole !== entry.type) {
    entry.mesh.userData.minionRole = entry.type;
    const scale = getScaleForType(entry.type);
    entry.mesh.scale.set(scale, scale, scale);
    const indicator = entry.mesh.userData.indicator;
    if (indicator) {
      indicator.material = getTypeIndicatorMaterial(entry.type);
      indicator.visible = entry.type !== 'melee';
    }
  }

  if (entry.mesh.userData.team !== entry.team) {
    entry.mesh.userData.team = entry.team;
    entry.mesh.material = getMaterialForTeam(entry.team);
  }

  entry.mesh.visible = true;

  ensureMinionHealthBar(entry);

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
    mesh.userData.unitType = 'minion';
    mesh.userData.team = minion.team || null;
    mesh.userData.id = id;
    mesh.position.y = MINION_HALF_HEIGHT;
    const indicator = new THREE.Mesh(TYPE_INDICATOR_GEOMETRY, getTypeIndicatorMaterial(minion.type));
    indicator.position.y = MINION_HALF_HEIGHT + (TYPE_INDICATOR_HEIGHT * 0.5) + 0.08;
    indicator.visible = minion.type !== 'melee';
    mesh.add(indicator);
    mesh.userData.indicator = indicator;
    sceneRef.add(mesh);
    const timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    entry = {
      id,
      mesh,
      team: minion.team || null,
      arrived: Boolean(minion.arrived),
      target: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      speed: DEFAULT_MINION_SPEED,
      lastUpdate: timestamp,
      type: 'melee',
      hp: typeof minion.hp === 'number' ? minion.hp : undefined,
      maxHp: typeof minion.maxHp === 'number' ? minion.maxHp : undefined,
      targetId: null,
      healthBarId: null
    };
    const initialType = typeof minion.type === 'string' ? minion.type : entry.type;
    entry.type = initialType;
    mesh.userData.minionRole = initialType;
    const scale = getScaleForType(initialType);
    mesh.scale.set(scale, scale, scale);
    indicator.material = getTypeIndicatorMaterial(initialType);
    indicator.visible = initialType !== 'melee';
    ensureMinionHealthBar(entry);
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

  const removedIds = [];
  minionMeshes.forEach((entry, id) => {
    if (!validIds.has(id)) {
      if (sceneRef && entry.mesh.parent === sceneRef) {
        sceneRef.remove(entry.mesh);
      }
      removeMinionHealthBar(entry);
      minionMeshes.delete(id);
      removedIds.push(id);
    }
  });

  if (removedIds.length) {
    cleanupProjectilesForIds(new Set(removedIds));
  }
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

export function handleMinionsRemoved(payload = {}) {
  const ids = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload.ids) ? payload.ids : []);
  const idSet = new Set(ids);
  ids.forEach(id => {
    const entry = minionMeshes.get(id);
    if (!entry) return;
    if (sceneRef && entry.mesh.parent === sceneRef) {
      sceneRef.remove(entry.mesh);
    }
    entry.mesh.visible = false;
    removeMinionHealthBar(entry);
    minionMeshes.delete(id);
  });
  cleanupProjectilesForIds(idSet);
}

export function handleMinionProjectile(projectile = {}) {
  if (!sceneRef || !projectile) return;
  const { id, type, origin, destination, speed } = projectile;
  if (typeof id !== 'number') return;

  const start = new THREE.Vector3(
    typeof origin?.x === 'number' ? origin.x : 0,
    typeof origin?.y === 'number' ? origin.y : MINION_HALF_HEIGHT,
    typeof origin?.z === 'number' ? origin.z : 0
  );
  const end = new THREE.Vector3(
    typeof destination?.x === 'number' ? destination.x : start.x,
    typeof destination?.y === 'number' ? destination.y : start.y,
    typeof destination?.z === 'number' ? destination.z : start.z
  );

  if (activeProjectiles.has(id)) {
    const existing = activeProjectiles.get(id);
    if (sceneRef && existing.mesh.parent === sceneRef) {
      sceneRef.remove(existing.mesh);
    }
    activeProjectiles.delete(id);
  }

  const mesh = new THREE.Mesh(projectileGeometry, getProjectileMaterial(type));
  mesh.position.copy(start);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  sceneRef.add(mesh);

  const distance = start.distanceTo(end);
  const projectileSpeed = Math.max(0.01, typeof speed === 'number' ? speed : 10);
  const duration = Math.max(0.05, distance / projectileSpeed);

  activeProjectiles.set(id, {
    mesh,
    start,
    end,
    duration,
    elapsed: 0,
    fromId: typeof projectile.fromId === 'number' ? projectile.fromId : null,
    targetId: typeof projectile.targetId === 'number' ? projectile.targetId : null,
    targetType: typeof projectile.targetType === 'string' ? projectile.targetType : null
  });
}

export function updateMinions(delta) {
  if (!sceneRef || delta <= 0) return;
  const catchUpMultiplier = CATCH_UP_MULTIPLIER;
  const largeDelta = delta >= FRAME_DESYNC_THRESHOLD;
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  minionMeshes.forEach(entry => {
    if (!entry.target) return;
    const mesh = entry.mesh;
    const timeSinceServer = typeof entry.lastUpdate === 'number' ? (now - entry.lastUpdate) : 0;
    const dxSnap = entry.target.x - mesh.position.x;
    const dzSnap = entry.target.z - mesh.position.z;
    const distSnapSq = dxSnap * dxSnap + dzSnap * dzSnap;
    const shouldSnap = largeDelta || timeSinceServer > SERVER_DESYNC_THRESHOLD_MS;
    if (shouldSnap && distSnapSq > 0.01) {
      if (distSnapSq >= SNAP_DISTANCE_SQ || largeDelta) {
        updateMeshPosition(mesh, entry.target.x, entry.target.z);
      } else {
        mesh.position.x = entry.target.x;
        mesh.position.z = entry.target.z;
        mesh.position.y = MINION_HALF_HEIGHT;
      }
      entry.velocity.x = entry.velocity.x * 0.5;
      entry.velocity.z = entry.velocity.z * 0.5;
      return;
    }
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

  const finished = [];
  activeProjectiles.forEach((projectile, projectileId) => {
    projectile.elapsed += delta;
    const { duration, start, end, mesh } = projectile;
    const t = duration > 0 ? Math.min(1, projectile.elapsed / duration) : 1;
    const inv = 1 - t;
    mesh.position.set(
      start.x * inv + end.x * t,
      start.y * inv + end.y * t,
      start.z * inv + end.z * t
    );
    if (t >= 1) {
      if (sceneRef && mesh.parent === sceneRef) {
        sceneRef.remove(mesh);
      }
      finished.push(projectileId);
    }
  });
  finished.forEach(id => activeProjectiles.delete(id));
}

export function clearMinions() {
  minionMeshes.forEach(entry => {
    if (sceneRef && entry.mesh.parent === sceneRef) {
      sceneRef.remove(entry.mesh);
    }
    removeMinionHealthBar(entry);
  });
  minionMeshes.clear();
  activeProjectiles.forEach(({ mesh }) => {
    if (sceneRef && mesh.parent === sceneRef) {
      sceneRef.remove(mesh);
    }
  });
  activeProjectiles.clear();
}
import * as THREE from 'three';
import { TEAM_BLUE, TEAM_RED } from '../core/teams.js';

const TEAM_KEYS = [TEAM_BLUE, TEAM_RED];

const turretGroups = {
  [TEAM_BLUE]: new THREE.Group(),
  [TEAM_RED]: new THREE.Group(),
};

turretGroups[TEAM_BLUE].name = 'Blue Turrets';
turretGroups[TEAM_RED].name = 'Red Turrets';

const TURRET_RADIUS = 0.6;
const TURRET_HEIGHT = 3;
const TURRET_SEGMENTS = 16;

const turretGeometry = new THREE.CylinderGeometry(
  TURRET_RADIUS,
  TURRET_RADIUS,
  TURRET_HEIGHT,
  TURRET_SEGMENTS
);

const turretMaterials = {
  [TEAM_BLUE]: new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.15,
  }),
  [TEAM_RED]: new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xb91c1c,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.15,
  }),
};

const DEFAULT_PROJECTILE_SPEED = 22;
const DEFAULT_IMPACT_RADIUS = 0.35;
const turretMeshByUid = new Map();
const turretProjectiles = new Map();
const turretRays = new Map();
const turretProjectileMaterialCache = new Map();
const turretProjectileGeometry = new THREE.SphereGeometry(0.18, 12, 12);
let sceneRef = null;
let nextTurretProjectileId = 1;
const tempDir = new THREE.Vector3();
const tempTarget = new THREE.Vector3();
const tempTurretTop = new THREE.Vector3();
const tempRayVec = new THREE.Vector3();
const tempRayQuat = new THREE.Quaternion();
const tempRayUp = new THREE.Vector3(0, 1, 0);

function parseIndex(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeTurretEntries(rawEntries) {
  if (!rawEntries) return [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
  return entries
    .map(entry => {
      if (!entry) return null;

      if (entry.isTexture) {
        return {
          texture: entry,
          lane: null,
          tier: null,
          id: null,
          path: null,
        };
      }

      const texture = entry.texture;
      if (texture?.isTexture) {
        return {
          texture,
          lane: parseIndex(entry.lane),
          tier: parseIndex(entry.tier),
          id: typeof entry.id === 'string' ? entry.id : null,
          path: typeof entry.path === 'string' ? entry.path : null,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function disposeChildren(group) {
  group.clear();
}

export function initTurrets({
  scene,
  turretTextures = {},
  heightTexture,
  displacementScale,
  terrainSize,
}) {
  if (!scene) {
    console.warn('initTurrets skipped: scene not provided.');
    return;
  }

  sceneRef = scene;
  clearTurretProjectiles();
  clearTurretRays();
  turretMeshByUid.clear();

  TEAM_KEYS.forEach(team => {
    const group = turretGroups[team];
    if (!group) return;
    if (!scene.children.includes(group)) {
      scene.add(group);
    }
    disposeChildren(group);
  });

  if (!heightTexture?.image) {
    console.warn('initTurrets skipped: height map missing image data.');
    return;
  }

  const heightMapData = getImageData(heightTexture.image);
  const sampleHeight = buildHeightSampler(heightMapData, displacementScale);

  TEAM_KEYS.forEach(team => {
    const group = turretGroups[team];
    if (!group) return;

    const entries = normalizeTurretEntries(turretTextures[team]);
    if (!entries.length) return;

    entries.forEach((entry, entryIndex) => {
      const { texture, lane, tier, id, path } = entry;
      if (!texture?.image) {
        console.warn(`initTurrets: skipped turret entry ${id ?? entryIndex} for team ${team} because image data is missing.`);
        return;
      }

      const turretMapData = getImageData(texture.image);
      const turretUVs = extractTurretUVs(turretMapData);
      if (!turretUVs.length) {
        const label = id ?? path ?? `entry-${entryIndex}`;
        console.warn(`initTurrets: no turret markers found for team ${team} within ${label}.`);
        return;
      }

      turretUVs.forEach(({ u, v }, markerIndex) => {
        const { x, z } = uvToWorld(u, v, terrainSize);
        const elevation = sampleHeight(u, v);
        const turret = new THREE.Mesh(turretGeometry, turretMaterials[team]);

        const baseId = id || ((lane !== null && tier !== null) ? `t_${lane}_${tier}` : `entry-${entryIndex}`);
        const uid = `${team}:${baseId}`;

        const nameParts = [team, 'turret'];
        if (id) {
          nameParts.push(id);
        } else {
          if (lane !== null) nameParts.push(`lane${lane}`);
          if (tier !== null) nameParts.push(`tier${tier}`);
        }
        if (turretUVs.length > 1) {
          nameParts.push(`marker${markerIndex + 1}`);
        }
        turret.name = nameParts.join('-');

        turret.userData.team = team;
        turret.userData.type = 'turret';
        turret.userData.id = id;
        turret.userData.lane = lane;
        turret.userData.tier = tier;
        turret.userData.markerIndex = turretUVs.length > 1 ? markerIndex : null;
        turret.userData.mapPath = path;
        turret.userData.uid = uid;
        turret.userData.attackRadius = 5;

        turret.castShadow = true;
        turret.receiveShadow = true;
        turret.position.set(x, elevation + TURRET_HEIGHT / 2, z);
        group.add(turret);
        if (!turretMeshByUid.has(uid)) {
          turretMeshByUid.set(uid, turret);
        }
        ensureRayForTurret(uid, turret);
      });
    });
  });
}

function getImageData(source) {
  const width = source.width;
  const height = source.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, width, height);

  return context.getImageData(0, 0, width, height);
}

function extractTurretUVs(imageData) {
  const { data, width, height } = imageData;
  const positions = [];
  const threshold = 10;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];

      if (alpha < threshold) {
        continue;
      }

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];

      if (red < threshold && green < threshold && blue < threshold) {
        const u = (x + 0.5) / width;
        const v = 1 - (y + 0.5) / height;
        positions.push({ u, v });
      }
    }
  }

  return positions;
}

function buildHeightSampler(imageData, displacementScale) {
  const { data, width, height } = imageData;
  const maxIndexX = width - 1;
  const maxIndexY = height - 1;

  const sample = (px, py) => {
    const clampedX = Math.max(0, Math.min(px, maxIndexX));
    const clampedY = Math.max(0, Math.min(py, maxIndexY));
    const index = (clampedY * width + clampedX) * 4;
    return data[index] / 255;
  };

  // Mirror the shader displacement by bilinear sampling the source height map.
  return (u, v) => {
    const x = u * maxIndexX;
    const y = (1 - v) * maxIndexY;

    const x0 = Math.floor(x);
    const x1 = Math.min(x0 + 1, maxIndexX);
    const y0 = Math.floor(y);
    const y1 = Math.min(y0 + 1, maxIndexY);

    const tx = x - x0;
    const ty = y - y0;

    const h00 = sample(x0, y0);
    const h10 = sample(x1, y0);
    const h01 = sample(x0, y1);
    const h11 = sample(x1, y1);

    const hx0 = THREE.MathUtils.lerp(h00, h10, tx);
    const hx1 = THREE.MathUtils.lerp(h01, h11, tx);
    const heightValue = THREE.MathUtils.lerp(hx0, hx1, ty);

    return heightValue * displacementScale;
  };
}

function getTurretProjectileMaterial(team) {
  const key = team || 'neutral';
  if (turretProjectileMaterialCache.has(key)) {
    return turretProjectileMaterialCache.get(key);
  }
  let color = 0xfacc15;
  if (team === TEAM_BLUE) {
    color = 0x60a5fa;
  } else if (team === TEAM_RED) {
    color = 0xf87171;
  }
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.35,
    transparent: true,
    opacity: 0.9,
  });
  turretProjectileMaterialCache.set(key, material);
  return material;
}

function resolveProjectileTarget(projectile) {
  if (!projectile) return null;
  const mesh = projectile.targetMesh;
  if (mesh && mesh.position) {
    return mesh.position;
  }
  return projectile.targetPosition || projectile.start;
}

function clearTurretProjectiles() {
  if (!turretProjectiles.size) return;
  turretProjectiles.forEach(projectile => {
    if (sceneRef && projectile?.mesh?.parent === sceneRef) {
      sceneRef.remove(projectile.mesh);
    }
  });
  turretProjectiles.clear();
}

function clearTurretRays() {
  if (!turretRays.size) return;
  turretRays.forEach(entry => {
    if (!entry) return;
    if (sceneRef && entry.mesh?.parent === sceneRef) {
      sceneRef.remove(entry.mesh);
    }
    if (sceneRef && entry.disc?.parent === sceneRef) {
      sceneRef.remove(entry.disc);
    }
  });
  turretRays.clear();
}

export function handleTurretAttack(payload = {}, { targetMesh } = {}) {
  if (!sceneRef) return null;
  if (!payload || typeof payload !== 'object') return null;

  const uid = typeof payload.turretId === 'string' ? payload.turretId : null;
  const turret = uid ? turretMeshByUid.get(uid) : null;
  const start = new THREE.Vector3(
    typeof payload.origin?.x === 'number' ? payload.origin.x : (turret?.position.x ?? 0),
    typeof payload.origin?.y === 'number' ? payload.origin.y : (turret?.position.y ?? TURRET_HEIGHT * 0.5),
    typeof payload.origin?.z === 'number' ? payload.origin.z : (turret?.position.z ?? 0)
  );

  const fallback = new THREE.Vector3(
    typeof payload.target?.x === 'number' ? payload.target.x : (targetMesh?.position?.x ?? start.x),
    typeof payload.target?.y === 'number' ? payload.target.y : (targetMesh?.position?.y ?? start.y),
    typeof payload.target?.z === 'number' ? payload.target.z : (targetMesh?.position?.z ?? start.z)
  );

  const speed = (typeof payload.speed === 'number' && payload.speed > 0)
    ? payload.speed
    : DEFAULT_PROJECTILE_SPEED;
  const travelTime = (typeof payload.travelTime === 'number' && payload.travelTime > 0)
    ? payload.travelTime
    : Math.max(0, start.distanceTo(fallback) / Math.max(1e-3, speed));
  const remaining = Math.max(0.05, travelTime);
  const impactRadius = (typeof payload.impactRadius === 'number' && payload.impactRadius > 0)
    ? payload.impactRadius
    : DEFAULT_IMPACT_RADIUS;

  const mesh = new THREE.Mesh(turretProjectileGeometry, getTurretProjectileMaterial(payload.team));
  mesh.position.copy(start);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.type = 'turretProjectile';
  sceneRef.add(mesh);

  const projectileId = nextTurretProjectileId++;
  turretProjectiles.set(projectileId, {
    id: projectileId,
    mesh,
    start,
    targetMesh: targetMesh || null,
    targetPosition: fallback,
    speed,
    remaining,
    impactRadius,
    turretId: uid,
    targetType: payload.targetType,
    targetId: payload.targetId
  });
  updateTurretRay(uid, turretProjectiles.get(projectileId));
  return projectileId;
}

export function updateTurrets(delta) {
  if (!sceneRef || delta <= 0 || !turretProjectiles.size) {
    if (delta > 0) {
      turretRays.forEach((entry, turretId) => {
        updateTurretRay(turretId, null);
      });
    }
    return;
  }
  const finished = [];
  turretProjectiles.forEach((projectile, id) => {
    if (!projectile?.mesh) {
      finished.push(id);
      return;
    }
    projectile.remaining -= delta;
    const targetPosRef = resolveProjectileTarget(projectile);
    if (!targetPosRef) {
      if (sceneRef && projectile.mesh.parent === sceneRef) {
        sceneRef.remove(projectile.mesh);
      }
      releaseTurretRay(projectile.turretId);
      finished.push(id);
      return;
    }
    tempTarget.copy(targetPosRef);
    tempDir.subVectors(tempTarget, projectile.mesh.position);
    const distance = tempDir.length();
    if (distance <= projectile.impactRadius || projectile.remaining <= 0) {
      projectile.mesh.position.copy(tempTarget);
      if (sceneRef && projectile.mesh.parent === sceneRef) {
        sceneRef.remove(projectile.mesh);
      }
      releaseTurretRay(projectile.turretId);
      finished.push(id);
      return;
    }
    tempDir.divideScalar(distance || 1);
    const step = projectile.speed * delta;
    const advance = Math.min(distance, step);
    projectile.mesh.position.addScaledVector(tempDir, advance);
    updateTurretRay(projectile.turretId, projectile);
  });
  finished.forEach(id => turretProjectiles.delete(id));

  const activeTurretIds = new Set();
  turretProjectiles.forEach(projectile => {
    if (projectile?.turretId) {
      activeTurretIds.add(projectile.turretId);
    }
  });
  turretRays.forEach((entry, turretId) => {
    if (!activeTurretIds.has(turretId)) {
      updateTurretRay(turretId, null);
    }
  });
}

function uvToWorld(u, v, terrainSize) {
  const halfSize = terrainSize * 0.5;
  const x = (u - 0.5) * terrainSize;
  const z = -(v - 0.5) * terrainSize;
  return { x: THREE.MathUtils.clamp(x, -halfSize, halfSize), z: THREE.MathUtils.clamp(z, -halfSize, halfSize) };
}

function ensureRayForTurret(turretId, turretMesh) {
  if (!sceneRef || !turretId || !turretMesh) return null;
  if (turretRays.has(turretId)) {
    return turretRays.get(turretId);
  }
  const attackRadius = turretMesh.userData?.attackRadius ?? 5;
  const radiusGeometry = new THREE.CircleGeometry(attackRadius, 64);
  const radiusMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff3cd,
    transparent: true,
    opacity: 0.18,
    depthWrite: false
  });
  const disc = new THREE.Mesh(radiusGeometry, radiusMaterial);
  disc.rotation.x = -Math.PI * 0.5;
  disc.position.set(turretMesh.position.x, turretMesh.position.y - TURRET_HEIGHT * 0.5 + 0.02, turretMesh.position.z);
  disc.visible = true;

  const rayGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true);
  rayGeometry.translate(0, 0.5, 0);
  const rayMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff3cd,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });
  const ray = new THREE.Mesh(rayGeometry, rayMaterial);
  ray.visible = false;

  sceneRef.add(disc);
  sceneRef.add(ray);

  const entry = { mesh: ray, disc, turret: turretMesh };
  turretRays.set(turretId, entry);
  return entry;
}

function releaseTurretRay(turretId) {
  if (!turretId || !turretRays.has(turretId)) return;
  const entry = turretRays.get(turretId);
  if (entry?.mesh) {
    entry.mesh.visible = false;
  }
  if (entry?.disc) {
    entry.disc.visible = true;
  }
}

function updateTurretRay(turretId, projectile) {
  if (!sceneRef || !turretId) return;
  const turretMesh = turretMeshByUid.get(turretId);
  if (!turretMesh) return;
  const rayEntry = ensureRayForTurret(turretId, turretMesh);
  if (!rayEntry) return;
  const rayMesh = rayEntry.mesh;
  const disc = rayEntry.disc;
  const targetMesh = projectile?.targetMesh || null;
  const targetPos = projectile ? (targetMesh?.position ?? projectile.targetPosition ?? null) : null;

  if (!projectile || !targetPos) {
    if (rayMesh) {
      rayMesh.visible = false;
      rayMesh.scale.set(1, 1, 1);
    }
    if (disc) {
      disc.visible = true;
      disc.position.set(turretMesh.position.x, turretMesh.position.y - TURRET_HEIGHT * 0.5 + 0.02, turretMesh.position.z);
    }
    return;
  }

  tempTurretTop.set(
    turretMesh.position.x,
    turretMesh.position.y + TURRET_HEIGHT * 0.5,
    turretMesh.position.z
  );
  tempRayVec.subVectors(targetPos, tempTurretTop);
  const length = tempRayVec.length();
  if (length <= 0.01) {
    if (rayMesh) {
      rayMesh.visible = false;
    }
    if (disc) {
      disc.visible = true;
    }
    return;
  }

  tempRayVec.divideScalar(length);
  rayMesh.visible = true;
  rayMesh.position.copy(tempTurretTop);
  tempRayQuat.setFromUnitVectors(tempRayUp, tempRayVec);
  rayMesh.setRotationFromQuaternion(tempRayQuat);
  rayMesh.scale.set(1, length, 1);
  if (disc) {
    disc.visible = true;
    disc.position.set(turretMesh.position.x, turretMesh.position.y - TURRET_HEIGHT * 0.5 + 0.02, turretMesh.position.z);
  }
}

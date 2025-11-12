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
    const texture = turretTextures[team];
    const group = turretGroups[team];
    if (!texture?.image || !group) {
      return;
    }

    const turretMapData = getImageData(texture.image);
    const turretUVs = extractTurretUVs(turretMapData);
    if (!turretUVs.length) {
      console.warn(`initTurrets: no turret markers found for team ${team}.`);
      return;
    }

    turretUVs.forEach(({ u, v }) => {
      const { x, z } = uvToWorld(u, v, terrainSize);
      const elevation = sampleHeight(u, v);
      const turret = new THREE.Mesh(turretGeometry, turretMaterials[team]);
      turret.name = `${team}-turret`;
      turret.userData.team = team;
      turret.userData.type = 'turret';
      turret.castShadow = true;
      turret.receiveShadow = true;
      turret.position.set(x, elevation + TURRET_HEIGHT / 2, z);
      group.add(turret);
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

function uvToWorld(u, v, terrainSize) {
  const halfSize = terrainSize * 0.5;
  const x = (u - 0.5) * terrainSize;
  const z = -(v - 0.5) * terrainSize;
  return { x: THREE.MathUtils.clamp(x, -halfSize, halfSize), z: THREE.MathUtils.clamp(z, -halfSize, halfSize) };
}

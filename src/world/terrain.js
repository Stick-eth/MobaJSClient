// src/terrain.js
import * as THREE from 'three';
import { scene } from './scene.js';
import { initTurrets } from './turrets.js';
import { TEAM_BLUE, TEAM_RED } from '../core/teams.js';

export let terrainMesh = null;

const TURRET_LANES = [1, 2, 3];
const TURRET_TIERS = [1, 2, 3];

export async function initTerrain() {
  const loader = new THREE.TextureLoader();

  const basePath = '/src/assets/base_map';
  const heightMapURL   = `${basePath}/heightmap.png`;
  const splatMapURL    = `${basePath}/splatmap.png`;
  const groundTexURL   = `${basePath}/ground.png`;
  const wallTexURL     = `${basePath}/wall.png`;
  const waterTexURL    = `${basePath}/water.png`;

  let heightMap;
  let splatMap;
  let groundTex;
  let wallTex;
  let waterTex;

  try {
    [heightMap, splatMap, groundTex, wallTex, waterTex] = await Promise.all([
      loader.loadAsync(heightMapURL),
      loader.loadAsync(splatMapURL),
      loader.loadAsync(groundTexURL),
      loader.loadAsync(wallTexURL),
      loader.loadAsync(waterTexURL),
    ]);
  } catch (error) {
    console.error('Failed to load terrain textures:', error);
    return;
  }

  const turretTextures = {};
  try {
    const [blueTurrets, redTurrets] = await Promise.all([
      loadTurretMapsForTeam(loader, basePath, TEAM_BLUE),
      loadTurretMapsForTeam(loader, basePath, TEAM_RED),
    ]);

    if (blueTurrets.length) {
      turretTextures[TEAM_BLUE] = blueTurrets;
    }
    if (redTurrets.length) {
      turretTextures[TEAM_RED] = redTurrets;
    }
  } catch (error) {
    console.error('Failed to load turret textures:', error);
  }

  [groundTex, wallTex, waterTex].forEach(tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 20);
  });

  splatMap.wrapS = splatMap.wrapT = THREE.RepeatWrapping;
  heightMap.wrapS = heightMap.wrapT = THREE.RepeatWrapping;

  const size     = 100;
  const segments = 256;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const displacementScale = 10.0;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      groundTex:   { value: groundTex },
      wallTex:     { value: wallTex },
      waterTex:    { value: waterTex },
      splatMap:    { value: splatMap },
      heightMap:   { value: heightMap },
      mapRepeat:   { value: new THREE.Vector2(20, 20) },
      displacementScale: { value: displacementScale }
    },
    vertexShader: `
      uniform sampler2D heightMap;
      uniform float displacementScale;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        // Sample la heightmap pour le displacement
        float disp = texture2D(heightMap, uv).r;
        // Calcul la nouvelle position
        vec3 displacedPosition = position + normal * (disp * displacementScale);
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D groundTex;
      uniform sampler2D wallTex;
      uniform sampler2D waterTex;
      uniform sampler2D splatMap;
      uniform vec2 mapRepeat;

      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vec2 uv = vUv * mapRepeat;
        vec3 mask = texture2D(splatMap, vUv).rgb;
        float g = mask.g;
        float r = mask.r;
        float b = mask.b;

        float maxc = max(max(r, g), b);
        r = step(0.9 * maxc, r);
        g = step(0.9 * maxc, g);
        b = step(0.9 * maxc, b);

        vec4 texGround = texture2D(groundTex, uv);
        vec4 texWall   = texture2D(wallTex, uv);
        vec4 texWater  = texture2D(waterTex, uv);

        vec4 finalColor = texGround * g + texWall * r + texWater * b;
        float shade = 0.85 + 0.15 * vNormal.y;
        gl_FragColor = vec4(finalColor.rgb * shade, 1.0);
      }
    `,
    lights: false,
  });

  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  terrainMesh.position.y = 0; 
  scene.add(terrainMesh);

  if (Object.keys(turretTextures).length > 0) {
    try {
      initTurrets({
        scene,
        turretTextures,
        heightTexture: heightMap,
        displacementScale,
        terrainSize: size,
      });
    } catch (error) {
      console.error('Failed to initialize turrets:', error);
    }
  }
}

async function loadTurretMapsForTeam(loader, basePath, team) {
  const teamPath = `${basePath}/${team}`;
  const descriptors = [];

  TURRET_LANES.forEach(lane => {
    TURRET_TIERS.forEach(tier => {
      const id = `t_${lane}_${tier}`;
      descriptors.push({
        id,
        lane,
        tier,
        url: `${teamPath}/turrets/${id}.png`,
      });
    });
  });

  const results = await Promise.allSettled(
    descriptors.map(descriptor => loader.loadAsync(descriptor.url))
  );

  const loaded = [];
  const missing = [];

  results.forEach((result, index) => {
    const descriptor = descriptors[index];
    if (result.status === 'fulfilled') {
      const texture = result.value;
      texture.name = `${team}-turret-${descriptor.id}`;
      loaded.push({
        texture,
        lane: descriptor.lane,
        tier: descriptor.tier,
        id: descriptor.id,
        path: descriptor.url,
      });
    } else {
      missing.push(descriptor.id);
    }
  });

  if (loaded.length) {
    if (missing.length) {
      console.warn(`Missing turret markers for team ${team}: ${missing.join(', ')}`);
    }
    return loaded;
  }

  if (missing.length) {
    console.warn(`No per-turret markers loaded for team ${team}, attempting legacy turretmap.png fallback.`);
  }

  const legacyUrl = `${teamPath}/turretmap.png`;
  try {
    const legacyTexture = await loader.loadAsync(legacyUrl);
    legacyTexture.name = `${team}-turret-legacy`;
    console.warn(`Using legacy turretmap.png for team ${team}.`);
    return [{
      texture: legacyTexture,
      lane: null,
      tier: null,
      id: 'legacy',
      path: legacyUrl,
    }];
  } catch (error) {
    console.warn(`No turret map could be loaded for team ${team}.`, error);
    return [];
  }
}

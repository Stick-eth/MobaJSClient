// src/terrain.js
import * as THREE from 'three';
import { scene } from './scene.js';
import { initTurrets } from './turrets.js';
import { TEAM_BLUE, TEAM_RED } from '../core/teams.js';

export let terrainMesh = null;

export async function initTerrain() {
  const loader = new THREE.TextureLoader();

  const basePath = '/src/assets/base_map';
  const heightMapURL   = `${basePath}/heightmap.png`;
  const splatMapURL    = `${basePath}/splatmap.png`;
  const groundTexURL   = `${basePath}/ground.png`;
  const wallTexURL     = `${basePath}/wall.png`;
  const waterTexURL    = `${basePath}/water.png`;
  const blueTurretMapURL = `${basePath}/blue/turretmap.png`;
  const redTurretMapURL  = `${basePath}/red/turretmap.png`;

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
  const [blueTurretResult, redTurretResult] = await Promise.allSettled([
    loader.loadAsync(blueTurretMapURL),
    loader.loadAsync(redTurretMapURL)
  ]);

  if (blueTurretResult.status === 'fulfilled') {
    turretTextures[TEAM_BLUE] = blueTurretResult.value;
  } else if (blueTurretResult.reason) {
    console.warn('Blue turret map could not be loaded:', blueTurretResult.reason);
  }

  if (redTurretResult.status === 'fulfilled') {
    turretTextures[TEAM_RED] = redTurretResult.value;
  } else if (redTurretResult.reason) {
    console.warn('Red turret map could not be loaded:', redTurretResult.reason);
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

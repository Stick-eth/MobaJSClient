// src/terrain.js
import * as THREE from 'three';
import { scene } from './scene.js';

export let terrainMesh = null;

export function initTerrain() {
  const loader = new THREE.TextureLoader();

  // → Remplace ces chemins par tes assets réels :
  const heightMapURL   = '/src/assets/heightmap.png';
  const groundTexURL   = '/src/assets/ground.png';

  // 1) Charger la heightmap pour la displacement
  const heightMap = loader.load(heightMapURL);
  heightMap.wrapS = heightMap.wrapT = THREE.RepeatWrapping;

  // 2) Charger la texture de sol (herbe, rocher…)
  const groundTex = loader.load(groundTexURL);
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set( 20, 20 );

  // 3) Géométrie subdivisée pour displacement
  const size     = 50;       // taille du terrain en unités
  const segments = 256;      // subdivisions
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI/2);

  // 4) Material standard avec displacement
  const mat = new THREE.MeshStandardMaterial({
    map: groundTex,
    displacementMap: heightMap,
    displacementScale: 10,    // hauteur max
    roughness: 1,
    metalness: 0
  });

  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);
}

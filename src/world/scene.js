// src/scene.js
import * as THREE from 'three';
import { initTerrain } from './terrain.js';

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Angle 56° sous l’horizontale
const CAMERA_DISTANCE = 12; // à ajuster selon rendu désiré
const CAMERA_ANGLE_DEG = 56;
const theta = THREE.MathUtils.degToRad(CAMERA_ANGLE_DEG);

export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas: document.getElementById('scene-canvas'),
});

export const cameraOffset = new THREE.Vector3(
  0,
  Math.sin(theta) * CAMERA_DISTANCE,
  Math.cos(theta) * CAMERA_DISTANCE
);

export function initScene() {
  // Configure le renderer
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Active les ombres (optionnel)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lumière directionnelle principale
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 7.5);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Lumière ambiante pour adoucir les ombres
  const ambLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambLight);

  // Initialise et ajoute le terrain 3D à la scène
  initTerrain();

  // Positionne la caméra et oriente-la vers l'origine
  camera.position.copy(cameraOffset);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

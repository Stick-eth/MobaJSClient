// src/scene.js
import * as THREE from 'three';
import { initTerrain } from './terrain.js';

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas: document.getElementById('scene-canvas'),
});

// Offset initial de la caméra par rapport au personnage (ou à l'origine)
export const cameraOffset = new THREE.Vector3(0, 10, 10);

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
}

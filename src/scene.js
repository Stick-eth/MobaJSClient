import * as THREE from 'three';

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

export const cameraOffset = new THREE.Vector3(0, 10, 10);

// **On exporte désormais le plan** pour pouvoir l’interroger depuis input.js
export const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide })
);

export function initScene() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Lumière
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7.5);
  scene.add(light);

  // Plan de sol
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);

  // Position initiale de la caméra
  camera.position.copy(cameraOffset);
  camera.lookAt(0, 0, 0);
}

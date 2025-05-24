// src/marker.js
import * as THREE from 'three';
import { scene } from './scene.js';

let markerGroup = null;
let startTime   = 0;

// Durée totale de l’animation (en secondes)
const DURATION    = 0.6;
// Rayon intérieur/extérieur de l’anneau
const INNER_RADIUS = 0.4;
const OUTER_RADIUS = 0.5;
// Nombre de flèches
const ARROW_COUNT  = 7;

export function showMarker(position) {
  // Nettoyage
  if (markerGroup) {
    scene.remove(markerGroup);
    disposeGroup(markerGroup);
  }

  markerGroup = new THREE.Group();
  // Surélève l'overlay du sol
  const ELEVATION = 0.02;
  markerGroup.position.set(position.x, position.y + ELEVATION, position.z);

  // 1) L’anneau
  const ringGeo = new THREE.RingGeometry(INNER_RADIUS, OUTER_RADIUS, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  markerGroup.add(ring);

  scene.add(markerGroup);
  startTime = performance.now();
}

export function updateMarker(delta) {
  if (!markerGroup) return;

  const elapsed = (performance.now() - startTime) / 1000;
  const t = elapsed / DURATION;

  if (t >= 1) {
    scene.remove(markerGroup);
    disposeGroup(markerGroup);
    markerGroup = null;
    return;
  }

  // fade out progressif
  const alpha = 1 - t;
  markerGroup.children.forEach(child => {
    child.material.opacity = 0.8 * alpha;
  });

  // léger scale pulsé de l’anneau
  const ring = markerGroup.children[0];
  const scale = 1 + 0.75 * Math.sin(Math.PI * t);
  ring.scale.set(scale, scale, scale);
}

function disposeGroup(group) {
  group.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  });
}

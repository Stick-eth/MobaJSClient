// src/cameraController.js
import * as THREE from 'three';
import { camera, cameraOffset } from '../world/scene.js';
import { character } from '../player/character.js';

let locked      = true;
let isPanning   = false;
let spaceHeld   = false;

// Origine du “drag virtuel”
const panStart   = new THREE.Vector2();
const panDelta   = new THREE.Vector2();

// Quaternion à conserver en unlocked
const storedQuat = new THREE.Quaternion();
// Position lastMouse pour edge-scroll
const lastMouse  = new THREE.Vector2(-Infinity, -Infinity);

// Zoom
let zoomDistance = cameraOffset.length();
const MIN_ZOOM    = 6;
const MAX_ZOOM    = 42; //MAX 12 NORMALLY

// Réglages
const SPEED_FACTOR = 0.08;
const ZOOM_SPEED   = 0.01;
const EDGE_SPEED   = 25;
const EDGE_MARGIN  = 50; 

export function initCameraControl(domElement) {
  const canvas = domElement;

  // — Y pour lock/unlock et Space pour track temporaire
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'y') {
      toggleLock();
    }
    if (e.code === 'Space') {
      spaceHeld = true;
      // recentrage immédiat
      camera.position.copy(character.position).add(cameraOffset);
      camera.lookAt(character.position);
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceHeld = false;
    }
  });

  // — Clic-molette : début du pan si unlock
  canvas.addEventListener('mousedown', e => {
    if (!locked && e.button === 1) {
      e.preventDefault();
      isPanning = true;
      panStart.set(e.clientX, e.clientY);
      panDelta.set(0, 0);
      storedQuat.copy(camera.quaternion);
    }
  });

  // — Suivi souris
  window.addEventListener('mousemove', e => {
    lastMouse.set(e.clientX, e.clientY);
    if (!locked && isPanning) {
      panDelta.set(
        e.clientX - panStart.x,
        e.clientY - panStart.y
      );
    }
  });

  // — Fin du pan
  window.addEventListener('mouseup', e => {
    if (!locked && e.button === 1) {
      isPanning = false;
      panDelta.set(0, 0);
    }
  });

  // — Zoom toujours possible
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomDistance = THREE.MathUtils.clamp(
      zoomDistance + e.deltaY * ZOOM_SPEED,
      MIN_ZOOM,
      MAX_ZOOM
    );
    const dir = camera.position.clone()
      .sub(character.position)
      .normalize();
    camera.position.copy(character.position)
      .addScaledVector(dir, zoomDistance);
  }, { passive: false });
}

export function updateCamera(delta) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = lastMouse.x;
  const y = lastMouse.y;

  // --- Locked ou Space : suivi strict, on oriente vers le perso ---
  if (locked || spaceHeld) {
    const offsetNorm = cameraOffset.clone().normalize();
    camera.position.copy(character.position)
      .addScaledVector(offsetNorm, zoomDistance);
    camera.lookAt(character.position);

  // --- Pan infini si molette enfoncée ---
  } else if (isPanning) {
    const dx   = panDelta.x;
    const dy   = panDelta.y;
    const dist = panDelta.length();
    if (dist > 0) {
      const dir   = new THREE.Vector3(dx, 0, dy).normalize();
      const speed = dist * SPEED_FACTOR;
      camera.position.addScaledVector(dir, speed * delta);
    }
    camera.quaternion.copy(storedQuat);

  // --- Edge-scroll si curseur dans la zone de bordure ---
  } else {
    let ex = 0, ez = 0;
    if (x <= EDGE_MARGIN)           ex = -1;
    else if (x >= w - EDGE_MARGIN)  ex = 1;
    if (y <= EDGE_MARGIN)           ez = -1;
    else if (y >= h - EDGE_MARGIN)  ez = 1;

    if (ex !== 0 || ez !== 0) {
      const dir = new THREE.Vector3(ex, 0, ez).normalize();
      camera.position.addScaledVector(dir, EDGE_SPEED * delta);
      camera.quaternion.copy(storedQuat);
    }
  }
}

export function toggleLock() {
  locked = !locked;
  if (!locked) {
    storedQuat.copy(camera.quaternion);
  }
  document.dispatchEvent(new CustomEvent('cameraLockChanged', {
    detail: { locked }
  }));
}

export function isCameraLocked() {
  return locked;
}

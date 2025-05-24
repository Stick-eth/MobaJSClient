// src/cameraController.js
import * as THREE from 'three';
import { camera, cameraOffset } from './scene.js';
import { character } from './character.js';

let locked      = true;
let isPanning   = false;
let spaceHeld   = false;

// Pour gérer le “drag virtuel” du pointeur
const panDelta    = new THREE.Vector2();
// Pour mémoriser l’orientation de la caméra en unlocked
const storedQuat  = new THREE.Quaternion();

// Zoom : on part de la distance initiale caméra ↔ personnage
let zoomDistance  = cameraOffset.length();
const MIN_ZOOM     = 4;    // distance minimale
const MAX_ZOOM     = 15;   // distance maximale

// Réglages
const SPEED_FACTOR = 0.08; // pour le pan
const ZOOM_SPEED   = 0.01;  // pour la molette

export function initCameraControl(domElement) {
  const canvas = domElement;

  // — Bascule lock/unlock avec Y
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'y') {
      locked = !locked;
      // si on repasse en locked, déverrouille le pointeur
      if (locked && document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    }

    // — Space maintien : comportement “lock”
    if (e.code === 'Space') {
      spaceHeld = true;
    }
  });
 
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceHeld = false;
    }
  });

  // — Clic-molette : démarre le pan (unlock only)
  canvas.addEventListener('mousedown', e => {
    if (!locked && e.button === 1) {
      isPanning = true;
      panDelta.set(0, 0);
      storedQuat.copy(camera.quaternion);
      canvas.requestPointerLock();
      e.preventDefault();
    }
  });

  // — Accumulation movementX/Y pour le pan
  document.addEventListener('mousemove', e => {
    if (!locked && isPanning && document.pointerLockElement === canvas) {
      panDelta.x += e.movementX;
      panDelta.y += e.movementY;
    }
  });

  // — Fin du pan
  document.addEventListener('mouseup', e => {
    if (!locked && e.button === 1) {
      isPanning = false;
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    }
  });

  // — Zoom/dézoom au scroll de molette (toujours possible)
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    // calcule la nouvelle distance
    const delta = e.deltaY * ZOOM_SPEED;
    zoomDistance = THREE.MathUtils.clamp(zoomDistance + delta, MIN_ZOOM, MAX_ZOOM);

    // repositionne immédiatement la caméra autour du personnage
    const direction = camera.position
      .clone()
      .sub(character.position)
      .normalize();
    camera.position
      .copy(character.position)
      .addScaledVector(direction, zoomDistance);
  }, { passive: false });
}

export function updateCamera(delta) {
  // — Mode locked ou Space maintenu : suivi rigide
  if (locked || spaceHeld) {
    const offsetNorm = cameraOffset.clone().normalize();
    camera.position
      .copy(character.position)
      .addScaledVector(offsetNorm, zoomDistance);
    camera.lookAt(character.position);

  // — Mode unlocked + en pan : déplacement infini
  } else if (isPanning) {
    const dx = panDelta.x;
    const dy = panDelta.y;
    const dir = new THREE.Vector3(dx, 0, dy).normalize();
    const speed = panDelta.length() * SPEED_FACTOR;
    camera.position.addScaledVector(dir, speed * delta);

    // maintien de l’orientation
    camera.quaternion.copy(storedQuat);
  }
}
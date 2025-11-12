// src/cameraController.js
import * as THREE from 'three';
import { camera, cameraOffset } from '../world/scene.js';
import { character } from '../player/character.js';

let locked      = true;
let isPanning   = false;
let spaceHeld   = false;
let firstPerson = false;
let lockBeforeFirstPerson = true;

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

const FIRST_PERSON_HEAD_OFFSET = new THREE.Vector3(0, 1.45, 0);
const FIRST_PERSON_FORWARD_OFFSET = 0.35;
const TRANSITION_DURATION = 450; // ms

let cameraTransition = null;

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
    if (e.key.toLowerCase() === 'o') {
      toggleFirstPersonView();
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

  if (updateCameraTransition()) {
    return;
  }

  if (firstPerson) {
    applyFirstPersonPose();
    return;
  }

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
  setLockState(!locked);
}

export function isCameraLocked() {
  return locked;
}

function toggleFirstPersonView() {
  if (cameraTransition) return;
  const targetMode = firstPerson ? 'third' : 'first';
  const fromPos = camera.position.clone();
  const fromQuat = camera.quaternion.clone();
  const targetPose = targetMode === 'first'
    ? computeFirstPersonPose()
    : computeThirdPersonPose();

  if (targetMode === 'first') {
    lockBeforeFirstPerson = locked;
    setLockState(true);
    spaceHeld = false;
    isPanning = false;
  } else {
    setLockState(lockBeforeFirstPerson);
  }

  cameraTransition = {
    targetMode,
    start: performance.now(),
    duration: TRANSITION_DURATION,
    fromPos,
    fromQuat,
    toPos: targetPose.position,
    toQuat: targetPose.quaternion
  };
}

function updateCameraTransition() {
  if (!cameraTransition) return false;
  const now = performance.now();
  const elapsed = now - cameraTransition.start;
  const t = Math.min(1, elapsed / cameraTransition.duration);
  const eased = easeInOutCubic(t);

  camera.position.copy(cameraTransition.fromPos).lerp(cameraTransition.toPos, eased);
  const slerpedQuat = cameraTransition.fromQuat.clone().slerp(cameraTransition.toQuat, eased);
  camera.quaternion.copy(slerpedQuat);

  if (t >= 1) {
    const targetMode = cameraTransition.targetMode;
    cameraTransition = null;
    firstPerson = targetMode === 'first';
    if (firstPerson) {
      applyFirstPersonPose();
    } else {
      applyThirdPersonPose();
    }
  }
  return true;
}

function computeFirstPersonPose() {
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(character.quaternion);
  const origin = character.position.clone().add(FIRST_PERSON_HEAD_OFFSET);
  const position = origin.clone().addScaledVector(forward, FIRST_PERSON_FORWARD_OFFSET);
  const lookAtTarget = origin.clone().addScaledVector(forward, 4);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, lookAtTarget, new THREE.Vector3(0, 1, 0))
  );
  return { position, quaternion };
}

function computeThirdPersonPose() {
  const offsetNorm = cameraOffset.clone().normalize();
  const position = character.position.clone().addScaledVector(offsetNorm, zoomDistance);
  const lookAtTarget = character.position.clone();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, lookAtTarget, new THREE.Vector3(0, 1, 0))
  );
  return { position, quaternion };
}

function applyFirstPersonPose() {
  const pose = computeFirstPersonPose();
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
}

function applyThirdPersonPose() {
  const pose = computeThirdPersonPose();
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  storedQuat.copy(camera.quaternion);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function setLockState(value) {
  if (locked === value) return;
  locked = value;
  if (!locked) {
    storedQuat.copy(camera.quaternion);
  }
  document.dispatchEvent(new CustomEvent('cameraLockChanged', {
    detail: { locked }
  }));
}

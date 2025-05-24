import * as THREE from 'three';
import { isWalkable } from './collision.js';

export const character = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x2194ce })
);

// position initiale
character.position.set(0, 0.5, 0);

let targetPos = null;
const speed = 8; // unités/seconde

export function initCharacter(scene) {
  scene.add(character);
}

export function setTarget(position) { 
    if (isWalkable(position.x, position.z)) {
    targetPos = position.clone();
  }
  targetPos.y = character.position.y;
}

export function updateCharacter(delta) {
  if (!targetPos) return;
  const dir = new THREE.Vector3().subVectors(targetPos, character.position);
  const dist = dir.length();
  if (dist > 0.05) {
    dir.normalize();
    character.position.addScaledVector(dir, speed * delta);
    // oriente le personnage
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir
    );
    character.quaternion.slerp(q, 0.2);
  } else {
    targetPos = null;
  }
}

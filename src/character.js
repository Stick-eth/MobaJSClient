import * as THREE from 'three';


export const character = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x2194ce })
);

// position initiale
character.position.set(0, 0.5, 0);

let path = [];
const speed = 8; // unités/seconde

export function initCharacter(scene) {
  scene.add(character);
}

export function setPath(newPath) {
  path = newPath.map(v => v.clone());
}

export function updateCharacter(delta) {
  if (path.length === 0) return;

  // prochaine cible sur le chemin
  const target = path[0];
  const dir = new THREE.Vector3().subVectors(target, character.position);
  const dist = dir.length();

  if (dist > 0.1) {
    dir.normalize();
    character.position.addScaledVector(dir, speed * delta);
    // orientation
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir
    );
    character.quaternion.slerp(q, 0.2);
  } else {
    // waypoint atteint : on le retire
    path.shift();
  }
}
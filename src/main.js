import * as THREE from 'three';

// --- 1. Initialisation scène, caméra, rendu ---
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('scene-canvas') });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// --- 2. Lumière ---
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7.5);
scene.add(light);

// --- 3. Plan de sol ---
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide })
);
plane.rotation.x = -Math.PI/2;
scene.add(plane);

// --- 4. Personnage (simple sphère) ---
const character = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x2194ce })
);
character.position.set(0, 0.5, 0);
scene.add(character);

// --- 5. Déplacement du personnage (clic droit) ---
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
let targetPos   = null;
renderer.domElement.addEventListener('contextmenu', e => {
  e.preventDefault();
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(plane);
  if (hits.length) {
    targetPos = hits[0].point.clone();
    targetPos.y = character.position.y;
  }
});

// --- 6. Caméra verrouillée / libre ---
let cameraLocked   = true;
const cameraOffset = new THREE.Vector3(0, 10, 10);

// Variables pour le mode libre
let isPanning      = false;
const panStart     = new THREE.Vector2();
let spherical      = new THREE.Spherical();
let sphericalStart = new THREE.Spherical();

// Initialise la spherical à partir de la position de la caméra + offset
function initSpherical() {
  // distance
  const offset = cameraOffset.clone();
  const radius = offset.length();
  // angle polaire (phi) et azimutal (theta)
  const phi   = Math.acos(offset.y / radius);
  const theta = Math.atan2(offset.x, offset.z);
  spherical.set(radius, phi, theta);
}
initSpherical();

// Bascule verrouillage avec la touche Y
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'y') {
    cameraLocked = !cameraLocked;

    if (!cameraLocked) {
      // passe en mode libre : calcule la spherical depuis la position courante
      spherical.setFromVector3(camera.position.clone().sub(character.position));
      sphericalStart.copy(spherical);
    }
  }
});

// Gère le clic molette enfoncé pour pan en mode libre
renderer.domElement.addEventListener('mousedown', e => {
  if (!cameraLocked && e.button === 1) {
    isPanning = true;
    panStart.set(e.clientX, e.clientY);
    sphericalStart.copy(spherical);
  }
});
renderer.domElement.addEventListener('mouseup', e => {
  if (!cameraLocked && e.button === 1) {
    isPanning = false;
  }
});
renderer.domElement.addEventListener('mousemove', e => {
  if (!cameraLocked && isPanning) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    // Ajuste les angles (sensibilité 0.005)
    spherical.theta = sphericalStart.theta - dx * 0.005;
    spherical.phi   = THREE.MathUtils.clamp(
      sphericalStart.phi - dy * 0.005,
      0.1, Math.PI - 0.1
    );
    // Recalcule la position caméra
    const offset = new THREE.Vector3().setFromSpherical(spherical);
    camera.position.copy(character.position).add(offset);
    camera.lookAt(character.position);
  }
});

// --- 7. Animation principale ---
const speed = 5; // unités/seconde
function animate() {
  requestAnimationFrame(animate);

  // 7.1 Déplacement du personnage
  if (targetPos) {
    const dir  = new THREE.Vector3().subVectors(targetPos, character.position);
    const dist = dir.length();
    if (dist > 0.05) {
      dir.normalize();
      character.position.addScaledVector(dir, speed * 0.016);
      // oriente le personnage
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0,0,1), dir.clone().normalize()
      );
      character.quaternion.slerp(q, 0.2);
    } else {
      targetPos = null;
    }
  }

  // 7.2 Caméra
  if (cameraLocked) {
    // suit le joueur avec un lerp pour la fluidité
    const desired = character.position.clone().add(cameraOffset);
    camera.position.lerp(desired, 0.1);
    camera.lookAt(character.position);
  }
  // sinon, la caméra reste dans l’état défini par les events mousemove

  renderer.render(scene, camera);
}
animate();

// --- 8. Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

import * as THREE from 'three';
import { scene } from '../world/scene.js';
import { projectiles } from './spells.js';
import { remotePlayers } from '../network/remotePlayers.js';

export function launchProjectile(startPos, targetMesh, travelSpeed = 5, impactRadius = 0.6) {
  const geometry = new THREE.SphereGeometry(0.15, 12, 12);
  const material = new THREE.MeshStandardMaterial({ color: 0xffff55, emissive: 0xeeaa00 });
  const proj = new THREE.Mesh(geometry, material);

  proj.position.copy(startPos);
  scene.add(proj);

  let alive = true; 
  console.log("Projectile launched from", startPos, "towards", targetMesh.position);
  
  // Boucle d’animation du projectile
  function animateProjectile() {
    if (!alive) return;

    // Vérifie que la cible existe toujours
    if (!targetMesh || !targetMesh.position) {
      // cible disparue => détruit le projectile
      destroy();
      return;
    }
    // Calcul du déplacement vers la position ACTUELLE de la cible
    const direction = new THREE.Vector3().subVectors(targetMesh.position, proj.position);
    const dist = direction.length();

    if (dist < impactRadius) {
      // Impact !
      destroy();
      // Optionnel : afficher effet visuel d'impact ici
      return;
    }

    direction.normalize();
    // Déplace le projectile (frame-indépendant)
    proj.position.addScaledVector(direction, travelSpeed * (1/60)); // suppose 60fps, sinon passer delta en paramètre

    proj._animId = requestAnimationFrame(animateProjectile);
  }

  function destroy() {
    alive = false;
    scene.remove(proj);
    proj.geometry.dispose();
    proj.material.dispose();
    // Optionnel : callback, effets, etc.
  }

  animateProjectile();
}

export function qSpellCast(from, pos, dir) {
  // Crée le projectile Q
  const geom = new THREE.SphereGeometry(0.22, 12, 12);
  const mat  = new THREE.MeshBasicMaterial({ color: 0x39c6ff });
  const mesh = new THREE.Mesh(geom, mat);
  
  
  mesh.position.copy(pos);
  mesh.position.y += 0.3; // pour que ça ne touche pas le sol direct

  scene.add(mesh);

  projectiles.push({
    mesh,
    direction: dir,
    speed: 25,
    timeLeft: 0.3 // durée de vie en secondes
  });

  console.log("Q Spell cast from", from, "at position", pos, "with direction", dir);
  }
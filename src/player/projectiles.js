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

// Linear, non-homing projectile synced with server params (pos, dir, speed, ttl)
export function launchLinearProjectile(startPos, dir, speed = 10, ttl = 2.0, color = 0xffff55, onDestroy) {
  const geometry = new THREE.SphereGeometry(0.15, 12, 12);
  const material = new THREE.MeshStandardMaterial({ color, emissive: 0xeeaa00 });
  const proj = new THREE.Mesh(geometry, material);
  proj.position.set(startPos.x, startPos.y, startPos.z);
  scene.add(proj);

  // Normalize direction
  const v = new THREE.Vector3(dir.x || 0, dir.y || 0, dir.z || 0);
  if (v.lengthSq() === 0) v.set(0, 0, 1);
  v.normalize();

  let alive = true;
  let remaining = Math.max(0, ttl || 0);
  let lastTs = performance.now();

  function step(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;

    proj.position.x += v.x * speed * dt;
    proj.position.y += v.y * speed * dt;
    proj.position.z += v.z * speed * dt;

    // Don't auto-destroy at target original position; only expire if max lifetime exceeded
    remaining -= dt;
    if (remaining <= 0) {
      // Fallback expiry (miss) – let onDestroy know
      return destroy();
    }
    proj._animId = requestAnimationFrame(step);
  }

  function destroy() {
    alive = false;
    scene.remove(proj);
    proj.geometry.dispose();
    proj.material.dispose();
    try { onDestroy && onDestroy(); } catch {}
  }

  proj._animId = requestAnimationFrame(step);
  return { destroy };
}

// Homing projectile that chases a moving target mesh.
// Server-authoritative: this visual does NOT auto-destroy on proximity; caller must destroy via handle.destroy (e.g. on projectileHit or TTL fallback).
export function launchHomingProjectile(startPos, targetMesh, speed = 10, ttl = undefined, color = 0xffff55, onDestroy) {
  const geometry = new THREE.SphereGeometry(0.15, 12, 12);
  const material = new THREE.MeshStandardMaterial({ color, emissive: 0xeeaa00 });
  const proj = new THREE.Mesh(geometry, material);
  proj.position.set(startPos.x, startPos.y, startPos.z);
  scene.add(proj);

  let alive = true;
  let lastTs = performance.now();
  let remaining = (typeof ttl === 'number' && ttl > 0) ? ttl : undefined;

  function step(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;

    if (!targetMesh || !targetMesh.position) {
      return destroy();
    }
    const direction = new THREE.Vector3().subVectors(targetMesh.position, proj.position);
    const dist = direction.length();
    if (dist > 0.0001) {
      direction.normalize();
      proj.position.addScaledVector(direction, speed * dt);
    }
    // TTL fallback expiry if provided
    if (remaining !== undefined) {
      remaining -= dt;
      if (remaining <= 0) return destroy();
    }
    proj._animId = requestAnimationFrame(step);
  }

  function destroy() {
    alive = false;
    scene.remove(proj);
    proj.geometry.dispose();
    proj.material.dispose();
    try { onDestroy && onDestroy(); } catch {}
  }

  proj._animId = requestAnimationFrame(step);
  return { destroy };
}
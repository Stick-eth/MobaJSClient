// src/spells.js
import * as THREE from 'three';
import { scene, camera } from '../world/scene.js';
import { character } from './character.js';
import { socket } from '../network/socket.js';
import { qSpellCast } from './projectiles.js';  

// --- CONFIGURATION DES SORTS ---
const SPELLS = [
  { key: 'a', name: 'Q (Skillshot)', cooldown: 4, icon: null }, // Q Ezreal
  { key: 'z', name: 'W', cooldown: 10, icon: null },
  { key: 'e', name: 'E', cooldown: 8, icon: null },
  { key: 'r', name: 'R', cooldown: 40, icon: null },
  { key: 'd', name: 'Flash', cooldown: 6, icon: null },
  { key: 'f', name: 'Summoner 2', cooldown: 12, icon: null },
];

// --- STATE ---
const spellState = SPELLS.map(s => ({
  cooldown: 0, // seconds left
  lastCast: -Infinity,
}));

export let projectiles = []; // { mesh, direction, speed, timeLeft }

export function initSpells() {
  window.addEventListener('keydown', handleSpellKeydown);
}

export function updateSpells(delta) {
  // Tick cooldowns
  for (let i = 0; i < SPELLS.length; ++i) {
    if (spellState[i].cooldown > 0) {
      spellState[i].cooldown = Math.max(0, spellState[i].cooldown - delta);
    }
  }

  // Move & remove projectiles
  for (let i = projectiles.length - 1; i >= 0; --i) {
    const p = projectiles[i];
    p.mesh.position.addScaledVector(p.direction, p.speed * delta);
    p.timeLeft -= delta;
    if (p.timeLeft <= 0) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

// --- Overlay API ---
export function getSpellsState() {
  return SPELLS.map((spell, i) => ({
    key: spell.key.toUpperCase(),
    name: spell.name,
    cooldown: spellState[i].cooldown,
    ready: spellState[i].cooldown === 0
  }));
}

// --- GESTION DES SORTS ---
function handleSpellKeydown(e) {
  const key = e.key.toLowerCase();
  const idx = SPELLS.findIndex(s => s.key === key);
  if (idx === -1) return;

  // Si cooldown > 0 : on bloque
  if (spellState[idx].cooldown > 0) return;

  if (SPELLS[idx].key === 'a') {
    castEzrealQ();
    
    spellState[idx].cooldown = SPELLS[idx].cooldown;
    spellState[idx].lastCast = performance.now() / 1000;
  }
  if (SPELLS[idx].key === 'd') {
    castFlash();
    spellState[idx].cooldown = SPELLS[idx].cooldown;
    spellState[idx].lastCast = performance.now() / 1000;
  }
}

// --- SPELL Q (Ezreal) ---
function castEzrealQ() {
  // 1. Direction = curseur souris projeté sur le terrain horizontal
  const dir = getCursorWorldDirection();
  if (!dir) return;

  // 2. Crée le projectile
  const geom = new THREE.SphereGeometry(0.22, 12, 12);
  const mat  = new THREE.MeshBasicMaterial({ color: 0x39c6ff });
  const mesh = new THREE.Mesh(geom, mat);

  mesh.position.copy(character.position);
  mesh.position.y += 0.3; // pour que ça ne touche pas le sol direct

  // Ajoute à la scène
  scene.add(mesh);

  // Stock pour update
  projectiles.push({
    mesh,
    direction: dir,
    speed: 25,
    timeLeft: 0.3 // durée de vie en secondes
  });

  socket.emit('spellCast', {
    spell: 'Q',
    from: socket.id,
    pos: {
      x: character.position.x,
      y: character.position.y,
      z: character.position.z
    },
    dir: {
      x: dir.x,
      y: dir.y,
      z: dir.z
    }
  });
}

// --- SPELL FLASH ---
function castFlash() {
  const dir = getCursorWorldDirection();
  if (!dir) return;

  // 1. Calcule la destination (700 units LoL ≈ ~5-7 unités, à tester visuellement)
  const DIST = 3; // adapte si besoin

  // 2. Vérifie que le terrain est walkable (optionnel)
  // -- Ajoute ton propre check de collision si tu veux interdire le flash dans le mur

  // 3. Déplace instantanément le personnage
  character.position.addScaledVector(dir, DIST);
}

// --- UTILS ---
// Calcule la direction monde du curseur (du personnage vers le point visé)
function getCursorWorldDirection() {
  // On projette le curseur sur le plan XZ à hauteur du personnage
  const mouse = new THREE.Vector2();
  // Utilise la dernière position souris connue (pour edge-case hors canvas)
  const lastEvent = window._lastMouseEvent;
  if (!lastEvent) return null;
  mouse.x =  (lastEvent.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(lastEvent.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  // Plan horizontal à hauteur du personnage
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -character.position.y);

  const intersect = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersect);
  const dir = intersect.sub(character.position);
  if (dir.lengthSq() < 0.001) return null;
  dir.y = 0; // reste dans le plan horizontal
  dir.normalize();
  return dir;
}

// --- TRACK LA POSITION SOURIS ---
// Pour toujours avoir la vraie direction au moment du cast
window.addEventListener('mousemove', e => { window._lastMouseEvent = e; });

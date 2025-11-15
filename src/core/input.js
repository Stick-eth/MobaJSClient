import * as THREE from 'three'; 
import { renderer, camera } from '../world/scene.js';
import { terrainMesh } from '../world/terrain.js';
import { setPath, character, moveToAttackTarget, attackTarget, isDead, isGameActive, areControlsEnabled, getAttackRange, getCurrentDestination, getCurrentPath } from '../player/character.js';
import { isWalkable } from '../world/collision.js';
import { showMarker } from '../ui/marker.js';
import { findPath, hasLineOfSight } from '../player/pathfinding.js';
import { remotePlayers } from '../network/remotePlayers.js';
import { socket } from '../network/socket.js';
import { onClassChange } from '../player/classes.js';
import { isEnemyTeam, getMyTeam } from '../core/teams.js';
import { getMinionMeshes } from '../world/minions.js';
import { getAttackableTurretMeshes } from '../world/turrets.js';

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

const AUTOATTACK_RETRY_MS = 120;
const SELF_COLLISION_RADIUS = 0.45;

let lastAutoAttackTime = 0;
let autoAttackCooldownMs = 650;
let pendingAutoAttack = false;
let lastAutoAttackAttempt = 0;

let hoveredEnemy = null;
let currentAttackTarget = null;
let autoAttackInterval = null;

const HOVER_OUTLINE_FLAG = '__hoverOutline';
const FRESNEL_VERTEX_SHADER = `
uniform float uPower;
uniform float uThickness;
varying float vFresnel;

void main() {
  vec3 displacedPosition = position + normal * uThickness;
  vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
  vec3 viewDir = normalize(-mvPosition.xyz);
  vec3 worldNormal = normalize(normalMatrix * normal);
  float fresnel = pow(1.0 - max(0.0, dot(worldNormal, viewDir)), uPower);
  vFresnel = fresnel;
  gl_Position = projectionMatrix * mvPosition;
}`;

const FRESNEL_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uIntensity;
varying float vFresnel;

void main() {
  float intensity = clamp(vFresnel * uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(uColor * intensity, uOpacity * intensity);
}`;

function createFresnelMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xff3030) },
      uOpacity: { value: 1.0 },
      uIntensity: { value: 2.4 },
      uPower: { value: 1.8 },
      uThickness: { value: 0.045 }
    },
    vertexShader: FRESNEL_VERTEX_SHADER,
    fragmentShader: FRESNEL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide
  });
}

function collectHoverTargets(root) {
  const targets = [];
  if (!root) {
    return targets;
  }
  root.traverse(node => {
    if (node.userData && node.userData[HOVER_OUTLINE_FLAG]) {
      return;
    }
    if ((node.isMesh || node.isSkinnedMesh) && node.visible !== false) {
      targets.push(node);
    }
  });
  return targets;
}

function ensureHoverOverlay(target) {
  if (!target || !target.geometry) {
    return null;
  }
  if (target.userData && target.userData.__hoverOverlay) {
    return target.userData.__hoverOverlay;
  }
  const material = createFresnelMaterial();
  const overlay = new THREE.Mesh(target.geometry, material);
  overlay.name = `${target.name || 'hover'}-outline`;
  overlay.visible = false;
  overlay.renderOrder = (target.renderOrder || 0) + 2;
  overlay.frustumCulled = target.frustumCulled;
  overlay.matrixAutoUpdate = true;
  overlay.castShadow = false;
  overlay.receiveShadow = false;
  overlay.userData = overlay.userData || {};
  overlay.userData[HOVER_OUTLINE_FLAG] = true;
  overlay.layers.mask = target.layers.mask;
  overlay.raycast = () => {};
  target.add(overlay);
  overlay.position.set(0, 0, 0);
  overlay.rotation.set(0, 0, 0);
  overlay.scale.set(1, 1, 1);
  target.userData = target.userData || {};
  target.userData.__hoverOverlay = overlay;
  return overlay;
}

function setHoverHighlight(mesh, highlighted) {
  if (!mesh) {
    return;
  }
  const targets = collectHoverTargets(mesh);
  targets.forEach(target => {
    const overlay = highlighted
      ? ensureHoverOverlay(target)
      : (target.userData && target.userData.__hoverOverlay) || null;
    if (overlay) {
      overlay.visible = highlighted;
    }
  });
}

function resolveTargetableMesh(object) {
  let node = object;
  while (node) {
    const hasId = node.userData && node.userData.id !== undefined && node.userData.id !== null;
    const hasType = typeof node.userData?.type === 'string';
    const hasUnitType = typeof node.userData?.unitType === 'string';
    if (hasId && (hasType || hasUnitType)) {
      return node;
    }
    node = node.parent;
  }
  return null;
}

function getTargetType(mesh) {
  if (!mesh?.userData) return 'player';
  const { type, unitType } = mesh.userData;
  if (type === 'minion' || unitType === 'minion') {
    return 'minion';
  }
  if (type === 'player' || unitType === 'player') {
    return 'player';
  }
  if (type === 'turret' || unitType === 'turret') {
    return 'turret';
  }
  return 'player';
}

function getTargetHitRadius(mesh) {
  if (!mesh?.userData) return 0;
  if (typeof mesh.userData.hitRadius === 'number') {
    return mesh.userData.hitRadius;
  }
  if (typeof mesh.userData.radius === 'number') {
    return mesh.userData.radius;
  }
  return 0;
}

function planarDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.hypot(dx, dz);
}

function getTargetableEnemyMeshes() {
  const players = Object.values(remotePlayers)
    .filter(mesh => mesh && mesh.visible && isEnemyMesh(mesh));
  const minions = getMinionMeshes()
    .filter(mesh => mesh && mesh.visible && isEnemyMesh(mesh));
  const turrets = getAttackableTurretMeshes()
    .filter(mesh => mesh && mesh.visible && isEnemyMesh(mesh));
  return [...players, ...minions, ...turrets];
}

function updateHoverEnemy() {
  raycaster.setFromCamera(mouse, camera);
  const meshes = getTargetableEnemyMeshes();

  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length > 0) {
    const mesh = resolveTargetableMesh(hits[0].object);
    if (mesh && hoveredEnemy !== mesh) {
      if (hoveredEnemy) setHoverHighlight(hoveredEnemy, false);
      hoveredEnemy = mesh;
      setHoverHighlight(hoveredEnemy, true);
    } else if (!mesh && hoveredEnemy) {
      setHoverHighlight(hoveredEnemy, false);
      hoveredEnemy = null;
    }
  } else if (hoveredEnemy) {
    setHoverHighlight(hoveredEnemy, false);
    hoveredEnemy = null;
  }
}

// -- Attaque auto sur joueur ciblé (juste la poursuite, toujours pathfinding) --
function startAttackingEnemy(enemyMesh) {
  const resolved = resolveTargetableMesh(enemyMesh);
  if (!resolved || !isEnemyMesh(resolved)) {
    return;
  }
  if (getTargetType(resolved) === 'turret' && !resolved.userData?.attackable) {
    return;
  }
  stopAttacking();
  currentAttackTarget = resolved;
  moveToAttackTarget(resolved);
}


function stopAttacking() {
  currentAttackTarget = null;
  if (autoAttackInterval) clearInterval(autoAttackInterval);
  autoAttackInterval = null;
  pendingAutoAttack = false;
  if (attackTarget) {
    moveToAttackTarget(null);
  }
}

// Permet à remotePlayers.js de signaler si une cible disparaît
export function onRemotePlayerRemoved(id) {
  if (currentAttackTarget && currentAttackTarget.userData.id === id) {
    stopAttacking();
  }
}

// -- Gestion souris globale (track en temps réel pour hover) --
window.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

export function initInput() {
  const canvas = renderer.domElement;

  canvas.addEventListener('mousedown', e => {
    if (isDead || !isGameActive || !areControlsEnabled()) {
      e.preventDefault();
      return;
    }
    if (e.button === 2) { // bouton droit
      e.preventDefault();

      raycaster.setFromCamera(mouse, camera);

      // -- Clic sur un joueur ennemi --
      const enemyMeshes = getTargetableEnemyMeshes();
      const hitEnemies = raycaster.intersectObjects(enemyMeshes, true);
      if (hitEnemies.length > 0) {
        const enemyMesh = resolveTargetableMesh(hitEnemies[0].object);
        if (enemyMesh) {
          startAttackingEnemy(enemyMesh);
        }
        return; // On n'autorise pas déplacement sur clic joueur
      }

      // -- Clic droit sur le terrain pour déplacer --
      const hits = raycaster.intersectObject(terrainMesh);
      if (hits.length > 0) {
        stopAttacking(); // Annule attaque en cours si on clique le sol
        const point = hits[0].point;
        if (isWalkable(point.x, point.z)) {
          const dist = character.position.distanceTo(point);
          if (dist < 2 && hasLineOfSight(character.position, point)) {
            // Ligne droite seulement pour petits déplacements sans obstacle
            const flatPoint = point.clone();
            flatPoint.y = character.position.y;
            setPath([flatPoint]);
            showMarker(flatPoint);
          } else {
            const path = findPath(
              character.position.x, character.position.z,
              point.x, point.z
            );
            if (path.length > 0) {
              setPath(path);
              showMarker(point);
            }
          }
        }
      }
    }
    if (e.button === 1) {
      e.preventDefault();
    }
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
  }, { passive: false });
}

// Appelé à chaque frame depuis main.js pour gérer hover en temps réel
export function updateInput(delta = 1/60) {
  if (!isGameActive || !areControlsEnabled()) {
    if (currentAttackTarget) stopAttacking();
    return;
  }
  if (isDead) {
    if (currentAttackTarget) stopAttacking();
    return;
  }
  updateHoverEnemy();

  if (currentAttackTarget && !isEnemyMesh(currentAttackTarget)) {
    stopAttacking();
    return;
  }
  if (currentAttackTarget && (!currentAttackTarget.visible || !currentAttackTarget.parent)) {
    stopAttacking();
    return;
  }
  if (currentAttackTarget && getTargetType(currentAttackTarget) === 'turret' && !currentAttackTarget.userData?.attackable) {
    stopAttacking();
    return;
  }

  // -- Gestion autoattack (cooldown géré proprement) --
  if (currentAttackTarget) {
    const dist = planarDistance(character.position, currentAttackTarget.position);
    const now = Date.now();
    if (pendingAutoAttack && (now - lastAutoAttackAttempt) >= AUTOATTACK_RETRY_MS) {
      pendingAutoAttack = false;
    }
    const aaRange = getAttackRange();
    const targetRadius = getTargetHitRadius(currentAttackTarget);
    const effectiveRange = aaRange + SELF_COLLISION_RADIUS + targetRadius;
    if (
      dist <= effectiveRange + 0.05 &&
      !pendingAutoAttack &&
      (now - lastAutoAttackTime) >= autoAttackCooldownMs
    ) {
      // Peut attaquer
      pendingAutoAttack = true;
      lastAutoAttackAttempt = now;
      socket.emit("autoattack", {
        targetId: currentAttackTarget.userData.id,
        from: socket.id,
        targetType: getTargetType(currentAttackTarget),
        pos: {
          x: character.position.x,
          y: character.position.y,
          z: character.position.z,
        }
      });
    }
  }
}

export function getInputDebugState() {
  return {
    attackTargetId: currentAttackTarget?.userData?.id ?? null,
    pendingAutoAttack,
    lastAutoAttackTime,
    lastAutoAttackAttempt,
    autoAttackCooldownMs,
    hoveredEnemyId: hoveredEnemy?.userData?.id ?? null,
    currentPath: getCurrentPath(),
    destination: getCurrentDestination(),
  };
}

function isEnemyMesh(mesh) {
  if (!mesh) return false;
  const team = mesh.userData?.team;
  const myTeam = getMyTeam();
  if (!team || !myTeam) {
    return true;
  }
  return isEnemyTeam(team);
}

export function resetAutoAttackCooldown() {
  lastAutoAttackTime = Date.now() - autoAttackCooldownMs;
  pendingAutoAttack = false;
}

onClassChange((definition) => {
  const cooldown = definition?.stats?.autoAttack?.cooldownMs;
  if (typeof cooldown === 'number') {
    autoAttackCooldownMs = cooldown;
  }
  lastAutoAttackTime = Date.now() - autoAttackCooldownMs;
  pendingAutoAttack = false;
});

window.addEventListener('autoattackConfirmed', () => {
  pendingAutoAttack = false;
  lastAutoAttackTime = Date.now();
});

window.addEventListener('enemyDied', (event) => {
  const { id } = event.detail || {};
  if (!id) return;
  if (currentAttackTarget && currentAttackTarget.userData?.id === id) {
    stopAttacking();
  }
});


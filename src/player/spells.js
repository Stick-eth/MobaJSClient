// src/spells.js
import * as THREE from 'three';
import { scene, camera } from '../world/scene.js';
import { character } from './character.js';
import { socket } from '../network/socket.js';
import { qSpellCast } from './projectiles.js';
import { onClassChange, getSelectedClassId } from './classes.js';
import { resetAutoAttackCooldown } from '../core/input.js';

const SPELL_ORDER = ['a', 'z', 'e', 'r', 'd', 'f'];

const CLASS_SPELLBOOK = {
  marksman: {
    a: {
      displayName: 'Q (Tir mystique)',
      cooldown: 4
    }
  },
  melee: {
    a: {
      displayName: 'Q (Renforcement)',
      cooldown: 6
    }
  }
};

const SUMMONER_SPELLS = {
  d: {
    displayName: 'Flash',
    cooldown: 300,
    cast: () => castFlash()
  },
  f: {
    displayName: 'Summoner 2',
    cooldown: 0,
    cast: null
  }
};

const spellState = new Map(); // key -> { remaining, duration }
let activeSpellBook = CLASS_SPELLBOOK.marksman;
let currentClassId = 'marksman';

export let projectiles = []; // { mesh, direction, speed, timeLeft }

export function initSpells() {
  window.addEventListener('keydown', handleSpellKeydown);
}

export function updateSpells(delta) {
  spellState.forEach((state) => {
    if (state.remaining > 0) {
      state.remaining = Math.max(0, state.remaining - delta);
    }
  });

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

export function getSpellsState() {
  return SPELL_ORDER.map((slot) => {
    const classCfg = activeSpellBook[slot];
    const summonerCfg = SUMMONER_SPELLS[slot];
    const cfg = classCfg || summonerCfg;
    if (!cfg) {
      return {
        key: slot.toUpperCase(),
        name: '—',
        cooldown: 0,
        ready: false
      };
    }
    const state = spellState.get(slot) || { remaining: 0 };
    return {
      key: slot.toUpperCase(),
      name: cfg.displayName,
      cooldown: state.remaining || 0,
      ready: (state.remaining || 0) === 0
    };
  });
}

function handleSpellKeydown(e) {
  const key = e.key.toLowerCase();
  const cfg = activeSpellBook[key] || SUMMONER_SPELLS[key];
  if (!cfg) return;

  const state = spellState.get(key);
  if (state && state.remaining > 0) return;

  let casted = false;
  if (SUMMONER_SPELLS[key]) {
    const caster = SUMMONER_SPELLS[key].cast;
    casted = typeof caster === 'function' ? caster() : false;
  } else {
    casted = castSpellForClass(currentClassId, key);
  }
  if (casted) {
    const duration = cfg.cooldown;
    spellState.set(key, {
      duration,
      remaining: duration
    });
  }
}

function castSpellForClass(classId, key) {
  if (classId === 'marksman' && key === 'a') {
    return castMarksmanQ();
  }
  if (classId === 'melee' && key === 'a') {
    return castMeleeQ();
  }
  return false;
}

function castMarksmanQ() {
  const dir = getCursorWorldDirection();
  if (!dir) return false;

  const geom = new THREE.SphereGeometry(0.22, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0x39c6ff });
  const mesh = new THREE.Mesh(geom, mat);

  mesh.position.copy(character.position);
  mesh.position.y += 0.3;

  scene.add(mesh);

  projectiles.push({
    mesh,
    direction: dir,
    speed: 25,
    timeLeft: 0.3
  });

  socket.emit('spellCast', {
    spell: 'Q',
    classId: 'marksman',
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

  return true;
}

function castMeleeQ() {
  resetAutoAttackCooldown();
  socket.emit('spellCast', {
    spell: 'Q',
    classId: 'melee'
  });
  return true;
}

// placeholder for future spells like Flash
function castFlash() {
  const dir = getCursorWorldDirection();
  if (!dir) return false;
  const DIST = 3;
  const origin = {
    x: character.position.x,
    y: character.position.y,
    z: character.position.z
  };
  const target = {
    x: origin.x + dir.x * DIST,
    y: origin.y,
    z: origin.z + dir.z * DIST
  };

  socket.emit('spellCast', {
    spell: 'flash',
    origin,
    target
  });
  return true;
}

function getCursorWorldDirection() {
  const mouse = new THREE.Vector2();
  const lastEvent = window._lastMouseEvent;
  if (!lastEvent) return null;
  mouse.x = (lastEvent.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(lastEvent.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -character.position.y);

  const intersect = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersect);
  const dir = intersect.sub(character.position);
  if (dir.lengthSq() < 0.001) return null;
  dir.y = 0;
  dir.normalize();
  return dir;
}

window.addEventListener('mousemove', (e) => { window._lastMouseEvent = e; });

function ensureSpellState(slot, cooldown) {
  const current = spellState.get(slot);
  if (current) {
    current.duration = cooldown;
    if (current.remaining > cooldown) {
      current.remaining = cooldown;
    }
  } else {
    spellState.set(slot, { duration: cooldown, remaining: 0 });
  }
}

function syncSpellbook(classId) {
  activeSpellBook = CLASS_SPELLBOOK[classId] || {};
  SPELL_ORDER.forEach((slot) => {
    const cfg = activeSpellBook[slot];
    if (cfg) {
      ensureSpellState(slot, cfg.cooldown);
    } else if (SUMMONER_SPELLS[slot]) {
      ensureSpellState(slot, SUMMONER_SPELLS[slot].cooldown);
    } else {
      spellState.delete(slot);
    }
  });
}

onClassChange(({ id }) => {
  currentClassId = id;
  syncSpellbook(id);
});

Object.entries(SUMMONER_SPELLS).forEach(([slot, data]) => {
  ensureSpellState(slot, data.cooldown);
});

syncSpellbook(getSelectedClassId());

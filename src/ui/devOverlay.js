import * as THREE from 'three';
import { character, attackTarget, isGameActive, areControlsEnabled, isDead, getMoveSpeed, getCharacterVelocity, getAttackRange } from '../player/character.js';
import { getInputDebugState } from '../core/input.js';
import { socket } from '../network/socket.js';

let initialized = false;
let enabled = false;
let rootElement = null;
let infoElement = null;
let ringGroup = null;
let pathLine = null;
let minionToggleButton = null;

const STATIC_RING_CONFIGS = [
  { radius: 5, color: 0x36c2ff },
  { radius: 10, color: 0xffc736 },
  { radius: 20, color: 0xff4664 }
];
const AUTO_RING_COLOR = 0x7cff89;
const RING_LABEL_HEIGHT = 0.35;
const PATH_LINE_COLOR = 0x00ffd0;

let staticRingEntries = [];
let autoAttackRingEntry = null;
let minionsEnabled = true;
let minionTogglePending = false;
let minionToggleTimeoutId = null;

const reusableVelocity = new THREE.Vector3();
const reusablePoint = new THREE.Vector3();

export function initDevOverlay(scene) {
  if (initialized) return;

  rootElement = document.createElement('div');
  rootElement.id = 'dev-overlay';

  infoElement = document.createElement('pre');
  infoElement.className = 'dev-overlay-body';
  rootElement.appendChild(infoElement);

  minionToggleButton = document.createElement('button');
  minionToggleButton.type = 'button';
  minionToggleButton.className = 'dev-overlay-button';
  minionToggleButton.addEventListener('click', handleMinionToggleClick);
  rootElement.appendChild(minionToggleButton);
  updateMinionButton();

  document.body.appendChild(rootElement);

  ringGroup = new THREE.Group();
  ringGroup.visible = false;

  staticRingEntries = STATIC_RING_CONFIGS.map((config) => {
    const entry = createRingEntry(config.radius, config.color, `${config.radius}u`);
    entry.baseRadius = config.radius;
    entry.defaultLabel = `${config.radius}u`;
    ringGroup.add(entry.group);
    return entry;
  });

  autoAttackRingEntry = createRingEntry(getAttackRange(), AUTO_RING_COLOR, 'AA');
  autoAttackRingEntry.baseRadius = 0;
  autoAttackRingEntry.defaultLabel = 'AA';
  ringGroup.add(autoAttackRingEntry.group);

  scene.add(ringGroup);

  pathLine = createPathLine();
  scene.add(pathLine);

  window.addEventListener('minionSpawningStatus', handleMinionStatusEvent);

  initialized = true;
  syncVisibility();
}

export function toggleDevOverlay() {
  setDevOverlayEnabled(!enabled);
  return enabled;
}

export function setDevOverlayEnabled(value) {
  enabled = Boolean(value);
  syncVisibility();
  updateMinionButton();
}

export function isDevOverlayEnabled() {
  return enabled;
}

export function updateDevOverlay() {
  if (!initialized) return;
  syncVisibility();

  if (!enabled) {
    if (pathLine) {
      pathLine.visible = false;
      pathLine.userData.hasPath = false;
    }
    return;
  }

  const shouldRender = isGameActive && character.visible;
  if (!shouldRender) {
    if (infoElement) {
      infoElement.textContent = 'En attente du match...';
    }
    if (pathLine) {
      pathLine.visible = false;
      pathLine.userData.hasPath = false;
    }
    return;
  }

  updateRingAnchors();

  staticRingEntries.forEach((entry) => {
    updateRingEntry(entry, entry.baseRadius, entry.defaultLabel);
  });

  const attackRange = Math.max(0, getAttackRange() || 0);
  const aaLabel = `AA ${attackRange.toFixed(1)}u`;
  updateRingEntry(autoAttackRingEntry, attackRange, aaLabel);

  const debugState = getInputDebugState();
  const velocity = getCharacterVelocity();
  reusableVelocity.copy(velocity);
  const speed = reusableVelocity.length();
  const destination = debugState.destination;
  const path = debugState.currentPath || [];

  updatePathVisualization(path);

  const pathPreview = buildPathPreview(path);

  const attackTargetId = debugState.attackTargetId ?? (attackTarget?.userData?.id ?? 'none');
  const attackDistance = attackTarget
    ? character.position.distanceTo(attackTarget.position).toFixed(2)
    : 'n/a';

  const now = Date.now();
  const sinceLastAA = formatDurationSince(debugState.lastAutoAttackTime, now);
  const sinceAttemptAA = formatDurationSince(debugState.lastAutoAttackAttempt, now);

  const minionStateLabel = minionsEnabled ? 'enabled' : 'disabled';
  const pendingSuffix = minionTogglePending ? ' (pending)' : '';

  const lines = [
    `state: running=${isGameActive ? 'yes' : 'no'} | controls=${areControlsEnabled() ? 'on' : 'off'} | dead=${isDead ? 'yes' : 'no'}`,
    `position: x=${character.position.x.toFixed(2)} y=${character.position.y.toFixed(2)} z=${character.position.z.toFixed(2)}`,
    `velocity: x=${velocity.x.toFixed(2)} y=${velocity.y.toFixed(2)} z=${velocity.z.toFixed(2)} | speed=${speed.toFixed(2)}`,
    `moveSpeed: ${getMoveSpeed().toFixed(2)} | path nodes: ${path.length}`,
    `destination: ${destination ? `x=${destination.x.toFixed(2)} z=${destination.z.toFixed(2)}` : 'none'}`,
    `path preview: ${pathPreview}`,
    `attack target: ${attackTargetId} | dist=${attackDistance} | hovered=${debugState.hoveredEnemyId ?? 'none'}`,
    `autoattack: pending=${debugState.pendingAutoAttack ? 'yes' : 'no'} | cooldown=${debugState.autoAttackCooldownMs}ms | since=${sinceLastAA}`,
    `last attempt: ${sinceAttemptAA}`,
    `minions: ${minionStateLabel}${pendingSuffix}`
  ];

  if (infoElement) {
    infoElement.textContent = lines.join('\n');
  }
}

function syncVisibility() {
  const shouldRender = enabled && isGameActive && character.visible;
  if (rootElement) {
    rootElement.classList.toggle('active', shouldRender);
  }
  if (ringGroup) {
    ringGroup.visible = shouldRender;
  }
  if (!shouldRender && pathLine) {
    pathLine.visible = false;
    pathLine.userData.hasPath = false;
  }
}

function updateRingAnchors() {
  if (!ringGroup) return;
  const baseY = Math.max(0, character.position.y - 0.5) + 0.05;
  ringGroup.position.set(character.position.x, baseY, character.position.z);
}

function buildPathPreview(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return 'none';
  }
  const preview = path.slice(0, 3).map((node, index) => {
    const x = typeof node?.x === 'number' ? node.x : 0;
    const z = typeof node?.z === 'number' ? node.z : 0;
    return `#${index}:${x.toFixed(1)},${z.toFixed(1)}`;
  }).join(' | ');
  return path.length > 3 ? `${preview} ...` : preview;
}

function updatePathVisualization(path) {
  if (!pathLine) return;
  if (!Array.isArray(path) || path.length === 0) {
    pathLine.visible = false;
    pathLine.userData.hasPath = false;
    return;
  }

  const pathHeight = Math.max(0, character.position.y - 0.45) + 0.12;
  const points = [
    reusablePoint.set(character.position.x, pathHeight, character.position.z).clone(),
    ...path.map((node) => new THREE.Vector3(
      typeof node?.x === 'number' ? node.x : 0,
      pathHeight,
      typeof node?.z === 'number' ? node.z : 0
    ))
  ];

  const newGeometry = new THREE.BufferGeometry().setFromPoints(points);
  if (pathLine.geometry) {
    pathLine.geometry.dispose();
  }
  pathLine.geometry = newGeometry;
  pathLine.visible = true;
  pathLine.userData.hasPath = true;
}

function createRingEntry(radius, color, labelText) {
  const geometry = buildRingGeometry(Math.max(radius, 0.1));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
    depthWrite: false
  });

  const line = new THREE.LineLoop(geometry, material);
  line.position.y = 0.02;
  line.renderOrder = 2;

  const { sprite, setText } = createLabelSprite(labelText, colorToCss(color));
  sprite.position.set(radius + 0.4, RING_LABEL_HEIGHT, 0);
  sprite.renderOrder = 3;

  const group = new THREE.Group();
  group.add(line);
  group.add(sprite);

  return {
    group,
    line,
    sprite,
    setLabelText: setText,
    radius,
    labelText
  };
}

function updateRingEntry(entry, radius, labelText) {
  if (!entry) return;
  if (!radius || radius <= 0) {
    entry.group.visible = false;
    return;
  }
  const safeRadius = Math.max(0.1, radius || 0);
  if (Math.abs(safeRadius - (entry.radius || 0)) > 0.05) {
    entry.radius = safeRadius;
    const oldGeometry = entry.line.geometry;
    entry.line.geometry = buildRingGeometry(safeRadius);
    oldGeometry?.dispose?.();
  }
  entry.group.visible = safeRadius > 0;
  entry.sprite.position.set(safeRadius + 0.4, RING_LABEL_HEIGHT, 0);
  if (labelText && labelText !== entry.labelText) {
    entry.setLabelText(labelText);
    entry.labelText = labelText;
  }
}

function buildRingGeometry(radius) {
  const segments = Math.max(32, Math.floor(radius * 24));
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.2, 1.1, 1);

  function drawLabel(label) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(12, 18, 30, 0.82)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.fillStyle = color;
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  }

  drawLabel(text);
  return { sprite, setText: drawLabel };
}

function colorToCss(color) {
  const hex = color.toString(16).padStart(6, '0');
  return `#${hex}`;
}

function createPathLine() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: PATH_LINE_COLOR,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false
  });
  const line = new THREE.Line(geometry, material);
  line.visible = false;
  line.renderOrder = 4;
  line.userData.hasPath = false;
  return line;
}

function formatDurationSince(timestamp, now) {
  if (!timestamp) return 'n/a';
  const diff = Math.max(0, now - timestamp);
  return formatDuration(diff);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes.toFixed(2)}m`;
  }
  const hours = minutes / 60;
  return `${hours.toFixed(2)}h`;
}

function handleMinionToggleClick() {
  if (!socket || minionTogglePending) {
    return;
  }
  if (!socket.connected) {
    minionTogglePending = false;
    updateMinionButton();
    return;
  }
  minionTogglePending = true;
  const targetState = !minionsEnabled;
  socket.emit('setMinionSpawning', { enabled: targetState });
  socket.emit('requestMinionSpawningStatus');
  if (minionToggleTimeoutId) {
    clearTimeout(minionToggleTimeoutId);
  }
  minionToggleTimeoutId = setTimeout(() => {
    if (minionTogglePending) {
      minionTogglePending = false;
      updateMinionButton();
    }
  }, 3000);
  updateMinionButton();
}

function handleMinionStatusEvent(event) {
  const nextEnabled = Boolean(event?.detail?.enabled);
  minionsEnabled = nextEnabled;
  minionTogglePending = false;
  if (minionToggleTimeoutId) {
    clearTimeout(minionToggleTimeoutId);
    minionToggleTimeoutId = null;
  }
  updateMinionButton();
}

function updateMinionButton() {
  if (!minionToggleButton) return;
  const label = minionsEnabled ? 'Disable Minions' : 'Enable Minions';
  minionToggleButton.textContent = minionTogglePending ? `${label} (pending)` : label;
  minionToggleButton.disabled = minionTogglePending;
}

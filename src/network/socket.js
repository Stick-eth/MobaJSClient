import { io } from "socket.io-client";
import { addRemotePlayer, updateRemotePlayer, removeRemotePlayer, updateRemotePlayerClass, updateRemotePlayerTeam, clearRemotePlayers } from "./remotePlayers.js";
import { remotePlayers } from './remotePlayers.js';
import { qSpellCast, launchLinearProjectile, launchHomingProjectile } from '../player/projectiles.js';
import { character, setDeadState, setMoveSpeed } from '../player/character.js';
import { trackHealthBar, setHealthBarValue, setHealthBarVisible, setHealthBarLevel, setHealthBarColor } from '../ui/healthBars.js';
import { getSelectedClassId, getSelectedClassDefinition, setSelectedClassId, onClassChange } from '../player/classes.js';
import { setMyTeam, setPlayerTeam, clearPlayerTeam, resetTeams, getMyTeam, getPlayerTeam, getTeamMeshColor, getHealthBarColorForTeam } from '../core/teams.js';
import { handleMinionSnapshot, handleMinionsSpawned, handleMinionsUpdated, handleMinionsRemoved, handleMinionProjectile, clearMinions as resetMinions, getMinionMeshById, showMinionGoldSplash } from '../world/minions.js';
import {
  handleTurretAttack,
  applyTurretSnapshot,
  applyTurretUpdate,
  handleTurretDestroyed,
  getTurretMeshByUid
} from '../world/turrets.js';

const envUrl = (import.meta.env.VITE_SERVER_URL || '').trim();
const defaultProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const defaultHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const defaultUrl = `${defaultProtocol}//${defaultHost}:3000`;
const serverUrl = envUrl || defaultUrl;
const devCommandsToken = (import.meta.env.VITE_DEV_COMMANDS_TOKEN || '').trim();
const SNAPSHOT_REQUEST_COOLDOWN_MS = 1000;

let lastMinionSnapshotRequest = 0;

const connectionMeta = {
  hadInitialConnection: false,
  isConnecting: false,
  attempt: 0,
  lastDisconnectManual: false
};

function emitNetworkStatus(status, detail = {}) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent('network:status', {
    detail: { status, ...detail }
  }));
}

function formatSocketError(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error && typeof error.message === 'string' && error.message.length) {
    return error.message;
  }
  if (error && typeof error.description === 'string' && error.description.length) {
    return error.description;
  }
  if (error && typeof error.type === 'string' && error.type.length) {
    return error.type;
  }
  if (error && typeof error.code === 'string' && error.code.length) {
    return `Code ${error.code}`;
  }
  if (error && typeof error.context === 'string' && error.context.length) {
    return error.context;
  }
  return '';
}

function safeNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function requestMinionSnapshot(options = {}) {
  if (!socket.connected) return;
  const force = Boolean(options?.force);
  const now = safeNowMs();
  if (!force && now - lastMinionSnapshotRequest < SNAPSHOT_REQUEST_COOLDOWN_MS) {
    return;
  }
  lastMinionSnapshotRequest = now;
  socket.emit('requestMinionSnapshot');
}

function resolveTurretTargetMesh(payload = {}) {
  let { targetType, targetId } = payload;
  if (!targetType && typeof targetId === 'string') {
    if (getTurretMeshByUid(targetId)) {
      targetType = 'turret';
    }
  }
  if (targetType === 'turret') {
    return getTurretMeshByUid(targetId) || null;
  }
  if (targetType === 'player') {
    if (targetId === socket.id) {
      return character;
    }
    return remotePlayers[targetId] || null;
  }
  if (targetType === 'minion') {
    if (typeof targetId !== 'number') return null;
    return getMinionMeshById(targetId);
  }
  return null;
}

function resolveAttackTargetMesh(targetType, targetId) {
  return resolveTurretTargetMesh({ targetType, targetId });
}

const socketOptions = {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 8000,
  timeout: 5000
};

if (devCommandsToken) {
  socketOptions.auth = { devToken: devCommandsToken };
}

export const socket = io(serverUrl, socketOptions);

let selectedClassId = getSelectedClassId();

let localProgress = { level: 1, xp: 0, xpToNext: 200, gold: 0 };
let localInventory = [];
let shopCatalog = [];
let shopMaxSlots = 6;

function emitLocalHealth(hp, maxHp) {
  window.dispatchEvent(new CustomEvent('playerHealthChanged', {
    detail: { hp, maxHp }
  }));
}

function emitLocalProgress(detail) {
  window.dispatchEvent(new CustomEvent('playerProgressUpdate', {
    detail: {
      ...detail,
      inventory: [...localInventory]
    }
  }));
}

function emitLocalGold(gold) {
  window.dispatchEvent(new CustomEvent('playerGoldChanged', {
    detail: { gold }
  }));
}

function updateLocalInventory(nextInventory, { force = false } = {}) {
  const normalized = Array.isArray(nextInventory)
    ? nextInventory.slice(0, shopMaxSlots)
    : [];
  const changed = force
    || normalized.length !== localInventory.length
    || normalized.some((value, index) => value !== localInventory[index]);
  localInventory = normalized;
  if (changed) {
    window.dispatchEvent(new CustomEvent('playerInventoryChanged', {
      detail: { id: socket.id, inventory: [...localInventory] }
    }));
  }
}

onClassChange(({ id }, { source }) => {
  selectedClassId = id;
  if (socket.connected && source === 'user') {
    socket.emit('selectClass', { classId: id });
  }
});

// Track active AA projectiles by id for precise stop on hit
const aaProjectiles = new Map(); // projId -> { destroy }

export let players = [];
export let myId = null;

export function connectToServer(reason = 'manual') {
  if (socket.connected) {
    emitNetworkStatus('connected', {
      isReconnect: connectionMeta.hadInitialConnection,
      alreadyConnected: true
    });
    return;
  }

  if (!socket.disconnected) {
    const statusKey = connectionMeta.hadInitialConnection ? 'reconnecting' : 'connecting';
    emitNetworkStatus(statusKey, {
      attempt: Math.max(1, connectionMeta.attempt || 1),
      reason,
      isReconnect: connectionMeta.hadInitialConnection,
      phase: connectionMeta.hadInitialConnection ? 'reconnect' : 'initial'
    });
    return;
  }

  connectionMeta.isConnecting = true;
  connectionMeta.attempt = 1;
  connectionMeta.lastDisconnectManual = false;
  const phase = connectionMeta.hadInitialConnection ? 'reconnect' : 'initial';
  emitNetworkStatus('connecting', {
    attempt: connectionMeta.attempt,
    reason,
    isReconnect: connectionMeta.hadInitialConnection,
    phase
  });
  socket.connect();
}

export function disconnectFromServer() {
  connectionMeta.lastDisconnectManual = true;
  connectionMeta.isConnecting = false;
  connectionMeta.attempt = 0;
  if (socket.connected || !socket.disconnected) {
    socket.disconnect();
  }
}

export function requestWorldResync({ force = false } = {}) {
  if (!socket.connected) {
    return;
  }
  requestMinionSnapshot({ force });
  socket.emit('snapshotRequest');
  socket.emit('requestMinionSpawningStatus');
}

export function clearActiveProjectiles() {
  aaProjectiles.forEach(handle => {
    try { handle.destroy(); } catch {}
  });
  aaProjectiles.clear();
}

socket.on('connect_error', (error) => {
  const attempt = Math.max(1, connectionMeta.attempt || 1);
  const message = formatSocketError(error) || 'Erreur de connexion au serveur';
  emitNetworkStatus('connection_error', {
    reason: message,
    attempt,
    isReconnect: connectionMeta.hadInitialConnection
  });
  connectionMeta.isConnecting = true;
  connectionMeta.attempt = attempt + 1;
});

socket.on('connect_timeout', () => {
  const attempt = Math.max(1, connectionMeta.attempt || 1);
  emitNetworkStatus('connection_error', {
    reason: 'Délai de connexion dépassé',
    attempt,
    timeout: true,
    isReconnect: connectionMeta.hadInitialConnection
  });
  connectionMeta.isConnecting = true;
  connectionMeta.attempt = attempt + 1;
});

socket.on('error', (error) => {
  const attempt = Math.max(1, connectionMeta.attempt || 1);
  const message = formatSocketError(error) || 'Erreur réseau inattendue';
  emitNetworkStatus('connection_error', {
    reason: message,
    attempt,
    isReconnect: connectionMeta.hadInitialConnection
  });
});

socket.on('reconnect_attempt', (attempt) => {
  connectionMeta.isConnecting = true;
  connectionMeta.attempt = attempt;
  emitNetworkStatus('reconnecting', {
    attempt,
    isReconnect: true
  });
});

socket.on('reconnect_error', (error) => {
  const attempt = Math.max(1, connectionMeta.attempt || 1);
  const message = formatSocketError(error) || 'Reconnexion échouée';
  emitNetworkStatus('connection_error', {
    reason: message,
    attempt,
    isReconnect: true
  });
  connectionMeta.isConnecting = true;
  connectionMeta.attempt = attempt + 1;
});

socket.on('reconnect_failed', () => {
  emitNetworkStatus('connection_error', {
    reason: 'Échec de la reconnexion',
    attempt: connectionMeta.attempt,
    isReconnect: true,
    fatal: true
  });
  connectionMeta.isConnecting = false;
});

socket.on("connect", () => {
  const isReconnect = connectionMeta.hadInitialConnection;
  connectionMeta.hadInitialConnection = true;
  connectionMeta.isConnecting = false;
  connectionMeta.attempt = 0;
  connectionMeta.lastDisconnectManual = false;
  emitNetworkStatus('connected', { isReconnect });
  myId = socket.id;
  lastMinionSnapshotRequest = 0;
  const classDef = getSelectedClassDefinition();
  const maxHp = classDef?.stats?.maxHp ?? 100;
  trackHealthBar(myId, character, { color: '#27ae60', max: maxHp });
  setHealthBarValue(myId, maxHp, maxHp);
  setHealthBarVisible(myId, true);
  emitLocalHealth(maxHp, maxHp);
  localProgress = { level: 1, xp: 0, xpToNext: 200, gold: 0 };
  localInventory = [];
  updateLocalInventory([], { force: true });
  setHealthBarLevel(myId, localProgress.level ?? 1);
  emitLocalProgress({ level: 1, xp: 0, xpToNext: 200, gold: 0, leveledUp: false, levelsGained: 0 });
  emitLocalGold(localProgress.gold);
  setMoveSpeed(classDef?.stats?.moveSpeed ?? 4.5);
  socket.emit('selectClass', { classId: selectedClassId });
  socket.emit('requestMinionSpawningStatus');
});

socket.on("playersList", (serverPlayers = []) => {
  const selfEntry = serverPlayers.find(p => p.id === socket.id);
  if (selfEntry?.team) {
    const team = setMyTeam(selfEntry.team);
    character.userData.team = team;
    if (character.material?.color) {
      character.material.color.setHex(getTeamMeshColor(team));
    }
    setHealthBarColor(socket.id, getHealthBarColorForTeam(team));
  }

  if (typeof selfEntry?.gold === 'number') {
    localProgress.gold = selfEntry.gold;
    emitLocalGold(localProgress.gold);
  }

  const initialInventory = Array.isArray(selfEntry?.inventory)
    ? selfEntry.inventory.slice(0, shopMaxSlots)
    : [];
  updateLocalInventory(initialInventory, { force: true });

  if (selfEntry && Number.isFinite(selfEntry.x) && Number.isFinite(selfEntry.z)) {
    character.position.set(selfEntry.x, character.position.y, selfEntry.z);
    character.visible = true;
    setDeadState(false);
  }

  players = serverPlayers
    .filter(p => p.id !== socket.id)
    .map(p => {
      const normalizedTeam = setPlayerTeam(p.id, p.team);
      return {
        ...p,
        team: normalizedTeam,
        gold: typeof p.gold === 'number' ? p.gold : 0,
        inventory: Array.isArray(p.inventory) ? [...p.inventory] : []
      };
    });

  players.forEach(p => {
    const maxHp = p.maxHp ?? 100;
    addRemotePlayer(p.id, p.x, p.z, p.hp ?? maxHp, maxHp, p.classId, p.team);
    setHealthBarValue(p.id, p.hp ?? maxHp, maxHp);
    setHealthBarVisible(p.id, !p.dead);
    setHealthBarLevel(p.id, p.level ?? 1);
    if (typeof p.moveSpeed === 'number') {
      const mesh = remotePlayers[p.id];
      if (mesh) {
        mesh.userData.moveSpeed = p.moveSpeed;
      }
    }
  });

  console.log("Liste des autres joueurs :", players);
});

socket.on("playerJoined", (newPlayer) => {
  if (newPlayer.id !== socket.id) {
    const maxHp = newPlayer.maxHp ?? 100;
    const normalizedTeam = setPlayerTeam(newPlayer.id, newPlayer.team);
    addRemotePlayer(newPlayer.id, newPlayer.x, newPlayer.z, newPlayer.hp ?? maxHp, maxHp, newPlayer.classId, normalizedTeam);
    setHealthBarValue(newPlayer.id, newPlayer.hp ?? maxHp, maxHp);
    setHealthBarVisible(newPlayer.id, !newPlayer.dead);
    setHealthBarLevel(newPlayer.id, newPlayer.level ?? 1);
    if (typeof newPlayer.moveSpeed === 'number') {
      const mesh = remotePlayers[newPlayer.id];
      if (mesh) {
        mesh.userData.moveSpeed = newPlayer.moveSpeed;
      }
    }
    players.push({
      ...newPlayer,
      team: normalizedTeam,
      gold: typeof newPlayer.gold === 'number' ? newPlayer.gold : 0,
      inventory: Array.isArray(newPlayer.inventory) ? [...newPlayer.inventory] : []
    });
    console.log("Nouveau joueur :", newPlayer);
  }
});

socket.on('teamAssignment', ({ id, team }) => {
  if (!id || !team) return;
  if (id === socket.id) {
    const normalized = setMyTeam(team);
    character.userData.team = normalized;
    if (character.material?.color) {
      character.material.color.setHex(getTeamMeshColor(normalized));
    }
    const barColor = getHealthBarColorForTeam(normalized);
    setHealthBarColor(id, barColor);
  } else {
    updateRemotePlayerTeam(id, team);
    const target = players.find(p => p.id === id);
    if (target) {
      target.team = getPlayerTeam(id);
    }
  }
});

socket.on("playerLeft", ({ id }) => {
  removeRemotePlayer(id);
  players = players.filter(p => p.id !== id);
  clearPlayerTeam(id);
  console.log("Joueur parti :", id);
});

socket.on('minionSnapshot', ({ minions } = {}) => {
  handleMinionSnapshot(Array.isArray(minions) ? minions : []);
});

socket.on('minionsSpawned', ({ minions } = {}) => {
  handleMinionsSpawned(Array.isArray(minions) ? minions : []);
});

socket.on('minionsUpdated', ({ minions } = {}) => {
  handleMinionsUpdated(Array.isArray(minions) ? minions : []);
});

socket.on('minionsRemoved', (payload = {}) => {
  handleMinionsRemoved(payload);
});

socket.on('minionProjectile', (payload = {}) => {
  handleMinionProjectile(payload);
});

socket.on('turretAttack', (payload = {}) => {
  const targetMesh = resolveTurretTargetMesh(payload);
  handleTurretAttack(payload, { targetMesh });
});

socket.on('turretSnapshot', ({ turrets: snapshot } = {}) => {
  applyTurretSnapshot(Array.isArray(snapshot) ? snapshot : []);
});

socket.on('turretUpdate', (payload = {}) => {
  applyTurretUpdate(payload);
});

socket.on('turretDestroyed', (payload = {}) => {
  handleTurretDestroyed(payload);
});

socket.on('minionSpawningStatus', ({ enabled } = {}) => {
  const isEnabled = enabled !== false;
  if (!isEnabled) {
    resetMinions();
  }
  window.dispatchEvent(new CustomEvent('minionSpawningStatus', {
    detail: { enabled: isEnabled }
  }));
});

socket.on("playerPositionUpdate", (data) => {
  if (data.id !== socket.id) {
    updateRemotePlayer(data.id, data.x, data.z);
  }
});

// Heartbeat resync snapshot autoritaire
socket.on('playersSnapshot', (snapshot) => {
  snapshot.forEach(p => {
    if (p.id === socket.id) return; // ignore self; local is source of truth for own position until corrections implemented
    const maxHp = p.maxHp ?? 100;
    updateRemotePlayer(p.id, p.x, p.z, { hp: p.hp, maxHp, classId: p.classId, team: p.team });
    setHealthBarValue(p.id, p.hp ?? maxHp, maxHp);
    setHealthBarVisible(p.id, !p.dead);
    const target = players.find(pl => pl.id === p.id);
    if (target) {
      target.x = p.x;
      target.z = p.z;
      target.hp = p.hp ?? target.hp;
      target.dead = p.dead;
      target.maxHp = maxHp;
      target.classId = p.classId ?? target.classId;
      if (p.team) target.team = p.team;
      if (typeof p.level === 'number') target.level = p.level;
      if (typeof p.xp === 'number') target.xp = p.xp;
      if (typeof p.xpToNext === 'number') target.xpToNext = p.xpToNext;
      if (typeof p.gold === 'number') target.gold = p.gold;
      if (typeof p.moveSpeed === 'number') {
        target.moveSpeed = p.moveSpeed;
        const mesh = remotePlayers[p.id];
        if (mesh) {
          mesh.userData.moveSpeed = p.moveSpeed;
        }
      }
    }
    if (p.team) {
      const normalizedTeam = updateRemotePlayerTeam(p.id, p.team);
      if (target && normalizedTeam) {
        target.team = normalizedTeam;
      }
    }
    if (p.classId) {
      updateRemotePlayerClass(p.id, p.classId);
    }
    const levelForBar = typeof p.level === 'number'
      ? p.level
      : (target?.level ?? 1);
    setHealthBarLevel(p.id, levelForBar);
  });
});

// Damage and death/respawn handling
socket.on('playerDamaged', ({ id, hp, from, source, maxHp }) => {
  const isLocal = id === socket.id;
  const target = isLocal ? null : players.find(p => p.id === id);
  const effectiveMax = isLocal
    ? (maxHp ?? getSelectedClassDefinition()?.stats?.maxHp ?? 100)
    : (maxHp ?? target?.maxHp ?? 100);

  setHealthBarValue(id, hp, effectiveMax);
  setHealthBarVisible(id, hp > 0);
  if (!isLocal) {
    if (target) {
      target.hp = hp;
      if (maxHp) target.maxHp = maxHp;
      if (hp <= 0) target.dead = true;
    }
    setHealthBarLevel(id, target?.level ?? 1);
  }
  if (isLocal) {
    setHealthBarLevel(id, localProgress.level ?? 1);
  }
  if (id === socket.id) {
    console.log(`[DMG] You took damage from ${from} via ${source}. HP=${hp}`);
    window.dispatchEvent(new Event('playerDamageEffect'));
    emitLocalHealth(hp, effectiveMax);
  }
});

socket.on('playerHealthUpdate', ({ id, hp, maxHp }) => {
  if (typeof id !== 'string') return;
  const isLocal = id === socket.id;
  const target = isLocal ? null : players.find(p => p.id === id);
  const effectiveMax = isLocal
    ? (maxHp ?? getSelectedClassDefinition()?.stats?.maxHp ?? 100)
    : (maxHp ?? target?.maxHp ?? 100);

  if (!isLocal && target) {
    target.hp = hp;
    target.maxHp = effectiveMax;
    if (hp > 0) {
      target.dead = false;
    }
  }

  setHealthBarValue(id, hp, effectiveMax);
  setHealthBarVisible(id, hp > 0);
  setHealthBarLevel(id, isLocal ? (localProgress.level ?? 1) : (target?.level ?? 1));

  if (isLocal) {
    emitLocalHealth(hp, effectiveMax);
  }
});

socket.on('playerDied', ({ id, by, source }) => {
  if (id === socket.id) {
    // Hide own character and show death overlay
    character.visible = false;
    setDeadState(true);
    setHealthBarVisible(id, false);
    const maxHp = getSelectedClassDefinition()?.stats?.maxHp ?? 100;
    setHealthBarValue(id, 0, maxHp);
    emitLocalHealth(0, maxHp);
    window.dispatchEvent(new CustomEvent('showDeathOverlay', { detail: { by, source, seconds: 5 } }));
    window.dispatchEvent(new Event('playerDiedLocal'));
  } else {
    // Hide remote player's mesh
    const mesh = remotePlayers[id];
    if (mesh) mesh.visible = false;
    setHealthBarVisible(id, false);
    const target = players.find(p => p.id === id);
    const maxHp = target?.maxHp ?? 100;
    setHealthBarValue(id, 0, maxHp);
    if (target) {
      target.dead = true;
      target.hp = 0;
    }
    window.dispatchEvent(new CustomEvent('enemyDied', { detail: { id } }));
  }
});

socket.on('playerRespawned', ({ id, x, z, hp, maxHp, classId, team }) => {
  if (id === socket.id) {
    character.position.set(x, character.position.y, z);
    character.visible = true;
    setDeadState(false);
    if (classId) {
      setSelectedClassId(classId, { source: 'server', force: true });
    }
    if (team) {
      const normalized = setMyTeam(team);
      character.userData.team = normalized;
      if (character.material?.color) {
        character.material.color.setHex(getTeamMeshColor(normalized));
      }
      setHealthBarColor(id, getHealthBarColorForTeam(normalized));
    }
    const effectiveMax = maxHp ?? (getSelectedClassDefinition()?.stats?.maxHp ?? 100);
    setHealthBarValue(id, hp ?? effectiveMax, effectiveMax);
    setHealthBarVisible(id, (hp ?? effectiveMax) > 0);
    setHealthBarLevel(id, localProgress.level ?? 1);
    window.dispatchEvent(new CustomEvent('hideDeathOverlay'));
    window.dispatchEvent(new Event('playerRespawnedLocal'));
    emitLocalHealth(hp ?? effectiveMax, effectiveMax);
  } else {
    const mesh = remotePlayers[id];
    if (mesh) {
      mesh.position.set(x, 0.5, z);
      mesh.visible = true;
    }
    let normalizedTeam = null;
    if (team) {
      normalizedTeam = setPlayerTeam(id, team);
      updateRemotePlayerTeam(id, normalizedTeam);
    }
    const target = players.find(p => p.id === id);
    if (target) {
      target.x = x;
      target.z = z;
      target.dead = false;
      target.hp = hp ?? (target.maxHp ?? 100);
      target.maxHp = maxHp ?? target.maxHp;
      target.classId = classId ?? target.classId;
      if (normalizedTeam) target.team = normalizedTeam;
    }
    if (classId) {
      updateRemotePlayerClass(id, classId);
    }
    const effectiveMax = maxHp ?? target?.maxHp ?? 100;
    setHealthBarValue(id, hp ?? effectiveMax, effectiveMax);
    setHealthBarVisible(id, (hp ?? effectiveMax) > 0);
    setHealthBarLevel(id, target?.level ?? 1);
  }
});

socket.on('autoattack', (payload) => {
  if (!payload) return;
  const { type, from, targetId, targetType: rawTargetType, pos, dir, speed, ttl, projId, homing } = payload;
  if (from === socket.id) {
    window.dispatchEvent(new CustomEvent('autoattackConfirmed', { detail: payload }));
  }
  if (type === 'melee') {
    if (from === socket.id) {
      console.log('[AA] melee swing sent');
    } else {
      console.log('[AA] melee swing from', from, 'to', targetId);
    }
    return;
  }
  if (type === 'ranged') {
    if (!pos) return;
    let targetType = rawTargetType;
    if (!targetType) {
      if (typeof targetId === 'number') {
        targetType = 'minion';
      } else if (typeof targetId === 'string' && getTurretMeshByUid(targetId)) {
        targetType = 'turret';
      } else {
        targetType = 'player';
      }
    }
    if (homing) {
      // Homing projectile follows target mesh; server decides hit
      const targetMesh = resolveAttackTargetMesh(targetType, targetId);
      if (!targetMesh) return;
      const handle = launchHomingProjectile(pos, targetMesh, speed || 14, ttl, 0xffff55, () => {
        if (projId) aaProjectiles.delete(projId);
      });
      if (projId) aaProjectiles.set(projId, handle);
    } else {
      // Fallback linear
      const handle = launchLinearProjectile(pos, dir || { x: 0, y: 0, z: 1 }, speed || 14, ttl, 0xffff55, () => {
        if (projId) aaProjectiles.delete(projId);
      });
      if (projId) aaProjectiles.set(projId, handle);
    }
  }
});

// Server authoritative hit, stop projectile immediately at impact
socket.on('projectileHit', ({ id, pos, targetId }) => {
  const handle = aaProjectiles.get(id);
  if (handle) {
    try { handle.destroy(); } catch {}
    aaProjectiles.delete(id);
  }
});

// Safety cleanup in case of disconnect or manual reload events
window.addEventListener('beforeunload', () => {
  aaProjectiles.forEach(h => { try { h.destroy(); } catch {} });
  aaProjectiles.clear();
});

socket.on('playerProgress', (payload = {}) => {
  const { id, level, xp, xpToNext, hp, maxHp, moveSpeed, leveledUp, levelsGained, gold, inventory } = payload;
  if (!id) return;
  if (id === socket.id) {
    if (typeof level === 'number') localProgress.level = level;
    if (typeof xp === 'number') localProgress.xp = xp;
    if (typeof xpToNext === 'number') localProgress.xpToNext = xpToNext;
    if (typeof gold === 'number') {
      localProgress.gold = gold;
      emitLocalGold(localProgress.gold);
    }
    if (Array.isArray(inventory)) {
      updateLocalInventory(inventory);
    }
    emitLocalProgress({
      level: localProgress.level,
      xp: localProgress.xp,
      xpToNext: localProgress.xpToNext,
      gold: localProgress.gold,
      leveledUp: Boolean(leveledUp),
      levelsGained: typeof levelsGained === 'number' ? levelsGained : (leveledUp ? 1 : 0)
    });
    setHealthBarLevel(id, localProgress.level ?? 1);
    if (typeof moveSpeed === 'number' && !Number.isNaN(moveSpeed)) {
      setMoveSpeed(moveSpeed);
    }
    if (typeof hp === 'number' && typeof maxHp === 'number') {
      setHealthBarValue(id, hp, maxHp);
      setHealthBarVisible(id, hp > 0);
      emitLocalHealth(hp, maxHp);
    }
  } else {
    const target = players.find(p => p.id === id);
    if (target) {
      if (typeof level === 'number') target.level = level;
      if (typeof xp === 'number') target.xp = xp;
      if (typeof xpToNext === 'number') target.xpToNext = xpToNext;
      if (typeof maxHp === 'number') target.maxHp = maxHp;
      if (typeof hp === 'number') target.hp = hp;
      if (typeof gold === 'number') target.gold = gold;
      if (Array.isArray(inventory)) {
        target.inventory = [...inventory];
      }
      if (typeof moveSpeed === 'number') {
        target.moveSpeed = moveSpeed;
        const mesh = remotePlayers[id];
        if (mesh) {
          mesh.userData.moveSpeed = moveSpeed;
        }
      }
    }
    const remoteLevel = typeof level === 'number' ? level : target?.level ?? 1;
    setHealthBarLevel(id, remoteLevel);
    if (typeof hp === 'number' && typeof maxHp === 'number') {
      setHealthBarValue(id, hp, maxHp);
      setHealthBarVisible(id, hp > 0);
    }
  }
});

socket.on('shop:data', ({ items, maxSlots } = {}) => {
  if (Number.isFinite(maxSlots)) {
    const normalizedSlots = Math.max(1, Math.min(12, Math.floor(maxSlots)));
    if (normalizedSlots !== shopMaxSlots) {
      shopMaxSlots = normalizedSlots;
      updateLocalInventory(localInventory, { force: true });
    }
  }
  if (Array.isArray(items)) {
    shopCatalog = items.map(item => ({ ...item }));
  }
  window.dispatchEvent(new CustomEvent('shop:data', {
    detail: {
      items: shopCatalog.map(item => ({ ...item })),
      maxSlots: shopMaxSlots
    }
  }));
});

socket.on('shop:purchaseResult', (payload = {}) => {
  window.dispatchEvent(new CustomEvent('shop:purchaseResult', {
    detail: { ...payload }
  }));
});

socket.on('shop:sellResult', (payload = {}) => {
  window.dispatchEvent(new CustomEvent('shop:sellResult', {
    detail: { ...payload }
  }));
});

socket.on('goldReward', (payload = {}) => {
  showMinionGoldSplash(payload);
});

socket.on('dev:commandResult', (payload = {}) => {
  window.dispatchEvent(new CustomEvent('dev:commandResult', {
    detail: { ...payload }
  }));
});

socket.on('spellCast', ({ spell, from, pos, dir, classId, origin }) => {
  // Si le lanceur c'est moi, pos est déjà la bonne position
  // Si le lanceur est un autre, pos est la position donnée par le serveur (c'est OK)

  if (spell === 'Q') {
    if (from === socket.id) return; // already spawned locally on cast
    if (classId === 'marksman' && pos && dir) {
      qSpellCast(from, pos, dir);
    }
    return;
  }

  if (spell === 'flash') {
    if (!pos) return;
    const y = typeof pos.y === 'number'
      ? pos.y
      : (from === socket.id ? character.position.y : 0.5);
    if (from === socket.id) {
      character.position.set(pos.x, y, pos.z);
    } else {
      updateRemotePlayer(from, pos.x, pos.z);
    }
    const target = players.find(p => p.id === from);
    if (target) {
      target.x = pos.x;
      target.z = pos.z;
    }
    window.dispatchEvent(new CustomEvent('spellFlashResolved', { detail: { from, origin, destination: pos } }));
  }
});

socket.on('disconnect', (reason) => {
  const wasManual = connectionMeta.lastDisconnectManual || reason === 'io client disconnect';
  emitNetworkStatus(wasManual ? 'client_disconnected' : 'disconnected', {
    reason,
    manual: wasManual
  });
  connectionMeta.isConnecting = false;
  connectionMeta.attempt = 0;
  connectionMeta.lastDisconnectManual = false;
  clearRemotePlayers();
  players = [];
  myId = null;
  emitLocalHealth(0, 0);
  localProgress = { level: 1, xp: 0, xpToNext: 200, gold: 0 };
  localInventory = [];
  updateLocalInventory([], { force: true });
  emitLocalProgress({ level: 1, xp: 0, xpToNext: 200, gold: 0, leveledUp: false, levelsGained: 0 });
  emitLocalGold(0);
  resetTeams();
  character.userData.team = null;
  resetMinions();
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      requestMinionSnapshot();
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    requestMinionSnapshot();
  });
}

socket.on('playerClassChanged', ({ id, classId, hp, maxHp }) => {
  if (!classId) return;
  if (id === socket.id) {
    setSelectedClassId(classId, { source: 'server', force: true });
    const effectiveMax = maxHp ?? (getSelectedClassDefinition()?.stats?.maxHp ?? 100);
    setHealthBarValue(id, hp ?? effectiveMax, effectiveMax);
    setHealthBarVisible(id, (hp ?? effectiveMax) > 0);
    setHealthBarLevel(id, localProgress.level ?? 1);
    emitLocalHealth(hp ?? effectiveMax, effectiveMax);
  } else {
    let target = players.find(p => p.id === id);
    if (target) {
      target.classId = classId;
      target.maxHp = maxHp ?? target.maxHp;
      target.hp = hp ?? target.hp;
    } else {
      const effectiveMax = maxHp ?? 100;
      target = { id, classId, maxHp: effectiveMax, hp: hp ?? effectiveMax, dead: (hp ?? effectiveMax) <= 0, x: 0, z: 0 };
      players.push(target);
    }
    updateRemotePlayerClass(id, classId);
    const effectiveMax = maxHp ?? target?.maxHp ?? 100;
    setHealthBarValue(id, hp ?? effectiveMax, effectiveMax);
    setHealthBarVisible(id, (hp ?? effectiveMax) > 0);
    setHealthBarLevel(id, target?.level ?? 1);
  }
});

export function purchaseItem(itemId) {
  if (!itemId) return;
  socket.emit('shop:purchaseItem', { itemId });
}

export function sellItem(slot) {
  if (!Number.isInteger(slot) || slot < 0) return;
  socket.emit('shop:sellItem', { slot });
}

export function getLocalInventory() {
  return [...localInventory];
}

export function getShopCatalog() {
  return {
    items: shopCatalog.map(item => ({ ...item })),
    maxSlots: shopMaxSlots
  };
}

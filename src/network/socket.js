import { io } from "socket.io-client";
import { addRemotePlayer, updateRemotePlayer, removeRemotePlayer } from "./remotePlayers.js";
import { remotePlayers } from './remotePlayers.js';
import { qSpellCast, launchLinearProjectile, launchHomingProjectile } from '../player/projectiles.js';
import { character, setDeadState } from '../player/character.js';
import { trackHealthBar, setHealthBarValue, setHealthBarVisible } from '../ui/healthBars.js';

export const socket = io("http://localhost:3000");

// Track active AA projectiles by id for precise stop on hit
const aaProjectiles = new Map(); // projId -> { destroy }

export let players = [];
export let myId = null;

socket.on("connect", () => {
  myId = socket.id;
  trackHealthBar(myId, character, { color: '#27ae60', max: 100 });
  setHealthBarValue(myId, 100, 100);
  setHealthBarVisible(myId, true);
});

socket.on("playersList", (serverPlayers) => {
  players = serverPlayers.filter(p => p.id !== socket.id);
  // Pour chaque joueur reçu à la connexion, on ajoute son mesh
  players.forEach(p => {
    addRemotePlayer(p.id, p.x, p.z, p.hp ?? 100);
    setHealthBarValue(p.id, p.hp ?? 100, 100);
    setHealthBarVisible(p.id, !p.dead);
  });
  console.log("Liste des autres joueurs :", players);
});

socket.on("playerJoined", (newPlayer) => {
  if (newPlayer.id !== socket.id) {
    addRemotePlayer(newPlayer.id, newPlayer.x, newPlayer.z, newPlayer.hp ?? 100);
    setHealthBarValue(newPlayer.id, newPlayer.hp ?? 100, 100);
    setHealthBarVisible(newPlayer.id, !newPlayer.dead);
    players.push(newPlayer);
    console.log("Nouveau joueur :", newPlayer);
  }
});

socket.on("playerLeft", ({ id }) => {
  removeRemotePlayer(id);
  players = players.filter(p => p.id !== id);
  console.log("Joueur parti :", id);
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
    updateRemotePlayer(p.id, p.x, p.z);
    setHealthBarValue(p.id, p.hp ?? 100, 100);
    setHealthBarVisible(p.id, !p.dead);
    const target = players.find(pl => pl.id === p.id);
    if (target) {
      target.x = p.x;
      target.z = p.z;
      target.hp = p.hp ?? target.hp;
      target.dead = p.dead;
    }
  });
});

// Damage and death/respawn handling
socket.on('playerDamaged', ({ id, hp, from, source }) => {
  setHealthBarValue(id, hp, 100);
  setHealthBarVisible(id, hp > 0);
  if (id !== socket.id) {
    const target = players.find(p => p.id === id);
    if (target) {
      target.hp = hp;
      if (hp <= 0) target.dead = true;
    }
  }
  if (id === socket.id) {
    console.log(`[DMG] You took damage: -${source === 'Q' ? 20 : 10}hp from ${from}. HP=${hp}`);
    window.dispatchEvent(new Event('playerDamageEffect'));
  }
});

socket.on('playerDied', ({ id, by, source }) => {
  if (id === socket.id) {
    // Hide own character and show death overlay
    character.visible = false;
    setDeadState(true);
    setHealthBarVisible(id, false);
    setHealthBarValue(id, 0, 100);
    window.dispatchEvent(new CustomEvent('showDeathOverlay', { detail: { by, source, seconds: 5 } }));
  } else {
    // Hide remote player's mesh
    const mesh = remotePlayers[id];
    if (mesh) mesh.visible = false;
    setHealthBarVisible(id, false);
    setHealthBarValue(id, 0, 100);
    const target = players.find(p => p.id === id);
    if (target) {
      target.dead = true;
      target.hp = 0;
    }
  }
});

socket.on('playerRespawned', ({ id, x, z, hp }) => {
  if (id === socket.id) {
    character.position.set(x, character.position.y, z);
    character.visible = true;
    setDeadState(false);
    setHealthBarValue(id, hp ?? 100, 100);
    setHealthBarVisible(id, (hp ?? 100) > 0);
    window.dispatchEvent(new CustomEvent('hideDeathOverlay'));
  } else {
    const mesh = remotePlayers[id];
    if (mesh) {
      mesh.position.set(x, 0.5, z);
      mesh.visible = true;
    }
    setHealthBarValue(id, hp ?? 100, 100);
    setHealthBarVisible(id, (hp ?? 100) > 0);
    const target = players.find(p => p.id === id);
    if (target) {
      target.x = x;
      target.z = z;
      target.dead = false;
      target.hp = hp ?? 100;
    }
  }
});

socket.on('autoattack', (payload) => {
  if (!payload) return;
  const { type, from, targetId, pos, dir, speed, ttl, projId, homing } = payload;
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
    if (homing) {
      // Homing projectile follows target mesh; server decides hit
      const targetMesh = (targetId === socket.id) ? character : remotePlayers[targetId];
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


socket.on('spellCast', ({ spell, from, pos, dir }) => {
  // Si le lanceur c'est moi, pos est déjà la bonne position
  // Si le lanceur est un autre, pos est la position donnée par le serveur (c'est OK)

  if (spell === 'Q') {
    qSpellCast(from, pos, dir);
  } 
})

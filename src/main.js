import { initScene, scene, renderer, camera } from './world/scene.js';
import { character, initCharacter, updateCharacter, checkCharacterPosition, setGameActive, setControlsEnabled, setDeadState } from './player/character.js';
import { initCameraControl, updateCamera } from './ui/cameraController.js';
import { initInput, updateInput } from './core/input.js';
import { initOverlay } from './ui/overlay.js';
import { initPerformanceStats } from './ui/performanceStats.js';
import { updateMarker } from './ui/marker.js';
import { initSpells, updateSpells } from './player/spells.js';
import { socket, clearActiveProjectiles } from "./network/socket.js";
import { initHealthBars, updateHealthBars, resetHealthBars } from './ui/healthBars.js';
import { initDevOverlay, toggleDevOverlay, setDevOverlayEnabled, updateDevOverlay } from './ui/devOverlay.js';
import { initMenus, showHomeMenu, hideHomeMenu, showPauseMenu, hidePauseMenu, isPauseMenuVisible } from './ui/menu.js';
import { clearRemotePlayers } from './network/remotePlayers.js';
import { initMinions, updateMinions, clearMinions } from './world/minions.js';
import { isLowSpecDevice } from './core/performance.js';

initScene();
initMinions(scene);
initCharacter(scene);
initInput();
initOverlay();
initCameraControl(renderer.domElement);
initSpells();
initHealthBars(camera, renderer.domElement);
initDevOverlay(scene);
const updatePerformanceStats = initPerformanceStats();
updateHealthBars();
updateDevOverlay();
const lowSpecMode = isLowSpecDevice();

const MINION_UPDATE_INTERVAL = lowSpecMode ? 1 / 30 : 0;
const HEALTHBAR_UPDATE_INTERVAL = lowSpecMode ? 1 / 30 : 0;
const DEV_OVERLAY_INTERVAL = lowSpecMode ? 0.15 : 0;
const PERF_STATS_INTERVAL = lowSpecMode ? 0.5 : 0;

let minionAccumulator = 0;
let healthBarAccumulator = 0;
let overlayAccumulator = 0;
let performanceAccumulator = 0;

setGameActive(false);
setControlsEnabled(false);
setDeadState(false);
character.visible = false;

let lastTime = performance.now();
let isHidden = false;
let accumulatedHiddenTime = 0;
let matchRunning = false;
let gamePaused = false;

initMenus({
  onPlay: startGame,
  onResume: resumeGame,
  onQuit: returnToHome
});

function startGame() {
  if (matchRunning) {
    if (gamePaused) resumeGame();
    return;
  }
  matchRunning = true;
  gamePaused = false;
  hideHomeMenu();
  hidePauseMenu();
  setDeadState(false);
  setGameActive(true);
  setControlsEnabled(true);
  character.visible = true;
  character.position.set(0, 0.5, 0);
  if (!socket.connected) {
    socket.connect();
  }
}

function resumeGame() {
  if (!matchRunning || !gamePaused) return;
  gamePaused = false;
  hidePauseMenu();
  setControlsEnabled(true);
}

function pauseGame() {
  if (!matchRunning || gamePaused) return;
  gamePaused = true;
  setControlsEnabled(false);
  showPauseMenu();
}

function returnToHome() {
  hidePauseMenu();
  matchRunning = false;
  gamePaused = false;
  setGameActive(false);
  setControlsEnabled(false);
  setDeadState(false);
  setDevOverlayEnabled(false);
  character.visible = false;
  character.position.set(0, 0.5, 0);
  clearActiveProjectiles();
  clearRemotePlayers();
  clearMinions();
  resetHealthBars();
  window.dispatchEvent(new CustomEvent('hideDeathOverlay'));
  if (socket.connected) {
    socket.disconnect();
  }
  showHomeMenu();
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const target = event.target;
  const isEditable = target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );

  if (!isEditable && event.key && event.key.toLowerCase() === 'p') {
    if (!matchRunning) return;
    toggleDevOverlay();
    return;
  }

  if (event.key === 'Escape') {
    if (!matchRunning) return;
    if (isPauseMenuVisible()) {
      resumeGame();
    } else {
      pauseGame();
    }
  }
});

window.addEventListener('playerRespawnedLocal', () => {
  if (matchRunning && !gamePaused) {
    setControlsEnabled(true);
  }
});

// Main animation loop
function animate(now = performance.now()) {
  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;
  const delta = Math.min(rawDelta, 0.05);

  const shouldSimulate = matchRunning && !gamePaused && !isHidden;

  if (shouldSimulate) {
    updateCharacter(delta);
    updateCamera(delta);
    updateMarker(delta);
    updateSpells(delta);
    checkCharacterPosition();
    updateInput();
  } else if (!isHidden) {
    updateCamera(delta);
  }

  if (lowSpecMode && MINION_UPDATE_INTERVAL > 0) {
    minionAccumulator += delta;
    while (minionAccumulator >= MINION_UPDATE_INTERVAL) {
      updateMinions(MINION_UPDATE_INTERVAL);
      minionAccumulator -= MINION_UPDATE_INTERVAL;
    }
  } else {
    updateMinions(delta);
  }

  if (isHidden) {
    accumulatedHiddenTime += rawDelta;
    if (accumulatedHiddenTime >= 1.0) {
      renderer.render(scene, camera);
      accumulatedHiddenTime = 0;
    }
  } else {
    renderer.render(scene, camera);
    if (updatePerformanceStats) {
      if (lowSpecMode && PERF_STATS_INTERVAL > 0) {
        performanceAccumulator += rawDelta;
        if (performanceAccumulator >= PERF_STATS_INTERVAL) {
          updatePerformanceStats(performanceAccumulator);
          performanceAccumulator = 0;
        }
      } else {
        updatePerformanceStats(rawDelta);
      }
    }
  }

  if (lowSpecMode && HEALTHBAR_UPDATE_INTERVAL > 0) {
    healthBarAccumulator += rawDelta;
    if (healthBarAccumulator >= HEALTHBAR_UPDATE_INTERVAL) {
      updateHealthBars();
      healthBarAccumulator = 0;
    }
  } else {
    updateHealthBars();
  }

  if (lowSpecMode && DEV_OVERLAY_INTERVAL > 0) {
    overlayAccumulator += rawDelta;
    if (overlayAccumulator >= DEV_OVERLAY_INTERVAL) {
      updateDevOverlay();
      overlayAccumulator = 0;
    }
  } else {
    updateDevOverlay();
  }
  requestAnimationFrame(animate);
}
animate();

// Visibility handling
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    isHidden = true;
    accumulatedHiddenTime = 0;
  } else {
    isHidden = false;
    if (socket.connected && matchRunning) {
      socket.emit('snapshotRequest');
    }
  }
});

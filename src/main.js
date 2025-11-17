import { initScene, scene, renderer, camera } from './world/scene.js';
import { character, initCharacter, updateCharacter, checkCharacterPosition, setGameActive, setControlsEnabled, setDeadState } from './player/character.js';
import { initCameraControl, updateCamera } from './ui/cameraController.js';
import { initInput, updateInput } from './core/input.js';
import { initOverlay } from './ui/overlay.js';
import { initShopUI } from './ui/shop.js';
import { initPerformanceStats } from './ui/performanceStats.js';
import { updateMarker } from './ui/marker.js';
import { initSpells, updateSpells } from './player/spells.js';
import { socket, clearActiveProjectiles, connectToServer, disconnectFromServer, requestWorldResync } from "./network/socket.js";
import { initHealthBars, updateHealthBars, resetHealthBars } from './ui/healthBars.js';
import { initDevOverlay, toggleDevOverlay, setDevOverlayEnabled, updateDevOverlay } from './ui/devOverlay.js';
import { initNetworkStatusUI, showNetworkOverlay, hideNetworkOverlay } from './ui/networkStatus.js';
import { initMenus, showHomeMenu, hideHomeMenu, showPauseMenu, hidePauseMenu, isPauseMenuVisible } from './ui/menu.js';
import { clearRemotePlayers } from './network/remotePlayers.js';
import { initMinions, updateMinions, clearMinions } from './world/minions.js';
import { updateTurrets } from './world/turrets.js';
import { isLowSpecDevice } from './core/performance.js';

initScene();
initMinions(scene);
initCharacter(scene);
initInput();
initOverlay();
initShopUI();
initCameraControl(renderer.domElement);
initSpells();
initHealthBars(camera, renderer.domElement);
initDevOverlay(scene);
initNetworkStatusUI();
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

let matchRunning = false;
let gamePaused = false;
let networkHold = false;
let pendingMatchStart = false;

setGameActive(false);
setControlsEnabled(false);
setDeadState(false);
character.visible = false;
updateSimulationLocks();

let lastTime = performance.now();
let isHidden = false;
let accumulatedHiddenTime = 0;

function updateSimulationLocks() {
  const shouldRun = matchRunning && !gamePaused && !networkHold;
  setGameActive(shouldRun);
  setControlsEnabled(shouldRun);
}

initMenus({
  onPlay: startGame,
  onResume: resumeGame,
  onQuit: returnToHome
});

function startGame() {
  if (pendingMatchStart) {
    return;
  }
  if (matchRunning) {
    if (gamePaused && !networkHold) {
      resumeGame();
    }
    return;
  }

  pendingMatchStart = true;
  gamePaused = false;
  networkHold = true;
  hideHomeMenu();
  hidePauseMenu();
  setDeadState(false);
  character.visible = false;
  character.position.set(0, 0.5, 0);
  updateSimulationLocks();

  if (socket.connected) {
    pendingMatchStart = false;
    finalizeMatchStart();
    return;
  }

  connectToServer('user-start');
}

function resumeGame() {
  if (!matchRunning || !gamePaused) return;
  gamePaused = false;
  hidePauseMenu();
  updateSimulationLocks();
}

function pauseGame() {
  if (!matchRunning || gamePaused) return;
  gamePaused = true;
  updateSimulationLocks();
  showPauseMenu();
}

function returnToHome() {
  hidePauseMenu();
  pendingMatchStart = false;
  matchRunning = false;
  gamePaused = false;
  networkHold = false;
  updateSimulationLocks();
  setDeadState(false);
  setDevOverlayEnabled(false);
  character.visible = false;
  character.position.set(0, 0.5, 0);
  clearActiveProjectiles();
  clearRemotePlayers();
  clearMinions();
  resetHealthBars();
  window.dispatchEvent(new CustomEvent('hideDeathOverlay'));
  hideNetworkOverlay();
  disconnectFromServer();
  showHomeMenu();
}

function finalizeMatchStart() {
  matchRunning = true;
  pendingMatchStart = false;
  gamePaused = false;
  networkHold = false;
  hideHomeMenu();
  hidePauseMenu();
  hideNetworkOverlay();
  setDeadState(false);
  character.visible = true;
  character.position.set(0, 0.5, 0);
  updateSimulationLocks();
  requestWorldResync({ force: true });
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
  if (matchRunning && !gamePaused && !networkHold) {
    setControlsEnabled(true);
  }
});

window.addEventListener('networkOverlay:retry', () => {
  connectToServer('manual-retry');
});

window.addEventListener('networkOverlay:quit', () => {
  returnToHome();
});

window.addEventListener('network:status', (event) => {
  const detail = event.detail || {};
  const status = detail.status;
  const attempt = detail.attempt;
  const reason = detail.reason;
  const isReconnect = Boolean(detail.isReconnect);
  const manual = Boolean(detail.manual);
  const fatal = Boolean(detail.fatal);

  if (!status) {
    return;
  }

  const shouldBlock = pendingMatchStart || matchRunning;

  switch (status) {
    case 'connecting': {
      if (!shouldBlock) {
        break;
      }
      networkHold = true;
      updateSimulationLocks();
      const message = attempt && attempt > 1
        ? `Connexion en cours... (tentative ${attempt})`
        : 'Connexion en cours...';
      showNetworkOverlay({
        title: 'Connexion au serveur',
        message,
        showSpinner: true,
        showRetry: false,
        showQuit: true
      });
      break;
    }
    case 'reconnecting': {
      if (!shouldBlock) {
        break;
      }
      networkHold = true;
      updateSimulationLocks();
      const message = attempt && attempt > 0
        ? `Tentative de reconnexion (${attempt})...`
        : 'Tentative de reconnexion...';
      showNetworkOverlay({
        title: 'Reconnexion au serveur',
        message,
        showSpinner: true,
        showRetry: false,
        showQuit: true
      });
      break;
    }
    case 'disconnected': {
      if (!shouldBlock || manual) {
        break;
      }
      networkHold = true;
      updateSimulationLocks();
      const message = reason && reason.length
        ? `Connexion perdue (${reason}).`
        : 'Connexion au serveur perdue.';
      showNetworkOverlay({
        title: 'Connexion perdue',
        message,
        detail: 'Tentative de reconnexion automatique en cours...',
        showSpinner: true,
        showRetry: true,
        showQuit: true
      });
      break;
    }
    case 'connection_error': {
      if (!shouldBlock) {
        break;
      }
      networkHold = true;
      updateSimulationLocks();
      const message = reason && reason.length
        ? reason
        : 'Impossible de joindre le serveur.';
      const detailText = fatal
        ? 'Plus aucune tentative automatique. Utilise Reessayer ou retourne au menu.'
        : (attempt && attempt > 1
          ? `Nouvelle tentative automatique en cours (essai ${attempt}).`
          : 'Nouvelle tentative automatique en cours.');
      showNetworkOverlay({
        title: isReconnect ? 'Reconnexion impossible' : 'Serveur inaccessible',
        message,
        detail: detailText,
        showSpinner: false,
        showRetry: true,
        showQuit: true
      });
      break;
    }
    case 'connected': {
      networkHold = false;
      hideNetworkOverlay();
      if (pendingMatchStart) {
        finalizeMatchStart();
      } else {
        updateSimulationLocks();
        if (matchRunning) {
          requestWorldResync({ force: true });
        }
      }
      break;
    }
    case 'client_disconnected': {
      networkHold = false;
      hideNetworkOverlay();
      updateSimulationLocks();
      break;
    }
    default:
      break;
  }
});

// Main animation loop
function animate(now = performance.now()) {
  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;
  const delta = Math.min(rawDelta, 0.05);

  const shouldSimulate = matchRunning && !gamePaused && !networkHold && !isHidden;

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

  updateTurrets(delta);

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

// src/overlay.js
import lockedIcon   from '../assets/locked.png';
import unlockedIcon from '../assets/unlocked.png';
import { getSpellsState } from '../player/spells.js';
import { toggleLock, isCameraLocked } from './cameraController.js';

export function initOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'overlay';

  const img = document.createElement('img');
  img.id  = 'overlay-icon';
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  // Death overlay
  const death = document.createElement('div');
  death.id = 'death-overlay';
  death.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.7);color:#fff;font-family:sans-serif;z-index:2000;font-size:32px;';
  const deathMsg = document.createElement('div');
  const deathCountdown = document.createElement('div');
  death.appendChild(deathMsg);
  death.appendChild(deathCountdown);
  document.body.appendChild(death);

  let deathTimer = null;
  function showDeath(by, source, seconds) {
    const cause = source ? `${source}` : 'unknown';
    deathMsg.textContent = by ? `Eliminé par ${by} (${cause})` : `Eliminé (${cause})`;
    let remaining = seconds;
    deathCountdown.textContent = `Réapparition dans ${remaining}s`;
    death.style.display = 'flex';
    clearInterval(deathTimer);
    deathTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(deathTimer);
      }
      deathCountdown.textContent = `Réapparition dans ${Math.max(0, remaining)}s`;
    }, 1000);
  }
  function hideDeath() {
    death.style.display = 'none';
    clearInterval(deathTimer);
  }

  window.addEventListener('showDeathOverlay', e => {
    const { by, source, seconds } = e.detail || {}; showDeath(by, source, seconds || 5);
  });
  window.addEventListener('hideDeathOverlay', hideDeath);

  // Damage indicator overlay
  const dmgIndicator = document.createElement('div');
  dmgIndicator.id = 'damage-indicator';
  document.body.appendChild(dmgIndicator);
  let dmgTimeout = null;
  function triggerDamageIndicator() {
    dmgIndicator.classList.remove('active');
    void dmgIndicator.offsetWidth; // force reflow to restart animation
    dmgIndicator.classList.add('active');
    clearTimeout(dmgTimeout);
    dmgTimeout = setTimeout(() => {
      dmgIndicator.classList.remove('active');
    }, 500);
  }
  window.addEventListener('playerDamageEffect', triggerDamageIndicator);

  // Met à jour l'icône selon l'état courant
  function updateIcon(locked = isCameraLocked()) {
    img.src = locked ? lockedIcon : unlockedIcon;
    img.alt = locked
      ? 'Caméra verrouillée'
      : 'Caméra déverrouillée';
  }

  // Au chargement initial
  updateIcon();

  // Quand la caméra change d'état (Y ou clic depuis overlay)
  document.addEventListener('cameraLockChanged', e => {
    updateIcon(e.detail.locked);
  });

  // Click sur l'icône pour basculer
  img.addEventListener('click', () => {
    toggleLock();
  });

}    

export function updateSpellOverlay() {
  let bar = document.getElementById('spell-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'spell-bar';
    document.body.appendChild(bar);
  }
  const spells = getSpellsState();
  bar.innerHTML = spells.map(spell =>
    `<span class="spell-slot${spell.ready ? '' : ' spell-cd'}">${spell.key} <small>${spell.cooldown > 0 ? spell.cooldown.toFixed(1) : ''}</small></span>`
  ).join('');
}

setInterval(updateSpellOverlay, 60);
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
// src/overlay.js
import lockedIcon   from './assets/locked.png';
import unlockedIcon from './assets/unlocked.png';
import { toggleLock, isCameraLocked } from './cameraController.js';

export function initOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'overlay';

  const img = document.createElement('img');
  img.id  = 'overlay-icon';
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  // Tooltip caché par défaut
    const tooltip = document.createElement('div');
    tooltip.id = 'overlay-tooltip';
    tooltip.textContent = 'Appuyez sur Y pour déverrouiller';
    overlay.appendChild(tooltip);

  // Met à jour l'icône selon l'état courant
  function updateIcon(locked = isCameraLocked()) {
    img.src = locked ? lockedIcon : unlockedIcon;
    img.alt = locked
      ? 'Caméra verrouillée'
      : 'Caméra déverrouillée';

      tooltip.textContent = locked
      ? 'Appuyez sur Y pour déverrouiller'
      : 'Appuyez sur Y pour verrouiller';
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

   // Affiche le tooltip après 1 s de survol, cache au départ ou à la sortie
    let hoverTimer;
    img.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => {
        tooltip.style.opacity = '1';
      }, 1000);
    });
    img.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      tooltip.style.opacity = '0';
    });
}    

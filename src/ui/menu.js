import { CLASS_DEFINITIONS, getSelectedClassId, setSelectedClassId, onClassChange } from '../player/classes.js';

const CLASS_ICONS = {
  marksman: new URL('../assets/HUD/range/class.png', import.meta.url).href,
  melee: new URL('../assets/HUD/melee/class.png', import.meta.url).href,
  support: new URL('../assets/HUD/support/class.png', import.meta.url).href
};

let homeMenu;
let pauseMenu;
let playButton;
let resumeButton;
let quitButton;
let classContainer;
let classButtons = new Map();

let callbacks = {
  onPlay: null,
  onResume: null,
  onQuit: null,
  onClassSelect: null
};

function buildClassSelection(panel) {
  if (classContainer) return;
  classContainer = document.createElement('div');
  classContainer.className = 'class-select';

  Object.values(CLASS_DEFINITIONS).forEach((cls) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'class-option';
    button.dataset.classId = cls.id;
    const iconSrc = CLASS_ICONS[cls.id] || CLASS_ICONS.marksman;
    button.innerHTML = `
      <img class="class-option-icon" src="${iconSrc}" alt="${cls.label}" />
      <span class="class-option-title">${cls.label}</span>
    `;
    button.addEventListener('click', () => {
      setSelectedClassId(cls.id);
      callbacks.onClassSelect && callbacks.onClassSelect(cls.id);
    });
    classContainer.appendChild(button);
    classButtons.set(cls.id, button);
  });

  panel.insertBefore(classContainer, panel.querySelector('.menu-actions'));
  updateClassHighlight(getSelectedClassId());
}

function updateClassHighlight(activeId) {
  classButtons.forEach((btn, id) => {
    if (id === activeId) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

function ensureElements() {
  if (!homeMenu) {
    homeMenu = document.createElement('div');
    homeMenu.id = 'home-menu';
    homeMenu.className = 'menu-overlay';
    homeMenu.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-logo">LoL2</h1>
        <div class="menu-actions">
          <button id="menu-play" class="menu-button">Jouer</button>
        </div>
      </div>
    `;
    document.body.appendChild(homeMenu);
    playButton = homeMenu.querySelector('#menu-play');
    playButton.addEventListener('click', () => {
      hideHomeMenu();
      callbacks.onPlay && callbacks.onPlay();
    });
    buildClassSelection(homeMenu.querySelector('.menu-panel'));
  }

  if (!pauseMenu) {
    pauseMenu = document.createElement('div');
    pauseMenu.id = 'pause-menu';
    pauseMenu.className = 'menu-overlay';
    pauseMenu.innerHTML = `
      <div class="menu-panel">
        <h2 class="menu-logo">LoL2</h2>
        <div class="menu-actions">
          <button id="menu-resume" class="menu-button">Reprendre</button>
          <button id="menu-quit" class="menu-button menu-button-secondary">Quitter</button>
        </div>
      </div>
    `;
    document.body.appendChild(pauseMenu);
    resumeButton = pauseMenu.querySelector('#menu-resume');
    quitButton = pauseMenu.querySelector('#menu-quit');

    resumeButton.addEventListener('click', () => {
      hidePauseMenu();
      callbacks.onResume && callbacks.onResume();
    });

    quitButton.addEventListener('click', () => {
      hidePauseMenu();
      callbacks.onQuit && callbacks.onQuit();
    });
  }
}

export function initMenus(opts = {}) {
  callbacks = {
    onPlay: opts.onPlay || null,
    onResume: opts.onResume || null,
    onQuit: opts.onQuit || null,
    onClassSelect: opts.onClassSelect || null
  };
  ensureElements();
  updateClassHighlight(getSelectedClassId());
  showHomeMenu();
  hidePauseMenu();
}

export function showHomeMenu() {
  ensureElements();
  if (homeMenu) {
    homeMenu.style.display = 'flex';
  }
}

export function hideHomeMenu() {
  if (homeMenu) {
    homeMenu.style.display = 'none';
  }
}

export function showPauseMenu() {
  ensureElements();
  if (pauseMenu) {
    pauseMenu.style.display = 'flex';
  }
}

export function hidePauseMenu() {
  if (pauseMenu) {
    pauseMenu.style.display = 'none';
  }
}

export function isPauseMenuVisible() {
  return pauseMenu?.style.display !== 'none' && pauseMenu?.style.display !== '';
}

onClassChange(({ id }) => {
  updateClassHighlight(id);
});

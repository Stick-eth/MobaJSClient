// src/overlay.js
import lockedIcon   from '../assets/locked.png';
import unlockedIcon from '../assets/unlocked.png';
import { getSpellsState } from '../player/spells.js';
import { toggleLock, isCameraLocked } from './cameraController.js';
import { CLASS_DEFINITIONS, getSelectedClassId, setSelectedClassId, onClassChange } from '../player/classes.js';

const meleeClassIcon = new URL('../assets/HUD/melee/class.png', import.meta.url).href;
const meleeQIcon = new URL('../assets/HUD/melee/q_spell.png', import.meta.url).href;
const rangeClassIcon = new URL('../assets/HUD/range/class.png', import.meta.url).href;
const rangeQIcon = new URL('../assets/HUD/range/q_spell.png', import.meta.url).href;
const supportClassIcon = new URL('../assets/HUD/support/class.png', import.meta.url).href;
const defaultSpellIcon = new URL('../assets/HUD/no_icon.png', import.meta.url).href;
const flashIcon = new URL('../assets/HUD/summoners/flash.png', import.meta.url).href;

const CLASS_HUD_ASSETS = {
  marksman: {
    classIcon: rangeClassIcon,
    spellIcons: {
      a: rangeQIcon
    }
  },
  melee: {
    classIcon: meleeClassIcon,
    spellIcons: {
      a: meleeQIcon
    }
  },
  support: {
    classIcon: supportClassIcon,
    spellIcons: {}
  }
};

const ABILITY_SLOTS = [
  { slot: 'a', label: 'Q' },
  { slot: 'z', label: 'W' },
  { slot: 'e', label: 'E' },
  { slot: 'r', label: 'R' }
];

const SUMMONER_SLOTS = [
  { slot: 'd', label: 'D', icon: flashIcon },
  { slot: 'f', label: 'F', icon: defaultSpellIcon }
];

const hudElements = {
  container: null,
  classIcon: null,
  healthFill: null,
  healthText: null,
  abilitySlots: new Map(),
  summonerSlots: new Map(),
  levelValue: null,
  xpFill: null,
  xpText: null
};

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
  death.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(10,13,20,0.85);color:#fff;font-family:sans-serif;z-index:2000;font-size:32px;';
  const deathMsg = document.createElement('div');
  deathMsg.className = 'death-title';
  const deathCountdown = document.createElement('div');
  deathCountdown.className = 'death-countdown';
  death.appendChild(deathMsg);
  death.appendChild(deathCountdown);
  death.appendChild(buildDeathClassSelection());
  document.body.appendChild(death);

  let deathTimer = null;
  function showDeath(by, source, seconds) {
    deathMsg.textContent = 'KO';
    let remaining = seconds;
    deathCountdown.textContent = `${Math.max(0, remaining)}s`;
    death.style.display = 'flex';
    updateDeathClassHighlight(getSelectedClassId());
    clearInterval(deathTimer);
    deathTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(deathTimer);
      }
      deathCountdown.textContent = `${Math.max(0, remaining)}s`;
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

  initHud();
}    

const deathClassButtons = new Map();

function buildDeathClassSelection() {
  const container = document.createElement('div');
  container.className = 'class-select death-class-select';

  Object.values(CLASS_DEFINITIONS).forEach((cls) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'class-option';
    button.dataset.classId = cls.id;
    const iconSrc = CLASS_HUD_ASSETS[cls.id]?.classIcon || defaultSpellIcon;
    button.innerHTML = `
      <img class="class-option-icon" src="${iconSrc}" alt="${cls.label}" />
      <span class="class-option-title">${cls.label}</span>
    `;
    button.addEventListener('click', () => {
      setSelectedClassId(cls.id);
    });
    container.appendChild(button);
    deathClassButtons.set(cls.id, button);
  });

  updateDeathClassHighlight(getSelectedClassId());
  return container;
}

function updateDeathClassHighlight(activeId) {
  deathClassButtons.forEach((btn, id) => {
    if (id === activeId) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

export function updateSpellOverlay() {
  const spells = getSpellsState();
  spells.forEach(spell => {
    const slotKey = spell.key.toLowerCase();
    const abilitySlot = hudElements.abilitySlots.get(slotKey);
    const summonerSlot = hudElements.summonerSlots.get(slotKey);
    const slot = abilitySlot || summonerSlot;
    if (!slot) return;
    const isSummoner = Boolean(summonerSlot);
    const hasSpell = isSummoner || (spell.name && spell.name !== '—');
    slot.container.classList.toggle('inactive', !hasSpell);
    if (!hasSpell) {
      slot.container.classList.remove('on-cooldown');
      slot.cooldown.textContent = '';
      return;
    }
    if (spell.ready || spell.cooldown <= 0) {
      slot.container.classList.remove('on-cooldown');
      slot.cooldown.textContent = '';
    } else {
      slot.container.classList.add('on-cooldown');
      slot.cooldown.textContent = spell.cooldown.toFixed(1);
    }
  });
}

setInterval(updateSpellOverlay, 60);

onClassChange(({ id }) => {
  updateDeathClassHighlight(id);
  updateHudForClass(id);
});

window.addEventListener('playerHealthChanged', (event) => {
  const { hp, maxHp } = event.detail || {};
  updateHudHealth(hp, maxHp);
});

window.addEventListener('playerProgressUpdate', (event) => {
  const { level, xp, xpToNext, leveledUp, levelsGained } = event.detail || {};
  updateHudLevel(level, xp, xpToNext);
  if (leveledUp) {
    triggerLevelUpFx(level, levelsGained);
  }
});

function initHud() {
  if (hudElements.container) return;

  const container = document.createElement('div');
  container.id = 'hud-container';

  const healthBar = document.createElement('div');
  healthBar.className = 'hud-health-bar';
  const healthFill = document.createElement('div');
  healthFill.className = 'hud-health-fill';
  const healthText = document.createElement('span');
  healthText.className = 'hud-health-text';
  healthText.textContent = '0 / 0';
  healthBar.appendChild(healthFill);
  healthBar.appendChild(healthText);

  const row = document.createElement('div');
  row.className = 'hud-row';

  const classWrapper = document.createElement('div');
  classWrapper.className = 'hud-class';
  const classIcon = document.createElement('img');
  classIcon.alt = 'Classe';
  classWrapper.appendChild(classIcon);

  const levelContainer = document.createElement('div');
  levelContainer.className = 'hud-level';
  const levelValue = document.createElement('span');
  levelValue.className = 'hud-level-value';
  levelValue.textContent = 'Niv. 1';
  const xpBar = document.createElement('div');
  xpBar.className = 'hud-xp-bar';
  const xpFill = document.createElement('div');
  xpFill.className = 'hud-xp-fill';
  xpBar.appendChild(xpFill);
  const xpText = document.createElement('span');
  xpText.className = 'hud-xp-text';
  xpText.textContent = '0 / 0';
  levelContainer.appendChild(levelValue);
  levelContainer.appendChild(xpBar);
  levelContainer.appendChild(xpText);
  classWrapper.appendChild(levelContainer);

  const abilityWrapper = document.createElement('div');
  abilityWrapper.className = 'hud-abilities';

  ABILITY_SLOTS.forEach(({ slot, label }) => {
    const abilitySlot = createHudSlot(label);
    abilityWrapper.appendChild(abilitySlot.container);
    hudElements.abilitySlots.set(slot, abilitySlot);
  });

  const summonerWrapper = document.createElement('div');
  summonerWrapper.className = 'hud-summoners';

  SUMMONER_SLOTS.forEach(({ slot, label, icon }) => {
    const summonerSlot = createHudSlot(label);
    summonerWrapper.appendChild(summonerSlot.container);
    summonerSlot.icon.src = icon;
    hudElements.summonerSlots.set(slot, summonerSlot);
  });

  row.appendChild(classWrapper);
  row.appendChild(abilityWrapper);
  row.appendChild(summonerWrapper);

  container.appendChild(healthBar);
  container.appendChild(row);
  document.body.appendChild(container);

  hudElements.container = container;
  hudElements.healthFill = healthFill;
  hudElements.healthText = healthText;
  hudElements.classIcon = classIcon;
  hudElements.levelValue = levelValue;
  hudElements.xpFill = xpFill;
  hudElements.xpText = xpText;

  updateHudForClass(getSelectedClassId());
  updateSpellOverlay();
  updateHudHealth(0, 0);
  updateHudLevel(1, 0, 0);
}

function createHudSlot(keyLabel) {
  const container = document.createElement('div');
  container.className = 'hud-slot';

  const icon = document.createElement('img');
  icon.alt = keyLabel;
  icon.src = defaultSpellIcon;

  const key = document.createElement('span');
  key.className = 'hud-slot-key';
  key.textContent = keyLabel;

  const cooldown = document.createElement('span');
  cooldown.className = 'hud-slot-cd';

  container.appendChild(icon);
  container.appendChild(key);
  container.appendChild(cooldown);

  return { container, icon, cooldown };
}

function updateHudForClass(classId) {
  const config = CLASS_HUD_ASSETS[classId] || CLASS_HUD_ASSETS.marksman;
  if (hudElements.classIcon) {
    hudElements.classIcon.src = config.classIcon;
  }

  hudElements.abilitySlots.forEach((slot, key) => {
    const iconSrc = config.spellIcons?.[key] || defaultSpellIcon;
    slot.icon.src = iconSrc;
  });
}

function updateHudHealth(hp = 0, maxHp = 0) {
  if (!hudElements.healthFill || !hudElements.healthText) return;
  const displayMax = Math.max(0, maxHp || 0);
  const clampMax = displayMax > 0 ? displayMax : 1;
  const safeHp = Math.max(0, Math.min(hp || 0, clampMax));
  const percent = displayMax > 0 ? (safeHp / displayMax) * 100 : 0;
  hudElements.healthFill.style.width = `${percent}%`;
  const roundedHp = Math.round(safeHp);
  const roundedMax = Math.round(displayMax);
  hudElements.healthText.textContent = `${roundedHp} / ${roundedMax}`;
}

function updateHudLevel(level = 1, xp = 0, xpToNext = 0) {
  if (!hudElements.levelValue || !hudElements.xpFill || !hudElements.xpText) return;
  const currentLevel = Math.max(1, Math.min(level || 1, 18));
  hudElements.levelValue.textContent = `Lv ${currentLevel}`;
  const target = Math.max(0, xpToNext || 0);
  const safeXp = Math.max(0, Math.min(xp || 0, target || 1));
  const percent = target > 0 ? (safeXp / target) * 100 : 100;
  hudElements.xpFill.style.width = `${percent}%`;
  hudElements.xpText.textContent = target > 0 ? `${Math.round(percent)}%` : 'MAX';
}

function triggerLevelUpFx(level, levelsGained = 1) {
  if (!hudElements.container) return;
  hudElements.container.classList.remove('level-up');
  void hudElements.container.offsetWidth;
  hudElements.container.classList.add('level-up');
  if (hudElements.container.querySelector('.hud-level-toast')) {
    hudElements.container.querySelectorAll('.hud-level-toast').forEach(node => node.remove());
  }
  if (hudElements.container) {
    const toast = document.createElement('div');
    toast.className = 'hud-level-toast';
    const gained = Math.max(1, levelsGained || 1);
    toast.textContent = gained > 1
      ? `+${gained} niveaux !`
      : `Niveau ${Math.max(1, level || 1)}`;
    hudElements.container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 1200);
  }
  setTimeout(() => {
    hudElements.container?.classList.remove('level-up');
  }, 800);
}
export const CLASS_DEFINITIONS = {
  marksman: {
    id: 'marksman',
    label: 'Tireur',
    description: 'Attaques à distance avec un tir mystique pour le Q.',
    stats: {
      maxHp: 1200,
      moveSpeed: 4.5,
      autoAttack: {
        type: 'ranged',
        damage: 55,
        range: 4,
        cooldownMs: 650,
        projectileSpeed: 14,
        projectileRadius: 0.6,
        projectileTtl: 2.0
      }
    },
    spells: {
      Q: {
        type: 'projectile',
        damage: 140,
        projectileSpeed: 25,
        projectileRadius: 0.6,
        projectileTtl: 0.3
      }
    }
  },
  melee: {
    id: 'melee',
    label: 'Mêlée',
    description: 'Combattant au corps à corps avec un buff de dégâts sur le Q.',
    stats: {
      maxHp: 1200,
      moveSpeed: 4.5,
      autoAttack: {
        type: 'melee',
        damage: 85,
        range: 1.0,
        cooldownMs: 1000,
        projectileSpeed: 0,
        projectileRadius: 1.0,
        projectileTtl: 0
      }
    },
    spells: {
      Q: {
        type: 'empower',
        bonusDamage: 160
      }
    }
  }
};

const DEFAULT_CLASS_ID = 'marksman';
let selectedClassId = DEFAULT_CLASS_ID;

const listeners = new Set();

function notifyListeners(source = 'user', force = false) {
  const def = CLASS_DEFINITIONS[selectedClassId] || CLASS_DEFINITIONS[DEFAULT_CLASS_ID];
  listeners.forEach((listener) => {
    try {
      listener({ ...def, id: selectedClassId }, { source, force });
    } catch (err) {
      console.error('Class listener error', err);
    }
  });
}

export function getSelectedClassId() {
  return selectedClassId;
}

export function getSelectedClassDefinition() {
  return CLASS_DEFINITIONS[selectedClassId] || CLASS_DEFINITIONS[DEFAULT_CLASS_ID];
}

export function setSelectedClassId(newId, { source = 'user', force = false } = {}) {
  if (!CLASS_DEFINITIONS[newId]) {
    console.warn(`Classe inconnue: ${newId}`);
    return;
  }
  const changed = newId !== selectedClassId;
  selectedClassId = newId;
  if (changed || force) {
    notifyListeners(source, force);
  }
}

export function onClassChange(listener, { immediate = true } = {}) {
  listeners.add(listener);
  if (immediate) {
    const def = CLASS_DEFINITIONS[selectedClassId] || CLASS_DEFINITIONS[DEFAULT_CLASS_ID];
    listener({ ...def, id: selectedClassId }, { source: 'init', force: true });
  }
  return () => listeners.delete(listener);
}

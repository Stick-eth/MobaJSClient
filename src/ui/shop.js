import { purchaseItem } from '../network/socket.js';

const state = {
  open: false,
  items: [],
  selectedItemId: null,
  gold: 0,
  inventory: [],
  maxSlots: 6,
  pending: false,
  pendingItemId: null
};

let shopOverlay = null;
let shopButton = null;
let itemsContainer = null;
let detailsTitle = null;
let detailsDescription = null;
let detailsStats = null;
let detailsCost = null;
let detailsSlots = null;
let buyButton = null;
let statusLabel = null;
let closeButton = null;

export function initShopUI() {
  if (shopOverlay) {
    return;
  }

  createShopButton();
  buildShopOverlay();
  bindShopEvents();
  refreshAvailability();
}

function createShopButton() {
  shopButton = document.createElement('button');
  shopButton.type = 'button';
  shopButton.className = 'hud-shop-button';
  shopButton.textContent = 'Boutique';
  shopButton.addEventListener('click', () => toggleShop(true));
  document.body.appendChild(shopButton);
}

function buildShopOverlay() {
  shopOverlay = document.createElement('div');
  shopOverlay.id = 'shop-overlay';
  shopOverlay.className = 'shop-overlay';

  const panel = document.createElement('div');
  panel.className = 'shop-panel';

  const listSection = document.createElement('div');
  listSection.className = 'shop-list';
  const listTitle = document.createElement('h3');
  listTitle.className = 'shop-section-title';
  listTitle.textContent = 'Articles disponibles';
  itemsContainer = document.createElement('div');
  itemsContainer.className = 'shop-items';
  listSection.appendChild(listTitle);
  listSection.appendChild(itemsContainer);

  const detailsSection = document.createElement('div');
  detailsSection.className = 'shop-details';
  detailsTitle = document.createElement('h3');
  detailsTitle.className = 'shop-details-title';
  detailsTitle.textContent = 'Choisissez un objet';
  detailsDescription = document.createElement('p');
  detailsDescription.className = 'shop-details-description';
  detailsDescription.textContent = 'Selectionnez un objet pour afficher ses effets.';
  detailsStats = document.createElement('ul');
  detailsStats.className = 'shop-details-stats';
  const meta = document.createElement('div');
  meta.className = 'shop-details-meta';
  detailsCost = document.createElement('span');
  detailsCost.className = 'shop-details-cost';
  detailsSlots = document.createElement('span');
  detailsSlots.className = 'shop-details-slots';
  meta.appendChild(detailsCost);
  meta.appendChild(detailsSlots);
  buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.className = 'shop-buy-button';
  buyButton.textContent = 'Acheter';
  statusLabel = document.createElement('div');
  statusLabel.className = 'shop-status';

  detailsSection.appendChild(detailsTitle);
  detailsSection.appendChild(detailsDescription);
  detailsSection.appendChild(detailsStats);
  detailsSection.appendChild(meta);
  detailsSection.appendChild(buyButton);
  detailsSection.appendChild(statusLabel);

  panel.appendChild(listSection);
  panel.appendChild(detailsSection);
  shopOverlay.appendChild(panel);

  closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'shop-close-button';
  closeButton.setAttribute('aria-label', 'Fermer la boutique');
  closeButton.textContent = '×';
  shopOverlay.appendChild(closeButton);

  document.body.appendChild(shopOverlay);
}

function bindShopEvents() {
  buyButton.addEventListener('click', () => {
    const item = getSelectedItem();
    if (!item) return;
    if (state.pending) return;
    if (state.inventory.length >= state.maxSlots) {
      setStatusMessage('Vos emplacements sont pleins.');
      return;
    }
    if (state.gold < item.cost) {
      setStatusMessage('Pas assez d\'or.');
      return;
    }
    state.pending = true;
    state.pendingItemId = item.id;
    setStatusMessage('Achat en cours...');
    updatePurchaseButton();
    purchaseItem(item.id);
  });

  closeButton.addEventListener('click', () => toggleShop(false));
  shopOverlay.addEventListener('mousedown', (event) => {
    if (event.target === shopOverlay) {
      toggleShop(false);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!state.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      toggleShop(false);
    }
  });

  window.addEventListener('playerGoldChanged', (event) => {
    const { gold } = event.detail || {};
    if (typeof gold === 'number') {
      state.gold = gold;
      refreshAvailability();
    }
  });

  window.addEventListener('playerInventoryChanged', (event) => {
    const { inventory } = event.detail || {};
    if (Array.isArray(inventory)) {
      state.inventory = [...inventory];
      refreshAvailability();
    }
  });

  window.addEventListener('shop:data', (event) => {
    const detail = event.detail || {};
    if (Array.isArray(detail.items)) {
      state.items = detail.items.map(item => ({ ...item }));
    }
    if (Number.isFinite(detail.maxSlots)) {
      state.maxSlots = Math.max(1, Math.min(12, Math.floor(detail.maxSlots)));
    }
    ensureSelectedItem();
    refreshAvailability();
  });

  window.addEventListener('shop:purchaseResult', (event) => {
    const detail = event.detail || {};
    state.pending = false;
    state.pendingItemId = null;
    if (detail.ok) {
      setStatusMessage('Achat reussi !');
    } else {
      switch (detail.reason) {
        case 'not_enough_gold':
          setStatusMessage('Pas assez d\'or.');
          break;
        case 'inventory_full':
          setStatusMessage('Vos emplacements sont pleins.');
          break;
        case 'unknown_item':
          setStatusMessage('Objet inconnu.');
          break;
        case 'invalid_request':
          setStatusMessage('Achat indisponible.');
          break;
        default:
          setStatusMessage('Achat echoue.');
          break;
      }
    }
    updatePurchaseButton();
    refreshAvailability();
  });
}

function toggleShop(forceOpen) {
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.open;
  if (shouldOpen === state.open) {
    return;
  }
  state.open = shouldOpen;
  if (state.open) {
    shopOverlay.classList.add('visible');
    document.body.classList.add('shop-open');
    ensureSelectedItem();
    refreshAvailability();
  } else {
    shopOverlay.classList.remove('visible');
    document.body.classList.remove('shop-open');
    state.pending = false;
    state.pendingItemId = null;
    setStatusMessage('');
  }
}

function ensureSelectedItem() {
  if (!state.items.length) {
    state.selectedItemId = null;
    return;
  }
  if (!state.selectedItemId || !state.items.some(item => item.id === state.selectedItemId)) {
    state.selectedItemId = state.items[0].id;
  }
}

function refreshAvailability() {
  if (!itemsContainer) return;
  ensureSelectedItem();
  renderItemList();
  updateDetails();
}

function renderItemList() {
  itemsContainer.innerHTML = '';
  if (!state.items.length) {
    const empty = document.createElement('p');
    empty.className = 'shop-empty';
    empty.textContent = 'Aucun objet disponible pour le moment.';
    itemsContainer.appendChild(empty);
    return;
  }

  state.items.forEach(item => {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'shop-item';
    entry.dataset.itemId = item.id;
    entry.innerHTML = `
      <span class="shop-item-name">${item.name}</span>
      <span class="shop-item-cost">${item.cost} or</span>
    `;
    if (item.id === state.selectedItemId) {
      entry.classList.add('active');
    }
    if (!canPurchaseItem(item)) {
      entry.classList.add('locked');
    }
    entry.addEventListener('click', () => {
      state.selectedItemId = item.id;
      state.pending = false;
      state.pendingItemId = null;
      setStatusMessage('');
      refreshAvailability();
    });
    itemsContainer.appendChild(entry);
  });
}

function updateDetails() {
  const item = getSelectedItem();
  if (!item) {
    detailsTitle.textContent = 'Boutique';
    detailsDescription.textContent = 'Revenez plus tard pour de nouveaux objets.';
    detailsStats.innerHTML = '';
    detailsCost.textContent = '';
    detailsSlots.textContent = `${state.inventory.length}/${state.maxSlots} emplacements`;
    buyButton.disabled = true;
    buyButton.textContent = 'Indisponible';
    return;
  }

  detailsTitle.textContent = item.name;
  detailsDescription.textContent = item.description || 'Un objet sans description.';
  detailsStats.innerHTML = '';
  const stats = item.stats || {};
  const statEntries = buildStatsList(stats);
  if (statEntries.length) {
    statEntries.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      detailsStats.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'Aucun bonus particulier.';
    detailsStats.appendChild(li);
  }
  detailsCost.textContent = `${item.cost} or`;
  detailsSlots.textContent = `${state.inventory.length}/${state.maxSlots} emplacements`;
  updatePurchaseButton();
}

function updatePurchaseButton() {
  const item = getSelectedItem();
  if (!item) {
    buyButton.disabled = true;
    buyButton.textContent = 'Indisponible';
    return;
  }
  if (state.pending && state.pendingItemId === item.id) {
    buyButton.disabled = true;
    buyButton.textContent = 'Achat...';
    return;
  }
  if (state.inventory.length >= state.maxSlots) {
    buyButton.disabled = true;
    buyButton.textContent = 'Emplacements pleins';
    return;
  }
  if (state.gold < item.cost) {
    const missing = item.cost - state.gold;
    buyButton.disabled = true;
    buyButton.textContent = `Manque ${missing} or`;
    return;
  }
  buyButton.disabled = false;
  buyButton.textContent = `Acheter (${item.cost} or)`;
}

function canPurchaseItem(item) {
  if (!item) return false;
  if (state.inventory.length >= state.maxSlots) return false;
  return state.gold >= item.cost;
}

function getSelectedItem() {
  if (!state.items.length) return null;
  return state.items.find(item => item.id === state.selectedItemId) || null;
}

function buildStatsList(stats) {
  const results = [];
  if (!stats) return results;
  if (typeof stats.attackDamage === 'number') {
    results.push(`+${stats.attackDamage} degats d'attaque`);
  }
  if (typeof stats.maxHp === 'number') {
    results.push(`+${stats.maxHp} points de vie`);
  }
  if (typeof stats.moveSpeed === 'number') {
    results.push(`+${stats.moveSpeed} vitesse de deplacement`);
  }
  if (typeof stats.attackSpeedPct === 'number') {
    results.push(`+${Math.round(stats.attackSpeedPct * 100)}% vitesse d'attaque`);
  }
  return results;
}

function setStatusMessage(message) {
  if (!statusLabel) return;
  statusLabel.textContent = message || '';
}

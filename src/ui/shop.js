import { purchaseItem, sellItem } from '../network/socket.js';

const state = {
  open: false,
  items: [],
  selectedItemId: null,
  selectedSource: 'shop',
  selectedInventoryIndex: null,
  gold: 0,
  inventory: [],
  maxSlots: 6,
  pending: false,
  pendingItemId: null,
  pendingAction: null,
  pendingSellSlot: null,
  itemCatalog: Object.create(null)
};

let shopOverlay = null;
let shopButton = null;
let itemsContainer = null;
let inventoryContainer = null;
let detailsTitle = null;
let detailsDescription = null;
let detailsStats = null;
let detailsCost = null;
let detailsSlots = null;
let buyButton = null;
let sellButton = null;
let statusLabel = null;
let closeButton = null;
let lastInventoryClick = { slot: null, timestamp: 0 };

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
  const actionsRow = document.createElement('div');
  actionsRow.className = 'shop-actions';
  buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.className = 'shop-buy-button';
  buyButton.textContent = 'Acheter';
  sellButton = document.createElement('button');
  sellButton.type = 'button';
  sellButton.className = 'shop-sell-button';
  sellButton.textContent = 'Vendre';
  sellButton.style.display = 'none';
  sellButton.disabled = true;
  actionsRow.appendChild(buyButton);
  actionsRow.appendChild(sellButton);
  statusLabel = document.createElement('div');
  statusLabel.className = 'shop-status';

  detailsSection.appendChild(detailsTitle);
  detailsSection.appendChild(detailsDescription);
  detailsSection.appendChild(detailsStats);
  detailsSection.appendChild(meta);
  detailsSection.appendChild(actionsRow);
  detailsSection.appendChild(statusLabel);

  const inventorySection = document.createElement('div');
  inventorySection.className = 'shop-inventory';
  const inventoryTitle = document.createElement('h3');
  inventoryTitle.className = 'shop-section-title';
  inventoryTitle.textContent = 'Inventaire';
  inventoryContainer = document.createElement('div');
  inventoryContainer.className = 'shop-inventory-grid';
  inventorySection.appendChild(inventoryTitle);
  inventorySection.appendChild(inventoryContainer);

  panel.appendChild(listSection);
  panel.appendChild(detailsSection);
  panel.appendChild(inventorySection);
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
    const item = getSelectedShopItem();
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
    state.pendingAction = 'buy';
    state.pendingSellSlot = null;
    setStatusMessage('Achat en cours...');
    updatePurchaseButton();
    updateSellButton();
    purchaseItem(item.id);
  });

  sellButton.addEventListener('click', () => {
    attemptSellSelected();
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
      if (!state.itemCatalog) {
        state.itemCatalog = Object.create(null);
      }
      detail.items.forEach(item => {
        state.itemCatalog[item.id] = { ...item };
      });
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
    state.pendingAction = null;
    state.pendingSellSlot = null;
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
    updateSellButton();
    refreshAvailability();
  });

  window.addEventListener('shop:sellResult', (event) => {
    const detail = event.detail || {};
    state.pending = false;
    state.pendingItemId = null;
    state.pendingAction = null;
    state.pendingSellSlot = null;
    lastInventoryClick = { slot: null, timestamp: 0 };
    if (detail.ok) {
      const refund = typeof detail.refund === 'number' ? detail.refund : 0;
      setStatusMessage(`Objet vendu pour ${refund} or.`);
    } else {
      switch (detail.reason) {
        case 'invalid_slot':
          setStatusMessage('Emplacement invalide.');
          break;
        case 'unknown_item':
          setStatusMessage('Objet inconnu.');
          break;
        case 'player_missing':
          setStatusMessage('Joueur indisponible.');
          break;
        default:
          setStatusMessage('Vente impossible.');
          break;
      }
    }
    updatePurchaseButton();
    updateSellButton();
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
    state.pendingAction = null;
    state.pendingSellSlot = null;
    lastInventoryClick = { slot: null, timestamp: 0 };
    setStatusMessage('');
  }
}

function ensureSelectedItem() {
  const hasShopItems = state.items.length > 0;
  const inventoryCount = state.inventory.length;

  if (state.selectedSource === 'inventory') {
    if (inventoryCount === 0) {
      state.selectedSource = hasShopItems ? 'shop' : 'inventory';
      state.selectedInventoryIndex = null;
    } else {
      if (!Number.isInteger(state.selectedInventoryIndex) || state.selectedInventoryIndex < 0 || state.selectedInventoryIndex >= inventoryCount) {
        state.selectedInventoryIndex = 0;
      }
      const invItemId = state.inventory[state.selectedInventoryIndex];
      state.selectedItemId = invItemId || null;
      return;
    }
  }

  if (hasShopItems) {
    if (!state.selectedItemId || !state.items.some(item => item.id === state.selectedItemId)) {
      state.selectedItemId = state.items[0].id;
    }
    state.selectedSource = 'shop';
    state.selectedInventoryIndex = null;
  } else if (inventoryCount > 0) {
    state.selectedSource = 'inventory';
    state.selectedInventoryIndex = 0;
    state.selectedItemId = state.inventory[0] || null;
  } else {
    state.selectedItemId = null;
    state.selectedInventoryIndex = null;
  }
}

function refreshAvailability() {
  if (!itemsContainer || !inventoryContainer) return;
  ensureSelectedItem();
  renderItemList();
  renderInventory();
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
    if (state.selectedSource === 'shop' && item.id === state.selectedItemId) {
      entry.classList.add('active');
    }
    if (!canPurchaseItem(item)) {
      entry.classList.add('locked');
    }
    entry.addEventListener('click', () => {
      state.selectedItemId = item.id;
      state.selectedSource = 'shop';
      state.selectedInventoryIndex = null;
      state.pending = false;
      state.pendingItemId = null;
      state.pendingAction = null;
      state.pendingSellSlot = null;
      setStatusMessage('');
      refreshAvailability();
    });
    itemsContainer.appendChild(entry);
  });
}

function renderInventory() {
  inventoryContainer.innerHTML = '';
  const totalSlots = Math.max(state.maxSlots, state.inventory.length);
  for (let slot = 0; slot < totalSlots; slot += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-inventory-slot';
    button.dataset.slotIndex = String(slot);

    const isOccupied = slot < state.inventory.length;
    if (isOccupied) {
      const itemId = state.inventory[slot];
      const definition = getItemDefinitionById(itemId);
      const name = definition?.name || itemId || 'Objet inconnu';
      const sellValue = definition ? calculateSellValue(definition) : 0;
      const sellLabel = definition ? `${sellValue} or` : 'N/A';
      button.classList.add('occupied');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'shop-inventory-name';
      nameSpan.textContent = name;
      const sellSpan = document.createElement('span');
      sellSpan.className = 'shop-inventory-sell';
      sellSpan.textContent = sellLabel;
      button.appendChild(nameSpan);
      button.appendChild(sellSpan);
      button.title = definition ? `${name} (vente ${sellValue} or)` : name;
    } else {
      button.classList.add('empty');
      button.textContent = 'Vide';
      button.title = 'Emplacement libre';
    }

    if (state.selectedSource === 'inventory' && state.selectedInventoryIndex === slot) {
      button.classList.add('active');
    }

    button.addEventListener('click', () => {
      const now = Date.now();
      const isDoubleClick = isOccupied
        && lastInventoryClick.slot === slot
        && (now - lastInventoryClick.timestamp) < 350;
      lastInventoryClick = { slot, timestamp: now };

      if (isDoubleClick) {
        state.selectedSource = 'inventory';
        state.selectedInventoryIndex = slot;
        state.selectedItemId = state.inventory[slot] || null;
        attemptSellSelected();
        return;
      }
      state.selectedSource = 'inventory';
      state.selectedInventoryIndex = slot;
      state.selectedItemId = isOccupied ? (state.inventory[slot] || null) : null;
      if (isOccupied) {
        state.pending = false;
        state.pendingItemId = null;
        state.pendingAction = null;
        state.pendingSellSlot = null;
        setStatusMessage('');
      }
      renderInventory();
      updateDetails();
    });

    inventoryContainer.appendChild(button);
  }
}

function updateDetails() {
  const source = state.selectedSource;
  const shopItem = getSelectedShopItem();
  const inventoryEntry = getSelectedInventoryEntry();
  const definition = source === 'inventory' ? (inventoryEntry?.definition || null) : (shopItem || null);

  detailsStats.innerHTML = '';

  if (!definition) {
    detailsTitle.textContent = source === 'inventory' ? 'Inventaire' : 'Boutique';
    detailsDescription.textContent = source === 'inventory'
      ? 'Selectionnez un objet possédé pour afficher ses détails.'
      : 'Revenez plus tard pour de nouveaux objets.';
    const placeholder = document.createElement('li');
    placeholder.textContent = 'Aucun bonus particulier.';
    detailsStats.appendChild(placeholder);
    detailsCost.textContent = '';
    detailsSlots.textContent = `${state.inventory.length}/${state.maxSlots} emplacements`;
    if (buyButton) {
      buyButton.style.display = source === 'shop' ? 'inline-flex' : 'none';
      buyButton.disabled = true;
      buyButton.textContent = source === 'shop' ? 'Indisponible' : 'Acheter';
    }
    if (sellButton) {
      sellButton.style.display = source === 'inventory' ? 'inline-flex' : 'none';
      sellButton.disabled = true;
      sellButton.textContent = 'Vendre';
    }
    return;
  }

  detailsTitle.textContent = definition.name || 'Objet';
  detailsDescription.textContent = definition.description || 'Un objet sans description.';
  detailsStats.innerHTML = '';
  const stats = definition.stats || {};
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
  const sellValue = calculateSellValue(definition);
  if (source === 'inventory') {
    detailsCost.textContent = `${definition.cost ?? 0} or (vente ${sellValue} or)`;
  } else {
    detailsCost.textContent = `${definition.cost ?? 0} or`;
  }
  detailsSlots.textContent = `${state.inventory.length}/${state.maxSlots} emplacements`;
  if (buyButton) {
    buyButton.style.display = source === 'shop' ? 'inline-flex' : 'none';
  }
  if (sellButton) {
    sellButton.style.display = source === 'inventory' ? 'inline-flex' : 'none';
  }
  updatePurchaseButton();
  updateSellButton(definition, inventoryEntry?.slot ?? null);
}

function updatePurchaseButton() {
  if (!buyButton) return;
  const item = getSelectedShopItem();
  if (state.selectedSource !== 'shop' || !item) {
    buyButton.disabled = true;
    buyButton.textContent = state.selectedSource === 'shop' ? 'Indisponible' : 'Acheter';
    return;
  }
  if (state.pending) {
    if (state.pendingAction === 'buy' && state.pendingItemId === item.id) {
      buyButton.disabled = true;
      buyButton.textContent = 'Achat...';
    } else {
      buyButton.disabled = true;
      buyButton.textContent = 'Indisponible';
    }
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

function updateSellButton(definition, slotIndex) {
  if (!sellButton) return;
  if (state.selectedSource !== 'inventory') {
    sellButton.disabled = true;
    sellButton.textContent = 'Vendre';
    return;
  }
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= state.inventory.length || !definition) {
    sellButton.disabled = true;
    sellButton.textContent = 'Vendre';
    return;
  }
  if (state.pending) {
    if (state.pendingAction === 'sell' && state.pendingSellSlot === slotIndex) {
      sellButton.disabled = true;
      sellButton.textContent = 'Vente...';
    } else {
      sellButton.disabled = true;
      sellButton.textContent = 'Vendre';
    }
    return;
  }
  const refund = calculateSellValue(definition);
  sellButton.disabled = false;
  sellButton.textContent = `Vendre (${refund} or)`;
}

function attemptSellSelected() {
  if (state.selectedSource !== 'inventory') {
    setStatusMessage('Selectionnez un objet à vendre.');
    return;
  }
  if (state.pending) {
    return;
  }
  const entry = getSelectedInventoryEntry();
  if (!entry || !entry.definition) {
    setStatusMessage('Aucun objet à vendre.');
    return;
  }
  state.pending = true;
  state.pendingAction = 'sell';
  state.pendingSellSlot = entry.slot;
  state.pendingItemId = entry.itemId;
  setStatusMessage('Vente en cours...');
  updateSellButton(entry.definition, entry.slot);
  updatePurchaseButton();
  sellItem(entry.slot);
}

function getSelectedShopItem() {
  if (state.selectedSource !== 'shop') {
    return null;
  }
  return state.items.find(item => item.id === state.selectedItemId) || null;
}

function getSelectedInventoryEntry() {
  if (state.selectedSource !== 'inventory') {
    return null;
  }
  const index = state.selectedInventoryIndex;
  if (!Number.isInteger(index) || index < 0 || index >= state.inventory.length) {
    return null;
  }
  const itemId = state.inventory[index];
  const definition = getItemDefinitionById(itemId);
  return {
    slot: index,
    itemId,
    definition
  };
}

function getItemDefinitionById(itemId) {
  if (!itemId) {
    return null;
  }
  if (state.itemCatalog && state.itemCatalog[itemId]) {
    return state.itemCatalog[itemId];
  }
  const fallback = state.items.find(item => item.id === itemId);
  if (fallback) {
    const cloned = { ...fallback };
    state.itemCatalog[itemId] = cloned;
    return cloned;
  }
  return null;
}

function calculateSellValue(definition) {
  if (!definition) {
    return 0;
  }
  const base = Math.max(0, Math.round(definition.cost ?? 0));
  return Math.max(0, Math.floor(base * 0.7));
}

function canPurchaseItem(item) {
  if (!item) return false;
  if (state.inventory.length >= state.maxSlots) return false;
  return state.gold >= item.cost;
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

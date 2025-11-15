const overlayState = {
  root: null,
  title: null,
  message: null,
  detail: null,
  retryButton: null,
  quitButton: null,
  spinner: null,
  isVisible: false,
  waitingForDom: false
};

function ensureOverlay() {
  if (overlayState.root) {
    return;
  }

  if (typeof document === 'undefined') {
    return;
  }

  if (!document.body) {
    if (!overlayState.waitingForDom && typeof window !== 'undefined') {
      overlayState.waitingForDom = true;
      window.addEventListener('DOMContentLoaded', () => {
        overlayState.waitingForDom = false;
        ensureOverlay();
      }, { once: true });
    }
    return;
  }

  const root = document.createElement('div');
  root.id = 'network-status-overlay';
  root.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'network-status-panel';

  const spinner = document.createElement('div');
  spinner.className = 'network-status-spinner';
  panel.appendChild(spinner);

  const title = document.createElement('h2');
  title.className = 'network-status-title';
  panel.appendChild(title);

  const message = document.createElement('p');
  message.className = 'network-status-message';
  panel.appendChild(message);

  const detail = document.createElement('p');
  detail.className = 'network-status-detail';
  panel.appendChild(detail);

  const actions = document.createElement('div');
  actions.className = 'network-status-actions';

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'network-status-button primary';
  retryButton.textContent = 'Reessayer';
  retryButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('networkOverlay:retry'));
  });
  actions.appendChild(retryButton);

  const quitButton = document.createElement('button');
  quitButton.type = 'button';
  quitButton.className = 'network-status-button secondary';
  quitButton.textContent = 'Retour au menu';
  quitButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('networkOverlay:quit'));
  });
  actions.appendChild(quitButton);

  panel.appendChild(actions);
  root.appendChild(panel);
  document.body.appendChild(root);

  overlayState.root = root;
  overlayState.title = title;
  overlayState.message = message;
  overlayState.detail = detail;
  overlayState.retryButton = retryButton;
  overlayState.quitButton = quitButton;
  overlayState.spinner = spinner;
}

export function initNetworkStatusUI() {
  if (typeof document === 'undefined') {
    return;
  }
  ensureOverlay();
}

export function showNetworkOverlay({
  title = 'Connexion',
  message = 'Connexion en cours...',
  detail = '',
  showSpinner = false,
  showRetry = false,
  retryLabel = 'Reessayer',
  retryDisabled = false,
  showQuit = true,
  quitLabel = 'Retour au menu'
} = {}) {
  if (typeof document === 'undefined') {
    return;
  }
  ensureOverlay();
  if (!overlayState.root) {
    return;
  }

  overlayState.title.textContent = title;
  overlayState.message.textContent = message;
  overlayState.detail.textContent = detail;
  overlayState.detail.style.display = detail ? 'block' : 'none';

  overlayState.spinner.style.display = showSpinner ? 'block' : 'none';
  overlayState.retryButton.style.display = showRetry ? 'inline-flex' : 'none';
  overlayState.retryButton.textContent = retryLabel;
  overlayState.retryButton.disabled = retryDisabled;

  overlayState.quitButton.style.display = showQuit ? 'inline-flex' : 'none';
  overlayState.quitButton.textContent = quitLabel;

  overlayState.root.style.display = 'flex';
  overlayState.isVisible = true;
}

export function hideNetworkOverlay() {
  if (!overlayState.root) {
    return;
  }
  overlayState.root.style.display = 'none';
  overlayState.isVisible = false;
}

export function isNetworkOverlayVisible() {
  return overlayState.isVisible;
}

import * as THREE from 'three';

let camera = null;
let canvas = null;
let container = null;

const tracked = new Map(); // id -> { mesh, bar, fill, max, hp, visible }

export function initHealthBars(activeCamera, rendererDomElement) {
  camera = activeCamera;
  canvas = rendererDomElement;

  if (!container) {
    container = document.createElement('div');
    container.id = 'health-bars';
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.pointerEvents = 'none';
    container.style.userSelect = 'none';
    container.style.zIndex = '1500';
    document.body.appendChild(container);
  }
}

export function trackHealthBar(id, mesh, { color = '#c0392b', max = 100 } = {}) {
  if (!container) {
    requestAnimationFrame(() => trackHealthBar(id, mesh, { color, max }));
    return;
  }
  if (tracked.has(id)) return;

  const bar = document.createElement('div');
  bar.className = 'hp-bar';
  if (color === '#27ae60' || color === 'green') {
    bar.classList.add('hp-self');
  }
  const fill = document.createElement('div');
  fill.className = 'hp-bar-fill';
  fill.style.backgroundColor = color;
  bar.appendChild(fill);
  container.appendChild(bar);

  tracked.set(id, {
    mesh,
    bar,
    fill,
    max,
    hp: max,
    visible: true,
    color
  });
}

export function untrackHealthBar(id) {
  const data = tracked.get(id);
  if (!data) return;
  if (data.bar?.parentElement) {
    data.bar.parentElement.removeChild(data.bar);
  }
  tracked.delete(id);
}

export function setHealthBarValue(id, hp, max = undefined) {
  const data = tracked.get(id);
  if (!data) return;
  if (typeof max === 'number') {
    data.max = max;
  }
  if (typeof hp === 'number') {
    data.hp = hp;
  }
  const safeHp = typeof data.hp === 'number' ? data.hp : data.max || 0;
  const percent = data.max ? Math.max(0, Math.min(1, safeHp / data.max)) : 0;
  data.fill.style.width = `${percent * 100}%`;
}

export function setHealthBarVisible(id, visible) {
  const data = tracked.get(id);
  if (!data) return;
  data.visible = visible;
  data.bar.style.display = visible ? 'block' : 'none';
}

const projector = new THREE.Vector3();

export function updateHealthBars() {
  if (!camera || !canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  tracked.forEach((data, id) => {
    const { mesh, bar, visible } = data;
    if (!mesh || !bar) return;

    if (!mesh.visible || !visible) {
      bar.style.display = 'none';
      return;
    }

    projector.copy(mesh.position);
    projector.y += 1.2; // offset au-dessus de la tête
    projector.project(camera);

    if (projector.z > 1 || projector.z < -1) {
      bar.style.display = 'none';
      return;
    }

    const x = (projector.x * 0.5 + 0.5) * width;
    const y = (-projector.y * 0.5 + 0.5) * height;

    bar.style.display = 'block';
    bar.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
  });
}

export function resetHealthBars() {
  tracked.forEach((_, id) => untrackHealthBar(id));
  tracked.clear();
}

import * as THREE from 'three';

let camera = null;
let canvas = null;
let container = null;

const tracked = new Map(); // id -> { mesh, wrapper, bar, fill, label, max, hp, visible }

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

  const wrapper = document.createElement('div');
  wrapper.className = 'hp-bar-wrapper';
  const bar = document.createElement('div');
  bar.className = 'hp-bar';
  if (color === '#27ae60' || color === 'green') {
    bar.classList.add('hp-self');
  }
  const label = document.createElement('span');
  label.className = 'hp-bar-level';
  label.textContent = 'Lv 1';
  wrapper.appendChild(label);

  const fill = document.createElement('div');
  fill.className = 'hp-bar-fill';
  fill.style.backgroundColor = color;
  bar.appendChild(fill);
  wrapper.appendChild(bar);
  container.appendChild(wrapper);

  tracked.set(id, {
    mesh,
    wrapper,
    bar,
    fill,
    label,
    max,
    hp: max,
    visible: true,
    color
  });
}

export function untrackHealthBar(id) {
  const data = tracked.get(id);
  if (!data) return;
  if (data.wrapper?.parentElement) {
    data.wrapper.parentElement.removeChild(data.wrapper);
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

export function setHealthBarLevel(id, level) {
  const data = tracked.get(id);
  if (!data || !data.label) return;
  const displayLevel = typeof level === 'number' && level > 0 ? Math.floor(level) : 1;
  data.label.textContent = `Lv ${displayLevel}`;
}

export function setHealthBarVisible(id, visible) {
  const data = tracked.get(id);
  if (!data) return;
  data.visible = visible;
  if (data.wrapper) {
    data.wrapper.style.display = visible ? 'block' : 'none';
  }
}

const projector = new THREE.Vector3();

export function updateHealthBars() {
  if (!camera || !canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  tracked.forEach((data, id) => {
    const { mesh, wrapper, visible } = data;
    if (!mesh || !wrapper) return;

    if (!mesh.visible || !visible) {
      wrapper.style.display = 'none';
      return;
    }

    projector.copy(mesh.position);
    projector.y += 1.2; // offset au-dessus de la tête
    projector.project(camera);

    if (projector.z > 1 || projector.z < -1) {
      wrapper.style.display = 'none';
      return;
    }

    const x = (projector.x * 0.5 + 0.5) * width;
    const y = (-projector.y * 0.5 + 0.5) * height;

    wrapper.style.display = 'block';
    wrapper.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
  });
}

export function resetHealthBars() {
  tracked.forEach((_, id) => untrackHealthBar(id));
  tracked.clear();
}

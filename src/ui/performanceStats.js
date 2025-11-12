const SAMPLE_WINDOW = 0.4;
const MIN_SAMPLES = 3;

export function initPerformanceStats() {
  const host = ensureHost();
  const stats = document.createElement('div');
  stats.id = 'perf-stats';
  stats.textContent = 'FPS 0';
  host.appendChild(stats);

  let elapsed = 0;
  let frames = 0;
  let lastFps = 0;

  return function updatePerformanceStats(deltaSeconds, { skip } = {}) {
    if (skip || deltaSeconds <= 0) return;
    elapsed += deltaSeconds;
    frames += 1;

    if (elapsed < SAMPLE_WINDOW || frames < MIN_SAMPLES) return;

    const fps = Math.round(frames / elapsed);
    if (fps !== lastFps) {
      stats.textContent = `FPS ${Math.max(0, fps)}`;
      lastFps = fps;
    }

    elapsed = 0;
    frames = 0;
  };
}

function ensureHost() {
  const overlay = document.getElementById('overlay');
  if (overlay) {
    return overlay;
  }

  const fallback = document.createElement('div');
  fallback.id = 'overlay';
  document.body.appendChild(fallback);
  return fallback;
}

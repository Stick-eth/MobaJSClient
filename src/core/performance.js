let cachedLowSpec = null;

const OVERRIDE_KEY = 'lol2.lowSpecMode';

function readOverride() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage?.getItem(OVERRIDE_KEY);
    if (!value) return null;
    if (value === 'on') return true;
    if (value === 'off') return false;
  } catch (error) {
    console.warn('[performance] Failed to read low spec override', error);
  }
  return null;
}

function detectLowSpec() {
  if (typeof window === 'undefined') {
    return false;
  }

  const override = readOverride();
  if (override !== null) {
    return override;
  }

  const navigatorRef = window.navigator || {};
  const hardwareConcurrency = typeof navigatorRef.hardwareConcurrency === 'number'
    ? navigatorRef.hardwareConcurrency
    : 8;
  const deviceMemory = typeof navigatorRef.deviceMemory === 'number'
    ? navigatorRef.deviceMemory
    : 8;
  const pixelRatio = window.devicePixelRatio || 1;
  const screenArea = window.screen ? window.screen.width * window.screen.height : 0;

  const isLimitedCpu = hardwareConcurrency > 0 && hardwareConcurrency <= 4;
  const isLimitedMemory = deviceMemory > 0 && deviceMemory <= 4;
  const isHighResolution = pixelRatio > 1.7 && screenArea > 2_000_000;

  return Boolean(isLimitedCpu || isLimitedMemory || isHighResolution);
}

export function isLowSpecDevice() {
  if (cachedLowSpec === null) {
    cachedLowSpec = detectLowSpec();
  }
  return cachedLowSpec;
}

export function setLowSpecOverride(enabled) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(OVERRIDE_KEY, enabled ? 'on' : 'off');
    cachedLowSpec = Boolean(enabled);
  } catch (error) {
    console.warn('[performance] Failed to store low spec override', error);
  }
}

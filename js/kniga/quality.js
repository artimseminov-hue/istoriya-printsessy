// Уровень качества: high (компьютер), mid (обычный телефон), low (слабое устройство).
// Можно задать вручную: kniga.html?q=low|mid|high. Если кадров мало — main.js понижает уровень сам.
export const LEVELS = {
  high: { name: 'high', dpr: 2, antialias: true, shadows: true, shadowMap: 2048, particles: 110, bokeh: 14, panels: 12 },
  mid: { name: 'mid', dpr: 1.75, antialias: true, shadows: true, shadowMap: 1024, particles: 70, bokeh: 10, panels: 10 },
  low: { name: 'low', dpr: 1, antialias: false, shadows: false, shadowMap: 512, particles: 36, bokeh: 0, panels: 8 }
};

export function pickQuality() {
  const q = new URLSearchParams(location.search).get('q');
  if (LEVELS[q]) return LEVELS[q];
  const touch = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (touch && (cores <= 4 || mem < 4)) return LEVELS.low;
  if (touch) return LEVELS.mid;
  return LEVELS.high;
}

export function lower(level) {
  return level.name === 'high' ? LEVELS.mid : LEVELS.low;
}

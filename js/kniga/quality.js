// Уровень качества: high (компьютер), mid (телефон), low (если телефон не справляется).
// Можно задать вручную: kniga.html?q=low|mid|high. Если кадров мало — main.js понижает уровень сам.
// Телефоны рисуются минимум в 1,5× (а обычно в 2×): у них экран ×2–×3, и при 1× фото выглядели пиксельными.
export const LEVELS = {
  high: { name: 'high', dpr: 2, antialias: true, shadows: true, shadowMap: 2048, particles: 110, bokeh: 14, panels: 12 },
  mid: { name: 'mid', dpr: 2, antialias: true, shadows: true, shadowMap: 1024, particles: 60, bokeh: 8, panels: 10 },
  low: { name: 'low', dpr: 1.5, antialias: true, shadows: false, shadowMap: 512, particles: 30, bokeh: 0, panels: 8 }
};

export function pickQuality() {
  const q = new URLSearchParams(location.search).get('q');
  if (LEVELS[q]) return LEVELS[q];
  const touch = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  // iPhone честно не сообщает ни число ядер, ни память, поэтому «слабым» считаем только явно слабое устройство
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory;
  if (touch && (cores <= 2 || (mem && mem < 3))) return LEVELS.low;
  if (touch) return LEVELS.mid;
  return LEVELS.high;
}

export function lower(level) {
  return level.name === 'high' ? LEVELS.mid : LEVELS.low;
}

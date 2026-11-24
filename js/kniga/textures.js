// Текстуры, нарисованные кодом на canvas: бумага, обрез, кожа, дерево, позолота, заглушки фото.
// Ничего не скачивается — сцена грузится быстро, а размер текстур можно уменьшить на слабых телефонах.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// детерминированный «шум», чтобы картинка была одинаковой при каждой загрузке
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function colorTex(c, { repeat, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;     // canvas — это цвет, значит sRGB
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function dataTex(c, repeat) {                // рельеф — это данные, не цвет
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function grain(ctx, w, h, amount, seed) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - .5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * .9;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(x, W, H, r, n, rgb, aMax) {
  for (let i = 0; i < n; i++) {
    const cx = r() * W, cy = r() * H, rad = 40 + r() * 220;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${rgb},${aMax * r()})`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
}

function fibers(x, W, H, r, n, style) {
  x.strokeStyle = style;
  for (let i = 0; i < n; i++) {
    const sx = r() * W, sy = r() * H, len = 6 + r() * 26, a = r() * Math.PI;
    x.lineWidth = .4 + r() * .9;
    x.beginPath(); x.moveTo(sx, sy);
    x.quadraticCurveTo(sx + Math.cos(a + .6) * len * .5, sy + Math.sin(a + .6) * len * .5, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    x.stroke();
  }
}

// ---------- страница: старая кремовая бумага, золотая рамка с завитками, тень у корешка ----------
export function pageTexture(side, size = 1024) {
  const W = size, H = Math.round(size * 4 / 3), k = size / 1024;
  const [c, x] = canvas(W, H);
  const r = rng(side === 'left' ? 11 : 12);
  const g = x.createRadialGradient(W * .5, H * .45, 60 * k, W * .5, H * .5, H * .8);
  g.addColorStop(0, '#fcf4e1'); g.addColorStop(.7, '#f3e3c2'); g.addColorStop(1, '#e2c99c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  blotches(x, W, H, r, 26, '205,165,105', .12);                 // пятна старения
  fibers(x, W, H, r, 900 * k, 'rgba(150,115,70,.09)');           // волокна
  grain(x, W, H, 9, side === 'left' ? 21 : 22);

  // тень и «объём» у корешка
  const inner = side === 'left' ? W : 0, dir = side === 'left' ? -1 : 1;
  const gs = x.createLinearGradient(inner, 0, inner + dir * 300 * k, 0);
  gs.addColorStop(0, 'rgba(70,45,20,.55)'); gs.addColorStop(.12, 'rgba(110,75,35,.28)');
  gs.addColorStop(.45, 'rgba(140,100,50,.06)'); gs.addColorStop(1, 'rgba(140,100,50,0)');
  x.fillStyle = gs; x.fillRect(0, 0, W, H);
  // потемнение у внешнего края и сверху/снизу
  const outer = side === 'left' ? 0 : W;
  const ge = x.createLinearGradient(outer, 0, outer - dir * 120 * k, 0);
  ge.addColorStop(0, 'rgba(160,115,60,.28)'); ge.addColorStop(1, 'rgba(160,115,60,0)');
  x.fillStyle = ge; x.fillRect(0, 0, W, H);

  // рамка: тонкая двойная линия и завитки по углам
  const m = 74 * k, gold = '#b98a3e';
  x.strokeStyle = gold; x.globalAlpha = .75;
  x.lineWidth = 3 * k; x.strokeRect(m, m, W - 2 * m, H - 2 * m);
  x.lineWidth = 1.2 * k; x.strokeRect(m + 12 * k, m + 12 * k, W - 2 * m - 24 * k, H - 2 * m - 24 * k);
  x.globalAlpha = .85;
  for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) flourish(x, cx, cy, sx, sy, 70 * k, gold, k);
  ornamentLine(x, W / 2, m, 120 * k, gold, k);
  ornamentLine(x, W / 2, H - m, 120 * k, gold, k);
  x.globalAlpha = 1;
  return colorTex(c, { aniso: 8 });
}

// рельеф бумаги (волокна) — общий для обеих страниц
export function paperBump(size = 512) {
  const [c, x] = canvas(size, size);
  const r = rng(31);
  x.fillStyle = '#808080'; x.fillRect(0, 0, size, size);
  fibers(x, size, size, r, 1400, 'rgba(255,255,255,.18)');
  fibers(x, size, size, r, 1000, 'rgba(0,0,0,.14)');
  grain(x, size, size, 26, 32);
  return dataTex(c, [3, 4]);
}

function flourish(x, cx, cy, sx, sy, s, color, k) {
  x.save(); x.translate(cx, cy); x.scale(sx, sy);
  x.strokeStyle = color; x.fillStyle = color; x.lineWidth = 2.2 * k; x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, s); x.bezierCurveTo(0, s * .35, s * .15, s * .12, s * .45, s * .18);
  x.bezierCurveTo(s * .7, s * .24, s * .62, s * .5, s * .45, s * .42); x.stroke();
  x.beginPath(); x.moveTo(s, 0); x.bezierCurveTo(s * .35, 0, s * .12, s * .15, s * .18, s * .45);
  x.bezierCurveTo(s * .24, s * .7, s * .5, s * .62, s * .42, s * .45); x.stroke();
  x.beginPath(); x.arc(s * .2, s * .2, 5 * k, 0, Math.PI * 2); x.fill();
  x.restore();
}

function ornamentLine(x, cx, cy, half, color, k) {
  x.save(); x.strokeStyle = color; x.fillStyle = color; x.lineWidth = 1.6 * k;
  x.beginPath(); x.moveTo(cx - half, cy); x.lineTo(cx - 18 * k, cy); x.moveTo(cx + 18 * k, cy); x.lineTo(cx + half, cy); x.stroke();
  star(x, cx, cy, 14 * k, color);
  x.restore();
}

export function star(x, cx, cy, r, color) {
  x.save(); x.fillStyle = color; x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * .3 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath(); x.fill(); x.restore();
}

// ---------- обрез страниц: сотни тонких листов ----------
export function pageEdgeTexture() {
  const [c, x] = canvas(256, 512);
  const r = rng(5);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#f3e6c8'); g.addColorStop(1, '#d9c194');
  x.fillStyle = g; x.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 1.6 + r() * 1.4) {
    const light = r() > .5;
    x.fillStyle = light ? `rgba(255,250,235,${.25 + r() * .3})` : `rgba(120,85,45,${.12 + r() * .22})`;
    x.fillRect(0, y, 256, .7 + r() * .6);
  }
  blotches(x, 256, 512, r, 10, '150,110,60', .12);
  return colorTex(c, { repeat: [3, 1], aniso: 8 });
}

// ---------- обложка: тёмно-синяя кожа с тиснением ----------
export function coverTexture() {
  const W = 1024, H = 768;
  const [c, x] = canvas(W, H);
  const r = rng(7);
  x.fillStyle = '#1a2150'; x.fillRect(0, 0, W, H);
  blotches(x, W, H, r, 40, '40,52,110', .45);
  blotches(x, W, H, r, 30, '8,10,30', .35);
  grain(x, W, H, 22, 8);
  x.strokeStyle = '#c9a04f'; x.globalAlpha = .9;
  x.lineWidth = 5; x.strokeRect(22, 22, W - 44, H - 44);
  x.lineWidth = 1.6; x.strokeRect(36, 36, W - 72, H - 72);
  x.globalAlpha = 1;
  return colorTex(c, { aniso: 8 });
}
export function leatherBump() {
  const S = 512;
  const [c, x] = canvas(S, S);
  const r = rng(41);
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {                 // «поры» кожи
    const cx = r() * S, cy = r() * S, rad = 1 + r() * 3.5;
    x.fillStyle = r() > .5 ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.18)';
    x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
  }
  grain(x, S, S, 30, 42);
  return dataTex(c, [4, 3]);
}

// ---------- стол: тёплое дерево ----------
export function woodTexture() {
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  const r = rng(3);
  const planks = 6, ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const base = 62 + r() * 16;
    x.fillStyle = `hsl(22, 46%, ${base / 4}%)`;
    x.fillRect(0, p * ph, W, ph);
    for (let i = 0; i < 60; i++) {
      const y = p * ph + r() * ph, a = .05 + r() * .09;
      x.strokeStyle = r() > .5 ? `rgba(25,12,5,${a})` : `rgba(200,140,85,${a * .7})`;
      x.lineWidth = .6 + r() * 2.2;
      x.beginPath(); x.moveTo(0, y);
      for (let xx = 0; xx <= W; xx += 64) x.lineTo(xx, y + Math.sin(xx * .006 + i) * (2 + r() * 5));
      x.stroke();
    }
    x.fillStyle = 'rgba(12,5,2,.6)'; x.fillRect(0, p * ph, W, 2.5);
  }
  grain(x, W, H, 12, 4);
  return colorTex(c, { repeat: [3, 3], aniso: 8 });
}

// ---------- позолота ----------
export function giltTexture() {
  const [c, x] = canvas(256, 256);
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#fbe3a2'); g.addColorStop(.4, '#d9a84f'); g.addColorStop(.62, '#fae09a'); g.addColorStop(1, '#c08d3d');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const r = rng(9);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(${r() > .4 ? '255,246,215' : '140,95,35'},${.06 + r() * .1})`;
    x.lineWidth = 1 + r() * 3;
    x.beginPath(); const y = r() * 256; x.moveTo(0, y); x.lineTo(256, y + (r() - .5) * 40); x.stroke();
  }
  return colorTex(c, { repeat: [2, 2] });
}

// ---------- мягкая тень: alphaMap (белое — тень) ----------
export function blobTexture() {
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.shadowColor = '#fff'; x.shadowBlur = 30; x.shadowOffsetX = 1000;
  x.fillStyle = '#fff'; x.fillRect(S * .22 - 1000, S * .22, S * .56, S * .56);
  return new THREE.CanvasTexture(c);
}

// ---------- искра и «боке» (размытый огонёк) ----------
export function sparkTexture() {
  const S = 64;
  const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(.22, 'rgba(255,214,140,.7)'); g.addColorStop(1, 'rgba(255,190,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return colorTex(c);
}
export function bokehTexture() {
  const S = 128;
  const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,225,160,.55)'); g.addColorStop(.7, 'rgba(255,205,130,.42)');
  g.addColorStop(.86, 'rgba(255,215,150,.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return colorTex(c);
}

// ---------- паспарту: кремовый картон со скошенным краем окна ----------
export function matTexture(w, h, iw, ih) {
  const W = 512, H = Math.round(512 * h / w);
  const [c, x] = canvas(W, H);
  const r = rng(55);
  x.fillStyle = '#f2e6cc'; x.fillRect(0, 0, W, H);
  fibers(x, W, H, r, 300, 'rgba(150,115,70,.08)');
  grain(x, W, H, 8, 56);
  const ox = (W - W * iw / w) / 2, oy = (H - H * ih / h) / 2;
  x.strokeStyle = 'rgba(255,252,240,.95)'; x.lineWidth = 5; x.strokeRect(ox - 3, oy - 3, W - 2 * ox + 6, H - 2 * oy + 6);   // скос окна
  x.strokeStyle = 'rgba(150,110,60,.35)'; x.lineWidth = 1.5; x.strokeRect(ox - 7, oy - 7, W - 2 * ox + 14, H - 2 * oy + 14);
  return colorTex(c);
}

// ---------- заглушка фотографии (честно подписана, не выдаётся за настоящее фото) ----------
export function placeholderTexture({ label, hue }, w, h) {
  const W = 768, H = Math.round(768 * h / w);
  const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, W * .4, H);
  g.addColorStop(0, `hsl(${hue}, 30%, 46%)`); g.addColorStop(1, `hsl(${hue + 25}, 34%, 26%)`);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const l = x.createRadialGradient(W * .32, H * .28, 10, W * .32, H * .28, W * .95);
  l.addColorStop(0, 'rgba(255,236,196,.38)'); l.addColorStop(1, 'rgba(255,236,196,0)');
  x.fillStyle = l; x.fillRect(0, 0, W, H);
  const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,10,5,.45)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * .42;
  star(x, cx, cy, Math.min(W, H) * .07, 'rgba(255,238,200,.8)');
  x.fillStyle = '#fff4dc'; x.textAlign = 'center';
  let fs = Math.round(Math.min(W, H) * .1);
  x.font = `500 ${fs}px "Marck Script", cursive`;
  const tw = x.measureText('Здесь будет фотография').width;
  if (tw > W * .84) { fs = Math.floor(fs * W * .84 / tw); x.font = `500 ${fs}px "Marck Script", cursive`; }   // надпись всегда помещается
  x.fillText('Здесь будет фотография', cx, cy + H * .17);
  let ls = Math.round(Math.min(W, H) * .062);
  x.font = `italic 500 ${ls}px "Cormorant Garamond", Georgia, serif`;
  const lw = x.measureText(label).width;
  if (lw > W * .86) { ls = Math.floor(ls * W * .86 / lw); x.font = `italic 500 ${ls}px "Cormorant Garamond", Georgia, serif`; }
  x.globalAlpha = .75;
  x.fillText(label, cx, cy + H * .28);
  x.globalAlpha = 1;
  grain(x, W, H, 16, hue);
  return colorTex(c, { aniso: 8 });
}

// ---------- тёплое свечение вокруг панели (мягкий прямоугольник) ----------
export function haloTexture() {
  const S = 256;
  const [c, x] = canvas(S, S);
  x.shadowColor = 'rgba(255,214,140,1)'; x.shadowBlur = 40; x.shadowOffsetX = 1000;
  x.fillStyle = '#fff'; x.fillRect(S * .2 - 1000, S * .2, S * .6, S * .6);
  return colorTex(c);
}

// ---------- луч света из книги: ярко внизу, тает кверху ----------
export function beamTexture() {
  const [c, x] = canvas(8, 256);
  const g = x.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,214,140,.9)'); g.addColorStop(.25, 'rgba(255,200,120,.35)'); g.addColorStop(1, 'rgba(255,190,110,0)');
  x.fillStyle = g; x.fillRect(0, 0, 8, 256);
  return colorTex(c);
}

// ---------- рамка-полароид: белая карточка, широкое поле снизу, нежные цветы, веточки, точки, божьи коровки ----------
// cw, ch — размер карточки; win — окно под фото {x, y, w, h} в тех же единицах (от левого верхнего угла)
// caption — подпись от руки на нижнем поле (название мини-главы или подпись к фото), необязательно
export function polaroidTexture(cw, ch, win, seed = 1, caption = '') {
  const PX = 1100;                                  // пикселей на единицу сцены
  const W = Math.round(cw * PX), H = Math.round(ch * PX);
  const [c, x] = canvas(W, H);
  const r = rng(seed * 97 + 13);
  x.fillStyle = '#fdfcf9'; x.fillRect(0, 0, W, H);
  grain(x, W, H, 6, seed + 3);
  const wx = win.x * PX, wy = win.y * PX, ww = win.w * PX, wh = win.h * PX;

  // узор только по полю карточки (окно под фото не трогаем)
  x.save();
  x.beginPath(); x.rect(0, 0, W, H); x.rect(wx, wy, ww, wh); x.clip('evenodd');
  const pink = ['#f4b8c4', '#f2a9b8', '#f7c6cf'], ink = '#2b2523';
  const spots = [];
  const bottomH = H - (wy + wh);
  // где рисовать: верхняя и боковые полоски — мелочь, нижнее поле — крупные цветы
  const place = (n, area) => { for (let i = 0; i < n; i++) spots.push({ ...area(), k: r() }); };
  place(7, () => ({ x: r() * W, y: wy * (.25 + r() * .55), s: .45 + r() * .25 }));
  place(8, () => ({ x: r() < .5 ? wx * (.2 + r() * .6) : wx + ww + (W - wx - ww) * (.2 + r() * .6), y: wy + r() * wh, s: .4 + r() * .25 }));
  if (caption) {          // с подписью: цветы только по краям нижнего поля, середина — для текста
    place(6, () => ({ x: r() < .5 ? W * (.03 + r() * .13) : W * (.84 + r() * .13), y: wy + wh + bottomH * (.25 + r() * .6), s: .6 + r() * .35 }));
  } else {
    place(11, () => ({ x: W * .05 + r() * W * .9, y: wy + wh + bottomH * (.2 + r() * .65), s: .75 + r() * .45 }));
  }
  const unit = Math.min(W, H) * .075;
  for (const p of spots) {
    const s = unit * p.s, a = (r() - .5) * 1.2;
    if (p.k < .38) flower(x, p.x, p.y, s, pink[(r() * 3) | 0], ink, a, r);
    else if (p.k < .62) sprig(x, p.x, p.y, s, ink, a, r);
    else if (p.k < .78) leaf(x, p.x, p.y, s * .7, ink, a);
    else if (p.k < .88) ladybug(x, p.x, p.y, s * .45, a);
    else dots(x, p.x, p.y, s, ink, r);
  }
  x.restore();

  if (caption) {
    // подпись от руки, подгоняется по ширине; длинная — в две строки
    let fs = Math.round(bottomH * .34);
    const fontOf = (n) => `600 ${n}px "Caveat", "Marck Script", cursive`;
    x.font = fontOf(fs);
    const maxW = W * .66;
    let lines = [caption];
    if (x.measureText(caption).width > maxW) {
      const words = caption.split(' '); let a = '', b = '';
      for (const w of words) { if (x.measureText(a + ' ' + w).width < maxW * .95 && !b) a = a ? a + ' ' + w : w; else b = b ? b + ' ' + w : w; }
      lines = b ? [a, b] : [a];
      fs = Math.round(bottomH * (lines.length > 1 ? .26 : .34));
      x.font = fontOf(fs);
      const widest = Math.max(...lines.map((l) => x.measureText(l).width));
      if (widest > maxW) { fs = Math.floor(fs * maxW / widest); x.font = fontOf(fs); }
    }
    x.fillStyle = '#3b2a1e'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const cy = wy + wh + bottomH * .5, lh = fs * 1.05;
    lines.forEach((l, i) => x.fillText(l, W / 2, cy + (i - (lines.length - 1) / 2) * lh));
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  }

  // тонкая тень окна: фото будто вставлено под плёнку
  x.strokeStyle = 'rgba(80,70,65,.25)'; x.lineWidth = 3; x.strokeRect(wx - 1.5, wy - 1.5, ww + 3, wh + 3);
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.5; x.strokeRect(wx - 4, wy - 4, ww + 8, wh + 8);
  return colorTex(c, { aniso: 8 });
}

function flower(x, cx, cy, s, color, ink, a, r) {
  x.save(); x.translate(cx, cy); x.rotate(a);
  // стебель с листиком
  x.strokeStyle = ink; x.lineWidth = Math.max(1.2, s * .06); x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, s * .2); x.quadraticCurveTo(s * .15, s * .9, -s * .05, s * 1.5); x.stroke();
  x.beginPath(); x.moveTo(s * .05, s * .8); x.quadraticCurveTo(s * .5, s * .6, s * .6, s * .9); x.stroke();
  // бутон-тюльпан из лепестков
  x.fillStyle = color; x.strokeStyle = 'rgba(200,110,130,.55)'; x.lineWidth = Math.max(1, s * .03);
  for (const [dx, rot] of [[-s * .22, -.35], [s * .22, .35], [0, 0]]) {
    x.beginPath(); x.ellipse(dx, -s * .05, s * .26, s * .42, rot, 0, Math.PI * 2); x.fill(); x.stroke();
  }
  x.fillStyle = 'rgba(255,255,255,.35)';
  x.beginPath(); x.ellipse(-s * .06, -s * .18, s * .07, s * .16, -.2, 0, Math.PI * 2); x.fill();
  x.restore();
}

function sprig(x, cx, cy, s, ink, a, r) {
  x.save(); x.translate(cx, cy); x.rotate(a);
  x.strokeStyle = ink; x.lineWidth = Math.max(1, s * .045); x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, s); x.quadraticCurveTo(s * .1, 0, -s * .05, -s * .9); x.stroke();
  for (let i = 0; i < 4; i++) {
    const t = .15 + i * .2, y = s - t * 1.9 * s, side = i % 2 ? 1 : -1;
    x.beginPath(); x.moveTo(s * .03, y); x.quadraticCurveTo(side * s * .35, y - s * .15, side * s * .42, y - s * .35); x.stroke();
  }
  x.restore();
}

function leaf(x, cx, cy, s, ink, a) {
  x.save(); x.translate(cx, cy); x.rotate(a);
  x.fillStyle = ink;
  x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * .55, 0, 0, s); x.quadraticCurveTo(-s * .55, 0, 0, -s); x.fill();
  x.restore();
}

function ladybug(x, cx, cy, s, a) {
  x.save(); x.translate(cx, cy); x.rotate(a);
  x.fillStyle = '#2b2523'; x.beginPath(); x.arc(0, -s * .9, s * .4, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#e8798c'; x.beginPath(); x.ellipse(0, 0, s * .75, s * .95, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#2b2523'; x.lineWidth = Math.max(1, s * .08);
  x.beginPath(); x.moveTo(0, -s * .9); x.lineTo(0, s * .95); x.stroke();
  x.fillStyle = '#2b2523';
  for (const [dx, dy] of [[-.35, -.25], [.35, -.25], [-.38, .35], [.38, .35]]) { x.beginPath(); x.arc(dx * s, dy * s, s * .14, 0, Math.PI * 2); x.fill(); }
  x.restore();
}

function dots(x, cx, cy, s, ink, r) {
  x.fillStyle = ink;
  for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(cx + (r() - .5) * s * 1.6, cy + (r() - .5) * s * .8, Math.max(1.5, s * (.06 + r() * .05)), 0, Math.PI * 2); x.fill(); }
}

// ---------- конверт для письма: закрытый (с сургучной печатью) и открытый ----------
export function envelopeTexture(w, h, open, from = '') {
  const PX = 1100, W = Math.round(w * PX), H = Math.round(h * PX);
  const [c, x] = canvas(W, H);
  const r = rng(77);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f6ead2'); g.addColorStop(1, '#e6d2ad');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  fibers(x, W, H, r, 260, 'rgba(140,100,60,.08)');
  grain(x, W, H, 8, 78);
  x.strokeStyle = 'rgba(150,110,60,.45)'; x.lineWidth = 3;
  // боковые клапаны
  x.beginPath(); x.moveTo(0, H); x.lineTo(W * .5, H * .52); x.lineTo(W, H); x.stroke();
  if (!open) {
    // верхний клапан закрыт, на нём печать
    x.fillStyle = 'rgba(225,205,165,.9)';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(W * .5, H * .58); x.lineTo(W, 0); x.closePath(); x.fill(); x.stroke();
    const sx = W / 2, sy = H * .56, R = Math.min(W, H) * .11;
    x.save(); x.shadowColor = 'rgba(40,10,5,.35)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
    x.fillStyle = '#8c1d2a'; x.beginPath();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, rr = R + (r() - .5) * 8; x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    x.fill(); x.restore();
    x.strokeStyle = 'rgba(60,8,12,.6)'; x.lineWidth = 2; x.beginPath(); x.arc(sx, sy, R * .72, 0, Math.PI * 2); x.stroke();
    star(x, sx, sy, R * .5, '#e2bc69');
  } else {
    // клапан откинут вверх — видна тёмная внутренность
    x.fillStyle = 'rgba(120,80,45,.35)';
    x.beginPath(); x.moveTo(0, 0); x.lineTo(W * .5, H * .3); x.lineTo(W, 0); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(150,110,60,.45)'; x.stroke();
  }
  if (from) {
    x.fillStyle = 'rgba(90,55,25,.85)'; x.textAlign = 'center';
    x.font = `${Math.round(H * .085)}px "Marck Script", cursive`;
    x.fillText(from, W / 2, H * .88);
  }
  return colorTex(c, { aniso: 8 });
}

// ---------- золотая звёздочка-наклейка: «это воспоминание уже открыто» ----------
export function stickerTexture() {
  const S = 128;
  const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,236,180,.9)'); g.addColorStop(.6, 'rgba(242,196,109,.35)'); g.addColorStop(1, 'rgba(242,196,109,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  star(x, S / 2, S / 2, S * .34, '#d9a441');
  star(x, S / 2, S / 2, S * .2, '#fff1c9');
  return colorTex(c);
}

// ---------- фото «вписать» в окно полароида: обрезка по центру, в полном разрешении файла (до 2048 px) ----------
// Раньше было не больше 1024 px — на телефоне с экраном ×3 открытое фото выглядело мыльным.
export function coverTexture2(img, w, h) {
  const MAX = Math.min(2048, Math.max(img.naturalWidth, img.naturalHeight, 512));
  const W = w >= h ? MAX : Math.round(MAX * w / h), H = w >= h ? Math.round(MAX * h / w) : MAX;
  const [c, x] = canvas(W, H);
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return colorTex(c, { aniso: 8 });
}

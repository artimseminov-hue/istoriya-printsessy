// Записка с воспоминанием: старая бумага с неровными краями, рукописный текст (Caveat),
// заголовок Marck Script, золотой завиток и сургучная печать. Текст «пишется» плавно, у листа есть тень и лёгкий изгиб.
import * as THREE from 'three';
import { rng, star, blobTexture } from './textures.js?v=20261124202948';

const CW = 1024;
const PAD = 100;
const TITLE_PX = 80, TEXT_PX = 60, SIGN_PX = 50, LINE = 1.24;
const FONT_TEXT = `600 ${TEXT_PX}px "Caveat", "Marck Script", cursive`;
const FONT_TITLE = `${TITLE_PX}px "Marck Script", "Caveat", cursive`;
const FONT_SIGN = `${SIGN_PX}px "Marck Script", "Caveat", cursive`;
export const NOTE_W = .74;        // ширина записки в сцене

export function createNote() {
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  const paper = document.createElement('canvas');      // бумага рисуется один раз, текст — поверх при каждом кадре проявления
  const px = paper.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const mat = new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: .3,
    roughness: .95, transparent: true, opacity: 0, depthWrite: false, depthTest: false   // парит над книгой
  });
  // лёгкий изгиб листа
  const geo = new THREE.PlaneGeometry(1, 1, 24, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, .03 * Math.sin(Math.PI * (p.getX(i) + .5)) - .015);
  geo.computeVertexNormals();
  const sheet = new THREE.Mesh(geo, mat);
  sheet.renderOrder = 6;

  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x120802, alphaMap: blobTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.3), shadowMat);
  shadow.position.set(.025, -.04, -.05);
  shadow.renderOrder = 5;

  const group = new THREE.Group();
  group.add(shadow, sheet);
  group.visible = false;

  let layout = null, H = 600;

  function wrap(text, maxW) {
    x.font = FONT_TEXT;
    const lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (x.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }

  function drawPaper(seed) {
    paper.width = CW; paper.height = H;
    const r = rng(seed);
    // неровный (рваный) край
    const path = new Path2D();
    const inset = 18, step = 14;
    const pts = [];
    for (let xx = inset; xx <= CW - inset; xx += step) pts.push([xx, inset + r() * 7]);
    for (let yy = inset; yy <= H - inset; yy += step) pts.push([CW - inset - r() * 7, yy]);
    for (let xx = CW - inset; xx >= inset; xx -= step) pts.push([xx, H - inset - r() * 7]);
    for (let yy = H - inset; yy >= inset; yy -= step) pts.push([inset + r() * 7, yy]);
    pts.forEach(([a, b], i) => (i ? path.lineTo(a, b) : path.moveTo(a, b)));
    path.closePath();
    const g = px.createRadialGradient(CW * .45, H * .4, 40, CW / 2, H / 2, CW * .75);
    g.addColorStop(0, '#fdf5e3'); g.addColorStop(.7, '#f1e0bd'); g.addColorStop(1, '#dcc092');
    px.fillStyle = g; px.fill(path);
    px.save(); px.clip(path);
    for (let i = 0; i < 18; i++) {                         // пятна времени
      const cx = r() * CW, cy = r() * H, rad = 40 + r() * 160;
      const b = px.createRadialGradient(cx, cy, 0, cx, cy, rad);
      b.addColorStop(0, `rgba(190,145,85,${.1 * r()})`); b.addColorStop(1, 'rgba(190,145,85,0)');
      px.fillStyle = b; px.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    px.strokeStyle = 'rgba(140,105,60,.08)';
    for (let i = 0; i < 500; i++) {                        // волокна
      const sx = r() * CW, sy = r() * H, a = r() * Math.PI, len = 6 + r() * 22;
      px.lineWidth = .5 + r() * .8; px.beginPath(); px.moveTo(sx, sy); px.lineTo(sx + Math.cos(a) * len, sy + Math.sin(a) * len); px.stroke();
    }
    px.lineWidth = 26; px.strokeStyle = 'rgba(150,105,50,.16)'; px.stroke(path);   // потемневший край
    px.restore();
    px.lineWidth = 1.5; px.strokeStyle = 'rgba(120,85,45,.35)'; px.stroke(path);

    // сургучная печать с золотой звездой
    const sx = CW - 118, sy = 104, R = 44;
    px.save();
    px.shadowColor = 'rgba(40,10,5,.35)'; px.shadowBlur = 10; px.shadowOffsetY = 4;
    px.fillStyle = '#8c1d2a'; px.beginPath();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, rr = R + (r() - .5) * 6; px.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    px.fill(); px.restore();
    const sg = px.createRadialGradient(sx - 12, sy - 14, 4, sx, sy, R);
    sg.addColorStop(0, 'rgba(255,170,160,.35)'); sg.addColorStop(1, 'rgba(60,5,10,.2)');
    px.fillStyle = sg; px.beginPath(); px.arc(sx, sy, R - 4, 0, Math.PI * 2); px.fill();
    px.strokeStyle = 'rgba(60,8,12,.6)'; px.lineWidth = 2; px.beginPath(); px.arc(sx, sy, R - 12, 0, Math.PI * 2); px.stroke();
    star(px, sx, sy, 22, '#e2bc69');
  }

  function setContent(note, seed = 7, width = NOTE_W) {
    const maxW = CW - PAD * 2 - 40;
    x.font = FONT_TEXT;
    const lines = note.text ? wrap(note.text, maxW) : [];
    const titleH = note.title ? TITLE_PX * 1.15 : 0;
    const divH = note.title ? 46 : 0;
    const bodyH = lines.length * TEXT_PX * LINE;
    const photoH = note.photo ? 200 : 0;                  // фото отправителя письма (необязательно)
    const signH = note.author ? SIGN_PX * 1.9 : 0;
    H = Math.round(PAD * 1.5 + titleH + divH + bodyH + photoH + signH);
    c.width = CW; c.height = H;
    drawPaper(seed);
    x.font = FONT_TEXT;
    const chars = [];
    let y = PAD * .85 + titleH + divH + TEXT_PX * .8;
    for (const line of lines) {
      let cx = PAD;
      for (const ch of line) { chars.push({ ch, x: cx, y }); cx += x.measureText(ch).width; }
      y += TEXT_PX * LINE;
    }
    layout = { note, chars, titleY: PAD * .85 + TITLE_PX * .85, divY: PAD * .85 + titleH + divH * .45, photoY: y, signY: y + photoH + SIGN_PX * .55 };
    group.scale.set(width, width * H / CW, 1);
    tex.dispose();               // размер холста поменялся — текстура пересоздастся
    draw(0);
    return { w: width, h: width * H / CW };
  }

  // p: 0..1 — сколько уже «написано»
  function draw(p) {
    const { note, chars } = layout;
    x.clearRect(0, 0, CW, H);
    x.drawImage(paper, 0, 0);
    const ink = '74,44,20';
    if (note.title) {
      x.font = FONT_TITLE; x.fillStyle = `rgba(138,88,36,${Math.min(1, p * 5)})`;
      // заголовок не заезжает на сургучную печать: длинный — чуть меньше
      const maxTW = CW - PAD - 250, tw = x.measureText(note.title).width;
      if (tw > maxTW) x.font = `${Math.floor(TITLE_PX * maxTW / tw)}px "Marck Script", "Caveat", cursive`;
      x.fillText(note.title, PAD, layout.titleY);
    }
    // золотой завиток-разделитель «прорисовывается»
    const dp = Math.min(1, Math.max(0, p * 4 - .3));
    if (dp > 0 && note.title) {
      const y = layout.divY, x0 = PAD, len = 300;
      x.save(); x.strokeStyle = '#c2954a'; x.lineWidth = 2.4; x.lineCap = 'round';
      x.setLineDash([len * dp, len]);
      x.beginPath(); x.moveTo(x0, y); x.bezierCurveTo(x0 + 80, y - 14, x0 + 150, y + 14, x0 + 240, y);
      x.quadraticCurveTo(x0 + 270, y - 8, x0 + 290, y); x.stroke();
      x.restore();
      if (dp > .9) star(x, x0 + 306, y, 9, `rgba(194,149,74,${(dp - .9) * 10})`);
    }
    // текст: буквы проступают по очереди, как чернила, с мягким «хвостом»
    x.font = FONT_TEXT;
    const n = chars.length, head = (Math.max(0, p - .12) / .88) * (n + 20);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, Math.min(1, (head - i) / 20));
      if (a <= 0) break;
      x.fillStyle = `rgba(${ink},${a * .92})`;
      x.fillText(chars[i].ch, chars[i].x, chars[i].y + (1 - a) * 5);
    }
    if (note.photo && note.photo.naturalWidth) {
      const a = Math.max(0, Math.min(1, (p - .8) * 5)), R = 80, cx0 = PAD + R, cy0 = layout.photoY + R + 10;
      x.save(); x.globalAlpha = a;
      x.beginPath(); x.arc(cx0, cy0, R, 0, Math.PI * 2); x.clip();
      const im = note.photo, k = Math.max(2 * R / im.naturalWidth, 2 * R / im.naturalHeight);
      x.drawImage(im, cx0 - im.naturalWidth * k / 2, cy0 - im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k);
      x.restore();
      x.save(); x.globalAlpha = a; x.strokeStyle = '#c2954a'; x.lineWidth = 4; x.beginPath(); x.arc(cx0, cy0, R, 0, Math.PI * 2); x.stroke(); x.restore();
    }
    if (note.author) {
      x.font = FONT_SIGN; x.textAlign = 'right';
      x.fillStyle = `rgba(120,76,34,${Math.max(0, Math.min(1, (p - .9) * 10))})`;
      x.fillText(note.author, CW - PAD, layout.signY);
      x.textAlign = 'left';
    }
    tex.needsUpdate = true;
  }

  return {
    mesh: group, setContent, draw,
    get opacity() { return mat.opacity; },
    set opacity(o) { mat.opacity = o; shadowMat.opacity = o * .5; group.visible = o > .002; }
  };
}

// 3D-книга «История одной Светы»: главы, развороты, воспоминания открываются по очереди.
// Фото лежат на страницах, отделяются, встают лицом к зрителю и раскрываются в объёмную галерею.
// Первое воспоминание главы открывается само, следующее подсвечивается, глава заканчивается перелистыванием.
// Весь контент — в site/content/content.js (см. CONTENT_GUIDE.md), код здесь менять не нужно.
// Состояния: intro → opening → gallery ⇄ focus → closing/flipping → … → final.
import * as THREE from 'three';
import { pickQuality, lower } from './quality.js';
import { createWorld } from './scene.js';
import { createBook, createPageFlip, surfaceY, PAGE_W, PAGE_D } from './book.js';
import { createPanel } from './photo.js';
import { createGallery } from './gallery.js';
import { createNote } from './note.js';
import { createRig } from './camera.js';
import { buildStory, loadProgress, saveProgress, resetProgress, nextItem, chapterDone } from './story.js';
import { createSound } from './sound.js';

const $ = (id) => document.getElementById(id);
const RENDER = new URLSearchParams(location.search).has('render');
const SPREAD_MAX = 10;                 // сколько фото на одном развороте

// раскладка фото на страницах: по 5 на страницу, с небольшим разбросом
const PAGE_SPOTS = [[-1.02, -.6, -5], [-.44, -.52, 4], [-.74, 0, -2], [-1.04, .56, 6], [-.44, .6, -4]];
function pageSpot(i, n) {
  const half = Math.ceil(n / 2), right = i >= half, j = right ? i - half : i;
  const s = PAGE_SPOTS[j % PAGE_SPOTS.length];
  return { x: right ? -s[0] : s[0], z: s[1], rot: right ? -s[2] : s[2] };
}
const wait = (s) => new Promise((r) => gsap.delayedCall(s, r));

(async function () {
  // фоновая музыка — одна на всю книгу; если браузер не даст включить сразу, включится при первом касании
  const sound = createSound();
  if (!RENDER) sound.start();

  // шрифты нужны до рисования на холстах; в образце и кириллица, и знаки препинания —
  // у Google Fonts они лежат в разных файлах, иначе точки и запятые на холсте пропадут
  await Promise.race([
    Promise.all(['600 60px "Caveat"', '80px "Marck Script"', 'italic 500 42px "Cormorant Garamond"'].map((f) => document.fonts.load(f, 'Ая Az .,:;—–«»!?()0'))),
    new Promise((r) => setTimeout(r, 3000))
  ]);

  let quality = pickQuality();
  const tale = buildStory(window.SVETA_CONTENT, Math.min(SPREAD_MAX, quality.panels));
  if (tale.problems.length) {
    $('problems').hidden = false;
    $('problems').textContent = '⚠ ' + tale.problems.join(' ');
    console.warn('[kniga]', tale.problems);
  }
  if (!tale.chapters.length) { gsap.to('#loading', { autoAlpha: 0, duration: .6 }); return; }
  const progress = loadProgress(tale);
  const viewed = progress.viewed;
  const save = () => saveProgress(progress);

  // ---------- рендер ----------
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.dpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .05, 60);
  const world = createWorld(scene, quality);
  scene.add(createBook(quality));
  const flipper = createPageFlip(quality);
  scene.add(flipper.mesh);
  const note = createNote();
  scene.add(note.mesh);
  const rig = createRig(camera);

  const ui = {
    hint: $('hint'), label: $('chapterLabel'), invite: $('invite'), inviteText: document.querySelector('#invite .invite-text'),
    openBar: $('openBar'), open: $('openBtn'), bar: $('galleryBar'), contents: $('contentsBtn'),
    turnBar: $('turnBar'), turn: $('turnBtn'),
    controls: $('controls'), cont: $('continueBtn'),
    player: $('player'), plBtn: $('plBtn'), plCaption: $('plCaption'), plBar: $('plBar'), plFill: $('plFill'), plTime: $('plTime'),
    letterNav: $('letterNav'), lpPrev: $('lpPrev'), lpNext: $('lpNext'), lpInfo: $('lpInfo'),
    photoNav: $('photoNav'), phPrev: $('phPrev'), phNext: $('phNext'), phAuto: $('phAuto'), photoInfo: $('photoInfo'), soundBtn: $('soundBtn'),
    card: $('chapterCard'), ccNum: $('ccNum'), ccTitle: $('ccTitle'), toast: $('toast'),
    menu: $('menu'), menuList: $('menuList'), menuReset: $('menuReset'), menuClose: $('menuClose'),
    final: $('final'), finalTitle: $('finalTitle'), finalText: $('finalText'), video: $('finalVideo'), cover: $('finalCover'), coverHint: $('coverHint'), finalBack: $('finalBack'),
    live: $('srNote'), list: $('srList'),
    paper: $('paper'), paperScroll: $('paperScroll'), paperTitle: $('paperTitle'), paperText: $('paperText'), paperAuthor: $('paperAuthor')
  };
  const show = (el, on, d) => gsap.to(el, { autoAlpha: on ? 1 : 0, duration: d ?? (on ? .9 : .35), ease: 'sine.out', overwrite: true });
  const hint = (text) => { if (text) ui.hint.textContent = text; show(ui.hint, !!text); };

  // ---------- телефон: своя раскладка (меньшая сторона экрана ≤ 500 px); компьютер её не видит ----------
  const isCompact = () => Math.min(innerWidth, innerHeight) <= 500;
  const isCompactLand = () => isCompact() && innerWidth / innerHeight >= 1.15;
  function syncCompact() {
    document.body.classList.toggle('compact', isCompact());
    document.body.classList.toggle('compact-land', isCompactLand());
    document.body.classList.toggle('compact-port', isCompact() && !isCompactLand());
    document.body.classList.toggle('compact-tiny', isCompact() && innerHeight < 320);
  }
  syncCompact();
  // записка на телефоне — настоящий текст (крупный, с прокруткой), а не картинка в 3D-сцене, которую приходилось уменьшать
  let paperKey = '';
  function setPaper(content, rect) {
    const key = [content.title, content.text, content.author].join('|');
    if (key !== paperKey) {
      paperKey = key;
      ui.paperTitle.textContent = content.title || '';
      ui.paperText.replaceChildren(...String(content.text || '').split(/\n+/).filter((t) => t.trim()).map((t) => {
        const el = document.createElement('p'); el.textContent = t.trim(); return el;
      }));
      ui.paperAuthor.textContent = content.author || '';
      ui.paperScroll.scrollTop = 0;
    }
    ui.paper.hidden = false;
    Object.assign(ui.paper.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', maxHeight: rect.h + 'px' });
    return ui.paper.offsetHeight;                    // настоящая высота (если текст короткий — меньше места)
  }
  function revealPaper(delay = 0) { gsap.fromTo(ui.paper, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .9, delay, ease: 'power2.out', overwrite: true }); }
  function hidePaper() {
    if (ui.paper.hidden) return;
    gsap.to(ui.paper, { autoAlpha: 0, duration: .4, ease: 'sine.in', overwrite: true, onComplete: () => { ui.paper.hidden = true; } });
  }
  // где стоят стрелки фото и «Продолжить» на телефоне боком (main.js ставит, CSS читает)
  function placeControls(navX, navY, rowX) {
    const c = ui.controls.style;
    if (navX == null) { c.removeProperty('--nav-x'); c.removeProperty('--nav-y'); c.removeProperty('--row-x'); return; }
    c.setProperty('--nav-x', navX + 'px'); c.setProperty('--nav-y', navY + 'px'); c.setProperty('--row-x', rowX + 'px');
  }
  let toastCall = null;
  function toast(text, sec = 2.6) {
    ui.toast.textContent = text; show(ui.toast, true, .4);
    toastCall && toastCall.kill(); toastCall = gsap.delayedCall(sec, () => show(ui.toast, false, .6));
  }

  // ---------- кадры ----------
  const BOOK_PTS = [], BOOK_FRONT = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    BOOK_PTS.push(new THREE.Vector3(sx * (PAGE_W + .14), 0, sz * (PAGE_D / 2 + .11)));
    BOOK_PTS.push(new THREE.Vector3(sx * PAGE_W * .96, .21, sz * PAGE_D / 2));
  }
  for (const sx of [-1, 1]) BOOK_FRONT.push(new THREE.Vector3(sx * (PAGE_W + .14), 0, PAGE_D / 2 + .11), new THREE.Vector3(sx * .9, .2, .2));
  const bottomInset = () => (isCompactLand() ? 70 : (ui.controls.offsetHeight || 60) + 34);
  const bookShot = () => rig.fit(BOOK_PTS, new THREE.Vector3(0, 1, .8), { top: 40, bottom: 90, left: 46, right: 46 });
  const topShot = () => rig.fit(BOOK_PTS, new THREE.Vector3(0, 1, .02), { top: 16, bottom: 16, left: 16, right: 16 });
  const finalShot = () => rig.fit(BOOK_PTS, new THREE.Vector3(0, .45, 1), { top: 60, bottom: 60, left: 30, right: 30 });
  const galleryShot = () => rig.fit(gallery.framePoints(BOOK_FRONT), new THREE.Vector3(0, .2, 1),
    isCompact() ? { top: 50, bottom: 34, left: 8, right: 8 } : { top: 44, bottom: 80, left: 24, right: 24 });

  // кадр на фото + место для записки (широкий экран — сбоку, к центру галереи; узкий — снизу); без записки — фото по центру
  const NOTE_GAP = .08;
  const noteWidth = () => (innerHeight < 520 && camera.aspect >= 1 ? .98 : .74);
  function focusLayout(p, noteSize) {
    const pose = p.focusPose();
    const q = pose.quaternion, C = pose.position;
    const N = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const R = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const U = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const wide = camera.aspect >= 1;
    const dir = N.clone().add(new THREE.Vector3(0, .06, 0)).normalize();
    const pts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(C.clone().addScaledVector(R, sx * p.outerW / 2).addScaledVector(U, sy * p.outerH / 2));
    let K = null;
    if (noteSize) {
      const side = wide ? R.clone().multiplyScalar(C.x > 0 ? -1 : 1) : U.clone().negate();
      K = C.clone().addScaledVector(side, (wide ? p.outerW : p.outerH) / 2 + NOTE_GAP + (wide ? noteSize.w : noteSize.h) / 2).addScaledVector(N, .04);
      const up = rig.upFor(dir), r = new THREE.Vector3().crossVectors(up, dir).normalize(), u = new THREE.Vector3().crossVectors(dir, r);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(K.clone().addScaledVector(r, sx * noteSize.w / 2).addScaledVector(u, sy * noteSize.h / 2));
    }
    const m = Math.min(innerWidth, innerHeight) * .05;
    return { shot: rig.fit(pts, dir, { top: 40 + m, bottom: bottomInset(), left: 16 + m, right: 16 + m }), notePos: K, dir };
  }

  // ---------- разворот: фото текущей главы ----------
  let chIdx = Math.min(progress.chapter, tale.chapters.length - 1);
  let spIdx = 0;
  let panels = [], gallery = null, byId = {}, pickables = [];
  let state = 'intro', current = null, active = null;
  const chapter = () => tale.chapters[chIdx];
  // разворот, на котором ждёт следующее воспоминание (или последний, если глава прочитана)
  const spreadFor = (ch) => { const n = nextItem(ch, viewed); return n ? n.spread : Math.max(0, ch.spreads.length - 1); };

  function destroySpread() {
    document.body.classList.remove('story-open');
    if (gallery) gallery.dispose();
    for (const p of panels) p.dispose();
    panels = []; gallery = null; byId = {}; pickables = []; active = null; current = null;
    ui.list.textContent = '';
  }
  function buildSpread(ci, si) {
    destroySpread();
    chIdx = ci; spIdx = si;
    const items = tale.chapters[ci].spreads[si] || [];
    const K = isCompact() ? 1.3 : 1;                  // на телефоне карточки в галерее крупнее
    panels = items.map((it, i) => createPanel({
      ...it, w: it.w * K, h: it.h * K, kind: it.kind === 'letter' ? 'letter' : 'photo', page: pageSpot(i, items.length),
      caption: it.kind === 'letter' ? '' : it.title, stack: Math.min(2, Math.max(0, (it.photos || []).length - 1))
    }, quality, surfaceY));
    for (const p of panels) {
      scene.add(p.group, p.blob);
      p.state.reveal = 0;
      p.state.seen = viewed[p.id] ? 1 : 0;
    }
    gallery = createGallery(scene, panels, .21);
    byId = Object.fromEntries(panels.map((p) => [p.id, p]));
    pickables = panels.flatMap((p) => p.pickables);
    for (const p of panels) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = `Открыть: ${p.data.title || 'воспоминание ' + p.data.order}`;
      b.addEventListener('click', () => tryFocus(p));
      ui.list.appendChild(b);
    }
    refreshLocks(true);
    ui.label.textContent = `Глава ${tale.chapters[ci].number} · ${tale.chapters[ci].title}`;
  }
  // ещё не открытые по очереди — чуть приглушены; просмотренные и следующее — яркие
  function refreshLocks(instant) {
    const nxt = nextItem(chapter(), viewed);
    for (const p of panels) {
      const locked = !viewed[p.id] && (!nxt || p.id !== nxt.id) ? 1 : 0;
      instant ? (p.state.locked = locked) : gsap.to(p.state, { locked, duration: .8 });
    }
  }
  const canOpen = (p) => viewed[p.id] || nextItem(chapter(), viewed)?.id === p.id;

  // ---------- подсказки: что открыть дальше ----------
  let invitedOnce = false;
  function setInvite(p, label) {
    if (active && active !== p) gsap.to(active.state, { invite: 0, duration: .5 });
    active = p;
    if (p) {
      gsap.to(p.state, { invite: 1, duration: .8, ease: 'sine.out' });
      ui.inviteText.textContent = label;
      show(ui.invite, true);
    } else show(ui.invite, false);
  }
  function guide(auto) {
    state = 'gallery';
    const ch = chapter();
    const nxt = nextItem(ch, viewed);
    show(ui.bar, true); show(ui.label, true);
    show(ui.turnBar, false);
    if (nxt && nxt.spread === spIdx) {
      const p = byId[nxt.id];
      const firstOfChapter = ch.items[0] === nxt;
      if (auto && firstOfChapter) {                 // первое воспоминание главы открывается само
        setInvite(null); hint('');
        gsap.delayedCall(.9, () => focus(p, true));
        return;
      }
      setInvite(p, invitedOnce ? 'Посмотри, что дальше…' : 'Нажми сюда');
      invitedOnce = true;
      hint('Посмотри, что дальше…');
      return;
    }
    setInvite(null);
    if (nxt) {                                      // этот разворот прочитан, в главе есть ещё
      ui.turn.innerHTML = 'Следующий разворот <span aria-hidden="true">›</span>';
      hint('Этот разворот прочитан');
    } else {                                        // глава прочитана
      const next = tale.chapters[chIdx + 1];
      if (!next) { hint('Книга прочитана'); return; }
      progress.unlocked = Math.max(progress.unlocked, chIdx + 1); save();
      ui.turn.innerHTML = next.type === 'final'
        ? '<span class="orn" aria-hidden="true">✦</span>Перейти к финалу<span class="orn" aria-hidden="true">✦</span>'
        : '<span class="orn" aria-hidden="true">✦</span>Перевернуть страницу<span class="orn" aria-hidden="true">✦</span>';
      hint('Глава прочитана');
    }
    show(ui.turnBar, true);
  }

  // ---------- галерея: фото поднимаются со страниц / возвращаются ----------
  async function openGallery() {
    state = 'opening';
    gallery.state.angle = 0;
    const tl = gsap.timeline();
    tl.to(gallery.state, { open: 1, duration: 2.2, ease: 'sine.inOut' }, 0);
    tl.to(world.glow, { intensity: 2.4, duration: 2, ease: 'sine.inOut' }, 0);
    const seq = [...panels].sort((a, b) => Math.abs(a.pagePos.x) - Math.abs(b.pagePos.x));
    seq.forEach((p, i) => {
      const at = .3 + i * .17;
      tl.call(() => world.particles.burst(p.pagePos), null, at);
      tl.to(p.state, { out: 1, duration: 2.7, ease: 'power2.inOut' }, at);
    });
    tl.call(() => rig.flyTo(galleryShot(), { duration: 3.6, ease: 'power2.inOut', arc: .12 }), null, .15);
    await tl;
  }
  async function closeGallery() {
    state = 'closing';
    const tl = gsap.timeline();
    tl.to(gallery.state, { angle: 0, duration: 1.2, ease: 'power2.inOut' }, 0);
    const seq = [...panels].sort((a, b) => Math.abs(b.pagePos.x) - Math.abs(a.pagePos.x));
    seq.forEach((p, i) => tl.to(p.state, { out: 0, focus: 0, dim: 0, invite: 0, duration: 2.2, ease: 'power2.inOut' }, .1 + i * .08));
    tl.to(gallery.state, { open: 0, duration: 1.8, ease: 'sine.inOut' }, .6);
    tl.to(world.glow, { intensity: 1.1, duration: 2, ease: 'sine.inOut' }, .6);
    tl.call(() => rig.flyTo(bookShot(), { duration: 3, ease: 'power2.inOut', arc: .12 }), null, .3);
    await tl;
  }

  // ---------- открыть воспоминание ----------
  function tryFocus(p) {
    if (!(state === 'gallery' || state === 'focus') || current === p) return;
    if (!canOpen(p)) {                               // по очереди: сначала подсвеченное
      toast('Сначала открой подсвеченное воспоминание ✦');
      if (active) gsap.fromTo(active.state, { hover: 1 }, { hover: 0, duration: 1.2, ease: 'sine.inOut' });
      return;
    }
    focus(p);
  }

  let letterPages = null, letterPage = 0, letterPhoto = null;
  function focus(p, auto = false) {
    if (!(state === 'gallery' || state === 'focus') || current === p) return;
    if (current) gsap.to(current.state, { focus: 0, duration: 1.4, ease: 'power2.inOut' });
    if (current && current.isLetter) current.setOpen(false);
    current = p;
    state = 'flying';
    setInvite(null);
    show(ui.bar, false); hint(''); show(ui.controls, false); show(ui.player, false); show(ui.turnBar, false); show(ui.label, false);
    hideNote(); stopAudio(); stopAuto(story);
    for (const o of panels) gsap.to(o.state, { hover: 0, dim: o === p ? 0 : 1, duration: 1.2, ease: 'sine.inOut' });
    gsap.to(world.bokeh, { opacity: .08, duration: 1.2 });

    // отмечаем как просмотренное и сохраняем
    if (!viewed[p.id]) { viewed[p.id] = true; save(); }
    gsap.to(p.state, { seen: 1, duration: 1, delay: 2 });
    refreshLocks();

    const it = p.data;
    setupPlayer(it);
    ui.letterNav.hidden = true;
    if (it.kind === 'letter') { focusLetter(p, auto); return; }
    ui.live.textContent = [it.title, it.text, it.author].filter(Boolean).join('. ');
    openStory(p);
  }

  // ================= мини-глава: фото вылетают из карточки, слева — главное фото и остальные, справа — текст и голос =================
  let story = null;          // { card, panels, main, shot, basis, ... }
  const loadImg = (src) => new Promise((res) => {
    if (!src) { res(null); return; }
    const im = new Image(); im.decoding = 'async';
    const t = setTimeout(() => res(im.naturalWidth ? im : null), 6000);
    im.onload = () => { clearTimeout(t); res(im); };
    im.onerror = () => { clearTimeout(t); console.info(`[kniga] фото не найдено: ${src}`); res(null); };
    im.src = src;
  });
  const _mS = new THREE.Matrix4(), _qy = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);

  // «сцена» истории — плоскость перед камерой; раскладка задаётся в пикселях экрана и переводится в 3D
  function stageBasis(shot, depth) {
    const dir = shot.pos.clone().sub(shot.target).normalize();
    _mS.lookAt(shot.pos, shot.target, rig.upFor(dir));
    const right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
    _mS.extractBasis(right, up, back);
    const q = new THREE.Quaternion().setFromRotationMatrix(_mS);
    const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * depth;
    return { origin: shot.pos.clone(), right, up, fwd: back.clone().negate(), q, depth, hh, hw: hh * camera.aspect, wpp: 2 * hh / innerHeight };
  }
  function toWorld(B, px, py, dz = 0, out = new THREE.Vector3()) {
    const nx = px / innerWidth * 2 - 1, ny = 1 - py / innerHeight * 2, k = (B.depth + dz) / B.depth;
    return out.copy(B.origin).addScaledVector(B.fwd, B.depth + dz).addScaledVector(B.right, nx * B.hw * k).addScaledVector(B.up, ny * B.hh * k);
  }

  // где что стоит (в пикселях): главное фото, ряд остальных, записка, плеер
  function storyLayout(st) {
    if (isCompact()) return storyLayoutCompact(st);
    placeControls(null);
    const W = innerWidth, H = innerHeight, it = st.card.data;
    const top = 26, bottom = (ui.controls.offsetHeight || 60) + 26, gap = Math.max(10, Math.min(W, H) * .025);
    const hasSide = !!(it.text || it.audio);
    const wide = W / H >= 1.15;
    const m = st.panels.length - 1;
    let photo, side;                                  // прямоугольники {x, y, w, h}
    if (!hasSide) photo = { x: gap * 2, y: top, w: W - gap * 4, h: H - top - bottom };
    else if (wide) {
      const split = W * (H < 520 ? .54 : .56);
      photo = { x: gap, y: top, w: split - gap * 1.5, h: H - top - bottom };
      side = { x: split + gap * .5, y: top, w: W - split - gap * 1.5, h: H - top - bottom };
    } else {
      const ph = (H - top - bottom) * .55;
      photo = { x: gap, y: top, w: W - gap * 2, h: ph };
      side = { x: gap, y: top + ph + gap, w: W - gap * 2, h: H - top - bottom - ph - gap };
    }
    // ряд остальных фото под главным
    const stripH = m ? Math.min(photo.h * (wide ? .26 : .3), 150) : 0;
    const mainArea = { x: photo.x, y: photo.y, w: photo.w, h: photo.h - (m ? stripH + gap : 0) };
    const targets = [];
    const aspect = (p) => p.outerW / p.outerH;
    const mainP = st.panels[st.main];
    const mh = Math.min(mainArea.h * .96, mainArea.w * .94 / aspect(mainP));
    targets[st.main] = { x: mainArea.x + mainArea.w / 2, y: mainArea.y + mainArea.h / 2, h: mh, dz: 0, yaw: 0 };
    if (m) {
      const others = st.panels.map((p, i) => i).filter((i) => i !== st.main);
      const sumA = others.reduce((a, i) => a + aspect(st.panels[i]), 0);
      const th = Math.max(36, Math.min(stripH * .92, (photo.w - gap * .6 * (m - 1)) / sumA));
      const rowW = sumA * th + gap * .6 * (m - 1);
      let cx = photo.x + (photo.w - rowW) / 2;
      const cy = photo.y + photo.h - stripH / 2;
      others.forEach((i, k) => {
        const w = aspect(st.panels[i]) * th;
        targets[i] = { x: cx + w / 2, y: cy + (k % 2 ? 3 : -3), h: th, dz: .04 + (k % 2) * .03, yaw: (k % 2 ? -1 : 1) * .12 };
        cx += w + gap * .6;
      });
    }
    // записка и плеер справа (на узком экране — снизу)
    let noteRect = null, playerAt = null;
    if (side) {
      const playerH = it.audio ? 78 : 0;
      if (it.text) noteRect = { x: side.x, y: side.y, w: side.w, h: side.h - playerH };
      if (it.audio) playerAt = { x: side.x + side.w / 2, y: noteRect ? null : side.y + side.h / 2, w: Math.min(side.w, 420) };
    }
    return { targets, noteRect, playerAt };
  }

  // ТЕЛЕФОН. Главное — фото: оно занимает всю высоту (боком) или верхнюю половину (вертикально).
  // Остальные фото мини-главы прячутся «стопкой» за главным — листать стрелками, свайпом или автоматически.
  // Записка — текстом справа (боком) или под фото (вертикально), под ней плеер; «Продолжить» — внизу колонки.
  function storyLayoutCompact(st) {
    const W = innerWidth, H = innerHeight, it = st.card.data;
    const land = isCompactLand(), hasSide = !!(it.text || it.audio), multi = st.panels.length > 1;
    const tiny = H < 320;                           // Safari с панелями вкладок оставляет странице ~230 px высоты
    const gap = 10, navH = multi ? (tiny ? 40 : 46) : 0, rowH = tiny ? 42 : 50, playerH = it.audio ? (tiny ? 50 : 62) : 0;
    let photo, side = null;
    if (land) {
      const split = hasSide ? Math.round(W * .56) : W;
      const sideTop = tiny ? 8 : 58;                // на низком экране кнопка музыки уезжает вниз влево (CSS)
      photo = { x: gap, y: 6, w: split - gap * 1.5, h: H - 6 - (multi ? navH + 2 : rowH + 8) };
      if (hasSide) side = { x: split + gap * .5, y: sideTop, w: W - split - gap * 1.5 - 4, h: H - sideTop - rowH - 18 };
    } else {
      const top = 62, ctrlH = rowH + navH + 18;
      const ph = hasSide ? Math.round((H - top - ctrlH) * .5) : H - top - ctrlH;
      photo = { x: gap, y: top, w: W - gap * 2, h: ph };
      if (hasSide) side = { x: gap + 4, y: top + ph + gap, w: W - gap * 2 - 8, h: H - top - ph - gap - ctrlH - 6 };
    }
    const aspect = (p) => p.outerW / p.outerH;
    const mainP = st.panels[st.main];
    const mh = Math.min(photo.h * .98, photo.w * .97 / aspect(mainP));
    const cx = photo.x + photo.w / 2, cy = photo.y + photo.h / 2;
    const targets = [];
    targets[st.main] = { x: cx, y: cy, h: mh, dz: 0, yaw: 0 };
    st.panels.forEach((p, i) => {
      if (i === st.main) return;
      const k = (i - st.main + st.panels.length) % st.panels.length;
      targets[i] = { x: cx + (k % 2 ? 7 : -7), y: cy + 4, h: mh * .93, dz: .1 + k * .02, yaw: (k % 2 ? -1 : 1) * .05 };
    });
    let noteRect = null, playerAt = null;
    if (side) {
      if (it.text) noteRect = { x: side.x, y: side.y, w: side.w, h: side.h - (playerH ? playerH + 8 : 0), paper: true };
      if (it.audio) playerAt = { x: side.x + side.w / 2, y: noteRect ? null : side.y + side.h / 2, w: Math.min(side.w, 420) };
    }
    // стрелки — сразу под фото; «Продолжить» — внизу правой колонки (боком) или по центру
    if (land) placeControls(cx, cy + mh / 2 + 2, side ? side.x + side.w / 2 : W / 2);
    else placeControls(null);
    return { targets, noteRect, playerAt };
  }

  function applyStoryLayout(st, animate) {
    const L = storyLayout(st);
    st.panels.forEach((p, i) => {
      const t = L.targets[i];
      if (animate) gsap.to(p.L, { ...t, duration: 1, ease: 'power3.inOut', overwrite: true });
      else Object.assign(p.L, t);
      gsap.to(p.state, { reveal: !isCompact() || i === st.main ? 1 : 0, duration: animate ? .6 : .01 });
      gsap.to(p.state, { focus: i === st.main ? 1 : 0, duration: animate ? .9 : .01, overwrite: 'auto' });
    });
    // записка: ширина подбирается так, чтобы текст целиком поместился в отведённое место
    st.noteShown = false; st.paperShown = false;
    if (L.noteRect && L.noteRect.paper) {
      const it = st.card.data;
      const h = setPaper({ title: it.title, text: it.text, author: it.author }, L.noteRect);
      st.noteBottomPx = L.noteRect.y + h;
      st.paperShown = true;
    } else if (L.noteRect) {
      const it = st.card.data, B = st.basis;
      const content = { title: it.title, text: it.text, author: it.author };
      let wWorld = L.noteRect.w * B.wpp * .96;
      let size = note.setContent(content, 7, wWorld);
      const maxH = L.noteRect.h * B.wpp * .96;
      if (size.h > maxH) { wWorld *= maxH / size.h; size = note.setContent(content, 7, wWorld); }
      const hPx = size.h / B.wpp;
      const free = Math.max(0, L.noteRect.h - hPx);
      const cy = L.noteRect.y + hPx / 2 + (it.audio ? free * .35 : free / 2);
      st.notePos = toWorld(B, L.noteRect.x + L.noteRect.w / 2, cy, -.02);
      st.noteBottomPx = cy + hPx / 2;
      st.noteShown = true;
    }
    if (L.playerAt) {
      const y = L.playerAt.y ?? (st.noteBottomPx + (isCompact() ? 8 + (ui.player.offsetHeight || 56) / 2 : 16 + 30));
      Object.assign(ui.player.style, { left: L.playerAt.x + 'px', top: y + 'px', width: L.playerAt.w + 'px' });
    }
    ui.photoInfo.textContent = st.panels.length > 1 ? `${st.main + 1} / ${st.panels.length}` : '';
  }

  async function openStory(card) {
    const it = card.data;
    if (isCompact()) {
      document.body.classList.add('story-open');
      for (const o of panels) if (o !== card) gsap.to(o.state, { reveal: 0, duration: .8, ease: 'sine.in' });
    }
    const { shot } = focusLayout(card, null);
    const D = 2.6;
    const fly = rig.flyTo(shot, { duration: D, ease: 'power2.inOut', arc: .2 });
    gsap.to(card.state, { focus: 1, duration: D * .8, ease: 'power2.inOut', delay: D * .15 });
    // фото мини-главы грузятся только сейчас (параллельно с полётом камеры)
    const photos = it.photos.length ? it.photos : [{ image: '', caption: '' }];
    const [imgs] = await Promise.all([Promise.all(photos.map((ph) => loadImg(ph.image))), fly]);
    if (current !== card) return;                 // пока грузилось, ушли в другое место
    const cardPose = card.focusPose();
    const depth = shot.pos.distanceTo(cardPose.position) * .86;
    const basis = stageBasis(shot, depth);
    const panelsS = photos.map((ph, i) => {
      const im = imgs[i];
      const a = im ? im.naturalWidth / im.naturalHeight : 4 / 3;
      const w = a >= 1 ? .66 : .66 * a, h = a >= 1 ? .66 / a : .66;
      const p = createPanel({
        id: `${it.id}#${i}`, kind: 'photo', image: ph.image, img: im, caption: ph.caption, title: it.title, w, h, phase: i * 1.7,
        fromPose: { pos: cardPose.position.clone(), quat: cardPose.quaternion.clone(), scale: .55 }
      }, quality, surfaceY);
      p.L = { x: innerWidth / 2, y: innerHeight / 2, h: 100, dz: 0, yaw: 0 };
      p.index = i;
      scene.add(p.group);
      return p;
    });
    story = { card, panels: panelsS, main: 0, shot, basis };
    story.byId = Object.fromEntries(panelsS.map((p) => [p.id, p]));
    story.pickables = panelsS.flatMap((p) => p.pickables);
    setupPlayer(it);
    ui.photoNav.hidden = panelsS.length < 2;
    ui.player.classList.add('floating');
    applyStoryLayout(story, false);
    // карточка тает — из неё поднимаются фото
    gsap.to(card.state, { reveal: 0, duration: 1.1, ease: 'sine.in' });
    world.particles.burst(cardPose.position);
    panelsS.forEach((p, i) => gsap.to(p.state, { out: 1, duration: 1.6, ease: 'power3.out', delay: .1 + i * .09 }));
    if (story.noteShown) gsap.delayedCall(.7, () => story && revealNoteAt(story.notePos, story.basis.q));
    if (story.paperShown) revealPaper(.8);
    gsap.delayedCall(1.2, () => {
      if (story?.card !== card) return;
      showControls(); state = 'focus';
      startVoice();
      scheduleAuto(story);
    });
  }

  // переключить главное фото (по нажатию на фото, стрелками, свайпом или само по кругу)
  function setMain(i) {
    if (!story || state !== 'focus') return;
    const n = story.panels.length;
    i = ((i % n) + n) % n;
    if (i === story.main) { scheduleAuto(story); return; }
    story.main = i;
    applyStoryLayout(story, true);
    if (story.noteShown) { placeNoteAt(story.notePos, story.basis.q); note.draw(1); }
    // лёгкое мерцание вокруг нового главного фото
    const P = story.panels[i];
    gsap.delayedCall(.55, () => { if (story && story.panels[story.main] === P) world.particles.burst(P.group.position); });
    scheduleAuto(story);                          // после ручного выбора показ продолжается с новым отсчётом
  }

  // автосмена: одно фото каждые ~6 с, по кругу; только пока мини-глава открыта
  const AUTO_SEC = 6;
  function scheduleAuto(st) {
    if (!st) return;
    st.autoCall && st.autoCall.kill();
    st.autoCall = null;
    paintAutoBtn(st);
    if (st.panels.length < 2 || st.autoPaused || story !== st) return;
    st.autoCall = gsap.delayedCall(AUTO_SEC, () => {
      st.autoCall = null;
      if (story !== st || state !== 'focus') return;
      setMain(st.main + 1);
    });
  }
  function stopAuto(st) { if (st && st.autoCall) { st.autoCall.kill(); st.autoCall = null; } }
  function paintAutoBtn(st) {
    const paused = !!st?.autoPaused;
    ui.phAuto.textContent = paused ? '▶' : '❚❚';
    ui.phAuto.setAttribute('aria-label', paused ? 'Продолжить показ фото' : 'Остановить показ фото');
    ui.phAuto.title = paused ? 'Продолжить показ' : 'Остановить показ';
    ui.phAuto.classList.toggle('paused', paused);
  }
  ui.phAuto.addEventListener('click', () => {
    if (!story) return;
    story.autoPaused = !story.autoPaused;
    if (story.autoPaused) { stopAuto(story); paintAutoBtn(story); toast('Показ остановлен — рассматривай спокойно', 1.8); }
    else setMain(story.main + 1);
  });

  function placeNoteAt(pos, q) {
    note.mesh.position.copy(pos);
    note.mesh.quaternion.copy(q);
    note.mesh.rotateZ(.012);
  }
  function revealNoteAt(pos, q) {
    placeNoteAt(pos, q);
    const end = note.mesh.position.clone();
    note.mesh.position.addScaledVector(story.basis.fwd, .06).addScaledVector(story.basis.up, -.03);
    note.draw(0); note.opacity = 0;
    const prog = { p: 0 };
    const len = (story.card.data.text || '').length + 100;
    gsap.timeline()
      .to(note, { opacity: 1, duration: 1, ease: 'sine.out' }, 0)
      .to(note.mesh.position, { x: end.x, y: end.y, z: end.z, duration: 1.3, ease: 'power3.out' }, 0)
      .to(prog, { p: 1, duration: Math.min(4.5, 1.4 + len / 90), ease: 'sine.inOut', onUpdate: () => note.draw(prog.p) }, .4);
  }

  // закрыть историю: фото возвращаются в карточку, карточка снова проявляется
  async function closeStory() {
    const st = story;
    if (!st) return;
    stopAuto(st);
    story = null;
    ui.photoNav.hidden = true;
    placeControls(null);
    show(ui.player, false);
    st.panels.forEach((p, i) => gsap.to(p.state, { out: 0, focus: 0, duration: 1.1, ease: 'power2.in', delay: i * .05 }));
    gsap.to(st.card.state, { reveal: 1, duration: 1.1, ease: 'sine.out', delay: .5 });
    document.body.classList.remove('story-open');
    for (const o of panels) if (o !== st.card) gsap.to(o.state, { reveal: 1, duration: 1, ease: 'sine.out', delay: .4 });
    st.closing = true;
    closingStory = st;
    await wait(1.3 + st.panels.length * .05);
    st.panels.forEach((p) => p.dispose());
    if (closingStory === st) closingStory = null;
  }
  let closingStory = null;

  // каждый кадр: фото истории держатся на своих местах перед камерой
  const _sp = new THREE.Vector3(), _sq = new THREE.Quaternion();
  function updateStory(st, t) {
    const B = st.basis;
    for (const p of st.panels) {
      toWorld(B, p.L.x, p.L.y, p.L.dz, _sp);
      _sq.copy(B.q).multiply(_qy.setFromAxisAngle(_Y, p.L.yaw));
      p.setSlot(_sp, _sq);
      p.state.size = (p.L.h * B.wpp * (B.depth + p.L.dz) / B.depth) / p.outerH;
      p.update(t);
    }
  }


  // письмо: камера к конверту, клапан открывается, лист поднимается из конверта; длинное письмо — по страницам
  const letterCache = {};
  async function focusLetter(p) {
    const it = p.data;
    if (!(it.letter in letterCache)) {
      try {
        const r = await fetch(it.letter);
        letterCache[it.letter] = r.ok ? (await r.text()).trim() : '';
      } catch (e) { letterCache[it.letter] = ''; }
      if (!letterCache[it.letter]) console.info(`[kniga] текст письма не найден: ${it.letter}`);
    }
    const text = letterCache[it.letter] || 'Текст письма пока не добавлен.';
    letterPages = paginate(text, 420);
    letterPage = 0;
    letterPhoto = null;
    if (it.fromPhoto) { letterPhoto = new Image(); letterPhoto.src = it.fromPhoto; }
    if (isCompact()) {
      ui.letterNav.hidden = true;
      const { shot } = focusLayout(p, null);
      const D = 2.8, tl = gsap.timeline();
      tl.add(rig.flyTo(shot, { duration: D, ease: 'power2.inOut', arc: .2 }), 0);
      tl.to(p.state, { focus: 1, duration: D * .8, ease: 'power2.inOut' }, D * .15);
      tl.call(() => p.setOpen(true), null, D * .7);
      tl.call(() => { setPaper({ title: it.title, text, author: it.from }, letterRect()); revealPaper(); }, null, D * .8);
      tl.call(() => { placeControls(null); showControls(); state = 'focus'; }, null, D * .8 + .7);
      return;
    }
    ui.letterNav.hidden = letterPages.length < 2;
    const size = setLetterPage();
    const { shot, notePos, dir } = focusLayout(p, size);
    const D = 2.8;
    const tl = gsap.timeline();
    tl.add(rig.flyTo(shot, { duration: D, ease: 'power2.inOut', arc: .2 }), 0);
    tl.to(p.state, { focus: 1, duration: D * .8, ease: 'power2.inOut' }, D * .15);
    tl.call(() => p.setOpen(true), null, D * .7);
    tl.call(() => revealNote(notePos, shot, dir, p.focusPose().position), null, D * .78);
    tl.call(() => { showControls(); state = 'focus'; }, null, D * .78 + .7);
  }
  // место для письма на телефоне: по центру, над кнопкой «Продолжить»
  function letterRect() {
    const W = innerWidth, H = innerHeight, w = Math.min(560, W - 28);
    const top = isCompactLand() ? 14 : 64;
    return { x: (W - w) / 2, y: top, w, h: H - top - 78 };
  }
  function paginate(text, max) {
    const pages = []; let cur = '';
    for (const para of text.split(/\n\s*\n/)) {
      const words = para.replace(/\s*\n\s*/g, ' ').split(' ');
      let line = cur ? cur + '\n' : '';
      for (const w of words) {
        if ((line + w).length > max && line.trim()) { pages.push(line.trim()); line = ''; }
        line += (line && !line.endsWith('\n') ? ' ' : '') + w;
      }
      cur = line;
      if (cur.length > max * .75) { pages.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) pages.push(cur.trim());
    return pages.length ? pages : [''];
  }
  function setLetterPage() {
    const it = current.data, last = letterPage === letterPages.length - 1;
    ui.lpInfo.textContent = `${letterPage + 1} / ${letterPages.length}`;
    ui.lpPrev.disabled = letterPage === 0; ui.lpNext.disabled = last;
    return note.setContent({
      title: letterPage === 0 ? it.title : '', text: letterPages[letterPage],
      author: last ? it.from : '', photo: last ? letterPhoto : null
    }, 11, noteWidth());
  }
  function turnLetter(d) {
    if (state !== 'focus' || !current || !current.isLetter) return;
    const n = letterPage + d;
    if (n < 0 || n >= letterPages.length) return;
    letterPage = n;
    const size = setLetterPage();
    const { shot, notePos, dir } = focusLayout(current, size);
    rig.flyTo(shot, { duration: .9, ease: 'power2.inOut', arc: 0 });
    revealNote(notePos, shot, dir);
  }

  const _m = new THREE.Matrix4();
  function placeNote(K, shot, dir) {
    note.mesh.position.copy(K);
    _m.lookAt(shot.pos, shot.target, rig.upFor(dir));
    note.mesh.quaternion.setFromRotationMatrix(_m);
    note.mesh.rotateZ(.018);
  }
  function revealNote(K, shot, dir, from) {
    placeNote(K, shot, dir);
    const end = note.mesh.position.clone();
    if (from) note.mesh.position.copy(from);                  // письмо выходит из конверта
    else note.mesh.position.addScaledVector(dir, -.08).add(new THREE.Vector3(0, -.03, 0));
    note.draw(0); note.opacity = 0;
    const prog = { p: 0 };
    const len = (current?.data.text || '').length + 100;
    gsap.timeline()
      .to(note, { opacity: 1, duration: 1, ease: 'sine.out' }, 0)
      .to(note.mesh.position, { x: end.x, y: end.y, z: end.z, duration: from ? 1.6 : 1.4, ease: 'power3.out' }, 0)
      .to(prog, { p: 1, duration: Math.min(4.2, 1.4 + len / 90), ease: 'sine.inOut', onUpdate: () => note.draw(prog.p) }, .45);
  }
  function hideNote() { gsap.to(note, { opacity: 0, duration: .5, ease: 'sine.in' }); hidePaper(); }
  function showControls() {
    show(ui.controls, true);
    if (story && !ui.player.hidden) show(ui.player, true);
    ui.cont.focus({ preventScroll: true });
  }

  // ---------- голос мини-главы: один элемент на всю книгу (sound.voice), включается сам при открытии ----------
  const voice = sound.voice;
  let voiceItem = null;
  const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
  function setupPlayer(it) {
    if (voiceItem === it) return;                 // та же мини-глава — запись не перезапускаем
    stopAudio();
    ui.player.hidden = !it.audio;
    ui.player.classList.remove('missing');
    if (!it.audio) return;
    voiceItem = it;
    ui.plCaption.textContent = it.audioCaption || '';
    ui.plBtn.textContent = '▶'; ui.plBtn.setAttribute('aria-label', 'Слушать');
    ui.plFill.style.width = '0%'; ui.plTime.textContent = '0:00';
    voice.src = it.audio;
  }
  // запустить запись открытой мини-главы (если браузер не разрешил — заиграет после первого касания)
  function startVoice() {
    if (!voiceItem || ui.player.classList.contains('missing')) return;
    sound.playVoice();
  }
  voice.addEventListener('timeupdate', () => {
    if (!voiceItem) return;
    ui.plFill.style.width = (voice.duration ? voice.currentTime / voice.duration * 100 : 0) + '%';
    ui.plTime.textContent = fmt(voice.currentTime);
  });
  voice.addEventListener('ended', () => { if (!voiceItem) return; ui.plBtn.textContent = '↺'; ui.plBtn.setAttribute('aria-label', 'Послушать ещё раз'); });
  voice.addEventListener('pause', () => { if (voiceItem && !voice.ended) { ui.plBtn.textContent = '▶'; ui.plBtn.setAttribute('aria-label', 'Слушать'); } });
  voice.addEventListener('play', () => { if (!voiceItem) return; ui.plBtn.textContent = '❚❚'; ui.plBtn.setAttribute('aria-label', 'Пауза'); });
  voice.addEventListener('error', () => {
    if (!voiceItem || !voice.getAttribute('src') || voice.src.startsWith('data:')) return;
    ui.player.classList.add('missing');
    ui.plCaption.textContent = 'Запись пока не добавлена';
    console.info(`[kniga] аудио не найдено: ${voiceItem.audio}`);
  });
  function stopAudio() { voiceItem = null; sound.stopVoice(); }
  ui.plBtn.addEventListener('click', () => {
    if (!voiceItem || ui.player.classList.contains('missing')) return;
    if (voice.paused) { if (voice.ended) voice.currentTime = 0; sound.playVoice(); } else voice.pause();
  });
  ui.plBar.addEventListener('click', (e) => {
    if (!voiceItem || !voice.duration) return;
    const r = ui.plBar.getBoundingClientRect();
    voice.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * voice.duration;
  });

  // ---------- кнопка звука (вверху справа): выключить / включить музыку ----------
  function paintSoundBtn() {
    ui.soundBtn.classList.toggle('off', sound.off);
    ui.soundBtn.setAttribute('aria-label', sound.off ? 'Включить музыку' : 'Выключить музыку');
    ui.soundBtn.title = sound.off ? 'Включить музыку' : 'Выключить музыку';
  }
  ui.soundBtn.addEventListener('click', () => { sound.setOff(!sound.off); paintSoundBtn(); });
  paintSoundBtn();

  // ---------- назад к галерее ----------
  async function backToGallery() {
    if (state !== 'focus') return;
    state = 'flying';
    show(ui.controls, false); hideNote(); stopAudio();
    if (story) await closeStory();
    const p = current;
    if (p) gsap.to(p.state, { focus: 0, duration: 2, ease: 'power2.inOut', delay: .2 });
    if (p && p.isLetter) gsap.delayedCall(.6, () => p.setOpen(false));
    for (const o of panels) gsap.to(o.state, { dim: 0, duration: 1.6, ease: 'sine.inOut', delay: .4 });
    gsap.to(world.bokeh, { opacity: .55, duration: 1.6, delay: .4 });
    current = null;
    rig.flyTo(galleryShot(), { duration: 2.8, ease: 'power2.inOut', arc: .2, onComplete: () => guide(false) });
  }

  // ---------- перелистывание: следующий разворот / глава ----------
  function showChapterCard(ch) {
    ui.ccNum.textContent = ch.type === 'final' ? 'Финал' : `Глава ${ch.number}`;
    ui.ccTitle.textContent = ch.title;
    return gsap.timeline()
      .to(ui.card, { autoAlpha: 1, duration: 1, ease: 'sine.out' })
      .to(ui.card, { autoAlpha: 0, duration: 1, ease: 'sine.in' }, '+=1.6');
  }
  async function goTo(ci, si, dir = 1) {
    if (!['gallery', 'book', 'final'].includes(state)) return;
    const chapterChanges = ci !== chIdx || state === 'final';
    state = 'flipping';
    setInvite(null); hint(''); show(ui.turnBar, false); show(ui.bar, false); show(ui.label, false); show(ui.controls, false);
    if (gallery && gallery.state.open > .5) await closeGallery();
    else await rig.flyTo(bookShot(), { duration: 2, ease: 'power2.inOut', arc: .1 });
    if (panels.length) await gsap.to(panels.map((p) => p.state), { reveal: 0, duration: .8, stagger: .04, ease: 'sine.in' });
    destroySpread();
    world.particles.burst(new THREE.Vector3(dir > 0 ? .7 : -.7, .3, 0));
    const flip = flipper.flip(dir);
    if (chapterChanges) showChapterCard(tale.chapters[ci]);
    await flip;
    progress.chapter = ci; save();
    const target = tale.chapters[ci];
    if (target.type === 'final') { chIdx = ci; await enterFinal(); return; }
    buildSpread(ci, si);
    if (chapterChanges) await wait(1.2);
    await revealOnPages();
    await openGallery();
    guide(true);
  }
  async function revealOnPages() {
    const tl = gsap.timeline();
    panels.forEach((p, i) => {
      tl.to(p.state, { reveal: 1, duration: 1.4, ease: 'sine.inOut' }, i * .1);
      tl.call(() => world.particles.burst(p.pagePos), null, .2 + i * .1);
    });
    await tl;
  }
  function onTurn() {
    if (state !== 'gallery') return;
    const ch = chapter();
    const nxt = nextItem(ch, viewed);
    if (nxt && nxt.spread === spIdx) return;          // на этом развороте ещё есть непросмотренное — переход закрыт
    if (nxt) { goTo(chIdx, nxt.spread, 1); return; }
    const ni = chIdx + 1;
    if (!tale.chapters[ni]) return;
    progress.unlocked = Math.max(progress.unlocked, ni); save();
    goTo(ni, spreadFor(tale.chapters[ni]), 1);
  }

  // ---------- оглавление ----------
  function openMenu() {
    if (!['gallery', 'book', 'final'].includes(state)) return;
    ui.menuList.textContent = '';
    tale.chapters.forEach((ch, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const done = ch.type !== 'final' && chapterDone(ch, viewed);
      const seen = ch.items.filter((it) => viewed[it.id]).length;
      const stateText = i > progress.unlocked ? '🔒 ещё закрыта'
        : ch.type === 'final' ? 'видеообращение'
          : done ? '✓ прочитана' : `${seen} из ${ch.items.length}`;
      b.innerHTML = `<span class="m-num">${ch.type === 'final' ? '✦' : ch.number}</span><span class="m-title"></span><span class="m-state">${stateText}</span>`;
      b.querySelector('.m-title').textContent = ch.title;
      b.disabled = i > progress.unlocked;
      if (i === chIdx) b.classList.add('current');
      b.addEventListener('click', () => {
        closeMenu();
        if (i === chIdx && state !== 'final') return;
        if (state === 'final') leaveFinal();
        goTo(i, spreadFor(ch), i >= chIdx ? 1 : -1);
      });
      li.appendChild(b); ui.menuList.appendChild(li);
    });
    ui.menu.hidden = false;
    gsap.fromTo(ui.menu, { opacity: 0 }, { opacity: 1, duration: .4 });
    ui.menuClose.focus();
  }
  function closeMenu() { ui.menu.hidden = true; }
  ui.contents.addEventListener('click', openMenu);
  ui.menuClose.addEventListener('click', closeMenu);
  ui.menu.addEventListener('click', (e) => { if (e.target === ui.menu) closeMenu(); });
  ui.menuReset.addEventListener('click', () => {
    if (confirm('Начать книгу сначала? Отметки о просмотренных воспоминаниях сбросятся.')) { resetProgress(); location.reload(); }
  });

  // ---------- финал: видеообращение ----------
  let videoReady = false;
  async function enterFinal() {
    state = 'final';
    const f = chapter().final;
    ui.finalTitle.textContent = f.title;
    ui.finalText.textContent = f.text;
    ui.cover.hidden = false; ui.video.hidden = true;
    ui.cover.classList.remove('missing');
    ui.coverHint.textContent = 'Нажми, чтобы посмотреть';
    if (f.poster) ui.cover.style.backgroundImage = `linear-gradient(rgba(13,11,28,.45), rgba(13,11,28,.65)), url("${f.poster}")`;
    // видео: только метаданные, без автозапуска; если файла нет — заставка говорит об этом
    videoReady = false;
    ui.video.src = f.prelude || f.video;
    ui.video.dataset.stage = f.prelude ? 'prelude' : 'main';
    ui.video.onerror = () => {
      if (ui.video.dataset.stage === 'prelude') { ui.video.dataset.stage = 'main'; ui.video.src = f.video; return; }   // нет мультсцены — сразу к видео
      ui.cover.classList.add('missing'); ui.coverHint.textContent = 'Видео пока не добавлено';
      console.info(`[kniga] видео не найдено: ${f.video}`);
    };
    ui.video.onloadedmetadata = () => { videoReady = true; };
    ui.video.onended = () => {
      if (ui.video.dataset.stage === 'prelude') { ui.video.dataset.stage = 'main'; ui.video.src = f.video; ui.video.play().catch(() => {}); }
    };
    ui.video.load();
    gsap.to(world.glow, { intensity: 2.6, duration: 2 });
    rig.flyTo(finalShot(), { duration: 3.2, ease: 'power2.inOut', arc: .15 });
    await wait(1.4);
    ui.final.hidden = false;
    gsap.fromTo(ui.final, { opacity: 0 }, { opacity: 1, duration: 1.4, ease: 'sine.out' });
    show(ui.bar, true);
  }
  // финальное видео: пока оно играет, музыка уходит; после — возвращается
  ui.video.addEventListener('play', () => sound.setDuck('video', true));
  ui.video.addEventListener('pause', () => sound.setDuck('video', false));
  ui.video.addEventListener('ended', () => sound.setDuck('video', false));
  ui.cover.addEventListener('click', () => {
    if (ui.cover.classList.contains('missing')) return;
    ui.cover.hidden = true; ui.video.hidden = false;
    ui.video.play().catch(() => {});
  });
  function leaveFinal() {
    ui.video.pause();
    ui.final.hidden = true;
    gsap.to(world.glow, { intensity: 1.1, duration: 1.5 });
  }
  ui.finalBack.addEventListener('click', () => {
    if (state !== 'final') return;
    leaveFinal();
    const pi = Math.max(0, chIdx - 1);
    state = 'book';
    goTo(pi, spreadFor(tale.chapters[pi]), -1);
  });

  // ---------- кнопки, клавиши ----------
  ui.cont.addEventListener('click', backToGallery);
  ui.turn.addEventListener('click', onTurn);
  ui.open.addEventListener('click', () => { if (state === 'book' && gallery) openGallery().then(() => guide(true)); });
  ui.lpPrev.addEventListener('click', () => turnLetter(-1));
  ui.lpNext.addEventListener('click', () => turnLetter(1));
  ui.phPrev.addEventListener('click', () => story && setMain(story.main - 1));
  ui.phNext.addEventListener('click', () => story && setMain(story.main + 1));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!ui.menu.hidden) closeMenu(); else backToGallery(); }
    if (e.key === 'ArrowRight') { if (story) setMain(story.main + 1); else turnLetter(1); }
    if (e.key === 'ArrowLeft') { if (story) setMain(story.main - 1); else turnLetter(-1); }
  });

  // ---------- касание, клик, перетаскивание (карусель) ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setRay(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pick(ev) {
    setRay(ev);
    const hits = ray.intersectObjects(pickables, false).filter((h) => byId[h.object.userData.panel]?.state.reveal > .5);
    return hits.length ? byId[hits[0].object.userData.panel] : null;
  }
  const LIMIT = .42;
  let drag = null, hovered = null, spin = null;
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, a: gallery ? gallery.state.angle : 0, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
    spin && spin.kill();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') rig.setPointer(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1);
    if (drag && state === 'gallery' && gallery) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 8) drag.moved = true;
      if (drag.moved) {
        let a = drag.a + dx / innerWidth * 1.3;
        if (Math.abs(a) > LIMIT) a = Math.sign(a) * (LIMIT + (Math.abs(a) - LIMIT) * .3);
        gallery.state.angle = a;
        const now = performance.now();
        drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT); drag.lastX = e.clientX; drag.lastT = now;
      }
      return;
    }
    if (e.pointerType !== 'mouse' || drag) return;
    const p = state === 'gallery' ? pick(e) : null;
    if (p !== hovered) {
      if (hovered) gsap.to(hovered.state, { hover: 0, duration: .4 });
      if (p && canOpen(p)) gsap.to(p.state, { hover: 1, duration: .45, ease: 'power2.out' });
      hovered = p;
    }
    canvas.style.cursor = p && canOpen(p) ? 'pointer' : '';
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.moved && state === 'gallery' && gallery) {
      const target = THREE.MathUtils.clamp(gallery.state.angle + d.v * 260 / innerWidth * 1.3, -LIMIT, LIMIT);
      spin = gsap.to(gallery.state, { angle: target, duration: 1.2, ease: 'power3.out' });
      return;
    }
    if (state === 'focus' && story) {
      // свайп влево — следующее фото, вправо — предыдущее
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { setMain(story.main + (dx < 0 ? 1 : -1)); return; }
      setRay(e);
      const hit = ray.intersectObjects(story.pickables, false)[0];
      if (hit) { const sp = story.byId[hit.object.userData.panel]; if (sp) setMain(sp.index); }
      return;
    }
    if (state === 'gallery' || state === 'focus') { const p = pick(e); if (p) tryFocus(p); }
  });

  // ---------- начало: вид сверху → название главы → фото проступают на страницах → поднимаются ----------
  rig.jump(topShot());
  const startCh = tale.chapters[chIdx];
  const resumed = Object.keys(viewed).length > 0;
  (async () => {
    await gsap.to('#loading', { autoAlpha: 0, duration: .7, ease: 'sine.inOut' });   // быстрее: сразу после вступления
    if (startCh.type === 'final') {
      await rig.flyTo(bookShot(), { duration: 3, ease: 'power2.inOut', arc: .1 });
      showChapterCard(startCh); await wait(2.4);
      await enterFinal();
      if (!RENDER) startFpsCheck();
      return;
    }
    buildSpread(chIdx, spreadFor(startCh));
    if (resumed) toast(`С возвращением! Продолжим: глава ${startCh.number}`, 3.4);
    showChapterCard(startCh);
    rig.flyTo(bookShot(), { duration: 3, ease: 'power2.inOut', arc: .1 });
    await wait(.5);
    await revealOnPages();
    await wait(.2);
    await openGallery();
    guide(true);
    if (!RENDER) startFpsCheck();
  })();

  // надпись-подсказка держится над подсвеченным фото
  const _iv = new THREE.Vector3();
  function placeInvite() {
    if (!active) return;
    const g = active.group;
    _iv.set(0, active.outerH / 2 + .04, 0).applyQuaternion(g.quaternion).multiplyScalar(g.scale.x).add(g.position).project(camera);
    let top = (1 - _iv.y) / 2 * innerHeight;
    const below = top - (ui.invite.offsetHeight || 60) < 6;
    if (below) {
      _iv.set(0, -active.outerH / 2 - .04, 0).applyQuaternion(g.quaternion).multiplyScalar(g.scale.x).add(g.position).project(camera);
      top = Math.min((1 - _iv.y) / 2 * innerHeight, innerHeight - (ui.invite.offsetHeight || 60) - 6);
    }
    ui.invite.classList.toggle('below', below);
    ui.invite.style.left = Math.max(70, Math.min(innerWidth - 70, (_iv.x + 1) / 2 * innerWidth)) + 'px';
    ui.invite.style.top = top + 'px';
  }

  // ---------- размер окна ----------
  addEventListener('resize', () => {
    if (!innerWidth || !innerHeight) return;         // промежуточный нулевой размер при повороте телефона
    syncCompact();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    if (state === 'gallery' && gallery) rig.jump(galleryShot());
    if (state === 'final') rig.jump(finalShot());
    if (state === 'focus' && story) {
      const { shot } = focusLayout(story.card, null);
      rig.jump(shot);
      story.shot = shot;
      story.basis = stageBasis(shot, story.basis.depth);
      applyStoryLayout(story, false);
      // переход «телефон ⇄ большой экран» (поворот планшета, смена размера окна): записка меняет вид
      if (story.paperShown) { note.opacity = 0; gsap.set(ui.paper, { autoAlpha: 1, y: 0 }); }
      else { gsap.killTweensOf(ui.paper); gsap.set(ui.paper, { autoAlpha: 0 }); ui.paper.hidden = true; }
      if (story.noteShown) { placeNoteAt(story.notePos, story.basis.q); note.draw(1); note.opacity = 1; }
      return;
    }
    if (state === 'focus' && current && current.isLetter && isCompact()) {
      const { shot } = focusLayout(current, null);
      rig.jump(shot);
      setPaper({ title: current.data.title, text: letterCache[current.data.letter] || '', author: current.data.from }, letterRect());
      return;
    }
    if (state === 'focus' && current) {
      const it = current.data;
      let size = null;
      if (current.isLetter) size = setLetterPage();
      else if (it.text || (it.title && !it.audio)) size = note.setContent({ title: it.title, text: it.text, author: it.author }, Math.abs(current.pagePos.x * 100) | 0, noteWidth());
      if (size) note.draw(1);
      const { shot, notePos, dir } = focusLayout(current, size);
      rig.jump(shot); if (size) placeNote(notePos, shot, dir);
    }
  });

  // ---------- проверка скорости ----------
  let fps = 0;
  function startFpsCheck() {
    let frames = 0; const t0 = performance.now();
    const count = () => {
      frames++;
      const dt = performance.now() - t0;
      if (dt < 2500) { requestAnimationFrame(count); return; }
      fps = frames / (dt / 1000);
      if (fps < 26 && quality.name !== 'low' && !document.hidden) {     // 30 кадров/с — норма для iPhone в энергосбережении
        quality = lower(quality);
        renderer.setPixelRatio(Math.min(devicePixelRatio, quality.dpr));
        if (!quality.shadows) {
          renderer.shadowMap.enabled = false; world.setShadows(false);
          scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
        }
        console.info(`[kniga] ${fps.toFixed(0)} кадров/с — качество понижено до «${quality.name}»`);
      }
    };
    requestAnimationFrame(count);
  }

  // ---------- кадр ----------
  function frame(t, dt) {
    if (gallery) gallery.update(t);
    for (const p of panels) p.update(t);
    if (story) updateStory(story, t);
    if (closingStory) updateStory(closingStory, t);
    world.particles.update(dt, t);
    rig.update(t);
    if (active) placeInvite();
    const d = camera.position.distanceTo(rig.target);
    scene.fog.near = d + 2.5; scene.fog.far = d + 10;
    renderer.render(scene, camera);
  }
  let renderBase = 0;
  if (RENDER) {
    // покадровая запись: время GSAP задаём только мы (ticker.sleep не годится — новые анимации его будят)
    gsap.ticker.remove(gsap.updateRoot);
    renderBase = gsap.ticker.time;
  } else {
    const timer = new THREE.Timer();
    timer.connect(document);
    renderer.setAnimationLoop(() => { timer.update(); frame(timer.getElapsed(), Math.min(timer.getDelta(), .05)); });
  }

  // для проверки из консоли
  window.__kniga = {
    THREE, camera, renderer, scene, rig, story: tale, progress,
    state: () => state, chapter: () => chIdx, spread: () => spIdx, current: () => current?.id, active: () => active?.id,
    quality: () => quality.name, fps: () => fps,
    focus: (id) => byId[id] && tryFocus(byId[id]), back: backToGallery, turn: onTurn, goTo, openMenu,
    letterPage: (d) => turnLetter(d), sv: () => story, sound, setMain: (i) => setMain(i),
    panels: () => panels.map((p) => ({ id: p.id, seen: p.state.seen, locked: p.state.locked, invite: p.state.invite })),
    // capture = false — только отрисовать (запись сама возьмёт кадр с холста), так быстрее
    renderAt(t, dt, capture = true) { gsap.updateRoot(renderBase + t); frame(t, dt); return capture ? canvas.toDataURL('image/jpeg', .9) : null; }
  };
})();

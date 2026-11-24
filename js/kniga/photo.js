// Фото-панель (полароид): лежит на странице книги, затем отделяется, по дуге поднимается в галерею,
// по пути встаёт из горизонтали в вертикаль и разворачивается лицом к зрителю.
// Снимок «проявляется» из золотых искр (шейдер растворения), вокруг — тёплое свечение.
import * as THREE from 'three';
import { placeholderTexture, blobTexture, haloTexture, polaroidTexture, envelopeTexture, stickerTexture, coverTexture2 } from './textures.js';

const CARD_T = .012;       // толщина карточки-полароида
const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
let blob, halo, sticker;
const hashId = (id) => [...String(id)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1000;   // свой узор у каждого фото

function rect(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
  return s;
}
function ring(ow, oh, iw, ih) {
  const s = rect(ow, oh), p = new THREE.Path();
  p.moveTo(-iw / 2, -ih / 2); p.lineTo(-iw / 2, ih / 2); p.lineTo(iw / 2, ih / 2); p.lineTo(iw / 2, -ih / 2); p.closePath();
  s.holes.push(p);
  return s;
}

// снимок: без освещения (светится сам, как голограмма), с растворением по шуму и золотым краем
function pictureMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map }, uReveal: { value: 1 }, uOpacity: { value: 1 },
      uBright: { value: 1 }, uEdge: { value: new THREE.Color(1.0, .78, .42) }
    },
    transparent: true,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uReveal, uOpacity, uBright; uniform vec3 uEdge;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float n = noise(vUv * 7.0) * .65 + noise(vUv * 23.0) * .35;
        float r = uReveal * 1.25 - .12;
        if (n > r) discard;
        vec3 col = texture2D(map, vUv).rgb * uBright;
        float edge = 1.0 - smoothstep(0.0, .09, r - n);         // золотой край проявления
        col = mix(col, uEdge * 2.2, edge * step(uReveal, .999));
        // лёгкое тёплое свечение по краю снимка
        vec2 d = min(vUv, 1.0 - vUv);
        col += uEdge * .05 * (1.0 - smoothstep(0.0, .05, min(d.x, d.y)));
        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

// data: { id, kind: 'story'|'letter'|'photo', image, img?, caption?, title, w, h, from, stack?, page: {x, z, rot} | fromPose: {pos, quat, scale} }
//   img      — уже загруженная картинка (фото мини-главы грузятся заранее, чтобы знать их пропорции)
//   caption  — подпись от руки на нижнем поле полароида
//   stack    — сколько карточек «стопки» показать за полароидом (у мини-главы с несколькими фото)
//   fromPose — откуда фото «вылетает» (из карточки мини-главы), вместо места на странице
export function createPanel(data, { shadows }, pageY) {
  blob = blob || blobTexture();
  halo = halo || haloTexture();
  sticker = sticker || stickerTexture();
  const isLetter = data.kind === 'letter';
  const { w, h } = data;
  // карточка-полароид: узкие поля сверху и по бокам, широкое снизу
  const S = Math.max(.04, .075 * Math.min(w, h)), T = S, B = S * 3.2;
  const ow = w + 2 * S, oh = h + T + B;

  // панель собрана «лицом вперёд» (+Z), как картина на стене
  const group = new THREE.Group();
  group.name = 'panel-' + data.id;

  // письмо — конверт во всю карточку, фото — полароид с окном под снимок
  const letterW = w + 2 * S, letterH = h + T + S;
  const polaroid = isLetter ? envelopeTexture(letterW, letterH, false, data.from) : polaroidTexture(ow, oh, { x: S, y: T, w, h }, hashId(data.id), data.caption || '');
  const frontMat = new THREE.MeshStandardMaterial({
    map: polaroid, emissiveMap: polaroid,          // подсветка по самому рисунку — чёрные веточки остаются тёмными
    roughness: .62, metalness: 0, emissive: 0xffffff, emissiveIntensity: .3
  });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf3efe8, roughness: .7 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: .8 });
  const cardW = isLetter ? letterW : ow, cardH = isLetter ? letterH : oh;
  const card = new THREE.Mesh(new THREE.BoxGeometry(cardW, cardH, CARD_T), [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
  card.position.z = -CARD_T / 2;

  // снимок: сначала заглушка, настоящее фото подгружается только для текущего разворота;
  // если файла нет — остаётся аккуратная заглушка с именем файла, а глава работает дальше
  const hue = (hashId(data.id) * 137) % 360;          // у каждой заглушки свой цвет
  const fileName = (data.image || '').split('/').pop();
  const picMat = pictureMaterial(placeholderTexture({ label: data.title || 'Воспоминание', hue }, w, h));
  let disposed = false;
  const setPic = (t) => { const old = picMat.uniforms.map.value; picMat.uniforms.map.value = t; if (old && old !== t) old.dispose(); };
  if (!isLetter && data.img && data.img.naturalWidth) {
    picMat.uniforms.map.value.dispose();
    picMat.uniforms.map.value = coverTexture2(data.img, w, h);
  } else if (!isLetter && data.image) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { if (!disposed) setPic(coverTexture2(img, w, h)); };
    img.onerror = () => { if (!disposed) setPic(placeholderTexture({ label: `${fileName} — файла пока нет`, hue }, w, h)); console.info(`[kniga] фото не найдено: ${data.image}`); };
    img.src = data.image;
  }
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), picMat);
  pic.position.set(0, (B - T) / 2, .0012);          // окно полароида выше центра карточки
  pic.visible = !isLetter;

  // золотая звёздочка в углу — «уже открыто»
  const stickMat = new THREE.MeshBasicMaterial({ map: sticker, transparent: true, opacity: 0, depthWrite: false });
  const stick = new THREE.Mesh(new THREE.PlaneGeometry(.085, .085), stickMat);
  stick.position.set(cardW / 2 - .06, -cardH / 2 + .06, .002);

  // мягкое тёплое свечение за карточкой
  const haloMat = new THREE.MeshBasicMaterial({ map: halo, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(cardW * 1.8, cardH * 1.7), haloMat);
  glow.position.z = -CARD_T - .01;
  glow.renderOrder = -1;

  group.add(glow, card, pic, stick);
  // «стопка»: за карточкой мини-главы видны края ещё нескольких фото
  const stackMat = data.stack ? new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: .7 }) : null;
  for (let i = 0; i < (data.stack || 0); i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(cardW * .97, cardH * .97, CARD_T * .8), stackMat);
    const sgn = i % 2 ? -1 : 1;
    b.position.set(sgn * (.018 + i * .01), .012 + i * .008, -CARD_T * (1.4 + i * 1.1));
    b.rotation.z = sgn * (.06 + i * .035);
    b.castShadow = shadows;
    b.userData.panel = data.id;
    group.add(b);
  }
  card.castShadow = shadows; card.receiveShadow = true;
  for (const m of [card, pic]) m.userData.panel = data.id;

  // ---------- позы ----------
  const fp = data.fromPose;
  const page = data.page || { x: fp ? fp.pos.x : 0, z: fp ? fp.pos.z : 0, rot: 0 };
  const pageScale = fp ? fp.scale : (data.pageScale || .46);
  const qPage = fp ? fp.quat.clone() : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (page.rot || 0) * DEG, 0))
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));   // лицом вверх, верх снимка — к дальнему краю книги
  const pPage = fp ? fp.pos.clone() : new THREE.Vector3(page.x, pageY(page.x) + CARD_T * pageScale + .003, page.z);

  // тень на бумаге, пока фото лежит
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x1c0e04, alphaMap: blob, transparent: true, depthWrite: false });
  const blobMesh = new THREE.Mesh(new THREE.PlaneGeometry(cardW * pageScale * 1.5, cardH * pageScale * 1.5).rotateX(-Math.PI / 2), blobMat);
  blobMesh.position.set(page.x + .015, pageY(page.x) + .002, page.z - .01);
  blobMesh.rotation.y = (page.rot || 0) * DEG;
  blobMesh.renderOrder = 1;
  blobMesh.visible = !fp;          // у фото, вылетающих из карточки, тени на странице нет

  const state = { reveal: 1, out: 0, focus: 0, dim: 0, hover: 0, invite: 0, seen: 0, locked: 0, size: 1, phase: page.x * 3.1 + page.z * 5.3 + (data.phase || 0) };
  const slotPos = new THREE.Vector3(), slotQ = new THREE.Quaternion();
  const c1 = new THREE.Vector3(), c2 = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  const mats = [frontMat, edgeMat, backMat];

  function bezier(a, b, c, d, t, out) {
    const u = 1 - t;
    return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
  }
  const smooth = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };

  return {
    id: data.id, data, group, blob: blobMesh, state, w, h, outerW: cardW, outerH: cardH, isLetter,
    pickables: [card, pic, ...group.children.filter((m) => m !== card && m !== pic && m.userData.panel)],
    pagePos: pPage,
    // место в галерее (мировые координаты), задаёт gallery.js каждый кадр
    setSlot(p, q) { slotPos.copy(p); slotQ.copy(q); },
    slotPose() { return { position: slotPos.clone(), quaternion: slotQ.clone() }; },
    // поза в момент открытия (чуть ближе к зрителю) — для расчёта кадра
    focusPose() {
      fwd.set(0, 0, 1).applyQuaternion(slotQ);
      return { position: slotPos.clone().addScaledVector(fwd, .14), quaternion: slotQ.clone() };
    },
    // конверт: открыть/закрыть клапан
    setOpen(open) {
      if (!isLetter) return;
      const t = envelopeTexture(letterW, letterH, open, data.from);
      const old = frontMat.map; frontMat.map = t; frontMat.emissiveMap = t; frontMat.needsUpdate = true; old.dispose();
    },
    dispose() {
      disposed = true;
      const seenMats = new Set();
      for (const o of [group, blobMesh]) o.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        for (const mt of [].concat(m.material || [])) {
          if (seenMats.has(mt)) continue; seenMats.add(mt);
          if (mt.map && mt.map !== blob && mt.map !== halo && mt.map !== sticker) mt.map.dispose();
          if (mt.uniforms && mt.uniforms.map && mt.uniforms.map.value) mt.uniforms.map.value.dispose();
          mt.dispose();
        }
      });
      group.removeFromParent(); blobMesh.removeFromParent();
    },
    update(t) {
      const o = state.out;
      // путь: сначала вверх от страницы, потом вперёд к своему месту
      c1.copy(pPage).add(tmp.set(0, .75, .1));
      fwd.set(0, 0, 1).applyQuaternion(slotQ);
      c2.copy(slotPos).addScaledVector(fwd, .55).add(tmp.set(0, -.35, 0));
      bezier(pPage, c1, c2, slotPos, o, group.position);
      // поворот: к середине пути фото уже почти вертикально, в конце — точно к зрителю
      qTmp.copy(qPage).slerp(slotQ, smooth(.05, .72, o));
      group.quaternion.copy(qTmp);
      const s = pageScale + (1 - pageScale) * smooth(.1, .9, o);
      const pulse = .5 + .5 * Math.sin(t * 3.6);                 // «нажми меня»: мягко увеличивается и уменьшается
      group.scale.setScalar(s * (1 + state.invite * .09 * pulse) * (1 + (state.size - 1) * smooth(.1, .9, o)));
      // в галерее — лёгкое «парение»; при открытии — шаг навстречу зрителю
      if (o > 0) {
        group.position.y += Math.sin(t * .7 + state.phase) * .012 * smooth(.85, 1, o) * (1 - state.focus);
        group.position.addScaledVector(fwd, state.focus * (fp ? .015 : .14) + state.hover * .05);   // фото истории уже стоит на своём месте — шагает чуть-чуть
      }
      // яркость: в фокусе — ярче, остальные приглушаются
      const vis = (1 - state.dim * .8) * (1 - state.locked * .38);   // ещё не открытые по очереди — чуть приглушены
      picMat.uniforms.uReveal.value = state.reveal;
      picMat.uniforms.uOpacity.value = vis;
      picMat.uniforms.uBright.value = (o > .02 ? 1.06 : .97) + state.focus * .06 + state.hover * .08;
      for (const m of mats) { m.transparent = vis < .999; m.opacity = vis * smooth(.35, .85, state.reveal); }
      frontMat.emissiveIntensity = .3 + o * .1 + state.hover * .25 + state.focus * .1;
      haloMat.opacity = (o * .38 + state.hover * .25 + state.focus * .25 + state.invite * (.35 + .45 * pulse)) * vis * state.reveal;
      blobMat.opacity = .55 * (1 - smooth(0, .15, o)) * smooth(.3, .9, state.reveal);
      group.visible = state.reveal > .01;
      stickMat.opacity = state.seen * vis * smooth(.6, 1, o) * state.reveal;
      const cast = shadows && o < .2;                 // в воздухе тень на стол не нужна — только пока фото у страницы
      card.castShadow = cast;
    }
  };
}

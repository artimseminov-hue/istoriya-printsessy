// Раскрытая книга как физический предмет: кожаная обложка со скруглёнными краями и золотыми уголками,
// толстый блок страниц со слоистым обрезом и скруглённым внешним краем, выраженный корешок с капталами,
// изогнутые к корешку страницы и шёлковая лента-закладка.
// Книга лежит в плоскости XZ, корешок — вдоль оси Z при x = 0, страницы смотрят в +Y.
import * as THREE from 'three';
import { pageTexture, paperBump, pageEdgeTexture, coverTexture, leatherBump, giltTexture } from './textures.js?v=20261124202948';

export const PAGE_W = 1.5;    // ширина одной страницы
export const PAGE_D = 2.0;    // высота страницы (вдоль Z)
const COVER_T = .05;          // толщина обложки
const COVER_W = PAGE_W * 2 + .28, COVER_D = PAGE_D + .22;

// высота бумаги над столом: u — 0 у корешка, 1 у внешнего края
export function pageHeight(u) {
  let h = COVER_T + .045 + .15 * (1 - Math.exp(-u * 7)) - .035 * u * u;
  if (u > .94) { const k = (u - .94) / .06; h -= .028 * k * k; }   // скруглённый обрез
  return h;
}
export const surfaceY = (x) => pageHeight(Math.min(1, Math.abs(x) / PAGE_W));

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function createBook(quality) {
  const { shadows } = quality;
  const texSize = quality.name === 'low' ? 768 : 1024;
  const book = new THREE.Group();
  book.name = 'book';

  // ---------- обложка ----------
  const coverMap = coverTexture();
  coverMap.repeat.set(1 / COVER_W, 1 / COVER_D); coverMap.offset.set(.5, .5);
  const lBump = leatherBump();
  const leatherTop = new THREE.MeshStandardMaterial({ map: coverMap, bumpMap: lBump, bumpScale: 1.2, roughness: .62, metalness: .05 });
  const leatherSide = new THREE.MeshStandardMaterial({ color: 0x1a2150, bumpMap: lBump, bumpScale: 1.2, roughness: .6 });
  const coverGeo = new THREE.ExtrudeGeometry(roundedRect(COVER_W, COVER_D, .07), {
    depth: COVER_T - .016, bevelEnabled: true, bevelThickness: .008, bevelSize: .012, bevelSegments: 3, curveSegments: 6
  });
  coverGeo.rotateX(-Math.PI / 2);
  coverGeo.translate(0, .008, 0);
  const cover = new THREE.Mesh(coverGeo, [leatherTop, leatherSide]);
  cover.receiveShadow = true; cover.castShadow = shadows;
  book.add(cover);

  // ---------- корешок: скруглённый «горб» кожи, виден сверху и снизу книги ----------
  const spineGeo = new THREE.CylinderGeometry(.075, .075, COVER_D - .02, 24, 1, false, -Math.PI / 2, Math.PI);
  spineGeo.rotateX(-Math.PI / 2);   // полуцилиндр выпуклостью вверх
  const spine = new THREE.Mesh(spineGeo, leatherSide);
  spine.position.y = COVER_T - .005;
  spine.castShadow = shadows; spine.receiveShadow = true;
  book.add(spine);

  // капталы — полосатые валики на концах блока страниц
  const hbCanvas = document.createElement('canvas'); hbCanvas.width = 64; hbCanvas.height = 8;
  const hx = hbCanvas.getContext('2d');
  for (let i = 0; i < 16; i++) { hx.fillStyle = i % 2 ? '#d8b25c' : '#7c1a2b'; hx.fillRect(i * 4, 0, 4, 8); }
  const hbTex = new THREE.CanvasTexture(hbCanvas); hbTex.colorSpace = THREE.SRGBColorSpace;
  const hbMat = new THREE.MeshStandardMaterial({ map: hbTex, roughness: .5 });
  for (const zs of [-1, 1]) {
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .1, 10).rotateZ(Math.PI / 2), hbMat);
    hb.position.set(0, pageHeight(0) - .02, zs * (PAGE_D / 2 + .004));
    book.add(hb);
  }

  // ---------- блок страниц: профиль вытянут вдоль Z, обрез со «слоями» ----------
  const edgeMap = pageEdgeTexture();
  edgeMap.repeat.set(1, 3.2);
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeMap, roughness: .95 });
  const bump = paperBump();
  for (const side of ['left', 'right']) {
    const s = side === 'left' ? -1 : 1;
    const shape = new THREE.Shape();
    const N = 48;
    shape.moveTo(0, COVER_T);
    for (let i = 0; i <= N; i++) { const u = i / N; shape.lineTo(s * u * PAGE_W, pageHeight(u) - .003); }
    shape.lineTo(s * PAGE_W, COVER_T + .006);
    shape.closePath();
    const stackGeo = new THREE.ExtrudeGeometry(shape, { depth: PAGE_D, bevelEnabled: false, curveSegments: 1 });
    stackGeo.translate(0, 0, -PAGE_D / 2);
    const stack = new THREE.Mesh(stackGeo, edgeMat);
    stack.receiveShadow = true; stack.castShadow = shadows;
    book.add(stack);

    // верхний лист повторяет изгиб
    const seg = 72;
    const geo = new THREE.PlaneGeometry(PAGE_W, PAGE_D, seg, 4);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i) + PAGE_W / 2;
      const u = side === 'left' ? 1 - lx / PAGE_W : lx / PAGE_W;
      pos.setX(i, side === 'left' ? lx - PAGE_W : lx);
      pos.setY(i, pageHeight(u));
    }
    geo.computeVertexNormals();
    const page = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: pageTexture(side, texSize), bumpMap: bump, bumpScale: .9, roughness: .86
    }));
    page.receiveShadow = true;
    page.name = 'page-' + side;
    book.add(page);
  }

  // ---------- золотые уголки на обложке ----------
  const gold = new THREE.MeshStandardMaterial({ color: 0xffe2a0, map: giltTexture(), metalness: .4, roughness: .3, emissive: 0xffb950, emissiveIntensity: .08, side: THREE.DoubleSide });
  const tri = new THREE.Shape();
  const cs = .2;
  tri.moveTo(0, 0); tri.lineTo(cs, 0); tri.quadraticCurveTo(cs * .45, cs * .45, 0, cs); tri.closePath();
  const triGeo = new THREE.ExtrudeGeometry(tri, { depth: .004, bevelEnabled: true, bevelThickness: .003, bevelSize: .004, bevelSegments: 2 });
  triGeo.rotateX(-Math.PI / 2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = new THREE.Mesh(triGeo, gold);
    m.position.set(sx * (COVER_W / 2 - .004), COVER_T + .002, sz * (COVER_D / 2 - .004));
    m.scale.set(-sx, 1, sz);          // уголок смотрит внутрь книги
    m.castShadow = shadows;
    book.add(m);
  }

  // ---------- лента-закладка: от корешка через правую страницу и вниз на стол ----------
  const pts = [];
  const path = [[.03, -1.02], [.06, -.55], [.1, -.05], [.14, .5], [.17, .96]];
  for (const [x, z] of path) pts.push(new THREE.Vector3(x, surfaceY(x) + .004, z));
  pts.push(new THREE.Vector3(.18, surfaceY(.18) - .03, 1.03));
  pts.push(new THREE.Vector3(.19, COVER_T + .02, 1.1));
  pts.push(new THREE.Vector3(.2, .004, 1.24));
  pts.push(new THREE.Vector3(.13, .003, 1.46));
  const curve = new THREE.CatmullRomCurve3(pts);
  const NS = 90, RW = .034;
  const rp = new Float32Array((NS + 1) * 2 * 3), ruv = new Float32Array((NS + 1) * 2 * 2), idx = [];
  const T = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, p = curve.getPointAt(t);
    curve.getTangentAt(t, T);
    side.crossVectors(T, up).normalize().multiplyScalar(RW / 2);
    rp.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
    ruv.set([0, t, 1, t], i * 4);
    if (i < NS) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rg.setAttribute('uv', new THREE.BufferAttribute(ruv, 2));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  const ribbon = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x5e0d1f, roughness: .42, metalness: .08, side: THREE.DoubleSide }));
  ribbon.castShadow = shadows; ribbon.receiveShadow = true;
  book.add(ribbon);

  return book;
}

// ---------- перелистывание страницы ----------
// Лист (с лицом правой страницы и оборотом левой) поворачивается вокруг корешка и при этом изгибается:
// внешний край чуть отстаёт, как у настоящей бумаги. p: 0 — лежит справа, 1 — лёг слева.
export function createPageFlip(quality) {
  const texSize = quality.name === 'low' ? 768 : 1024;
  const SX = 40, SZ = 6;
  const geo = new THREE.PlaneGeometry(PAGE_W, PAGE_D, SX, SZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(PAGE_W / 2, 0, 0);                    // x: 0 (корешок) … PAGE_W (внешний край)
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  const front = new THREE.MeshStandardMaterial({ map: pageTexture('right', texSize), roughness: .86, side: THREE.FrontSide });
  const backMap = pageTexture('left', texSize);
  backMap.wrapS = THREE.RepeatWrapping; backMap.repeat.x = -1; backMap.offset.x = 1;   // оборот виден зеркально
  const back = new THREE.MeshStandardMaterial({ map: backMap, roughness: .86, side: THREE.BackSide });
  const group = new THREE.Group();
  const mFront = new THREE.Mesh(geo, front), mBack = new THREE.Mesh(geo, back);
  mFront.castShadow = mBack.castShadow = quality.shadows;
  group.add(mFront, mBack);
  group.visible = false;

  const state = { p: 0 };
  function update() {
    const p = state.p;
    for (let i = 0; i < pos.count; i++) {
      const lx = base[i * 3], z = base[i * 3 + 2];
      const u = lx / PAGE_W;
      const a = Math.min(Math.PI, Math.max(0, Math.PI * p - .5 * Math.sin(Math.PI * p) * u));
      const h = pageHeight(u) + .006;
      pos.setXYZ(i, Math.cos(a) * lx, h + Math.sin(a) * lx * .85, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // dir: 1 — вперёд (справа налево), -1 — назад
  function flip(dir = 1, duration = 1.9) {
    group.visible = true;
    state.p = dir > 0 ? 0 : 1;
    update();
    return gsap.to(state, {
      p: dir > 0 ? 1 : 0, duration, ease: 'power2.inOut',
      onUpdate: update, onComplete: () => { group.visible = false; }
    });
  }
  return { mesh: group, flip };
}

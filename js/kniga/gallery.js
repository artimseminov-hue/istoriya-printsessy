// Галерея воспоминаний: панели стоят на дуге вокруг зрителя в три слоя по глубине,
// из книги поднимается тёплый луч.
// Вся дуга поворачивается вокруг зрителя, как карусель (свайп / перетаскивание).
import * as THREE from 'three';
import { rng, beamTexture } from './textures.js';

const DEG = Math.PI / 180;
export const VIEWER = new THREE.Vector3(0, 1.45, 5.2);    // точка, к которой повёрнуты все панели

// слои: радиус от зрителя, угловой размах, диапазон высот
const LAYERS = [
  { R: 4.35, span: 50, y: [.95, 1.3] },
  { R: 5.15, span: 58, y: [1.45, 1.95] },
  { R: 5.95, span: 50, y: [2.05, 2.5] }
];

// раскладываем n панелей по слоям: ближний ~30%, средний ~40%, дальний ~30%
export function layoutSlots(panels, seed = 1) {
  const r = rng(seed);
  const n = panels.length;
  const counts = [Math.round(n * .3), 0, Math.round(n * .3)];
  counts[1] = n - counts[0] - counts[2];
  const slots = [];
  let k = 0;
  LAYERS.forEach((L, li) => {
    const c = counts[li];
    for (let i = 0; i < c; i++, k++) {
      const a = (c === 1 ? 0 : (i / (c - 1) - .5) * L.span) + (r() - .5) * 7 + (li === 1 ? 0 : (r() - .5) * 6);
      const y = L.y[0] + r() * (L.y[1] - L.y[0]);
      const yaw = r() < .55 ? (r() < .5 ? -1 : 1) * (6 + r() * 9) : 0;        // часть панелей чуть развёрнута — объём
      slots.push({ angle: a * DEG, R: L.R, y, yaw: yaw * DEG, layer: li });
    }
  });
  // ближние — к краям, чтобы не закрывать дальние по центру: сортировка не нужна, дуги разной ширины
  return panels.map((p, i) => ({ panel: p, base: slots[i] }));
}

export function createGallery(scene, panels, bookTop) {
  const items = layoutSlots(panels, 7);
  const state = { angle: 0, open: 0 };          // angle — поворот карусели, open — насколько раскрыта галерея
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), qYaw = new THREE.Quaternion();

  function slotWorld(base, angle, outPos, outQ) {
    const a = base.angle + angle;
    outPos.set(VIEWER.x + Math.sin(a) * base.R, base.y, VIEWER.z - Math.cos(a) * base.R);
    m.lookAt(VIEWER.clone().setY(base.y + (VIEWER.y - base.y) * .35), outPos, new THREE.Vector3(0, 1, 0));   // +Z панели — к зрителю, верх — вверх
    outQ.setFromRotationMatrix(m).multiply(qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), base.yaw));
  }

  // ---------- тёплый луч из книги ----------
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 1.25, 2.8, 40, 1, true),
    new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false })
  );
  beam.position.set(0, bookTop + 1.4, 0);
  beam.renderOrder = -2;
  scene.add(beam);

  function update(t) {
    for (const it of items) {
      slotWorld(it.base, state.angle, pos, q);
      it.panel.setSlot(pos, q);
    }
    beam.material.opacity = state.open * (.16 + Math.sin(t * .9) * .03);
    beam.rotation.y = t * .05;
  }

  // точки для общего кадра галереи: углы всех панелей на своих местах + передний край книги
  function framePoints(bookPts) {
    const pts = [...bookPts];
    for (const it of items) {
      slotWorld(it.base, state.angle, pos, q);
      const hw = it.panel.outerW / 2, hh = it.panel.outerH / 2;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(new THREE.Vector3(sx * hw, sy * hh, 0).applyQuaternion(q).add(pos));
    }
    return pts;
  }

  // при смене разворота: убрать луч и освободить память видеокарты
  function dispose() {
    beam.removeFromParent();
    beam.geometry.dispose(); beam.material.map.dispose(); beam.material.dispose();
  }

  return { items, state, update, framePoints, dispose };
}

// «Оператор»: настоящая 3D-камера Three.js. Кадр строится по проекциям углов объектов (ничего не обрезается,
// учитывается место под кнопки), перелёт — по дуге: взгляд опережает движение, мягкий разгон и торможение,
// лёгкий «наезд» объективом в середине пути. На остановке камера чуть дышит и медленно плывёт.
import * as THREE from 'three';

const V = () => new THREE.Vector3();

export function createRig(camera) {
  // «верх» камеры зависит от того, куда она смотрит: глядя сверху на книгу — наклонён к дальнему краю
  // (иначе камера заваливается набок), глядя на галерею почти горизонтально — обычный «верх» +Y
  const UP_TOP = new THREE.Vector3(0, .45, -1).normalize(), UP_Y = new THREE.Vector3(0, 1, 0);
  function upFor(dir, out = new THREE.Vector3()) {        // dir — от цели к камере
    const d = dir.clone().normalize();
    const k = THREE.MathUtils.smoothstep(d.y, .55, .9);  // .55 и ниже — горизонтально, .9 и выше — сверху
    return out.copy(UP_Y).lerp(UP_TOP, k).normalize();
  }
  camera.up.copy(UP_TOP);
  const baseFov = camera.fov;
  const pos = V(), target = V();
  const from = { pos: V(), target: V() }, to = { pos: V(), target: V() };
  const ctrl = V();
  const fly = { t: 1 };
  let dur = 1, easePos = gsap.parseEase('power2.inOut'), easeTgt = gsap.parseEase('power3.inOut');
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let tween = null;

  function shot(targetPos, dir, dist) {
    return { target: targetPos.clone(), pos: targetPos.clone().addScaledVector(dir.clone().normalize(), dist) };
  }

  // ---------- кадрирование по точкам ----------
  const probe = new THREE.PerspectiveCamera();
  const ndc = V(), right = V(), upv = V();
  function frameBox(points, tgt, dir, d) {
    probe.fov = baseFov; probe.aspect = camera.aspect; probe.near = .01; probe.far = 100; upFor(dir, probe.up);
    probe.position.copy(tgt).addScaledVector(dir, d);
    probe.lookAt(tgt); probe.updateMatrixWorld(); probe.updateProjectionMatrix();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of points) {
      ndc.copy(p).project(probe);
      x0 = Math.min(x0, ndc.x); x1 = Math.max(x1, ndc.x); y0 = Math.min(y0, ndc.y); y1 = Math.max(y1, ndc.y);
    }
    return { x0, x1, y0, y1 };
  }
  // insets — отступы в пикселях (сверху место для заголовка, снизу — для кнопок)
  function fit(points, dir, { top = 24, bottom = 24, left = 24, right: r = 24 } = {}) {
    dir = dir.clone().normalize();
    const W = innerWidth, H = innerHeight;
    const sx0 = -1 + 2 * left / W, sx1 = 1 - 2 * r / W, sy0 = -1 + 2 * bottom / H, sy1 = 1 - 2 * top / H;
    const tgt = V();
    for (const p of points) tgt.add(p);
    tgt.divideScalar(points.length);
    let d = 3;
    for (let pass = 0; pass < 3; pass++) {
      // расстояние: самый близкий кадр, в который всё помещается
      let lo = .2, hi = 40;
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2, b = frameBox(points, tgt, dir, mid);
        const ok = (b.x1 - b.x0) <= (sx1 - sx0) && (b.y1 - b.y0) <= (sy1 - sy0) && b.x0 > -1.5 && b.x1 < 1.5;
        ok ? (hi = mid) : (lo = mid);
      }
      d = hi;
      // центрируем содержимое в «безопасной» области экрана
      const b = frameBox(points, tgt, dir, d);
      const dx = (sx0 + sx1) / 2 - (b.x0 + b.x1) / 2, dy = (sy0 + sy1) / 2 - (b.y0 + b.y1) / 2;
      const hh = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * d, hw = hh * camera.aspect;
      probe.matrixWorld.extractBasis(right, upv, ndc);
      tgt.addScaledVector(right, -dx * hw).addScaledVector(upv, -dy * hh);
    }
    return { target: tgt, pos: tgt.clone().addScaledVector(dir, d) };
  }

  function jump(s) {
    tween && tween.kill();
    fly.t = 1;
    from.pos.copy(s.pos); from.target.copy(s.target);
    to.pos.copy(s.pos); to.target.copy(s.target);
    ctrl.copy(s.pos);
  }

  // перелёт по дуге: камера чуть отъезжает и поднимается в середине пути, взгляд опережает движение
  function flyTo(s, { duration = 2.4, ease = 'power2.inOut', arc = .3, onComplete } = {}) {
    tween && tween.kill();
    from.pos.copy(pos); from.target.copy(target);
    to.pos.copy(s.pos); to.target.copy(s.target);
    const mid = from.pos.clone().lerp(to.pos, .5);
    const span = from.pos.distanceTo(to.pos);
    const away = mid.clone().sub(from.target.clone().lerp(to.target, .5)).normalize();
    ctrl.copy(mid).addScaledVector(away, span * arc).add(new THREE.Vector3(0, span * arc * .45, 0));
    dur = duration;
    easePos = gsap.parseEase(ease);
    fly.t = 0;
    tween = gsap.to(fly, { t: 1, duration, ease: 'none', onComplete });
    return tween;
  }

  const tmpA = V(), tmpB = V();
  function update(t) {
    const p = easePos(fly.t);
    const tp = easeTgt(Math.min(1, fly.t / .82));        // взгляд приходит на место чуть раньше камеры
    const q = 1 - p;
    pos.set(0, 0, 0).addScaledVector(from.pos, q * q).addScaledVector(ctrl, 2 * q * p).addScaledVector(to.pos, p * p);
    target.copy(from.target).lerp(to.target, tp);
    if (!Number.isFinite(pos.x + pos.y + pos.z)) pos.copy(to.pos);   // страховка от неверных чисел

    // «наезд» объективом посреди перелёта
    const fov = baseFov * (1 - .05 * Math.sin(Math.PI * fly.t));
    if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }

    pointer.sx += (pointer.x - pointer.sx) * .035;
    pointer.sy += (pointer.y - pointer.sy) * .035;
    const d = pos.distanceTo(target);
    tmpA.set(
      Math.sin(t * .31) * .005 + Math.sin(t * .06) * .012 + pointer.sx * .03,
      Math.sin(t * .23) * .0035 - pointer.sy * .018,
      Math.cos(t * .19) * .004
    ).multiplyScalar(d);
    camera.position.copy(pos).add(tmpA);
    tmpB.copy(target).addScaledVector(tmpA, .2);
    upFor(dirTmp.subVectors(camera.position, tmpB), camera.up);
    camera.lookAt(tmpB);
  }
  const dirTmp = V();

  return {
    shot, fit, jump, flyTo, update, upFor,
    get flying() { return fly.t < 1; },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    get position() { return pos; },
    get target() { return target; },
    debug: () => ({ t: fly.t, from: from.pos.toArray(), to: to.pos.toArray(), ctrl: ctrl.toArray() })
  };
}

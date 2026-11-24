// Стол, свет и частицы. Тёплая «лампа» слева светит конусом: книга в пятне света, края стола уходят в темноту.
// Частиц немного: пылинки над книгой, несколько размытых огоньков ближе к камере (глубина) и всплески при появлении фото.
import * as THREE from 'three';
import { woodTexture, sparkTexture, bokehTexture } from './textures.js';

const NIGHT = 0x0b0a1f;

export function createWorld(scene, quality) {
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.Fog(NIGHT, 5.5, 13);

  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 12),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: .58, metalness: 0 })
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  // вечерний фон: лиловое «небо» и тёплый отсвет снизу, слабо — чтобы тени были глубокими
  scene.add(new THREE.HemisphereLight(0x7f86d8, 0x2a1609, .42));

  // лампа: тёплый конус с мягким краем и мягкими тенями
  const key = new THREE.SpotLight(0xffc98c, 135, 0, .62, .85, 2);
  key.position.set(-2.9, 5.4, 2.3);
  key.target.position.set(.2, 0, -.05);
  key.castShadow = quality.shadows;
  key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  key.shadow.camera.near = 3; key.shadow.camera.far = 11;
  key.shadow.bias = -.0003;
  key.shadow.normalBias = .02;
  key.shadow.radius = 6;
  scene.add(key, key.target);

  // контровой лиловый «от окна»: обрисовывает края рам и обреза
  const rim = new THREE.DirectionalLight(0x9d8cff, .55);
  rim.position.set(3.5, 2.4, -4);
  scene.add(rim);

  // тёплое свечение самой книги
  const glow = new THREE.PointLight(0xffc56e, 1.1, 4, 2);
  glow.position.set(0, .85, .1);
  scene.add(glow);

  const dust = createDust(quality.particles);
  const bokeh = createBokeh(quality.bokeh);
  const bursts = createBursts();
  scene.add(dust.points, bursts.points);
  if (bokeh) scene.add(bokeh.points);

  return {
    key, glow,
    bokeh: bokeh ? bokeh.points.material : { opacity: 0 },   // приглушаем, когда открыто фото
    particles: {
      burst(pos) { bursts.emit(pos); dust.boost(); },
      update(dt, t) { dust.update(dt, t); bursts.update(dt); bokeh && bokeh.update(dt, t); }
    },
    setShadows(on) { key.castShadow = on; }
  };
}

function pointsMaterial(map, size, opacity = 1) {
  return new THREE.PointsMaterial({
    map, size, sizeAttenuation: true, vertexColors: true, opacity,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
}

// ---------- редкие пылинки над книгой ----------
function createDust(count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  const reset = (i, any) => {
    pos[i * 3] = (Math.random() - .5) * 3.4;
    pos[i * 3 + 1] = any ? .25 + Math.random() * 1.4 : .22;
    pos[i * 3 + 2] = (Math.random() - .5) * 2.2;
  };
  for (let i = 0; i < count; i++) {
    reset(i, true);
    seed.set([.02 + Math.random() * .04, Math.random() * 6.28, .5 + Math.random() * 1.2, .04 + Math.random() * .08], i * 4);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, pointsMaterial(sparkTexture(), .032));
  points.frustumCulled = false;
  let boost = 0;
  return {
    points,
    boost() { boost = Math.min(1, boost + .5); },
    update(dt, t) {
      boost = Math.max(0, boost - dt * .6);
      for (let i = 0; i < count; i++) {
        const k = i * 3, s = i * 4;
        pos[k + 1] += seed[s] * dt * (1 + boost * 2);
        pos[k] += Math.sin(t * .4 + seed[s + 1]) * seed[s + 3] * dt;
        pos[k + 2] += Math.cos(t * .33 + seed[s + 1]) * seed[s + 3] * dt * .6;
        if (pos[k + 1] > 1.7) reset(i, false);
        const hgt = pos[k + 1];
        const fade = Math.min(1, (hgt - .2) * 2.5) * Math.min(1, (1.7 - hgt) * 2);
        const tw = .35 + .65 * Math.sin(t * seed[s + 2] + seed[s + 1]) ** 2;
        const b = Math.max(0, fade * tw * (.55 + boost * .4));
        col[k] = b; col[k + 1] = b * .85; col[k + 2] = b * .58;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  };
}

// ---------- крупные размытые огоньки между камерой и книгой — ощущение глубины ----------
function createBokeh(count) {
  if (!count) return null;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - .5) * 5, 1.2 + Math.random() * 1.6, .2 + Math.random() * 2.6], i * 3);
    ph[i] = Math.random() * 6.28;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, pointsMaterial(bokehTexture(), .3, .55));
  points.frustumCulled = false;
  return {
    points,
    update(dt, t) {
      for (let i = 0; i < count; i++) {
        pos[i * 3] += Math.sin(t * .1 + ph[i]) * .02 * dt;
        pos[i * 3 + 1] += Math.cos(t * .08 + ph[i]) * .015 * dt;
        const b = .18 + .14 * Math.sin(t * .35 + ph[i]);
        col.set([b, b * .82, b * .55], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  };
}

// ---------- всплеск искр, когда фото поднимается ----------
function createBursts() {
  const N = 64;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N).fill(9);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, pointsMaterial(sparkTexture(), .04));
  points.frustumCulled = false;
  let next = 0;
  return {
    points,
    emit(p) {
      for (let j = 0; j < 14; j++) {
        const i = next++ % N, a = Math.random() * 6.28, r = .1 + Math.random() * .3;
        pos.set([p.x + Math.cos(a) * r, p.y + .02, p.z + Math.sin(a) * r * .7], i * 3);
        vel.set([Math.cos(a) * .05, .12 + Math.random() * .22, Math.sin(a) * .04], i * 3);
        life[i] = -Math.random() * .5;               // небольшой разброс по времени
      }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        life[i] += dt;
        const L = life[i], k = i * 3;
        if (L < 0 || L > 1.8) { col.set([0, 0, 0], k); continue; }
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        const b = Math.sin(Math.PI * L / 1.8) * .9;
        col.set([b, b * .85, b * .55], k);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  };
}

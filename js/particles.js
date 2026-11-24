/* Частицы на Canvas: звёзды, пылинки, золотые искры. */
(function () {
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const parts = [];
  const emitters = {};          // имя -> {pos: () => ({x,y}), rate, kind, spread, on}
  let stars = [], starsAlpha = 0, starsTarget = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(W * H / 5200);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H * .9,
      r: Math.random() * 1.3 + .3, p: Math.random() * 6.28, s: Math.random() * 1.5 + .5
    }));
  }

  function spawn(e) {
    const o = e.pos(); if (!o) return;
    const a = Math.random() * 6.28, d = Math.random() * (e.spread || 30);
    const p = { x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d * .6, life: 0, kind: e.kind };
    if (e.kind === 'spark') {
      p.vx = (Math.random() - .5) * 30; p.vy = -(40 + Math.random() * 90);
      p.max = 1.6 + Math.random() * 1.6; p.r = 1 + Math.random() * 2.2;
    } else {                       // dust
      p.vx = (Math.random() - .5) * 12; p.vy = -(4 + Math.random() * 10);
      p.max = 3 + Math.random() * 3; p.r = .6 + Math.random() * 1.6;
    }
    parts.push(p);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);

    starsAlpha += (starsTarget - starsAlpha) * Math.min(1, dt * 2);
    if (starsAlpha > .01) {
      for (const s of stars) {
        const tw = .5 + .5 * Math.sin(now / 1000 * s.s + s.p);
        ctx.globalAlpha = starsAlpha * (.25 + .75 * tw);
        ctx.fillStyle = '#fff4d6';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
    }

    for (const k in emitters) {
      const e = emitters[k]; if (!e.on) continue;
      e.acc = (e.acc || 0) + e.rate * dt;
      while (e.acc >= 1) { spawn(e); e.acc--; }
    }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life > p.max) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt + Math.sin(p.life * 2 + p.r) * (p.kind === 'dust' ? 6 : 10) * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      const a = Math.sin(Math.PI * t);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      g.addColorStop(0, `rgba(255,240,190,${a})`);
      g.addColorStop(.35, `rgba(255,205,120,${a * .55})`);
      g.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  window.FX = {
    stars(on) { starsTarget = on ? 1 : 0; },
    emitter(name, opts) { emitters[name] = Object.assign(emitters[name] || {}, opts); },
    stop(name) { if (emitters[name]) emitters[name].on = false; },
    burst(pos, n, kind) { for (let i = 0; i < n; i++) spawn({ pos: () => pos, kind: kind || 'spark', spread: 40 }); },
    clear() { parts.length = 0; for (const k in emitters) emitters[k].on = false; }
  };

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();

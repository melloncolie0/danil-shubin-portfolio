(async () => {
  async function createEffect(root) {
  const isLinks = root.dataset.effect === 'links';
  const canvas = root.querySelector('.sandbox-canvas'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  try { await document.fonts.load('500 160px Benzin'); } catch { /* The fallback font remains usable. */ }
  const mask = document.createElement('canvas'), ink = mask.getContext('2d', { willReadFrequently: true });
  if (!ink) return;
  const touchButton = root.querySelector('.sandbox-touch');
  let nodes = [], nodeGap = 18, entities = [];
  const links = [];
  const pointer = { active: false, x: 0, y: 0, vx: 0, vy: 0, stamp: 0 };
  let width = 0, height = 0, particles = [], visible = false, raf = 0, last = 0, time = 0;
  let gesture = null, yaw = 0, targetYaw = 0;
  const motion = () => document.documentElement.dataset.motion !== 'off';
  const phone = () => width < 760;
  const particleRadius = () => phone() ? 68 : 135;
  const networkRadius = () => phone() ? 80 : 145;

  function wake() {
    if (visible && !document.hidden && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function projectHomes() {
    const sine = Math.sin(yaw), cosine = Math.cos(yaw);
    nodes.forEach(n => {
      const x = n.anchorX - width / 2;
      const z = n.anchorZ;
      n.depth = -x * sine + z * cosine;
      n.homeX = width / 2 + x * cosine + z * sine;
      n.homeY = n.anchorY - n.depth * .035;
    });
  }
  function snap() {
    projectHomes();
    for (const p of entities) { p.x = p.homeX; p.y = p.homeY; p.vx = p.vy = 0; }
  }
  function resize() {
    const box = canvas.getBoundingClientRect(), w = Math.round(box.width), h = Math.round(box.height);
    if (!w || !h || (w === width && h === height)) return;
    width = w; height = h;
    const dpr = Math.min(devicePixelRatio || 1, phone() ? 1.35 : 1.5);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mask.width = w; mask.height = h;
    const lines = isLinks ? ['UX/UI'] : ['DANIL', 'SHUBIN'];
    ink.font = '500 160px Benzin';
    const measure = Math.max(...lines.map(line => ink.measureText(line).width));
    const size = Math.min(phone() ? 108 : isLinks ? 240 : 215, (phone() ? w - 44 : w * .76) / measure * 160);
    ink.font = '500 ' + size + 'px Benzin'; ink.textAlign = 'center'; ink.textBaseline = 'middle';
    ink.fillStyle = '#fff';
    const center = h * (isLinks ? .47 : phone() ? .52 : .50);
    lines.forEach((line, i) => ink.fillText(line, w / 2, center + (i - (lines.length - 1) / 2) * size * 1.25));
    const data = ink.getImageData(0, 0, w, h).data;
    let gap = phone() ? 3 : 5;
    function sample() {
      const result = [];
      for (let y = 0; y < h; y += gap) for (let x = 0; x < w; x += gap) {
        if (data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] <= 100) continue;
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453, variation = seed - Math.floor(seed);
        result.push({ x, y, homeX: x, homeY: y, vx: 0, vy: 0, radius: gap * (phone() ? .32 : .24),
          bias: (variation - .5) * 5.7, weight: .5 + variation, phase: variation * Math.PI * 2 });
      }
      return result;
    }
    particles = isLinks ? [] : sample();
    while (particles.length > (phone() ? 1450 : 3200)) { gap += .5; particles = sample(); }
    if (isLinks) {
      nodeGap = phone() ? 7 : 16;
      function sampleNodes() {
        const result = [];
        for (let y = 0, row = 0; y < h; y += nodeGap, row++) for (let x = 0, col = 0; x < w; x += nodeGap, col++) {
          if (data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] <= 100) continue;
          result.push({ x, y, anchorX: x, anchorY: y, homeX: x, homeY: y, row, col, vx: 0, vy: 0, ax: 0, ay: 0, depth: 0 });
        }
        return result;
      }
      nodes = sampleNodes();
      while (nodes.length > (phone() ? 220 : 450)) { nodeGap += .5; nodes = sampleNodes(); }
      links.length = 0;
      const lookup = new Map(nodes.map((n, i) => [n.col + ',' + n.row, i]));
      nodes.forEach((n, i) => {
        n.anchorZ = Math.sin(n.anchorX / width * Math.PI * 3) * nodeGap * .55;
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          const neighbor = lookup.get((n.col + dx) + ',' + (n.row + dy));
          if (neighbor !== undefined) links.push({ a: i, b: neighbor });
        }
      });
    }
    entities = [...nodes, ...particles];
    gesture = null; pointer.active = false; pointer.vx = pointer.vy = 0;
    canvas.dataset.dragging = 'false'; snap();
    root.dataset.ready = 'true'; root.dataset.particles = String(particles.length);
    root.dataset.nodes = String(nodes.length); root.dataset.lines = String(lines.length);
    wake();
  }
  function limitVelocity(p, maximum) {
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maximum) { p.vx *= maximum / speed; p.vy *= maximum / speed; }
  }
  function step(dt) {
    time += dt;
    const radius = networkRadius();
    nodes.forEach(n => {
      n.ax = (n.homeX - n.x) * 13 - n.vx * 4.2;
      n.ay = (n.homeY - n.y) * 13 - n.vy * 4.2;
      if (!pointer.active || gesture?.node === n) return;
      let dx = n.x - pointer.x, dy = n.y - pointer.y, distance = Math.hypot(dx, dy);
      if (distance >= radius) return;
      if (distance < 1) { dx = 1; dy = -.5; distance = Math.hypot(dx, dy); }
      const falloff = (1 - distance / radius) ** 2;
      n.ax += dx / distance * radius * 32 * falloff + pointer.vx * 4 * falloff;
      n.ay += dy / distance * radius * 32 * falloff + pointer.vy * 4 * falloff;
    });
    links.forEach(({ a, b }) => {
      const p = nodes[a], q = nodes[b], dx = q.x - p.x, dy = q.y - p.y;
      // Vector springs carry force to neighboring points and unfold reliably after a drag.
      const fx = (dx - (q.homeX - p.homeX)) * 26 + (q.vx - p.vx) * 1.4;
      const fy = (dy - (q.homeY - p.homeY)) * 26 + (q.vy - p.vy) * 1.4;
      p.ax += fx; p.ay += fy; q.ax -= fx; q.ay -= fy;
    });
    if (gesture?.node) {
      const n = gesture.node;
      n.ax += (pointer.x + gesture.offsetX - n.x) * 250 - n.vx * 16;
      n.ay += (pointer.y + gesture.offsetY - n.y) * 250 - n.vy * 16;
    }
    nodes.forEach(n => {
      n.vx += n.ax * dt; n.vy += n.ay * dt; limitVelocity(n, 1100);
      n.x += n.vx * dt; n.y += n.vy * dt;
    });
    const r = particleRadius();
    particles.forEach(p => {
      let ax = (p.homeX - p.x) * 11 - p.vx * 4.5, ay = (p.homeY - p.y) * 11 - p.vy * 4.5;
      if (pointer.active) {
        const dx = p.homeX - pointer.x, dy = p.homeY - pointer.y, distance = Math.hypot(dx, dy);
        if (distance < r) {
          const force = (1 - distance / r) ** 2, angle = Math.atan2(dy, dx) + p.bias;
          const push = r * 12.5 * p.weight * force;
          ax += Math.cos(angle) * push + Math.sin(time * 1.4 + p.phase) * r * 1.5 * force + pointer.vx * 5 * force;
          ay += Math.sin(angle) * push + Math.cos(time * 1.1 + p.phase) * r * 1.5 * force + pointer.vy * 5 * force;
        }
      }
      p.vx += ax * dt; p.vy += ay * dt; limitVelocity(p, 1000);
      p.x += p.vx * dt; p.y += p.vy * dt;
    });
    pointer.vx *= Math.exp(-dt * 10); pointer.vy *= Math.exp(-dt * 10);
  }
  function networkOpacity(n) {
    // Edge fades let each effect dissolve into the surrounding black page.
    const edge = Math.max(0, Math.min(1, n.y / 130, (height - n.y) / 100));
    return edge;
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = .8;
    links.forEach(({ a, b }) => {
      const p = nodes[a], q = nodes[b];
      const strain = Math.abs(Math.hypot(q.x - p.x, q.y - p.y) - Math.hypot(q.homeX - p.homeX, q.homeY - p.homeY));
      ctx.strokeStyle = 'rgba(190,202,218,' + (((phone() ? .42 : .28) + Math.min(.22, strain / 180)) * Math.min(networkOpacity(p), networkOpacity(q))) + ')';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    });
    [...nodes].sort((a, b) => a.depth - b.depth).forEach(n => {
      const r = Math.max(1.6, nodeGap * .17) * (1 + Math.max(-.15, Math.min(.15, n.depth / 160)));
      const stretch = Math.min(.5, Math.hypot(n.vx, n.vy) * .002), ry = r * (1.1 + stretch);
      ctx.fillStyle = 'rgba(225,232,242,' + (.90 * networkOpacity(n)) + ')';
      ctx.beginPath();
      [[-1, 0], [-.52, -1], [.52, -1], [1, 0], [.52, 1], [-.52, 1]].forEach(([x, y], i) => {
        if (!i) ctx.moveTo(n.x + x * r, n.y + y * ry); else ctx.lineTo(n.x + x * r, n.y + y * ry);
      });
      ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = '#f0f0ee'; ctx.beginPath();
    particles.forEach(p => { ctx.moveTo(p.x + p.radius, p.y); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); });
    ctx.fill();
    ctx.strokeStyle = '#d7e1ec'; ctx.lineWidth = 1; ctx.beginPath();
    particles.forEach(p => {
      if (Math.hypot(p.vx, p.vy) < 130) return;
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .007, p.y - p.vy * .007);
    });
    ctx.stroke();
  }
  function stats() {
    let textDisplacement = 0, networkDisplacement = 0, affected = 0;
    for (const p of particles) {
      const d = Math.hypot(p.x - p.homeX, p.y - p.homeY);
      textDisplacement = Math.max(textDisplacement, d); if (d > 3) affected++;
    }
    for (const n of nodes) networkDisplacement = Math.max(networkDisplacement, Math.hypot(n.x - n.homeX, n.y - n.homeY));
    root.dataset.textDisplacement = textDisplacement.toFixed(2);
    root.dataset.networkDisplacement = networkDisplacement.toFixed(2);
    root.dataset.affected = String(affected);
    root.dataset.interaction = gesture?.node ? 'grab' : pointer.active ? 'scatter' : 'assemble';
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60; last = now;
    if (motion()) {
      yaw += (targetYaw - yaw) * (1 - Math.exp(-dt * 7)); projectHomes();
      const steps = Math.ceil(dt * 120);
      for (let i = 0; i < steps; i++) step(dt / steps);
    } else { yaw = targetYaw; snap(); }
    const nearby = pointer.active && (particles.some(p => Math.hypot(p.homeX - pointer.x, p.homeY - pointer.y) < particleRadius())
      || nodes.some(n => Math.hypot(n.x - pointer.x, n.y - pointer.y) < networkRadius()));
    const drifting = entities.some(p => Math.hypot(p.vx, p.vy) > .35 || Math.hypot(p.x - p.homeX, p.y - p.homeY) > .3);
    const moving = nearby || drifting || gesture !== null || Math.abs(targetYaw - yaw) > .001;
    if (!moving) snap();
    draw(); stats(); root.dataset.running = String(motion() && moving);
    if (motion() && moving) raf = requestAnimationFrame(frame);
  }
  function clearPointer() {
    gesture = null; pointer.active = false; pointer.vx = pointer.vy = 0; canvas.dataset.dragging = 'false';
  }
  function reset() {
    clearPointer(); targetYaw = 0;
    if (!motion()) { yaw = 0; snap(); }
    wake();
  }
  function point(e) {
    const box = canvas.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
    const elapsed = Math.max(.008, Math.min(.1, (e.timeStamp - pointer.stamp) / 1000));
    if (pointer.active) {
      pointer.vx = Math.max(-1500, Math.min(1500, (x - pointer.x) / elapsed));
      pointer.vy = Math.max(-1500, Math.min(1500, (y - pointer.y) / elapsed));
    }
    pointer.x = x; pointer.y = y; pointer.stamp = e.timeStamp; pointer.active = true;
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !motion()) return;
    point(e);
    let nearest = null, distance = phone() ? 42 : 70;
    nodes.forEach(n => {
      const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
      if (d < distance) { nearest = n; distance = d; }
    });
    gesture = { id: e.pointerId, node: nearest, offsetX: nearest ? nearest.x - pointer.x : 0, offsetY: nearest ? nearest.y - pointer.y : 0 };
    canvas.setPointerCapture(e.pointerId); canvas.dataset.dragging = nearest ? 'true' : 'false'; wake();
  });
  canvas.addEventListener('pointermove', e => {
    if (!motion() || (e.pointerType !== 'mouse' && !gesture)) return;
    point(e); wake();
  });
  function release(e) {
    if (gesture && e.pointerId !== undefined && gesture.id !== e.pointerId) return;
    gesture = null; canvas.dataset.dragging = 'false';
    if (e.pointerType !== 'mouse') { pointer.active = false; pointer.vx = pointer.vy = 0; }
    wake();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('pointercancel', () => { clearPointer(); wake(); });
  canvas.addEventListener('pointerleave', () => { if (!gesture) { clearPointer(); wake(); } });
  canvas.addEventListener('keydown', e => {
    if (![' ', 'Escape', ...(isLinks ? ['ArrowLeft', 'ArrowRight'] : [])].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') reset();
    else if (motion()) {
      clearPointer();
      if (e.key === ' ') {
        particles.forEach((p, i) => { p.vx += Math.cos(i * 2.399963) * 280; p.vy += Math.sin(i * 2.399963) * 280; });
        nodes.forEach((n, i) => { n.vx += Math.cos(i * 2.399963) * 90; n.vy -= 55; });
      } else targetYaw = Math.max(-.8, Math.min(.8, targetYaw + (e.key === 'ArrowLeft' ? -.25 : .25)));
      wake();
    }
  });
  touchButton.addEventListener('click', () => {
    const playing = root.dataset.touchPlaying !== 'true';
    root.dataset.touchPlaying = String(playing); touchButton.setAttribute('aria-pressed', String(playing));
    touchButton.textContent = playing ? 'Готово' : 'Попробовать'; clearPointer(); wake();
  });
  function stop() { cancelAnimationFrame(raf); raf = 0; clearPointer(); root.dataset.running = 'false'; }
  function syncMotion() {
    touchButton.disabled = !motion();
    if (!motion()) {
      root.dataset.touchPlaying = 'false'; touchButton.setAttribute('aria-pressed', 'false'); touchButton.textContent = 'Попробовать';
    }
    clearPointer(); wake();
  }
  document.addEventListener('motion-preference-change', syncMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else wake(); });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake(); else stop();
  }).observe(canvas);
  resize(); syncMotion();
  }
  await Promise.all([...document.querySelectorAll('.sandbox-effect[data-effect="particles"], .sandbox-effect[data-effect="links"]')].map(createEffect));
})();

(() => {
  const stage = document.querySelector('.orbit-stage');
  const library = window.Motion;
  if (!stage || !library?.springValue) return;
  const hero = stage.closest('.hero');
  const composition = stage.closest('.hero-composition');
  const status = stage.querySelector('.orbit-status');
  const layer = document.createElement('div');
  layer.className = 'orbit-drag-layer';
  hero.append(layer);
  const spring = { stiffness: 165, damping: 21, mass: .8 };
  const items = [...stage.querySelectorAll('.orbit-icon')].map((node, index) => {
    node.setAttribute('aria-describedby', 'orbit-help');
    node.dataset.orbitState = 'orbit';
    const marker = document.createComment(`orbit ${node.dataset.orbitIcon}`);
    node.before(marker);
    return { node, index, marker, baseSize: node.offsetWidth, state: 'orbit', hovered: false, keyboard: false,
      pointer: null, hover: library.springValue(0, { stiffness: 220, damping: 22 }),
      x: library.springValue(0, spring), y: library.springValue(0, spring),
      opacity: library.springValue(1, spring),
      scale: library.springValue(1, spring), rotate: library.springValue(0, spring) };
  });
  let width = stage.clientWidth, height = stage.clientHeight;
  let phase = 2.25, clock = 0, lastTime = 0, frame = 0, visible = true;
  const motionOn = () => document.documentElement.dataset.motion !== 'off';
  const displaced = () => items.some(item => item.state !== 'orbit');
  const requestDraw = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(draw); };

  function orbit(item) {
    const angle = phase + item.index * Math.PI * 2 / items.length;
    const depth = (Math.sin(angle) + 1) / 2;
    const rx = width * .34, ry = height * .235, tilt = -.16;
    const ox = Math.cos(angle) * rx, oy = Math.sin(angle) * ry;
    const float = motionOn() ? Math.sin(clock * .8 + item.index * 1.9) * 5 : 0;
    return {
      x: width / 2 + ox * Math.cos(tilt) - oy * Math.sin(tilt),
      y: height * .47 + ox * Math.sin(tilt) + oy * Math.cos(tilt) + float,
      scale: .65 + depth * .43 + (motionOn() ? item.hover.get() * .13 : 0),
      opacity: .56 + depth * .44,
      rotation: Math.sin(angle + .7) * 9 + (motionOn() ? Math.sin(clock * .4 + item.index) * 3 : 0),
      depth
    };
  }

  function world(position, rect) {
    const zoom = rect.width / width;
    return { x: rect.left + position.x * zoom, y: rect.top + position.y * zoom, zoom };
  }

  function measureArea() {
    const rect = hero.getBoundingClientRect();
    // Orbit coordinates belong to the hero, even when it scrolls out of view.
    const visibleHeight = Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top);
    const opacity = Number(composition.style.opacity || 1);
    return { rect, opacity,
      active: visibleHeight > 0 && opacity > .02 };
  }

  function orbitTarget(position, rect, area) {
    return { ...world(position, rect), fits: area.active };
  }

  function paintOrbit(item, position, rect = stage.getBoundingClientRect(), area = measureArea()) {
    const target = orbitTarget(position, rect, area);
    item.node.hidden = !target.fits;
    const size = item.baseSize;
    const x = (target.x - rect.left) / target.zoom, y = (target.y - rect.top) / target.zoom;
    item.node.style.transform = `translate3d(${x - size / 2}px,${y - size / 2}px,0) rotate(${position.rotation}deg) scale(${position.scale})`;
    item.node.style.opacity = position.opacity;
    item.node.style.zIndex = item.hovered ? 20 : Math.round(position.depth * 10) + 1;
  }

  function paintHeld(item, area = measureArea()) {
    const size = item.size;
    item.node.style.opacity = item.opacity.get();
    item.node.style.transform = `translate3d(${item.x.get() - area.rect.left - size / 2}px,${item.y.get() - area.rect.top - size / 2}px,0) rotate(${item.rotate.get()}deg) scale(${item.scale.get()})`;
  }

  function restore(item) {
    clearTimeout(item.keyTimer);
    const focused = document.activeElement === item.node;
    const returned = item.state === 'return';
    const pointer = item.pointer;
    if (returned) item.node.dataset.returnSeconds = ((performance.now() - item.released) / 1000).toFixed(2);
    item.state = 'orbit';
    item.keyboard = false;
    item.pointer = null;
    if (pointer !== null && item.node.hasPointerCapture(pointer)) item.node.releasePointerCapture(pointer);
    item.node.dataset.orbitState = 'orbit';
    item.marker.after(item.node);
    item.node.style.removeProperty('width');
    item.node.style.removeProperty('height');
    item.node.style.removeProperty('z-index');
    paintOrbit(item, orbit(item));
    if (focused) item.node.focus({ preventScroll: true });
    item.hovered = item.node.matches(':hover') || item.node.matches(':focus-visible');
    item.hover.set(item.hovered ? 1 : 0);
    if (returned) status.textContent = `${item.node.querySelector('.orbit-label').textContent} снова на орбите.`;
    document.body.classList.toggle('orbit-dragging', items.some(other => other.pointer !== null));
  }

  function trackRelease(item) {
    item.vx = 0; item.vy = 0;
    item.movedAt = performance.now();
    delete item.node.dataset.returnSeconds;
  }

  function driftBack(item, target, dt, elapsed) {
    const previous = item.previousTarget || target;
    const targetVX = dt > 0 ? Math.max(-400, Math.min(400, (target.x - previous.x) / dt)) : 0;
    const targetVY = dt > 0 ? Math.max(-400, Math.min(400, (target.y - previous.y) / dt)) : 0;
    item.previousTarget = target;
    // Attraction builds gradually, so the released icon keeps a little momentum.
    const pull = Math.min(1, elapsed / 720) ** 2;
    const attraction = 3.125 * pull;
    const friction = .75 + 2.75 * pull;
    let x = item.x.get(), y = item.y.get();
    const steps = Math.max(1, Math.ceil(dt * 120));
    const step = dt / steps;
    for (let i = 0; i < steps; i++) {
      item.vx += ((target.x - x) * attraction - (item.vx - targetVX) * friction) * step;
      item.vy += ((target.y - y) * attraction - (item.vy - targetVY) * friction) * step;
      x += item.vx * step; y += item.vy * step;
    }
    item.x.jump(x); item.y.jump(y);
    return { distance: Math.hypot(x - target.x, y - target.y), speed: Math.hypot(item.vx - targetVX, item.vy - targetVY) };
  }

  function draw(time) {
    frame = 0;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .05) : 0;
    lastTime = time;
    if (motionOn() && visible) { phase += dt * Math.PI * 2 / 100; clock += dt; }
    const rect = stage.getBoundingClientRect();
    const area = measureArea();
    layer.hidden = !area.active;
    layer.style.opacity = area.opacity;
    if (!area.active) {
      items.filter(item => item.state !== 'orbit').forEach(restore);
      lastTime = 0;
      return;
    }
    items.forEach(item => {
      const position = orbit(item);
      if (item.state === 'orbit') paintOrbit(item, position, rect, area);
      else {
        if (item.state === 'return') {
          const target = orbitTarget(position, rect, area);
          if (!target.fits) { restore(item); return; }
          const elapsed = time - item.released;
          const flight = driftBack(item, target, dt, elapsed);
          const proximity = Math.max(0, Math.min(1, 1 - flight.distance / item.releaseDistance));
          item.scale.set(1.18 + (position.scale * target.zoom / item.zoom - 1.18) * proximity);
          item.opacity.set(1 + (position.opacity - 1) * proximity);
          item.rotate.set(position.rotation);
          if (elapsed > 1000 && flight.distance < 2 && flight.speed < 4) {
            restore(item);
            return;
          }
        }
        paintHeld(item, area);
      }
    });
    if (!document.hidden && ((visible && motionOn()) || displaced())) requestDraw();
  }

  function lift(item) {
    const area = measureArea();
    if (!area.active || item.node.hidden) return false;
    layer.hidden = false;
    layer.style.opacity = area.opacity;
    if (item.state === 'return') {
      item.state = 'drag'; item.node.dataset.orbitState = 'drag';
      trackRelease(item);
      if (motionOn()) { item.scale.set(1.18); item.opacity.set(1); }
      status.textContent = `${item.node.querySelector('.orbit-label').textContent} можно перемещать.`;
      requestDraw();
      return true;
    }
    if (item.state !== 'orbit') return true;
    const position = orbit(item);
    const rect = stage.getBoundingClientRect();
    const target = world(position, rect);
    const drawn = item.node.getBoundingClientRect();
    target.x = drawn.left + drawn.width / 2; target.y = drawn.top + drawn.height / 2;
    item.zoom = target.zoom;
    item.size = item.baseSize * target.zoom;
    item.x.jump(target.x); item.y.jump(target.y);
    item.scale.jump(position.scale); item.rotate.jump(position.rotation);
    item.opacity.jump(position.opacity);
    item.node.style.width = `${item.size}px`;
    item.node.style.height = `${item.size}px`;
    item.node.style.opacity = 1;
    item.node.style.zIndex = 30;
    item.state = 'drag';
    trackRelease(item);
    item.node.dataset.orbitState = 'drag';
    layer.append(item.node);
    item.node.focus({ preventScroll: true });
    if (motionOn()) { item.scale.set(1.18); item.opacity.set(1); }
    else { item.scale.jump(1); item.opacity.jump(1); }
    paintHeld(item);
    status.textContent = `${item.node.querySelector('.orbit-label').textContent} можно перемещать.`;
    requestDraw();
    return true;
  }

  function move(item, x, y) {
    if (item.pointer !== null) {
      const now = performance.now();
      const dt = Math.max(.008, (now - item.movedAt) / 1000);
      const blend = 1 - Math.exp(-dt / .055);
      item.vx += ((x - item.x.get()) / dt - item.vx) * blend;
      item.vy += ((y - item.y.get()) / dt - item.vy) * blend;
      item.movedAt = now;
    }
    item.x.jump(x);
    item.y.jump(y);
    paintHeld(item);
  }

  function release(item) {
    if (item.state !== 'drag') return;
    clearTimeout(item.keyTimer);
    item.state = 'return';
    item.node.dataset.orbitState = 'return';
    item.released = performance.now();
    const momentum = .32 * Math.exp(-(item.released - item.movedAt) / 75);
    item.vx *= momentum; item.vy *= momentum;
    const speed = Math.hypot(item.vx, item.vy);
    if (speed > 280) { item.vx *= 280 / speed; item.vy *= 280 / speed; }
    const target = orbitTarget(orbit(item), stage.getBoundingClientRect(), measureArea());
    item.releaseDistance = Math.max(40, Math.hypot(item.x.get() - target.x, item.y.get() - target.y));
    item.previousTarget = null;
    const pointer = item.pointer;
    item.pointer = null;
    if (pointer !== null && item.node.hasPointerCapture(pointer)) item.node.releasePointerCapture(pointer);
    document.body.classList.toggle('orbit-dragging', items.some(other => other.pointer !== null));
    status.textContent = `${item.node.querySelector('.orbit-label').textContent} возвращается на орбиту.`;
    if (!motionOn()) restore(item);
    requestDraw();
  }

  items.forEach(item => {
    const node = item.node;
    node.addEventListener('pointerenter', () => { item.hovered = true; item.hover.set(1); requestDraw(); });
    node.addEventListener('pointerleave', () => { item.hovered = node.matches(':focus-visible'); item.hover.set(item.hovered ? 1 : 0); requestDraw(); });
    node.addEventListener('focus', () => { if (node.matches(':focus-visible')) { item.hovered = true; item.hover.set(1); requestDraw(); } });
    node.addEventListener('blur', () => { item.hovered = false; item.hover.set(0); if (item.keyboard) release(item); });
    node.addEventListener('dragstart', event => event.preventDefault());
    node.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      if (!lift(item)) return;
      node.focus({ preventScroll: true });
      item.keyboard = false;
      item.pointer = event.pointerId;
      item.offsetX = item.x.get() - event.clientX;
      item.offsetY = item.y.get() - event.clientY;
      node.setPointerCapture(event.pointerId);
      document.body.classList.add('orbit-dragging');
    });
    node.addEventListener('pointermove', event => {
      if (item.pointer !== event.pointerId || item.state !== 'drag') return;
      move(item, event.clientX + item.offsetX, event.clientY + item.offsetY);
      if (motionOn()) item.rotate.set(Math.max(-16, Math.min(16, event.movementX * .7)));
    });
    node.addEventListener('pointerup', event => { if (item.pointer === event.pointerId) release(item); });
    node.addEventListener('pointercancel', event => { if (item.pointer === event.pointerId) release(item); });
    node.addEventListener('lostpointercapture', () => { if (item.pointer !== null) release(item); });
    node.addEventListener('keydown', event => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (direction) {
        event.preventDefault(); if (!lift(item)) return; item.keyboard = true;
        move(item, item.x.get() + direction[0] * 55, item.y.get() + direction[1] * 55);
        clearTimeout(item.keyTimer); item.keyTimer = setTimeout(() => release(item), 1600);
      } else if (event.key === 'Enter' || event.key === 'Escape' || event.key === ' ') {
        event.preventDefault(); release(item);
      }
    });
  });

  new ResizeObserver(() => {
    width = stage.clientWidth; height = stage.clientHeight;
    items.filter(item => item.state !== 'orbit').forEach(restore);
    items.forEach(item => { item.baseSize = parseFloat(getComputedStyle(item.node).width) || item.baseSize; });
    requestDraw();
  }).observe(stage);
  window.addEventListener('scroll', () => {
    items.filter(item => item.state !== 'orbit').forEach(restore);
    requestDraw();
  }, { passive: true });
  document.addEventListener('portfolio-card-open', () => items.filter(item => item.state !== 'orbit').forEach(restore));
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    document.body.classList.toggle('orbit-hero-visible', visible);
    lastTime = 0;
    requestDraw();
  }).observe(hero);
  document.addEventListener('motion-preference-change', () => {
    items.forEach(item => { if (!motionOn() && item.state === 'return') restore(item); item.hover.jump(0); });
    lastTime = 0; requestDraw();
  });
  document.addEventListener('visibilitychange', () => {
    lastTime = 0;
    if (document.hidden) {
      items.forEach(item => { if (item.state !== 'orbit') restore(item); });
      cancelAnimationFrame(frame); frame = 0;
    } else requestDraw();
  });
  window.addEventListener('blur', () => items.forEach(release));
  requestDraw();
})();

import * as THREE from 'three';
import { ClothPhysics } from './cloth-physics.js';

const root = document.querySelector('#metal-cloth');
if (root) {
  const canvas = root.querySelector('canvas'), touchButton = root.querySelector('.sandbox-touch'), fallback = root.querySelector('.cloth-fallback');
  const small = matchMedia('(max-width:760px), (pointer:coarse)');
  const motion = () => document.documentElement.dataset.motion !== 'off';
  let renderer, scene, camera, fabric, geometry, simulation, studio, weave;
  let visible = false, lost = false, frameId = 0, last = 0, accumulator = 0, elapsed = 0, width = 0, height = 0, gesture = null;
  let clockStart = 0, frames = 0, statsTime = 0;
  const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster(), dragPlane = new THREE.Plane();
  const hitPoint = new THREE.Vector3(), localPoint = new THREE.Vector3(), offset = new THREE.Vector3();
  const brush = { dirty: false, x: 0, y: 0, speed: 0, stamp: 0 };

  function makeStudio() {
    const room = new THREE.Scene(); room.background = new THREE.Color('#18191c');
    const panels = [];
    function panel(w, h, x, y, z, brightness) {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(brightness, brightness, brightness), side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); room.add(mesh); panels.push(mesh);
    }
    panel(4, 9, -4, 1, 4, 3.5);
    panel(2, 9, 4, 0, 3, 2.8);
    panel(9, 1.3, 0, 5, 3, 4.0);
    panel(7, 4, 0, 1, -6, .8);
    const generator = new THREE.PMREMGenerator(renderer);
    const target = generator.fromScene(room, .035, .1, 30, { size: small.matches ? 128 : 256 });
    generator.dispose(); panels.forEach(p => { p.geometry.dispose(); p.material.dispose(); });
    return target;
  }
  function makeWeave() {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const value = Math.round(128 + Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2) * 27);
      const o = (y * size + x) * 4; data[o] = data[o + 1] = data[o + 2] = value; data[o + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(34, 25);
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
  }
  function buildFabric() {
    geometry?.dispose();
    const mobile = small.matches;
    simulation = new ClothPhysics(mobile ? { columns: 24, rows: 26, width: 5.1, height: 5.0, iterations: 5 } : { columns: 36, rows: 28, iterations: 6 });
    geometry = new THREE.PlaneGeometry(simulation.width, simulation.height, simulation.columns, simulation.rows);
    geometry.setAttribute('position', new THREE.BufferAttribute(simulation.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    geometry.computeVertexNormals();
    if (!fabric) {
      weave = makeWeave();
      const material = new THREE.MeshPhysicalMaterial({
        color: '#dfe2e6', metalness: .94, roughness: .28, clearcoat: mobile ? 0 : .26, clearcoatRoughness: .30,
        anisotropy: mobile ? 0 : .5, bumpMap: weave, bumpScale: .006, side: THREE.DoubleSide, envMapIntensity: 1.15
      });
      fabric = new THREE.Mesh(geometry, material); fabric.frustumCulled = false;
      fabric.rotation.set(.015, -.14, -.055); scene.add(fabric);
    } else {
      fabric.geometry = geometry; fabric.material.clearcoat = mobile ? 0 : .26;
      fabric.material.anisotropy = mobile ? 0 : .5; fabric.material.needsUpdate = true;
    }
    root.dataset.points = String(simulation.count); root.dataset.physics = 'verlet-constraints';
    root.dataset.mobile = String(mobile); accumulator = 0;
  }
  function initialize() {
    if (renderer || root.dataset.failed === 'true') return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !small.matches, alpha: false, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.0;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#000');
      camera = new THREE.PerspectiveCamera(42, 1, .1, 60);
      studio = makeStudio(); scene.environment = studio.texture;
      const key = new THREE.DirectionalLight('#ffffff', 2.3); key.position.set(-3, 4, 6); scene.add(key);
      const rim = new THREE.DirectionalLight('#dbe5f2', 1.2); rim.position.set(4, 1, -3); scene.add(rim);
      buildFabric(); resize();
      root.dataset.ready = 'true'; root.dataset.renderer = 'webgl'; fallback.hidden = true;
    } catch {
      renderer?.dispose(); renderer = null; root.dataset.failed = 'true'; root.dataset.ready = 'false';
      fallback.textContent = 'Этот эффект не удалось открыть.'; fallback.hidden = false;
    }
  }
  function resize() {
    const box = canvas.getBoundingClientRect(); width = box.width; height = box.height;
    if (!renderer || !width || !height) return;
    if ((root.dataset.mobile === 'true') !== small.matches) { release(); buildFabric(); }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small.matches ? 1.15 : 1.5));
    renderer.setSize(width, height, false); camera.aspect = width / height;
    const viewHeight = Math.max(simulation.height + 2.0, (simulation.width * .85 + 1.1) / camera.aspect);
    camera.position.set(0, -.15, viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
    camera.lookAt(0, -.15, 0); camera.updateProjectionMatrix(); wake();
  }
  function render() {
    geometry.attributes.position.needsUpdate = true; geometry.computeVertexNormals();
    renderer.render(scene, camera);
  }
  function wake() {
    if (visible && !document.hidden && !lost && renderer && !frameId) { last = 0; frameId = requestAnimationFrame(frame); }
  }
  function stop() { cancelAnimationFrame(frameId); frameId = 0; last = 0; accumulator = 0; clockStart = 0; frames = 0; release(); root.dataset.running = 'false'; }
  function frame(now) {
    frameId = 0;
    if (!visible || document.hidden || lost || !renderer) return;
    const minimum = small.matches ? 1000 / 32 : 0;
    if (last && now - last < minimum) { frameId = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60; last = now;
    const physicsStart = performance.now();
    if (motion()) {
      if (brush.dirty && !gesture) applyBrush();
      accumulator = Math.min(.06, accumulator + dt);
      while (accumulator >= 1 / 90) { elapsed += 1 / 90; simulation.step(1 / 90, elapsed); accumulator -= 1 / 90; }
    }
    const physicsMs = performance.now() - physicsStart, drawStart = performance.now();
    render(); const drawMs = performance.now() - drawStart; frames++;
    if (!clockStart) clockStart = now;
    if (now - statsTime > 500) {
      root.dataset.energy = simulation.energy().toFixed(4); root.dataset.grabbed = String(Boolean(gesture));
      root.dataset.physicsMs = physicsMs.toFixed(2); root.dataset.drawMs = drawMs.toFixed(2);
      root.dataset.fps = (frames * 1000 / Math.max(1, now - clockStart)).toFixed(1); statsTime = now;
    }
    root.dataset.running = String(motion());
    if (motion()) frameId = requestAnimationFrame(frame);
  }
  function updatePointer(e) {
    const box = canvas.getBoundingClientRect();
    pointer.set((e.clientX - box.left) / box.width * 2 - 1, -(e.clientY - box.top) / box.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function intersection() { fabric.updateMatrixWorld(true); return raycaster.intersectObject(fabric, false)[0]; }
  function applyBrush() {
    brush.dirty = false;
    const hit = intersection(); if (!hit) { canvas.dataset.hover = 'false'; return; }
    canvas.dataset.hover = 'true'; fabric.worldToLocal(localPoint.copy(hit.point));
    simulation.impulse(localPoint.x, localPoint.y, Math.min(1.4, brush.speed * .002));
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !renderer || !motion()) return;
    updatePointer(e); const hit = intersection(); if (!hit?.face) return;
    fabric.worldToLocal(localPoint.copy(hit.point));
    let index = -1, distance = Infinity;
    for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
      if (simulation.pinned[i]) continue;
      const p = simulation.positions, d = Math.hypot(p[i * 3] - localPoint.x, p[i * 3 + 1] - localPoint.y, p[i * 3 + 2] - localPoint.z);
      if (d < distance) { index = i; distance = d; }
    }
    if (index < 0 || !simulation.beginGrab(index)) return;
    const p = simulation.positions;
    offset.set(p[index * 3] - localPoint.x, p[index * 3 + 1] - localPoint.y, p[index * 3 + 2] - localPoint.z);
    dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.point);
    gesture = { id: e.pointerId, start: new THREE.Vector3(p[index * 3], p[index * 3 + 1], p[index * 3 + 2]) };
    root.dataset.drags = String(Number(root.dataset.drags || 0) + 1);
    brush.dirty = false; canvas.dataset.dragging = 'true'; root.dataset.grabbed = 'true';
    canvas.setPointerCapture(e.pointerId); wake();
  });
  canvas.addEventListener('pointermove', e => {
    if (!renderer || !motion() || (e.pointerType !== 'mouse' && !gesture)) return;
    updatePointer(e);
    if (gesture) {
      if (e.pointerId !== gesture.id || !raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
      fabric.worldToLocal(localPoint.copy(hitPoint)).add(offset); simulation.moveGrab(localPoint.x, localPoint.y, localPoint.z + .22);
      root.dataset.pull = localPoint.distanceTo(gesture.start).toFixed(3);
    } else {
      const seconds = Math.max(.008, Math.min(.1, (e.timeStamp - brush.stamp) / 1000));
      brush.speed = Math.hypot(e.clientX - brush.x, e.clientY - brush.y) / seconds;
      brush.x = e.clientX; brush.y = e.clientY; brush.stamp = e.timeStamp; brush.dirty = true;
    }
    wake();
  });
  function release(e) {
    if (gesture && e?.pointerId !== undefined && gesture.id !== e.pointerId) return;
    // Keep quick flicks meaningful even if the browser skipped a frame during the gesture.
    if (gesture && e?.type !== 'pointercancel' && renderer && motion() && !lost) simulation.step(1 / 90, elapsed);
    gesture = null; simulation?.release(); canvas.dataset.dragging = 'false'; root.dataset.grabbed = 'false'; brush.dirty = false;
  }
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('pointerleave', () => { canvas.dataset.hover = 'false'; brush.dirty = false; });
  canvas.addEventListener('keydown', e => {
    if (![' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !simulation) return;
    e.preventDefault();
    if (e.key === 'Escape') { release(); simulation.reset(); }
    else if (motion()) simulation.impulse(0, -.2, e.key === ' ' ? 3.5 : .8, e.key === 'ArrowLeft' ? -2 : e.key === 'ArrowRight' ? 2 : 0, e.key === 'ArrowUp' ? 2 : e.key === 'ArrowDown' ? -2 : 0);
    wake();
  });
  touchButton.addEventListener('click', () => {
    const playing = root.dataset.touchPlaying !== 'true'; root.dataset.touchPlaying = String(playing);
    touchButton.setAttribute('aria-pressed', String(playing)); touchButton.textContent = playing ? 'Готово' : 'Попробовать'; release();
  });
  function syncMotion() {
    release(); touchButton.disabled = !motion();
    if (!motion()) { root.dataset.touchPlaying = 'false'; touchButton.setAttribute('aria-pressed', 'false'); touchButton.textContent = 'Попробовать'; }
    wake();
  }
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lost = true; stop(); root.dataset.ready = 'false'; fallback.textContent = 'Эффект приостановлен.'; fallback.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; studio?.dispose(); studio = makeStudio(); scene.environment = studio.texture;
    root.dataset.ready = 'true'; fallback.hidden = true; resize(); wake();
  });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { initialize(); wake(); } else stop();
  }, { rootMargin: '60px 0px' }).observe(canvas);
  small.addEventListener('change', resize);
  document.addEventListener('motion-preference-change', syncMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else wake(); });
  syncMotion();
}

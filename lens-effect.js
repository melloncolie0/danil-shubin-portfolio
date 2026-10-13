import * as THREE from 'three';
import { LensMotion } from './lens-motion.js';

const root = document.querySelector('#glass-lens');
if (root) {
  const canvas = root.querySelector('canvas'), touchButton = root.querySelector('.sandbox-touch');
  const status = root.querySelector('.lens-status'), small = matchMedia('(max-width:760px), (pointer:coarse)');
  const motion = () => document.documentElement.dataset.motion !== 'off';
  const fonts = document.fonts.load('400 160px Benzin').catch(() => {});
  let renderer, scene, camera, sphere, poster, posterTexture, environment;
  let visible = false, initializing = false, lost = false, frameId = 0, last = 0, width = 0, height = 0, radius = 1, gesture = null;
  const body = new LensMotion(1, 1);

  function makeEnvironment() {
    const studio = document.createElement('canvas');
    studio.width = small.matches ? 512 : 1024; studio.height = studio.width / 2;
    const light = studio.getContext('2d');
    light.fillStyle = '#030405'; light.fillRect(0, 0, studio.width, studio.height);
    // Smooth, seam-wrapped light fields avoid rectangular softbox reflections in the glass.
    for (const [u, v, rx, ry, color, opacity] of [
      [.20, .32, .14, .24, '235,242,255', .95],
      [.76, .42, .16, .30, '205,222,255', .40],
      [.48, .15, .27, .15, '245,247,255', .55]
    ]) {
      for (const wrap of [-1, 0, 1]) {
        light.save(); light.translate((u + wrap) * studio.width, v * studio.height);
        light.scale(rx * studio.width, ry * studio.height);
        const glow = light.createRadialGradient(0, 0, 0, 0, 0, 1);
        glow.addColorStop(0, `rgba(${color},${opacity})`);
        glow.addColorStop(.35, `rgba(${color},${opacity * .55})`);
        glow.addColorStop(.70, `rgba(${color},${opacity * .12})`);
        glow.addColorStop(1, `rgba(${color},0)`);
        light.fillStyle = glow; light.fillRect(-1, -1, 2, 2); light.restore();
      }
    }
    const texture = new THREE.CanvasTexture(studio); texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const generator = new THREE.PMREMGenerator(renderer);
    const target = generator.fromEquirectangular(texture);
    generator.dispose(); texture.dispose(); return target;
  }
  function drawPoster() {
    const sheet = document.createElement('canvas'), scale = Math.min(1.8, 2048 / width);
    sheet.width = Math.round(width * scale); sheet.height = Math.round(height * scale);
    const ink = sheet.getContext('2d'); ink.scale(scale, scale);
    ink.fillStyle = '#000'; ink.fillRect(0, 0, width, height);
    const lines = ['СМОТРИ', 'ГЛУБЖЕ'];
    ink.font = '400 160px Benzin';
    const measured = Math.max(...lines.map(line => ink.measureText(line).width));
    const size = Math.min(184, height * .235, (width - (small.matches ? 36 : width * .16)) / measured * 160);
    ink.font = '400 ' + size + 'px Benzin'; ink.textAlign = 'center'; ink.textBaseline = 'middle';
    ink.fillStyle = '#e9eaed';
    lines.forEach((line, i) => ink.fillText(line, width / 2, height * .49 + (i - .5) * size * 1.40));
    // Sparse calibration lines make the glass curvature visible between the letters.
    ink.strokeStyle = '#ffffff18'; ink.lineWidth = .75;
    for (const y of [height * .20, height * .80]) {
      ink.beginPath(); ink.moveTo(width * .12, y); ink.lineTo(width * .88, y); ink.stroke();
    }
    const texture = new THREE.CanvasTexture(sheet); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    posterTexture?.dispose(); posterTexture = texture; poster.material.map = texture; poster.material.needsUpdate = true;
  }
  async function initialize() {
    if (renderer || initializing || root.dataset.failed === 'true') return;
    initializing = true; await fonts;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !small.matches, alpha: false, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#000');
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 3000); camera.position.z = 1000;
      environment = makeEnvironment(); scene.environment = environment.texture;
      poster = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#fff', toneMapped: false })); scene.add(poster);
      const material = new THREE.MeshPhysicalMaterial({
        color: '#fff', metalness: 0, roughness: .025, transmission: 1, ior: 1.35,
        thickness: 1, dispersion: small.matches ? .35 : .65, clearcoat: .22, clearcoatRoughness: .08,
        envMapIntensity: .7, attenuationColor: '#ffffff', attenuationDistance: Infinity
      });
      sphere = new THREE.Mesh(new THREE.SphereGeometry(1, small.matches ? 40 : 64, small.matches ? 28 : 40), material); scene.add(sphere);
      resize(true); root.dataset.ready = 'true'; root.dataset.renderer = 'webgl'; status.hidden = true; wake();
    } catch {
      renderer?.dispose(); renderer = null; root.dataset.failed = 'true'; status.textContent = 'Этот эффект не удалось открыть.'; status.hidden = false;
    } finally { initializing = false; }
  }
  function resize(force = false) {
    const rect = canvas.getBoundingClientRect(), w = Math.round(rect.width), h = Math.round(rect.height);
    if (!renderer || !w || !h || !sphere || (!force && w === width && h === height)) return;
    width = w; height = h; gesture = null; body.resize(w, h);
    radius = small.matches ? Math.min(86, w * .22, h * .19) : Math.min(172, w * .125, h * .235);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small.matches ? 1.2 : 1.5));
    renderer.transmissionResolutionScale = small.matches ? .75 : 1; renderer.setSize(w, h, false);
    camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2; camera.updateProjectionMatrix();
    poster.scale.set(w, h, 1); poster.position.z = -radius * 1.15;
    sphere.scale.set(radius, radius, radius * .65); sphere.position.z = radius * .58;
    // Transmission thickness is local to the unit sphere; Three.js applies its world scale.
    sphere.material.thickness = 1.55; sphere.material.dispersion = small.matches ? .35 : .65;
    drawPoster(); root.dataset.radius = radius.toFixed(1); root.dataset.mobile = String(small.matches); canvas.dataset.dragging = 'false'; wake();
  }
  function render() {
    sphere.position.x = body.x - width / 2; sphere.position.y = height / 2 - body.y;
    renderer.render(scene, camera);
    root.dataset.x = body.x.toFixed(1); root.dataset.y = body.y.toFixed(1);
    root.dataset.speed = Math.hypot(body.vx, body.vy).toFixed(1);
    root.dataset.interaction = gesture ? 'drag' : body.active ? 'follow' : 'rest';
  }
  function wake() {
    if (renderer && visible && !document.hidden && !lost && !frameId) { last = 0; frameId = requestAnimationFrame(frame); }
  }
  function stop() { cancelAnimationFrame(frameId); frameId = 0; last = 0; release(true); root.dataset.running = 'false'; }
  function frame(now) {
    frameId = 0;
    if (!renderer || !visible || document.hidden || lost) return;
    if (small.matches && last && now - last < 1000 / 40) { frameId = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60; last = now;
    if (motion()) body.step(dt); else body.snap();
    render(); const moving = motion() && body.moving(); root.dataset.running = String(moving);
    if (moving) frameId = requestAnimationFrame(frame);
  }
  function point(e) {
    const rect = canvas.getBoundingClientRect(); body.point(e.clientX - rect.left, e.clientY - rect.top); wake();
  }
  canvas.addEventListener('pointermove', e => {
    if (!renderer || !motion() || (e.pointerType !== 'mouse' && !gesture) || (gesture && gesture.id !== e.pointerId)) return;
    point(e);
  });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !renderer || !motion()) return;
    gesture = { id: e.pointerId }; point(e); canvas.setPointerCapture(e.pointerId); canvas.dataset.dragging = 'true';
    root.dataset.drags = String(Number(root.dataset.drags || 0) + 1);
  });
  function release(home = false) { gesture = null; canvas.dataset.dragging = 'false'; if (home) body.home(); }
  function pointerUp(e) {
    if (gesture && gesture.id !== e.pointerId) return;
    const outside = body.targetX < 0 || body.targetX > width || body.targetY < 0 || body.targetY > height;
    release(e.pointerType !== 'mouse' || outside); wake();
  }
  canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('lostpointercapture', pointerUp);
  canvas.addEventListener('pointercancel', () => { release(true); wake(); });
  canvas.addEventListener('pointerleave', () => { if (!gesture) { release(true); wake(); } });
  canvas.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key) || !renderer) return;
    e.preventDefault();
    if (e.key === 'Escape') release(true);
    else if (motion()) body.point(body.targetX + (e.key === 'ArrowLeft' ? -55 : e.key === 'ArrowRight' ? 55 : 0), body.targetY + (e.key === 'ArrowUp' ? -55 : e.key === 'ArrowDown' ? 55 : 0));
    wake();
  });
  touchButton.addEventListener('click', () => {
    const playing = root.dataset.touchPlaying !== 'true'; root.dataset.touchPlaying = String(playing);
    touchButton.setAttribute('aria-pressed', String(playing)); touchButton.textContent = playing ? 'Готово' : 'Попробовать'; release(true); wake();
  });
  function syncMotion() {
    release(true); touchButton.disabled = !motion();
    if (!motion()) { root.dataset.touchPlaying = 'false'; touchButton.setAttribute('aria-pressed', 'false'); touchButton.textContent = 'Попробовать'; }
    wake();
  }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; stop(); });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; environment?.dispose(); environment = makeEnvironment(); scene.environment = environment.texture;
    posterTexture.needsUpdate = true; wake();
  });
  new ResizeObserver(() => resize()).observe(canvas); small.addEventListener('change', () => resize(true));
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { initialize(); wake(); } else stop(); }, { rootMargin: '60px 0px' }).observe(canvas);
  document.addEventListener('motion-preference-change', syncMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else wake(); });
  syncMotion();
}

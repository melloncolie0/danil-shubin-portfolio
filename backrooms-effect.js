import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { BackroomsView } from './backrooms-view.js';
import { BackroomsWalk } from './backrooms-walk.js';
import { buildWalkSpace } from './backrooms-collision.js';
import { RenderCadence } from './backrooms-timing.js';
import { PortalMotion } from './portal-motion.js';

const root = document.querySelector('#scene-portal');
if (root) {
  const canvas = root.querySelector('canvas'), status = root.querySelector('.portal-status');
  const closeButton = root.querySelector('.portal-close');
  const joystick = root.querySelector('.portal-joystick'), thumb = joystick.querySelector('span');
  const small = matchMedia('(max-width:760px), (pointer:coarse)'), view = new BackroomsView(), aperture = new PortalMotion(1, 1);
  const motion = () => document.documentElement.dataset.motion !== 'off';
  let renderer, roomScene, figureScene, camera, location, figure, walk;
  let sceneTarget, screenScene, screenCamera, mask;
  let loading = false, visible = false, lost = false, frameId = 0, width = 0, height = 0, bleed = 0, gesture = null;
  const cadence = new RenderCadence(60);
  const keys = new Set(), directions = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
  let stick = null, stickX = 0, stickY = 0, quality = 1, fpsStart = 0, fpsFrames = 0, slowWindows = 0;

  async function initialize() {
    if (renderer || loading || root.dataset.failed === 'true') return;
    loading = true; status.hidden = false; status.textContent = 'Загружаю Backrooms…';
    const variant = small.matches ? 'mobile' : 'web';
    try {
      const loader = new GLTFLoader();
      const [room, cutout] = await Promise.all([
        loader.loadAsync(new URL(`./media/backrooms/backrooms-${variant}.glb`, import.meta.url).href),
        loader.loadAsync(new URL(`./media/backrooms/caveman-${variant}.glb`, import.meta.url).href)
      ]);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = 1; renderer.autoClear = false;
      roomScene = new THREE.Scene(); roomScene.background = new THREE.Color('#000');
      figureScene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(58, 1, .04, 110);
      location = room.scene; roomScene.add(location); location.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(location);
      root.dataset.bounds = [bounds.min.toArray(), bounds.max.toArray()].map(p => p.map(n => n.toFixed(2)).join(',')).join(';');
      const cutoutBounds = new THREE.Box3().setFromObject(cutout.scene), size = cutoutBounds.getSize(new THREE.Vector3());
      const center = cutoutBounds.getCenter(new THREE.Vector3()), scale = 2.10 / size.y;
      cutout.scene.scale.multiplyScalar(scale);
      cutout.scene.position.set(-center.x * scale, -cutoutBounds.min.y * scale, -center.z * scale);
      figure = new THREE.Group(); figure.add(cutout.scene); figure.rotation.y = Math.PI / 2;
      figure.position.set(-6.7, -.1176, 5.2); figureScene.add(figure);
      const space = buildWalkSpace(location, figure); walk = new BackroomsWalk(space);
      if (!space.supported(walk.x, walk.z, walk.radius)) throw new Error('Starting point must have a floor');
      root.dataset.walls = String(space.segments.length); root.dataset.floorTriangles = String(space.triangles.length);
      camera.position.set(-2, 1.50, 5.2); camera.rotation.order = 'YXZ';
      // Keep the room's baked illumination. Light the cutout in a separate pass with the same depth buffer.
      figureScene.add(new THREE.HemisphereLight('#ffefd0', '#5b4d36', 1.45));
      const key = new THREE.DirectionalLight('#fff7df', 2.3); key.position.set(-1, 3.2, 4); key.target.position.copy(figure.position);
      figureScene.add(key, key.target);
      const fill = new THREE.DirectionalLight('#c3c8b4', .5); fill.position.set(-10, 2, 7); figureScene.add(fill);
      const textures = new Set(); let triangles = 0, meshes = 0;
      for (const model of [location, cutout.scene]) model.traverse(object => {
        if (!object.isMesh) return;
        meshes++; triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      for (const texture of textures) texture.anisotropy = Math.min(small.matches ? 2 : 4, renderer.capabilities.getMaxAnisotropy());
      for (const scene of [roomScene, figureScene]) {
        scene.updateMatrixWorld(true);
        scene.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
      }
      root.dataset.meshes = String(meshes); root.dataset.triangles = String(Math.round(triangles));
      sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
      mask = new THREE.ShaderMaterial({
        uniforms: { uScene: { value: sceneTarget.texture }, uSize: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: 1 } },
        depthTest: false, depthWrite: false,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
        fragmentShader: `uniform sampler2D uScene;uniform vec2 uSize,uCenter;uniform float uRadius;varying vec2 vUv;
          void main(){
            float edge=length(vUv*uSize-uCenter)-uRadius;
            float visible=1.0-smoothstep(-1.5,1.5,edge);
            // Reveal the same fixed view, without zoom, glow or a visible ring.
            gl_FragColor=vec4(texture2D(uScene,vUv).rgb*visible,1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      });
      screenScene = new THREE.Scene(); screenCamera = new THREE.Camera();
      screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mask));
      root.dataset.variant = variant; root.dataset.scene = 'backrooms'; root.dataset.ring = 'false'; root.dataset.mapping = 'fixed-world'; root.dataset.targetFps = '60';
      resize(true); status.textContent = 'Готовлю сцену…';
      // Compile before revealing the portal so first-time shader work does not interrupt walking.
      renderer.setRenderTarget(sceneTarget);
      await renderer.compileAsync(roomScene, camera); await renderer.compileAsync(figureScene, camera);
      renderer.setRenderTarget(null); await renderer.compileAsync(screenScene, screenCamera);
      root.dataset.ready = 'true'; root.dataset.renderer = 'webgl'; status.hidden = true; syncControls(); wake();
    } catch {
      renderer?.dispose(); renderer = null; root.dataset.failed = 'true';
      status.textContent = 'Локацию не удалось загрузить. Обнови страницу, чтобы попробовать ещё раз.'; status.hidden = false;
    } finally { loading = false; }
  }
  function resize(force = false) {
    const rect = root.getBoundingClientRect(), draw = canvas.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height), extra = Math.max(0, (draw.height - rect.height) / 2);
    if (!renderer || !w || !h || (!force && w === width && h === height && Math.abs(extra - bleed) < .1)) return;
    release(true); clearMovement(); width = w; height = h; bleed = extra; aperture.resize(w, h, bleed);
    const renderHeight = h + bleed * 2;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small.matches ? 1 : 1.35) * quality); renderer.setSize(w, renderHeight, false);
    const projection = aperture.viewportProjection(small.matches ? 66 : 58);
    camera.aspect = projection.aspect; camera.fov = projection.fov; camera.updateProjectionMatrix();
    sizeTarget();
    mask.uniforms.uSize.value.set(w, renderHeight); mask.uniforms.uCenter.value.set(aperture.cx, h + bleed - aperture.cy);
    root.dataset.mobile = String(small.matches); root.dataset.bleed = bleed.toFixed(1); syncControls(); wake();
  }
  function sizeTarget() {
    const scale = Math.min(1.3, (small.matches ? 896 : 1280) / Math.max(width, height + bleed * 2)) * quality;
    sceneTarget.setSize(Math.round(width * scale), Math.round((height + bleed * 2) * scale));
    root.dataset.quality = quality.toFixed(2);
  }
  function syncControls() {
    root.dataset.expanded = String(aperture.opened); closeButton.hidden = !aperture.opened;
    root.dataset.touchPlaying = String(aperture.opened && motion());
    joystick.hidden = !aperture.opened || !motion();
    if (!aperture.opened) clearMovement();
  }
  function render() {
    const started = performance.now();
    camera.position.set(walk.x, walk.y, walk.z);
    camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
    renderer.setRenderTarget(sceneTarget); renderer.clear(); renderer.render(roomScene, camera); renderer.render(figureScene, camera);
    mask.uniforms.uRadius.value = aperture.radius;
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(screenScene, screenCamera);
    root.dataset.yaw = view.yaw.toFixed(3); root.dataset.pitch = view.pitch.toFixed(3);
    root.dataset.dragging = String(Boolean(gesture));
    root.dataset.radius = aperture.radius.toFixed(1); root.dataset.reveal = aperture.reveal().toFixed(3);
    root.dataset.position = [walk.x, walk.y, walk.z].map(n => n.toFixed(3)).join(',');
    root.dataset.walkDistance = walk.distance.toFixed(2); root.dataset.walking = String(walk.moving());
    root.dataset.drawMs = (performance.now() - started).toFixed(2);
  }
  function wake() {
    if (renderer && root.dataset.ready === 'true' && visible && !document.hidden && !lost && !frameId) { cadence.reset(); fpsStart = 0; fpsFrames = 0; frameId = requestAnimationFrame(frame); }
  }
  function stop() { cancelAnimationFrame(frameId); frameId = 0; cadence.reset(); release(true); clearMovement(); root.dataset.running = 'false'; }
  function frame(now) {
    frameId = 0;
    if (!renderer || !visible || document.hidden || lost) return;
    const tick = cadence.take(now);
    if (!tick) { frameId = requestAnimationFrame(frame); return; }
    const { dt, gap } = tick;
    if (motion()) { view.step(dt); aperture.step(dt); if (aperture.opened) walk.step(dt, view.yaw); } else { view.snap(); aperture.snap(); }
    render(); measure(now, gap);
    const moving = motion() && (view.moving() || aperture.moving() || walk.moving()); root.dataset.running = String(moving);
    if (moving) frameId = requestAnimationFrame(frame);
  }
  function measure(now, gap) {
    // Long pauses from an inactive browser or shader compilation are not GPU load.
    if (gap > 150) { fpsStart = now; fpsFrames = slowWindows = 0; root.dataset.frameGap = gap.toFixed(0); return; }
    if (!fpsStart) { fpsStart = now; fpsFrames = 0; return; }
    fpsFrames++;
    if (now - fpsStart < 1000) return;
    const fps = fpsFrames * 1000 / (now - fpsStart); root.dataset.fps = fps.toFixed(1);
    slowWindows = fps < 52 ? slowWindows + 1 : 0;
    if (slowWindows >= 2 && quality > .66) {
      quality = Math.max(.65, quality - .1); slowWindows = 0;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small.matches ? 1 : 1.35) * quality);
      renderer.setSize(width, height + bleed * 2, false); sizeTarget();
    }
    fpsStart = now; fpsFrames = 0;
  }
  function movementInput() {
    let x = stickX, y = stickY;
    for (const code of keys) { const direction = directions[code]; if (direction) { x += direction[0]; y += direction[1]; } }
    walk?.input(x, y); wake();
  }
  function clearMovement() {
    keys.clear(); resetStick(); walk?.stop(); root.dataset.walking = 'false';
  }
  function resetStick() {
    stickX = stickY = 0;
    const id = stick?.id; stick = null;
    if (id !== undefined && joystick.hasPointerCapture(id)) joystick.releasePointerCapture(id);
    thumb.style.transform = 'translate(0px,0px)';
  }
  function exit() {
    release(true); clearMovement(); aperture.close(); view.reset(); walk?.reset();
    syncControls(); wake();
  }
  function pointer(e) {
    const r = root.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    return { x, y, distance: Math.hypot(x - aperture.cx, y - aperture.cy) };
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || root.dataset.ready !== 'true' || !motion() || gesture) return;
    const p = pointer(e), edge = !aperture.opened && Math.abs(p.distance - aperture.radius) < (small.matches ? 32 : 24);
    if (!edge && p.distance > aperture.radius) return;
    canvas.focus({ preventScroll: true });
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: 0, edge };
    if (edge) aperture.beginResize(p.distance);
    canvas.setPointerCapture(e.pointerId); canvas.dataset.dragging = 'true';
    root.dataset.drags = String(Number(root.dataset.drags || 0) + 1); wake();
  });
  canvas.addEventListener('pointermove', e => {
    if (!renderer || !motion() || (gesture && gesture.id !== e.pointerId) || (e.pointerType !== 'mouse' && !gesture)) return;
    if (gesture) {
      gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY));
      if (gesture.edge) aperture.dragResize(pointer(e).distance);
      else view.turn((e.clientX - gesture.x) * .003, (e.clientY - gesture.y) * .0025);
      gesture.x = e.clientX; gesture.y = e.clientY;
    } else {
      const r = root.getBoundingClientRect(), p = pointer(e);
      view.aim((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1);
      canvas.dataset.hover = !aperture.opened && Math.abs(p.distance - aperture.radius) < 24 ? 'edge' : p.distance <= aperture.radius ? 'inside' : 'none';
    }
    wake();
  });
  function release(cancel = false, e) {
    if (!gesture || (e?.pointerId !== undefined && e.pointerId !== gesture.id)) return;
    const id = gesture.id;
    if (gesture.edge) aperture.endResize(cancel);
    else if (!cancel && gesture.moved < 8 && (e?.pointerType === 'mouse' || !aperture.opened)) aperture.toggle();
    gesture = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    canvas.dataset.dragging = 'false'; root.dataset.dragging = 'false'; view.home(); syncControls();
  }
  canvas.addEventListener('pointerup', e => { release(false, e); wake(); });
  canvas.addEventListener('pointercancel', e => { release(true, e); wake(); });
  canvas.addEventListener('lostpointercapture', e => { release(true, e); wake(); });
  canvas.addEventListener('pointerleave', () => { if (!gesture) view.home(); wake(); });
  canvas.addEventListener('keydown', e => {
    if (!['Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !renderer) return;
    e.preventDefault(); if (e.key === 'Escape') { exit(); return; }
    else if (motion()) {
      if (e.key === 'Enter' || e.key === ' ') aperture.toggle();
      else view.turn(e.key === 'ArrowLeft' ? -.12 : e.key === 'ArrowRight' ? .12 : 0, e.key === 'ArrowUp' ? -.08 : e.key === 'ArrowDown' ? .08 : 0);
    }
    syncControls();
    wake();
  });
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && root.contains(document.activeElement)) { e.preventDefault(); exit(); return; }
    if (!directions[e.code] || !renderer || !visible || !motion() || !root.contains(document.activeElement)) return;
    e.preventDefault(); aperture.setOpen(true); keys.add(e.code); syncControls(); movementInput();
  });
  window.addEventListener('keyup', e => { if (keys.delete(e.code)) { e.preventDefault(); movementInput(); } });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) clearMovement(); });
  window.addEventListener('blur', () => { release(true); clearMovement(); });
  joystick.addEventListener('pointerdown', e => {
    if (e.button !== 0 || stick || !motion() || !aperture.opened) return;
    e.preventDefault(); joystick.focus({ preventScroll: true });
    const rect = joystick.getBoundingClientRect(); stick = { id: e.pointerId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    joystick.setPointerCapture(e.pointerId); moveStick(e);
  });
  function moveStick(e) {
    if (!stick || e.pointerId !== stick.id) return;
    const dx = e.clientX - stick.x, dy = e.clientY - stick.y, length = Math.max(30, Math.hypot(dx, dy));
    stickX = dx / length; stickY = -dy / length;
    thumb.style.transform = `translate(${stickX * 24}px,${-stickY * 24}px)`; movementInput();
  }
  joystick.addEventListener('pointermove', moveStick);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(event, e => {
    if (stick?.id === e.pointerId) { resetStick(); movementInput(); }
  });
  joystick.addEventListener('keydown', e => {
    const map = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' }, code = map[e.key];
    if (code) { e.preventDefault(); keys.add(code); movementInput(); }
  });
  joystick.addEventListener('keyup', e => {
    const code = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' }[e.key];
    if (code) { e.preventDefault(); keys.delete(code); movementInput(); }
  });
  closeButton.addEventListener('click', exit);
  function syncMotion() {
    release(true); clearMovement();
    if (!motion()) {
      view.reset(); walk?.reset(); aperture.close();
    }
    syncControls(); wake();
  }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; stop(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; resize(true); wake(); });
  new ResizeObserver(() => resize()).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { initialize(); wake(); } else stop(); }, { rootMargin: '60px 0px' }).observe(canvas);
  small.addEventListener('change', () => resize(true));
  document.addEventListener('motion-preference-change', syncMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else wake(); });
  syncMotion();
}

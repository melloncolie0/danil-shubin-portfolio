import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/three/examples/jsm/libs/meshopt_decoder.module.js';

// Keep the supplied GLB intact. Facial motion is applied to each instance on the GPU.
const modelURL = new URL('./media/head/tripo-head.glb', import.meta.url);
const clamp = THREE.MathUtils.clamp;
const portraits = [];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionEnabled = () => document.documentElement.dataset.motion
  ? document.documentElement.dataset.motion !== 'off' : !reduced.matches;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const modelPromise = loader.loadAsync(modelURL.href);

function addFaceMotion(content, uniforms) {
  content.traverse(object => {
    if (!object.isMesh) return;
    const install = original => {
      const material = original.clone();
      material.onBeforeCompile = shader => {
        shader.uniforms.portraitBlink = uniforms.blink;
        shader.uniforms.portraitGaze = uniforms.gaze;
        shader.uniforms.portraitMouth = uniforms.mouth;
        const face = `
          uniform float portraitBlink;
          uniform vec2 portraitGaze;
          uniform float portraitMouth;
          varying vec3 portraitFace;
          float eyeRegion(vec3 p, vec2 radius) {
            vec2 eye = vec2((abs(p.z) - 0.111) / radius.x, (p.y - 0.018) / radius.y);
            return (1.0 - smoothstep(0.72, 1.22, length(eye))) * smoothstep(0.18, 0.28, p.x);
          }
        `;
        shader.vertexShader = face + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          portraitFace = position;
          float lid = eyeRegion(position, vec2(0.058, 0.027));
          transformed.y -= (position.y - 0.018) * portraitBlink * lid * 0.88;
          // Lower lip and upper chin move together; the moustache stays in place.
          float jawWidth = 1.0 - smoothstep(0.065, 0.125, abs(position.z));
          float jawLower = 1.0 - smoothstep(-0.222, -0.197, position.y);
          float jawChin = smoothstep(-0.395, -0.285, position.y);
          float jawFront = smoothstep(0.24, 0.32, position.x);
          float jaw = jawWidth * jawLower * jawChin * jawFront;
          transformed.y -= portraitMouth * jaw * 0.024;
          transformed.x -= portraitMouth * jaw * 0.003;
        `);
        shader.fragmentShader = face + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #ifdef USE_MAP
            // Convert a small movement along the face into local texture coordinates.
            vec2 dx = dFdx(portraitFace.zy);
            vec2 dy = dFdy(portraitFace.zy);
            float det = dx.x * dy.y - dx.y * dy.x;
            vec2 ux = dFdx(vMapUv);
            vec2 uy = dFdy(vMapUv);
            vec2 gazeOffset = vec2(0.0);
            vec2 lidOffset = vec2(0.0);
            if (abs(det) > 0.00000001) {
              vec2 shift = vec2(-portraitGaze.x * 0.010, portraitGaze.y * 0.005);
              gazeOffset = ux * (shift.x * dy.y - shift.y * dy.x) / det
                         + uy * (dx.x * shift.y - dx.y * shift.x) / det;
              lidOffset = ux * (-0.030 * dy.x) / det + uy * (0.030 * dx.x) / det;
            }
            float iris = eyeRegion(portraitFace, vec2(0.046, 0.016));
            vec4 sampledDiffuseColor = texture2D(map, vMapUv - gazeOffset * iris * (1.0 - portraitBlink));
            vec4 lidColor = texture2D(map, vMapUv + lidOffset);
            sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, lidColor.rgb,
              portraitBlink * eyeRegion(portraitFace, vec2(0.053, 0.021)));
            // A narrow shaded opening follows the lips as the jaw relaxes.
            vec2 mouthShape = vec2(portraitFace.z / 0.092,
              (portraitFace.y + 0.207) / (0.002 + portraitMouth * 0.0045));
            float mouthOpening = (1.0 - smoothstep(0.78, 1.12, length(mouthShape)))
              * smoothstep(0.24, 0.32, portraitFace.x) * min(1.0, portraitMouth * 1.6);
            sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.032, 0.009, 0.008), mouthOpening);
            diffuseColor *= sampledDiffuseColor;
          #endif
        `);
      };
      material.customProgramCacheKey = () => 'portrait-face-motion-v2';
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(install) : install(object.material);
  });
}

class ModelPortrait {
  constructor(canvas, content) {
    this.canvas = canvas;
    this.visible = canvas.closest('.portrait-assistant')?.hidden !== true;
    this.speaking = false;
    this.frame = 0;
    this.lastTime = 0;
    this.startTime = performance.now();
    this.targetX = this.targetY = this.yaw = this.pitch = 0;
    this.frontYaw = -Math.PI/2;
    this.orbitYaw = this.orbitPitch = 0;
    this.orbit = canvas.hasAttribute('data-orbit');
    this.hovering = false;
    this.nodStart = -10;
    this.renderCount = 0;
    this.eyeX = this.eyeY = 0;
    this.mouthOpen = 0;
    this.mouthOverride = null;
    this.gazeOverride = null;
    this.eyesClosed = false;
    this.blinkStart = -10;
    this.nextBlink = 1.8 + Math.random();
    this.blinkCount = 0;
    this.lastPointer = -10;
    this.faceUniforms = {blink:{value:0}, gaze:{value:new THREE.Vector2()}, mouth:{value:0}};
    addFaceMotion(content, this.faceUniforms);
    this.renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true,
      powerPreference:'low-power', preserveDrawingBuffer:this.orbit});
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1,1,1,-1,.01,20);
    this.camera.position.set(0,0,4);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x514840,2.5));
    const key = new THREE.DirectionalLight(0xfff8ef,3);
    key.position.set(-2,3,4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xf0f4ff,1.5);
    fill.position.set(3,1,2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff,1.3);
    rim.position.set(1,2,-3);
    this.scene.add(rim);
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    content.position.sub(center);
    this.baseScale = 1/Math.max(size.y,.00001);
    this.root = new THREE.Group();
    this.root.add(content);
    this.root.scale.setScalar(this.baseScale);
    this.scene.add(this.root);
    let triangles = 0;
    content.traverse(object=> {
      if (!object.isMesh) return;
      const geometry = object.geometry;
      triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count)/3;
      object.frustumCulled = true;
    });
    canvas.dataset.modelSource = 'tripo-head.glb';
    canvas.dataset.triangles = triangles;
    this.tick = this.tick.bind(this);
    this.resizeObserver = new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas);
    const avatar = canvas.closest('.assistant-avatar');
    if (avatar) {
      avatar.addEventListener('pointerenter',()=>{this.hovering=true;this.resume();});
      avatar.addEventListener('pointerleave',()=>{this.hovering=false;});
      avatar.addEventListener('click',()=>this.nod());
    }
    if (this.orbit) this.attachOrbit();
    canvas.addEventListener('webglcontextlost',event=> {
      event.preventDefault(); this.stop(); canvas.dataset.ready='false';
    });
    canvas.addEventListener('webglcontextrestored',()=> {
      canvas.dataset.ready='true'; this.resize(); this.resume();
    });
    this.resize();
    canvas.dataset.ready = 'true';
    this.resume();
  }
  enabled() { return motionEnabled(); }
  resize() {
    const box = this.canvas.getBoundingClientRect();
    if (box.width<=0 || box.height<=0) {this.stop();return;}
    this.renderer.setSize(Math.max(1,box.width),Math.max(1,box.height),false);
    const aspect = box.width/Math.max(1,box.height);
    const halfHeight = .64;
    this.camera.left=-halfHeight*aspect; this.camera.right=halfHeight*aspect;
    this.camera.top=halfHeight; this.camera.bottom=-halfHeight;
    this.camera.updateProjectionMatrix();
    this.draw((performance.now()-this.startTime)/1000,0);
    this.resume();
  }
  attachOrbit() {
    let drag = null;
    this.canvas.addEventListener('pointerdown',event=> {
      drag={id:event.pointerId,x:event.clientX,y:event.clientY};
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove',event=> {
      if (!drag || drag.id!==event.pointerId) return;
      this.orbitYaw+=(event.clientX-drag.x)*.009;
      this.orbitPitch=clamp(this.orbitPitch+(event.clientY-drag.y)*.006,-.6,.6);
      drag.x=event.clientX; drag.y=event.clientY;
      this.draw((performance.now()-this.startTime)/1000,0);
    });
    const release=()=>{drag=null;};
    this.canvas.addEventListener('pointerup',release);
    this.canvas.addEventListener('pointercancel',release);
  }
  nod() {
    if (!this.enabled()) return;
    this.nodStart=(performance.now()-this.startTime)/1000;
    this.resume();
  }
  blink(wake=true) {
    if (!this.enabled()) return;
    this.blinkStart=(performance.now()-this.startTime)/1000;
    this.nextBlink=this.blinkStart+2.8+Math.random()*3;
    this.blinkCount++;
    if (wake) this.resume();
  }
  updateEyes(time, moving, blend) {
    if (moving && time >= this.nextBlink) this.blink(false);
    const phase=time-this.blinkStart;
    let blink=0;
    if (moving && phase>=0 && phase<0.30) {
      if (phase<0.10) blink=Math.sin(phase/0.10*Math.PI/2);
      else if (phase<0.14) blink=1;
      else blink=Math.cos((phase-0.14)/0.16*Math.PI/2);
    }
    if (moving && this.eyesClosed) blink=1;
    const idle=time-this.lastPointer>3;
    const glance=idle?Math.sin(time*0.83)*0.24:0;
    const x=moving?(this.gazeOverride?.x ?? (this.targetX*0.82+glance)):0;
    const y=moving?(this.gazeOverride?.y ?? (-this.targetY*0.72+Math.sin(time*0.51)*0.08)):0;
    this.eyeX+=(clamp(x,-1,1)-this.eyeX)*blend;
    this.eyeY+=(clamp(y,-1,1)-this.eyeY)*blend;
    if (!moving) this.eyeX=this.eyeY=0;
    this.faceUniforms.blink.value=blink;
    this.faceUniforms.gaze.value.set(this.eyeX,this.eyeY);
    this.canvas.dataset.blink=blink.toFixed(3);
    this.canvas.dataset.blinks=this.blinkCount;
    this.canvas.dataset.gazeX=this.eyeX.toFixed(3);
    this.canvas.dataset.gazeY=this.eyeY.toFixed(3);
    this.canvas.dataset.eyeMotion=moving?'on':'off';
  }
  updateMouth(time, moving, dt) {
    const speech=clamp(0.45+Math.sin(time*18.5)*0.24+Math.sin(time*29.3+0.7)*0.13,0.14,0.82);
    const target=moving ? (this.mouthOverride ?? (this.speaking?speech:0)) : 0;
    const speed=target>this.mouthOpen?24:14;
    this.mouthOpen+=(target-this.mouthOpen)*(1-Math.exp(-Math.max(dt,.016)*speed));
    if (!moving || this.mouthOpen<0.0005) this.mouthOpen=0;
    this.faceUniforms.mouth.value=this.mouthOpen;
    this.canvas.dataset.mouth=this.mouthOpen.toFixed(3);
    this.canvas.dataset.speaking=moving && this.speaking?'true':'false';
  }
  stop() { cancelAnimationFrame(this.frame); this.frame=0; }
  resume() {
    if (document.hidden || !this.visible) return;
    if (!this.enabled()) { this.draw(0,0); return; }
    if (!this.frame) this.frame=requestAnimationFrame(this.tick);
  }
  tick(now) {
    this.frame=0;
    if (document.hidden || !this.visible || !this.enabled()) return;
    const fps=matchMedia('(pointer:coarse)').matches?18:24;
    if (now-this.lastTime>=1000/fps) {
      const dt=Math.min(.1,(now-this.lastTime)/1000);
      this.lastTime=now;
      this.draw((now-this.startTime)/1000,dt);
    }
    this.frame=requestAnimationFrame(this.tick);
  }
  draw(time,dt=.04) {
    const moving=this.enabled() && this.visible;
    const desiredYaw=this.orbit?this.orbitYaw:(moving?this.targetX*.24+Math.sin(time*.65)*.016:0);
    const desiredPitch=this.orbit?this.orbitPitch:(moving?this.targetY*.12:0);
    const blend=1-Math.exp(-Math.max(dt,.016)*9);
    this.yaw+=(desiredYaw-this.yaw)*blend;
    this.pitch+=(desiredPitch-this.pitch)*blend;
    if (!moving || this.orbit) {this.yaw=desiredYaw;this.pitch=desiredPitch;}
    const progress=clamp((time-this.nodStart)/.65,0,1);
    const pulse=moving?Math.sin(progress*Math.PI):0;
    const nod=moving?Math.sin(progress*Math.PI*2)*pulse*.16:0;
    const pop=1+(moving && this.hovering ? .025 : 0)+pulse*.025;
    this.root.rotation.set(this.pitch+nod,this.frontYaw+this.yaw,0);
    this.root.position.y=moving && !this.orbit?Math.sin(time*.95)*.009:0;
    this.root.scale.setScalar(this.baseScale*pop);
    this.updateEyes(time,moving,blend);
    this.updateMouth(time,moving,dt);
    this.renderer.render(this.scene,this.camera);
    this.renderCount++;
    this.canvas.dataset.frames=this.renderCount;
    this.canvas.dataset.yaw=this.yaw.toFixed(3);
    this.canvas.dataset.pitch=(this.pitch+nod).toFixed(3);
    this.canvas.dataset.motion=moving?'on':'off';
    this.canvas.dataset.nod=pulse.toFixed(3);
  }
}

async function initialize() {
  const asset = await modelPromise;
  for (const canvas of document.querySelectorAll('[data-portrait]')) {
    try {
      const portrait=new ModelPortrait(canvas,asset.scene.clone(true));
      canvas.portrait=portrait;
      portraits.push(portrait);
      canvas.dispatchEvent(new Event('portrait-ready'));
    } catch(error) {
      console.warn('Model portrait unavailable',error);
      canvas.dataset.ready='false';
    }
  }
}
document.addEventListener('pointermove',event=> {
  if (event.pointerType==='touch') return;
  portraits.forEach(portrait=> {
    const box=portrait.canvas.getBoundingClientRect();
    portrait.targetX=clamp((event.clientX-box.left-box.width/2)/Math.max(innerWidth*.55,1),-1,1);
    portrait.targetY=clamp((event.clientY-box.top-box.height/2)/Math.max(innerHeight*.6,1),-1,1);
    portrait.lastPointer=(performance.now()-portrait.startTime)/1000;
  });
},{passive:true});
document.documentElement.addEventListener('pointerleave',()=>portraits.forEach(p=>{p.targetX=p.targetY=0;}));
document.addEventListener('visibilitychange',()=>portraits.forEach(p=>document.hidden?p.stop():p.resume()));
document.addEventListener('motion-preference-change',()=>portraits.forEach(p=>{p.stop();p.nodStart=-10;p.blinkStart=-10;p.nextBlink=(performance.now()-p.startTime)/1000+1.8;p.resume();}));
initialize().catch(error=> {
  console.warn('Supplied model unavailable',error);
  document.querySelectorAll('[data-portrait]').forEach(c=>c.dataset.ready='false');
});

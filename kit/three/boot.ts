/**
 * Three.js setup in one call: renderer, scene, camera, resize, bloom, fixed-ish loop, HTML HUD.
 *
 *   const { scene, camera, loop, hud } = bootThree({ bloom: true });
 *   loop((dt, t) => { ... });          // dt in seconds, clamped
 *   hud.innerHTML = `<div class="score">0</div>`;
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import '@fontsource/orbitron/700.css';
import '@fontsource/press-start-2p/400.css';

export interface ThreeOpts {
  parent?: HTMLElement;
  background?: number;
  fog?: { color?: number; near: number; far: number };
  fov?: number;
  shadows?: boolean;
  /** UnrealBloom: true or { strength, radius, threshold } */
  bloom?: boolean | { strength?: number; radius?: number; threshold?: number };
  /** cap device pixel ratio for perf */
  maxPixelRatio?: number;
}

export function bootThree(o: ThreeOpts = {}) {
  const parent = o.parent ?? document.getElementById('game') ?? document.body;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, o.maxPixelRatio ?? 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (o.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  parent.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.background ?? 0x05060f);
  if (o.fog) scene.fog = new THREE.Fog(o.fog.color ?? o.background ?? 0x05060f, o.fog.near, o.fog.far);
  const camera = new THREE.PerspectiveCamera(o.fov ?? 60, 1, 0.1, 2000);

  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  if (o.bloom) {
    const b = o.bloom === true ? {} : o.bloom;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength ?? 0.9, b.radius ?? 0.4, b.threshold ?? 0.2);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  const hud = document.createElement('div');
  hud.className = 'hud';
  Object.assign(hud.style, { position: 'absolute', inset: '0', pointerEvents: 'none', fontFamily: 'Orbitron, system-ui, sans-serif', color: '#fff' });
  parent.appendChild(hud);

  const resizers: ((w: number, h: number) => void)[] = [];
  let customRender: ((dt: number) => void) | null = null;
  const resize = () => {
    const w = parent.clientWidth || innerWidth, h = parent.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    for (const r of resizers) r(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  let shake = 0;
  const timer = new THREE.Timer();
  timer.connect(document); // pauses delta while the tab is hidden
  let paused = false;
  const loop = (fn: (dt: number, t: number) => void) => {
    renderer.setAnimationLoop((now) => {
      timer.update(now);
      const dt = Math.min(timer.getDelta(), 1 / 20);
      if (!paused) fn(dt, timer.getElapsed());
      // camera shake is applied for the render only, then removed, so game logic never sees it
      const ox = (Math.random() - 0.5) * shake, oy = (Math.random() - 0.5) * shake;
      camera.position.x += ox; camera.position.y += oy;
      if (customRender) customRender(dt); else if (composer) composer.render(); else renderer.render(scene, camera);
      camera.position.x -= ox; camera.position.y -= oy;
      shake *= Math.pow(0.0005, dt);
    });
  };

  const api = {
    THREE, renderer, scene, camera, composer, bloomPass, hud, loop,
    /** world-unit shake amplitude, decays automatically */
    shake(amount = 0.3) { shake = Math.max(shake, amount); },
    /** take over how each frame is drawn (e.g. kit/three/realism's post-processing chain) */
    setRender(fn: ((dt: number) => void) | null) { customRender = fn; },
    /** called with the canvas size now and on every resize */
    onResize(fn: (w: number, h: number) => void) { resizers.push(fn); fn(parent.clientWidth || innerWidth, parent.clientHeight || innerHeight); },
    set paused(p: boolean) { paused = p; },
    get paused() { return paused; },
  };
  (window as any).__game = api;
  return api;
}

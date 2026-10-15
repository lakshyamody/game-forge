/**
 * Renders one asset, framed the same way every time, for the Studio's "choose the look" cards.
 *   /preview.html?target=<target>[&tint=rrggbb]      target: "pack/name" (library model) · "texture:<id>" · "hdri:<id>" · "code:<path.ts>"
 * A code target is a module (e.g. games/<slug>/art/hero.ts) whose default export (or `build`) returns a THREE.Object3D,
 * or a promise of one. Sets window.__ready (or window.__error) when the frame is final. Used by scripts/preview.mjs.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadModel, loadTexture, loadHdri, animate, loadClips } from '../kit/assets';

const W = 640, H = 480;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, W / H, 0.01, 2000);
const done = () => { renderer.render(scene, camera); requestAnimationFrame(() => { renderer.render(scene, camera); (window as any).__ready = true; }); };

/** soft studio: gradient backdrop, room light, a key light with a contact shadow on a floor that fades out */
function studio() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#f4f6f8'); gr.addColorStop(1, '#d9dfe6'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c); bg.colorSpace = THREE.SRGBColorSpace; scene.background = bg;
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; scene.add(key, key.target);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.receiveShadow = true; scene.add(floor);
  return { key, floor };
}

/** fit any object: stand it on the floor, three-quarter view, filling ~70% of the frame */
function frame(obj: THREE.Object3D, s: { key: THREE.DirectionalLight; floor: THREE.Mesh }) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(mid.x, box.min.y, mid.z));
  obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.castShadow = m.receiveShadow = true; });
  scene.add(obj);
  const r = Math.max(size.x, size.y, size.z) || 1;
  s.floor.scale.setScalar(r * 1.6);
  const cam = r / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.35;
  camera.position.set(cam * 0.62, size.y * 0.55 + cam * 0.32, cam * 0.82);
  camera.lookAt(0, size.y * 0.45, 0);
  camera.near = cam / 100; camera.far = cam * 20; camera.updateProjectionMatrix();
  Object.assign(s.key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.01, far: r * 20 });
  s.key.position.set(r * 2, r * 4, r * 3); s.key.target.position.set(0, 0, 0);
}

async function main() {
  const q = new URLSearchParams(location.search), target = q.get('target') ?? '', tint = q.get('tint');
  if (target.startsWith('hdri:')) {
    // a sky: look at the horizon so its colour, clouds and light read at a glance
    await loadHdri(scene, target.slice(5), { background: true, renderer });
    camera.position.set(0, 0, 0); camera.lookAt(1, 0.12, 0);
    return done();
  }
  const s = studio();
  if (target.startsWith('texture:')) {
    // a surface: a gently tilted tile under the key light shows colour, relief and how it repeats
    const mat = new THREE.MeshStandardMaterial({ ...(await loadTexture(target.slice(8), { repeat: 2 })), roughness: 0.9 });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 2), mat); tile.receiveShadow = true;
    scene.add(tile); s.floor.visible = false;
    camera.position.set(1.7, 1.55, 2.0); camera.lookAt(0, -0.1, 0);
    return done();
  }
  let obj: THREE.Object3D;
  if (target.startsWith('code:')) {
    const mod = await import(/* @vite-ignore */ `/${target.slice(5).replace(/^\/+/, '')}`);
    obj = await (mod.default ?? mod.build)();
  } else {
    obj = await loadModel(target, tint ? { tint: parseInt(tint.replace('#', ''), 16) } : {});
    // Rocketbox people keep their clips in shared libraries; everyone else carries their own
    const extra = /^rocketbox\/(?!anims)/.test(target) ? await loadClips(/female|girl/.test(target) ? 'rocketbox/anims-female' : 'rocketbox/anims-male') : [];
    const clips = [...((obj.userData.animations ?? []) as THREE.AnimationClip[]), ...extra];
    const idle = clips.find((c) => /idle/i.test(c.name))?.name;
    if (idle) { const a = animate(obj, extra); a.play(idle); a.update(0.6); }
  }
  frame(obj, s);
  done();
}
main().catch((e) => { (window as any).__error = String(e?.message ?? e); });

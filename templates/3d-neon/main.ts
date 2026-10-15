/**
 * {{TITLE}} — Three.js template.
 * Collect orbs, dodge the hunters, dash through gaps. Shows: scene setup with bloom, input,
 * a simple entity loop, particle bursts, camera follow, HTML HUD, procedural audio.
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { createInput } from '@kit/input';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { damp, clamp, TAU } from '@kit/math';
import { rng } from '@kit/rng';
import { store } from '@kit/save';
import { tune } from '@kit/tune';

const TITLE = '{{TITLE}}';
const ARENA = 22;                       // half-size of the square arena
const save = store('{{SLUG}}', { best: 0 });
/** Tuning knobs — open with ?tune for live sliders. */
const T = { moveSpeed: 11, dashSpeed: 26, dashCooldown: 0.9, hunterSpeed: 4, hunterRamp: 0.08, spawnEvery: 2.2, spawnMin: 0.5 };
tune(T, 'Tuning');

const { scene, camera, loop, hud, shake } = bootThree({ bloom: { strength: 0.8, radius: 0.4, threshold: 0.2 }, fog: { near: 30, far: 70 } });
const input = createInput(document.body);

// ------------------------------------------------------------------ world
scene.add(new THREE.HemisphereLight(0x8899ff, 0x220022, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 5);
scene.add(sun);

const grid = new THREE.GridHelper(ARENA * 2, ARENA, 0x6a3cff, 0x2a1a5a);
scene.add(grid);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ color: 0x070712, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01;
scene.add(floor);
const wallMat = new THREE.MeshBasicMaterial({ color: 0xff4dd2 });
for (const [x, z, w, d] of [[0, -ARENA, ARENA * 2, 0.2], [0, ARENA, ARENA * 2, 0.2], [-ARENA, 0, 0.2, ARENA * 2], [ARENA, 0, 0.2, ARENA * 2]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), wallMat);
  m.position.set(x, 0.2, z);
  scene.add(m);
}

const glowMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 });
const player = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16), glowMat(0x33f0ff));
player.position.y = 0.6;
scene.add(player);
const pv = new THREE.Vector3();

// ------------------------------------------------------------------ entities
interface Thing { mesh: THREE.Mesh; v: THREE.Vector3; alive: boolean; t: number }
const orbGeo = new THREE.OctahedronGeometry(0.4);
const hunterGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const orbs: Thing[] = [];
const hunters: Thing[] = [];
const sparks: Thing[] = [];
const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);

function spawn(list: Thing[], geo: THREE.BufferGeometry, color: number, x: number, z: number) {
  let t = list.find((o) => !o.alive);
  if (!t) { t = { mesh: new THREE.Mesh(geo, glowMat(color)), v: new THREE.Vector3(), alive: false, t: 0 }; list.push(t); scene.add(t.mesh); }
  t.alive = true; t.t = 0; t.v.set(0, 0, 0);
  t.mesh.visible = true; t.mesh.position.set(x, geo === orbGeo ? 0.6 : 0.45, z); t.mesh.scale.setScalar(0.01);
  return t;
}
function kill(t: Thing) { t.alive = false; t.mesh.visible = false; }
function burst(at: THREE.Vector3, color: number, n = 16, speed = 8) {
  for (let i = 0; i < n; i++) {
    const s = spawn(sparks, sparkGeo, color, at.x, at.z);
    (s.mesh.material as THREE.MeshStandardMaterial).emissive.setHex(color);
    s.mesh.position.y = at.y;
    const a = rng.range(0, TAU), up = rng.range(2, 8);
    s.v.set(Math.cos(a) * rng.range(0.3, 1) * speed, up, Math.sin(a) * rng.range(0.3, 1) * speed);
    s.mesh.scale.setScalar(1);
  }
}
const randPos = () => [rng.range(-ARENA + 2, ARENA - 2), rng.range(-ARENA + 2, ARENA - 2)] as const;

// ------------------------------------------------------------------ HUD
hud.innerHTML = `
  <div class="stat" style="left:24px;color:#33f0ff">SCORE <span id="score">0</span></div>
  <div class="stat" style="right:24px;color:#ff4dd2"><span id="time">0.0</span>s</div>
  <div class="overlay" id="menu"><h1>${TITLE}</h1><p>WASD move · SPACE dash · collect orbs · avoid hunters</p><p id="best"></p><p style="color:#fff">CLICK OR PRESS SPACE</p></div>
  <div class="overlay hidden" id="over"><h1>GAME OVER</h1><p id="final"></p><p style="color:#fff">CLICK OR PRESS SPACE TO RETRY</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
$('best').textContent = save.get('best') ? `BEST ${save.get('best')}` : '';

// ------------------------------------------------------------------ game state
let state: 'menu' | 'play' | 'over' = 'menu';
let score = 0, elapsed = 0, spawnT = 0, dashT = 0, dashCd = 0, punch = 0;

function start() {
  [...orbs, ...hunters, ...sparks].forEach(kill);
  player.position.set(0, 0.6, 0); pv.set(0, 0, 0); player.visible = true;
  score = 0; elapsed = 0; spawnT = 2.5; dashCd = 0;
  for (let i = 0; i < 6; i++) spawn(orbs, orbGeo, 0xffd23f, ...randPos());
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  state = 'play';
  if (!music.playing) music.play(SONGS.synthwave);
  sfx.play('select');
}
function gameOver() {
  state = 'over';
  player.visible = false;
  burst(player.position, 0x33f0ff, 40, 12);
  shake(0.8);
  sfx.play('bigBoom');
  const best = save.best('best', score);
  $('final').textContent = `SCORE ${score} · ${elapsed.toFixed(1)}s${best ? ' · NEW BEST!' : ''}`;
  setTimeout(() => $('over').classList.remove('hidden'), 700);
}
for (const id of ['menu', 'over']) $(id).addEventListener('pointerdown', () => start());

// ------------------------------------------------------------------ loop
loop((dt) => {
  if (input.pressed('KeyM')) audio.toggleMute();
  if (state !== 'play') {
    if (input.pressed('Space') || input.pressed('Enter')) start();
  } else {
    elapsed += dt;
    // movement + dash
    const ax = input.axis();
    const speed = dashT > 0 ? T.dashSpeed : T.moveSpeed;
    dashCd -= dt; dashT -= dt;
    if (input.pressed('Space') && dashCd <= 0 && (ax.x || ax.y)) { dashT = 0.15; dashCd = T.dashCooldown; sfx.play('dash'); }
    pv.x = damp(pv.x, ax.x * speed, 12, dt);
    pv.z = damp(pv.z, ax.y * speed, 12, dt);
    player.position.x = clamp(player.position.x + pv.x * dt, -ARENA + 0.6, ARENA - 0.6);
    player.position.z = clamp(player.position.z + pv.z * dt, -ARENA + 0.6, ARENA - 0.6);

    // spawn hunters faster over time
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = Math.max(T.spawnMin, T.spawnEvery - elapsed * 0.03);
      let x = 0, z = 0;
      do { [x, z] = randPos(); } while (Math.hypot(x - player.position.x, z - player.position.z) < 12);
      spawn(hunters, hunterGeo, 0xff3366, x, z);
      sfx.play('spawn', { volume: 0.5 });
    }
  }

  // orbs
  for (const o of orbs) if (o.alive) {
    o.t += dt;
    o.mesh.scale.setScalar(Math.min(1, o.t * 4) * (1 + Math.sin(o.t * 5) * 0.1));
    o.mesh.rotation.y += dt * 2;
    o.mesh.position.y = 0.6 + Math.sin(o.t * 3) * 0.15;
    if (state === 'play' && o.mesh.position.distanceTo(player.position) < 1) {
      kill(o); score += 10; punch = 1;
      burst(o.mesh.position, 0xffd23f, 14, 6);
      sfx.play('coin');
      spawn(orbs, orbGeo, 0xffd23f, ...randPos());
    }
  }
  // hunters chase
  for (const h of hunters) if (h.alive) {
    h.t += dt;
    h.mesh.scale.setScalar(Math.min(1, h.t * 3));
    const d = new THREE.Vector3().subVectors(player.position, h.mesh.position).setY(0);
    const dist = d.length();
    d.normalize().multiplyScalar(T.hunterSpeed + Math.min(elapsed * T.hunterRamp, 5));
    h.v.lerp(d, 1 - Math.exp(-2 * dt));
    h.mesh.position.addScaledVector(h.v, dt);
    h.mesh.rotation.x += dt * 3; h.mesh.rotation.y += dt * 2;
    if (state === 'play' && h.t > 0.5 && dist < 1.05) {
      if (dashT > 0) { kill(h); score += 25; burst(h.mesh.position, 0xff3366, 20); sfx.play('explode'); shake(0.3); }
      else gameOver();
    }
  }
  // sparks fall with gravity
  for (const s of sparks) if (s.alive) {
    s.t += dt;
    s.v.y -= 20 * dt;
    s.mesh.position.addScaledVector(s.v, dt);
    if (s.mesh.position.y < 0.06) { s.mesh.position.y = 0.06; s.v.multiplyScalar(0.6); s.v.y *= -0.4; }
    s.mesh.scale.setScalar(Math.max(0, 1 - s.t / 0.8));
    if (s.t > 0.8) kill(s);
  }

  // juice + camera
  punch = damp(punch, 0, 10, dt);
  player.scale.setScalar(1 + punch * 0.35 + (dashT > 0 ? 0.2 : 0));
  const cx = player.position.x, cz = player.position.z;
  camera.position.x = damp(camera.position.x, cx, 4, dt);
  camera.position.y = 15;
  camera.position.z = damp(camera.position.z, cz + 11, 4, dt);
  camera.lookAt(camera.position.x, 0, camera.position.z - 11);

  $('score').textContent = String(score);
  $('time').textContent = elapsed.toFixed(1);
  (window as any).__playtest = { state, score, time: Math.round(elapsed), hunters: hunters.filter((h) => h.alive).length };
  input.endFrame();
});

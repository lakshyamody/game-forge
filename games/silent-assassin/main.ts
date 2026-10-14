/**
 * Silent Assassin — sneak through a city at dusk, take down marked targets without being seen, reach the extraction van.
 * Guards have vision cones (yellow → orange → red). Civilians scream if they see a kill or a body.
 * Debug: ?god (no damage) ?mission=3 ?tune. window.__debug.behind(i) teleports behind target i.
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { Debris } from '@kit/three/debris';
import { createInput } from '@kit/input';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { damp, clamp, angleDiff, rotateToward } from '@kit/math';
import { rng } from '@kit/rng';
import { store } from '@kit/save';
import { loadModel, loadTexture, loadHdri, animate, sound, sizeOf, preloadModels } from '@kit/assets';
import { CITY, HALF, EDGE, P, G, C, MISSION, SCORE } from './config';

const q = new URLSearchParams(location.search);
const GOD = q.has('god');
const START_MISSION = Number(q.get('mission') ?? 1);
const save = store('silent-assassin', { best: 0, bestMission: 0 });

const game = bootThree({ background: 0x3a3050, fog: { color: 0x4a3a58, near: 45, far: 110 }, fov: 50, shadows: true, maxPixelRatio: 1.5, bloom: { strength: 0.45, radius: 0.4, threshold: 0.9 } });
const { scene, camera, loop, hud, shake, renderer } = game;
camera.far = 300; camera.updateProjectionMatrix();
const input = createInput(document.body);
const debris = new Debris(scene);

// ---------------------------------------------------------------- city
const sun = new THREE.DirectionalLight(0xffc89a, 2.2); sun.position.set(-30, 40, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 });
scene.add(sun, sun.target, new THREE.HemisphereLight(0xb0a0ff, 0x403040, 0.7));
await loadHdri(scene, 'belfast_sunset_puresky', { background: true, intensity: 0.45 });

const asphalt = await loadTexture('asphalt_02', { repeat: 24 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(EDGE * 2 + 40, EDGE * 2 + 40), new THREE.MeshStandardMaterial({ ...asphalt, color: 0x77727a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

/** Building blocks: collision AABBs (centre + half size) */
interface Block { x: number; z: number; h: number; height: number; mats: THREE.Material[] }
const blocks: Block[] = [];
const COLL = 4.6;   // collision half-size of a block (building footprint + a little)
const concrete = await loadTexture('concrete_wall_003', { repeat: 3 });
const walkMat = new THREE.MeshStandardMaterial({ ...concrete, color: 0xb8b0a8 });
const BUILDINGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
await preloadModels(BUILDINGS.map((b) => `kaykit-city-builder/building-${b}-withoutbase`));
for (let i = 0; i < CITY.BLOCKS; i++) for (let j = 0; j < CITY.BLOCKS; j++) {
  const x = -HALF + CITY.CELL * (i + 0.5), z = -HALF + CITY.CELL * (j + 0.5);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(CITY.BLOCK + 1.2, 0.2, CITY.BLOCK + 1.2), walkMat);
  walk.position.set(x, 0.1, z); walk.receiveShadow = true; scene.add(walk);
  const m = await loadModel(`kaykit-city-builder/building-${BUILDINGS[(i * 3 + j * 5) % BUILDINGS.length]}-withoutbase`);
  const s = sizeOf(m); m.scale.multiplyScalar(Math.min(8.6 / Math.max(s.x, s.z), 12 / s.y));   // capped below the camera
  m.rotation.y = ((i + j * 2) % 4) * Math.PI / 2;
  m.position.set(x, 0.2, z);
  const mats: THREE.Material[] = [];
  m.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { const mat = (mesh.material as THREE.Material).clone(); mesh.material = mat; mats.push(mat); } });
  scene.add(m);
  blocks.push({ x, z, h: COLL, height: sizeOf(m).y + 0.2, mats });
}
// skyline ring outside the playable streets (decor only — the player is clamped inside EDGE)
for (let k = -CITY.BLOCKS / 2 - 1; k <= CITY.BLOCKS / 2 + 1; k++) for (const [sx, sz] of [[k, -1], [k, 1], [-1, k], [1, k]]) {
  const ring = CITY.BLOCKS / 2 + 0.5;
  const x = sz === -1 || sz === 1 ? k * CITY.CELL : sx * ring * CITY.CELL, z = sz === -1 || sz === 1 ? sz * ring * CITY.CELL : k * CITY.CELL;
  if ((Math.abs(sx) === 1 && Math.abs(k) > CITY.BLOCKS / 2) || sz === 1 || (Math.abs(sx) === 1 && k > 0)) continue;   // nothing on the camera (south) side
  loadModel(`kaykit-city-builder/building-${BUILDINGS[Math.abs(Math.round(k * 7 + sx * 3 + sz * 5)) % BUILDINGS.length]}-withoutbase`).then((m) => {
    const s = sizeOf(m); m.scale.multiplyScalar(Math.min(11 / Math.max(s.x, s.z), 16 / s.y)); m.position.set(x, 0, z); m.rotation.y = Math.atan2(-x, -z); scene.add(m);
  });
}
// lane dashes along every street
{
  const dashes: THREE.Matrix4[] = [];
  for (let k = 0; k <= CITY.BLOCKS; k++) {
    const s = -HALF + k * CITY.CELL;
    for (let t = -HALF; t < HALF; t += 2.5) {
      if (Math.abs(((t + HALF) % CITY.CELL)) < 3.5 || Math.abs(((t + HALF) % CITY.CELL) - CITY.CELL) < 3.5) continue;
      dashes.push(new THREE.Matrix4().makeTranslation(s, 0.02, t), new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(t, 0.02, s));
    }
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.02, 1.2), new THREE.MeshBasicMaterial({ color: 0xe8d890 }), dashes.length);
  dashes.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im);
}

// ---------------------------------------------------------------- nodes (street intersections) + props
const NN = CITY.BLOCKS + 1;
const nodeX = (n: number) => -HALF + (n % NN) * CITY.CELL;
const nodeZ = (n: number) => -HALF + Math.floor(n / NN) * CITY.CELL;
const nearestNode = (x: number, z: number) => clamp(Math.round((x + HALF) / CITY.CELL), 0, NN - 1) + clamp(Math.round((z + HALF) / CITY.CELL), 0, NN - 1) * NN;
function neighbours(n: number) {
  const i = n % NN, j = Math.floor(n / NN), out: number[] = [];
  if (i > 0) out.push(n - 1); if (i < NN - 1) out.push(n + 1); if (j > 0) out.push(n - NN); if (j < NN - 1) out.push(n + NN);
  return out;
}
for (let n = 0; n < NN * NN; n++) {
  if (n % 2) continue;
  loadModel('kaykit-city-builder/streetlight', { height: 4.2 }).then((l) => { l.position.set(nodeX(n) + 3.6, 0.2, nodeZ(n) + 3.6); l.rotation.y = -Math.PI / 4; scene.add(l); });
}
/** parked cars: low cover. Crouch behind them and guards can't see you. */
interface Car { x: number; z: number; hx: number; hz: number }
const cars: Car[] = [];
const CAR_MODELS = ['car-sedan', 'car-taxi', 'car-hatchback', 'car-stationwagon', 'car-police'];
for (let k = 0; k < 22; k++) {
  const along = rng.int(0, CITY.BLOCKS - 1), line = rng.int(0, CITY.BLOCKS), vertical = rng.chance(0.5);
  const t = -HALF + CITY.CELL * (along + 0.5) + rng.range(-3, 3), side = rng.chance(0.5) ? 1.9 : -1.9;
  const x = vertical ? -HALF + line * CITY.CELL + side : t, z = vertical ? t : -HALF + line * CITY.CELL + side;
  if (cars.some((c) => Math.hypot(c.x - x, c.z - z) < 5)) continue;
  const car: Car = { x, z, hx: vertical ? 0.85 : 1.9, hz: vertical ? 1.9 : 0.85 };
  cars.push(car);
  loadModel(`kaykit-city-builder/${CAR_MODELS[k % CAR_MODELS.length]}`).then((m) => {
    const s = sizeOf(m); m.scale.multiplyScalar(3.8 / Math.max(s.x, s.z));
    const s2 = sizeOf(m); m.rotation.y = (s2.x > s2.z) === vertical ? Math.PI / 2 : 0;
    m.position.set(x, 0, z); scene.add(m);
  });
}
const extras = ['dumpster', 'bench', 'firehydrant', 'trash-a', 'box-a', 'bush'];
for (const b of blocks) for (let k = 0; k < 2; k++) {
  const side = rng.int(0, 3), off = rng.range(-3.5, 3.5);
  const x = b.x + (side === 0 ? 5.1 : side === 1 ? -5.1 : off), z = b.z + (side === 2 ? 5.1 : side === 3 ? -5.1 : off);
  loadModel(`kaykit-city-builder/${rng.pick(extras)}`).then((m) => { const s = sizeOf(m); m.scale.multiplyScalar(Math.min(1.2 / Math.max(s.x, s.z), 1.3 / s.y)); m.position.set(x, 0.2, z); m.rotation.y = rng.range(0, 6); scene.add(m); });
}

// ---------------------------------------------------------------- collision + line of sight
function pushOut(o: { x: number; z: number }, r = 0.4) {
  for (const b of blocks) {
    const dx = o.x - b.x, dz = o.z - b.z, px = b.h + r - Math.abs(dx), pz = b.h + r - Math.abs(dz);
    if (px > 0 && pz > 0) { if (px < pz) o.x += Math.sign(dx) * px; else o.z += Math.sign(dz) * pz; }
  }
  for (const c of cars) {
    const dx = o.x - c.x, dz = o.z - c.z, px = c.hx + r - Math.abs(dx), pz = c.hz + r - Math.abs(dz);
    if (px > 0 && pz > 0) { if (px < pz) o.x += Math.sign(dx) * px; else o.z += Math.sign(dz) * pz; }
  }
  o.x = clamp(o.x, -EDGE + r, EDGE - r); o.z = clamp(o.z, -EDGE + r, EDGE - r);
}
function segBox(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, hx: number, hz: number) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, cx - hx, cx + hx], [az, dz, cz - hz, cz + hz]]) {
    if (Math.abs(d) < 1e-6) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
  }
  return true;
}
/** clear line between two points? Low cover (cars) only blocks when the target is crouching. */
function los(ax: number, az: number, bx: number, bz: number, lowCover = false) {
  for (const b of blocks) if (segBox(ax, az, bx, bz, b.x, b.z, b.h - 0.3, b.h - 0.3)) return false;
  if (lowCover) for (const c of cars) if (segBox(ax, az, bx, bz, c.x, c.z, c.hx, c.hz)) return false;
  return true;
}

// ---------------------------------------------------------------- characters
function textSprite(text: string, color: string, size = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.font = 'bold 100px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#000'; g.strokeText(text, 64, 70); g.fillStyle = color; g.fillText(text, 64, 70);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  s.scale.setScalar(size); s.renderOrder = 10; return s;
}
const coneGeo = (() => {
  const pts: number[] = [0, 0, 0], idx: number[] = [], N = 16, a = THREE.MathUtils.degToRad(G.viewAngle);
  for (let k = 0; k <= N; k++) { const t = -a + (2 * a * k) / N; pts.push(Math.sin(t), 0, Math.cos(t)); if (k) idx.push(0, k, k + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); return g;
})();
const CONE = { patrol: 0xffe14d, sus: 0xff9a2e, hunt: 0xff2a2a };

type Kind = 'guard' | 'civ' | 'target';
type State = 'walk' | 'wait' | 'sus' | 'hunt' | 'flee' | 'dead';
interface Npc {
  kind: Kind; root: THREE.Group; anim: ReturnType<typeof animate>;
  x: number; z: number; yaw: number; state: State;
  node: number; prev: number; ox: number; oz: number; via: number;
  sus: number; lastX: number; lastZ: number; lostT: number; shootT: number; waitT: number; fleeT: number; deadT: number;
  follow: Npc | null; found: boolean;
  cone?: THREE.Mesh; mark?: THREE.Sprite; marker?: THREE.Object3D;
}
let npcs: Npc[] = [];
const CIV_MODELS = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-f'].map((m) => `mini-characters/character-${m}`);
const GUARD_MODELS = ['blocky-characters/character-h', 'blocky-characters/character-k'];
await preloadModels([...CIV_MODELS, ...GUARD_MODELS, 'mini-characters/character-male-d', 'kaykit-adventurers/dagger', 'blaster-kit/blaster-b', 'kaykit-city-builder/car-hatchback']);

async function makeNpc(kind: Kind, node: number): Promise<Npc> {
  const root = new THREE.Group();
  const model = await loadModel(kind === 'guard' ? rng.pick(GUARD_MODELS) : rng.pick(CIV_MODELS), { height: kind === 'guard' ? 1.75 : 1.6, tint: kind === 'guard' ? 0x6f88d8 : undefined });
  root.add(model);
  const lane = kind === 'guard' ? 1.2 : 2.4;
  const n: Npc = {
    kind, root, anim: animate(model), x: nodeX(node), z: nodeZ(node), yaw: 0, state: 'walk', node, prev: -1,
    ox: rng.range(-lane, lane), oz: rng.range(-lane, lane), via: -1,
    sus: 0, lastX: 0, lastZ: 0, lostT: 0, shootT: 0, waitT: 0, fleeT: 0, deadT: 0, follow: null, found: false,
  };
  if (kind === 'guard') {
    const gun = await loadModel('blaster-kit/blaster-b', { height: 0.3 }); gun.position.set(-0.32, 0.85, 0.3); root.add(gun);
    n.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: CONE.patrol, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    n.cone.position.y = 0.25; scene.add(n.cone);
    n.mark = textSprite('?', '#ffd23f', 0.9); n.mark.position.y = 2.5; n.mark.visible = false; root.add(n.mark);
  }
  if (kind === 'target') {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff2030, emissiveIntensity: 2 }));
    m.rotation.x = Math.PI; m.position.y = 2.3; root.add(m); n.marker = m;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; root.add(ring);
  }
  n.anim.play('walk');
  root.position.set(n.x, 0.0, n.z);
  scene.add(root);
  npcs.push(n);
  return n;
}

// player
const player = { x: 0, z: 0, yaw: 0, hp: P.hp, crouch: false, sprint: false, attackT: 0, hurtT: 0, alive: true, root: new THREE.Group(), anim: null as unknown as ReturnType<typeof animate>, vx: 0, vz: 0 };
{
  const m = await loadModel('mini-characters/character-male-d', { height: 1.6, tint: 0x4a4458 });
  player.root.add(m); player.anim = animate(m); player.anim.play('idle');
  const dagger = await loadModel('kaykit-adventurers/dagger', { height: 0.5 });
  dagger.position.set(-0.3, 0.7, 0.2); dagger.rotation.x = Math.PI / 2; player.root.add(dagger);
  scene.add(player.root);
}
// objective arrow around the player's feet
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0xff3040 }));
arrow.rotation.x = Math.PI / 2; const arrowPivot = new THREE.Group(); arrow.position.z = 1.4; arrowPivot.add(arrow); scene.add(arrowPivot);
// extraction beam
const exfil = new THREE.Group();
exfil.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x40ff90, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })));
(exfil.children[0] as THREE.Mesh).position.y = 15;
const exRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 40), new THREE.MeshBasicMaterial({ color: 0x40ff90 }));
exRing.rotation.x = -Math.PI / 2; exRing.position.y = 0.05; exfil.add(exRing);
loadModel('kaykit-city-builder/car-hatchback').then((v) => { const s = sizeOf(v); v.scale.multiplyScalar(3.6 / Math.max(s.x, s.z)); v.position.set(2.8, 0, 0); exfil.add(v); });
exfil.visible = false; scene.add(exfil);
// tracers
const tracers: { line: THREE.Line; t: number }[] = [];
function tracer(ax: number, az: number, bx: number, bz: number) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, 1.1, az), new THREE.Vector3(bx, 1.0, bz)]), new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true }));
  scene.add(line); tracers.push({ line, t: 0.12 });
}

// ---------------------------------------------------------------- HUD
hud.innerHTML = `
  <div class="bar top-l"><div>MISSION <b id="mission">1</b></div><div id="targets"></div></div>
  <div class="bar top-c" id="alert">HIDDEN</div>
  <div class="bar top-r"><div id="hearts"></div><div>SCORE <b id="score">0</b></div></div>
  <div id="prompt" class="prompt">E · TAKE DOWN</div>
  <div id="pops"></div>
  <div id="hurt"></div>
  <div id="banner"></div>
  <div class="ov" id="menu"><h1>SILENT <span>ASSASSIN</span></h1><p class="tag">Strike from the shadows. Leave no witnesses.</p>
    <p class="keys">WASD move · SHIFT crouch (quiet, hides behind cars) · SPACE sprint (loud)<br>E / CLICK take down · stay out of the guards' cones<br>Kill the <b style="color:#ff4050">red-marked targets</b>, then reach the <b style="color:#40ff90">green extraction</b></p>
    <p id="best"></p><p class="go">CLICK OR PRESS SPACE</p></div>
  <div class="ov hidden" id="over"><h1 id="overTitle">MISSION <span>FAILED</span></h1><p id="final"></p><p class="go">CLICK OR PRESS SPACE TO RETRY</p></div>
  <div class="ov hidden" id="pause"><h1>PAUSED</h1><p class="go">ESC TO RESUME</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
$('best').textContent = save.get('best') ? `BEST ${save.get('best')} · MISSION ${save.get('bestMission')}` : '';
const v3 = new THREE.Vector3();
function toScreen(x: number, y: number, z: number) {
  v3.set(x, y, z).project(camera);
  return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, on: v3.z < 1 };
}
function pop(x: number, z: number, text: string, color = '#fff', big = false) {
  const s = toScreen(x, 2.4, z), el = document.createElement('div');
  el.className = 'pop' + (big ? ' big' : ''); el.textContent = text; el.style.color = color; el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1200);
}
function banner(text: string, color = '#ffd34d') {
  const b = $('banner'); b.textContent = text; b.style.color = color; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

// ---------------------------------------------------------------- game state
let state: 'menu' | 'play' | 'over' | 'between' = 'menu';
let mission = START_MISSION, score = 0, missionT = 0, hunted = false, hitstop = 0, slowmo = 0, extracting = false;
let targetsTotal = 0;

async function startMission() {
  for (const n of npcs) { scene.remove(n.root); if (n.cone) scene.remove(n.cone); }
  npcs = [];
  const spawn = 0;   // player starts at the north-west corner
  player.x = nodeX(spawn); player.z = nodeZ(spawn); player.yaw = 0; player.hp = P.hp; player.alive = true; player.attackT = 0;
  player.anim.play('idle');
  const free = [...Array(NN * NN).keys()].filter((k) => Math.hypot(nodeX(k) - player.x, nodeZ(k) - player.z) > 30);
  targetsTotal = MISSION.targets(mission);
  const targets: Npc[] = [];
  for (let k = 0; k < targetsTotal; k++) targets.push(await makeNpc('target', rng.pick(free)));
  for (let k = 0; k < MISSION.guards(mission); k++) {
    const g = await makeNpc('guard', rng.pick(free));
    if (k < targets.length) { g.follow = targets[k]; g.x = targets[k].x - 2; g.z = targets[k].z; }
  }
  for (let k = 0; k < C.count; k++) await makeNpc('civ', rng.int(0, NN * NN - 1));
  npcs.forEach((n) => { if (n.kind !== 'guard' || !n.follow) n.node = rng.pick(neighbours(n.node)); });
  missionT = 0; hunted = false; extracting = false; exfil.visible = false;
  $('mission').textContent = String(mission);
  state = 'play';
  banner(`MISSION ${mission}`);
  sound.play('voiceover-pack/go', { volume: 0.7 });
}
async function startRun() {
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  mission = START_MISSION; score = 0;
  if (!music.playing) music.play(SONGS.ambient);
  sfx.play('select');
  await startMission();
}
function gameOver() {
  state = 'over'; player.alive = false;
  player.anim.play('die', { once: true });
  shake(0.6); sound.play('voiceover-pack/mission_failed', { volume: 0.8 });
  const best = save.best('best', score);
  if (mission > save.get('bestMission')) save.set('bestMission', mission);
  $('final').textContent = `SCORE ${score} · REACHED MISSION ${mission}${best ? ' · NEW BEST!' : ''}`;
  setTimeout(() => $('over').classList.remove('hidden'), 1200);
}
async function missionComplete() {
  state = 'between';
  const time = Math.max(0, Math.round(90 - missionT)) * SCORE.timeBonus;
  const ghost = hunted ? 0 : 2000;
  score += SCORE.extract + time + ghost;
  banner(ghost ? 'SILENT ASSASSIN! +2000' : 'MISSION COMPLETE', ghost ? '#40ff90' : '#ffd34d');
  pop(player.x, player.z, `+${SCORE.extract + time}`, '#40ff90', true);
  sound.play('voiceover-pack/mission_completed', { volume: 0.8 }); sfx.play('powerup');
  setTimeout(async () => { mission++; if (state === 'between') await startMission(); }, 2600);
}
for (const id of ['menu', 'over']) $(id).addEventListener('pointerdown', () => { if (state === 'menu' || state === 'over') void startRun(); });
addEventListener('blur', () => { if (state === 'play') setPause(true); });
function setPause(p: boolean) { game.paused = p; $('pause').classList.toggle('hidden', !p); if (p) input.endFrame(); }
addEventListener('keydown', (e) => { if (e.code === 'Escape' && state === 'play') setPause(!game.paused); });

// ---------------------------------------------------------------- AI helpers
function moveToward(n: Npc, gx: number, gz: number, speed: number, dt: number) {
  const dx = gx - n.x, dz = gz - n.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return d;
  const step = Math.min(d, speed * dt);
  n.x += (dx / d) * step; n.z += (dz / d) * step;
  n.yaw = rotateToward(n.yaw, Math.atan2(dx, dz), 8 * dt);
  pushOut(n, 0.35);
  return d;
}
/** walk to a point: straight if visible, otherwise street by street via intersections */
function steer(n: Npc, gx: number, gz: number, speed: number, dt: number) {
  if (los(n.x, n.z, gx, gz)) { n.via = -1; return moveToward(n, gx, gz, speed, dt); }
  const goal = nearestNode(gx, gz);
  if (n.via < 0 || !los(n.x, n.z, nodeX(n.via), nodeZ(n.via))) n.via = nearestNode(n.x, n.z);
  if (Math.hypot(nodeX(n.via) - n.x, nodeZ(n.via) - n.z) < 0.8 && n.via !== goal) {
    const i = n.via % NN, j = Math.floor(n.via / NN), gi = goal % NN, gj = Math.floor(goal / NN);
    n.via += Math.abs(gi - i) >= Math.abs(gj - j) ? Math.sign(gi - i) : Math.sign(gj - j) * NN;
  }
  moveToward(n, nodeX(n.via), nodeZ(n.via), speed, dt);
  return Math.hypot(gx - n.x, gz - n.z);
}
function wander(n: Npc, speed: number, dt: number) {
  const d = moveToward(n, nodeX(n.node) + n.ox, nodeZ(n.node) + n.oz, speed, dt);
  if (d < 0.3) {
    const opts = neighbours(n.node).filter((k) => k !== n.prev);
    n.prev = n.node; n.node = rng.pick(opts.length ? opts : neighbours(n.node));
    if (n.kind === 'guard' && rng.chance(0.5)) { n.state = 'wait'; n.waitT = rng.range(1, 2.5); }
  }
}
/** does n see point (x,z)? cone = guards' view cone; civilians see a wide arc */
function sees(n: Npc, x: number, z: number, range: number, halfAngleDeg: number, lowCover = false) {
  const dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d > 1.2 && Math.abs(angleDiff(n.yaw, Math.atan2(dx, dz))) > THREE.MathUtils.degToRad(halfAngleDeg)) return false;
  return los(n.x, n.z, x, z, lowCover);
}
function alarm(x: number, z: number, scream = true) {
  if (scream) sfx.play('hurt', { freq: 900, volume: 0.35 });
  for (const g of npcs) if (g.kind === 'guard' && g.state !== 'dead' && g.state !== 'hunt' && Math.hypot(g.x - x, g.z - z) < G.alarmRadius) {
    g.state = 'hunt'; g.lastX = x; g.lastZ = z; g.lostT = 0; g.sus = 1;
  }
}
function startHunt(g: Npc) {
  if (g.state !== 'hunt') { sound.play('voiceover-pack/war_look_out', { volume: 0.6, minGap: 1.5 }); shake(0.15); }
  if (!hunted) { hunted = true; banner('SPOTTED!', '#ff4040'); }
  g.state = 'hunt'; g.sus = 1; g.lastX = player.x; g.lastZ = player.z; g.lostT = 0;
}
function hurtPlayer() {
  if (GOD || player.hurtT > 0 || !player.alive) return;
  player.hp--; player.hurtT = 0.6;
  shake(0.45); hitstop = 0.06; sfx.play('hurt'); music.duck(0.3, 400);
  $('hurt').classList.remove('flash'); void $('hurt').offsetWidth; $('hurt').classList.add('flash');
  debris.burst(player.x, 1, player.z, [0xc01020, 0x701018], 10, 4, 4, 0.12);
  if (player.hp <= 0) gameOver();
}

// ---------------------------------------------------------------- take-down
function killable() {
  // prefer whoever is in front of you, then the closest
  let best: Npc | null = null, bs = Infinity;
  for (const n of npcs) if (n.state !== 'dead') {
    const d = Math.hypot(n.x - player.x, n.z - player.z);
    if (d > P.killRange) continue;
    const s = d + Math.abs(angleDiff(player.yaw, Math.atan2(n.x - player.x, n.z - player.z))) * 0.6;
    if (s < bs) { bs = s; best = n; }
  }
  return best;
}
function takeDown(v: Npc) {
  player.yaw = Math.atan2(v.x - player.x, v.z - player.z);
  player.attackT = 0.45; player.anim.play('attack-melee-right', { once: true, fade: 0.05 });
  const wasAware = v.state === 'hunt' || v.sus > 0.5;
  v.state = 'dead'; v.deadT = 0; v.anim.play('die', { once: true, fade: 0.05 });
  if (v.cone) v.cone.visible = false; if (v.mark) v.mark.visible = false; if (v.marker) v.marker.visible = false;
  v.root.children.filter((c) => (c as THREE.Mesh).geometry instanceof THREE.RingGeometry).forEach((c) => (c.visible = false));
  // witnesses: anyone else alive who can see the spot
  let witnesses = 0;
  for (const n of npcs) if (n !== v && n.state !== 'dead' && n.state !== 'flee') {
    const seen = n.kind === 'guard' ? sees(n, v.x, v.z, G.viewRange, G.viewAngle + 15) : sees(n, v.x, v.z, C.witnessRange, 80);
    if (!seen) continue;
    witnesses++;
    if (n.kind === 'guard') startHunt(n);
    else { n.state = 'flee'; n.fleeT = 5; n.lastX = v.x; n.lastZ = v.z; }
  }
  if (witnesses) { v.found = true; alarm(v.x, v.z); }
  const silent = !witnesses && !wasAware;
  const pts = v.kind === 'target' ? (silent ? SCORE.targetSilent : SCORE.targetLoud) : v.kind === 'guard' ? (silent ? SCORE.guardSilent : SCORE.guardLoud) : SCORE.civilian;
  score = Math.max(0, score + pts);
  if (v.kind === 'civ') pop(v.x, v.z, `INNOCENT ${pts}`, '#ff7070');
  else pop(v.x, v.z, `${silent ? 'SILENT ' : ''}+${pts}`, silent ? '#9dffb0' : '#ffd34d', v.kind === 'target');
  hitstop = v.kind === 'target' ? 0.12 : 0.07; shake(v.kind === 'target' ? 0.35 : 0.2);
  debris.burst(v.x, 1.1, v.z, [0xb01020, 0x5a0810, 0x222222], v.kind === 'target' ? 22 : 12, 4, 4, 0.13);
  sound.play('rpg-audio/knifeslice', { volume: 0.8 }); sound.play('impact-sounds/impactsoft_heavy_*', { volume: 0.5 });
  if (v.kind === 'target') {
    const left = npcs.filter((n) => n.kind === 'target' && n.state !== 'dead').length;
    if (left === 0) {
      slowmo = 0.9; banner('ALL TARGETS DOWN · EXTRACT!', '#40ff90');
      sound.play('voiceover-pack/objective_achieved', { volume: 0.8 });
      let far = 0; for (let k = 0; k < NN * NN; k++) if (Math.hypot(nodeX(k) - player.x, nodeZ(k) - player.z) > Math.hypot(nodeX(far) - player.x, nodeZ(far) - player.z)) far = k;
      exfil.position.set(nodeX(far), 0, nodeZ(far)); exfil.visible = true; extracting = true;
    } else banner(`TARGET DOWN · ${left} LEFT`, '#ff6070');
  }
}

// ---------------------------------------------------------------- update
let bodyScanT = 0;
function updateNpcs(dt: number) {
  bodyScanT -= dt;
  const scan = bodyScanT <= 0; if (scan) bodyScanT = 0.25;
  for (const n of npcs) {
    if (n.state === 'dead') { n.deadT += dt; continue; }
    // discover bodies
    if (scan && n.state !== 'flee' && n.state !== 'hunt') for (const b of npcs) if (b.state === 'dead' && !b.found && b.deadT > 0.3) {
      if (n.kind === 'guard' ? sees(n, b.x, b.z, G.viewRange, G.viewAngle) : sees(n, b.x, b.z, C.witnessRange * 0.8, 70)) {
        b.found = true; pop(b.x, b.z, 'BODY FOUND!', '#ff9a2e');
        if (n.kind === 'guard') { n.state = 'hunt'; n.lastX = b.x; n.lastZ = b.z; n.lostT = G.giveUp * 0.4; n.sus = 1; }
        else { n.state = 'flee'; n.fleeT = 5; n.lastX = b.x; n.lastZ = b.z; }
        alarm(b.x, b.z);
      }
    }
    let moving = 0;
    if (n.kind === 'guard') {
      const pd = Math.hypot(player.x - n.x, player.z - n.z);
      if (n.state !== 'hunt' && player.alive) {
        // vision
        if (sees(n, player.x, player.z, G.viewRange, G.viewAngle, player.crouch)) {
          n.sus += dt * G.notice * (1 + 2.5 * (1 - pd / G.viewRange)) * (player.crouch ? G.crouchMul : 1);
          n.state = 'sus'; n.yaw = rotateToward(n.yaw, Math.atan2(player.x - n.x, player.z - n.z), 3 * dt);
          if (n.sus >= 1) startHunt(n);
        } else if (player.sprint && pd < P.sprintNoise) {
          n.sus = Math.max(n.sus, 0.3); n.state = 'sus'; n.yaw = rotateToward(n.yaw, Math.atan2(player.x - n.x, player.z - n.z), 4 * dt);
        } else {
          n.sus = Math.max(0, n.sus - G.decay * dt);
          if (n.state === 'sus' && n.sus <= 0.05) n.state = 'walk';
        }
      }
      if (n.state === 'hunt') {
        const seeIt = player.alive && sees(n, player.x, player.z, G.viewRange * 1.4, 100, player.crouch);
        if (seeIt) { n.lastX = player.x; n.lastZ = player.z; n.lostT = 0; }
        else n.lostT += dt;
        n.shootT -= dt;
        if (seeIt && pd < G.shootRange) {
          n.yaw = rotateToward(n.yaw, Math.atan2(player.x - n.x, player.z - n.z), 10 * dt);
          if (pd > 4) { moveToward(n, player.x, player.z, G.huntSpeed * 0.4, dt); moving = 1; }
          if (n.shootT <= 0) {
            n.shootT = G.shootEvery * rng.range(0.8, 1.2);
            n.anim.play('holding-right-shoot', { once: true, fade: 0.05 });
            const hit = rng.chance(G.hitChance);
            tracer(n.x, n.z, player.x + (hit ? 0 : rng.range(-1.5, 1.5)), player.z + (hit ? 0 : rng.range(-1.5, 1.5)));
            sfx.play('shoot', { volume: 0.4 });
            if (hit) hurtPlayer();
          }
        } else {
          const d = steer(n, n.lastX, n.lastZ, G.huntSpeed, dt); moving = d > 0.5 ? 2 : 0;
          if (n.lostT > G.giveUp) { n.state = 'walk'; n.sus = 0.4; n.node = nearestNode(n.x, n.z); }
        }
      } else if (n.state === 'wait') {
        n.waitT -= dt; n.yaw += Math.sin(n.waitT * 2) * dt * 1.2;
        if (n.waitT <= 0) n.state = 'walk';
      } else if (n.state === 'walk') {
        if (n.follow && n.follow.state !== 'dead') {
          const f = n.follow, gx = f.x - Math.sin(f.yaw) * 2.2 + Math.cos(f.yaw) * 0.8, gz = f.z - Math.cos(f.yaw) * 2.2 - Math.sin(f.yaw) * 0.8;
          const d = Math.hypot(gx - n.x, gz - n.z);
          if (d > 0.4) { steer(n, gx, gz, d > 4 ? G.huntSpeed * 0.6 : C.walkSpeed * 1.1, dt); moving = d > 4 ? 2 : 1; }
          else n.yaw = rotateToward(n.yaw, f.yaw + 0.6, 2 * dt);
        } else { wander(n, G.patrolSpeed, dt); moving = 1; }
      }
      // cone + marker
      const cone = n.cone!, mat = cone.material as THREE.MeshBasicMaterial;
      cone.position.x = n.x; cone.position.z = n.z; cone.rotation.y = n.yaw; cone.scale.set(G.viewRange, 1, G.viewRange);
      mat.color.setHex(n.state === 'hunt' ? CONE.hunt : n.sus > 0.05 ? CONE.sus : CONE.patrol);
      mat.opacity = n.state === 'hunt' ? 0.14 : 0.2 + n.sus * 0.2;
      const mk = n.mark!;
      mk.visible = n.sus > 0.05 || n.state === 'hunt';
      const want = n.state === 'hunt' ? '!' : '?';
      if (mk.userData.c !== want) { mk.material.map = textSprite(want, want === '!' ? '#ff3030' : '#ffd23f').material.map; mk.userData.c = want; }
      mk.scale.setScalar(0.6 + Math.min(1, n.sus) * 0.5);
    } else {
      if (n.state === 'flee') {
        n.fleeT -= dt;
        const ax = n.x - n.lastX, az = n.z - n.lastZ, d = Math.hypot(ax, az) || 1;
        moveToward(n, n.x + (ax / d) * 3, n.z + (az / d) * 3, C.fleeSpeed, dt); moving = 2;
        if (n.fleeT <= 0) { n.state = 'walk'; n.node = nearestNode(n.x, n.z); }
      } else { wander(n, C.walkSpeed * (n.kind === 'target' ? 0.85 : 1), dt); moving = 1; }
      if (n.marker) { n.marker.position.y = 2.3 + Math.sin(performance.now() / 250) * 0.12; n.marker.rotation.y += dt * 3; }
    }
    if (!n.anim.current.startsWith('holding') || n.shootT < G.shootEvery - 0.3) n.anim.play(moving === 2 ? 'sprint' : moving === 1 ? 'walk' : n.kind === 'guard' && n.state === 'hunt' ? 'holding-right' : 'idle');
    n.root.position.set(n.x, 0.2, n.z); n.root.rotation.y = n.yaw;
  }
  for (const n of npcs) n.anim.update(dt);
}

function updatePlayer(dt: number) {
  player.hurtT -= dt; player.attackT -= dt;
  if (!player.alive) { player.anim.update(dt); return; }
  const ax = input.axis();
  player.crouch = input.down('ShiftLeft') || input.down('ShiftRight') || input.down('KeyC');
  const moving = Math.hypot(ax.x, ax.y) > 0.1;
  player.sprint = !player.crouch && input.down('Space') && moving;
  const speed = player.crouch ? P.crouch : player.sprint ? P.sprint : P.walk;
  const lock = player.attackT > 0 ? 0.15 : 1;
  player.vx = damp(player.vx, ax.x * speed * lock, 14, dt); player.vz = damp(player.vz, ax.y * speed * lock, 14, dt);
  player.x += player.vx * dt; player.z += player.vz * dt;
  pushOut(player, 0.4);
  if (moving && player.attackT <= 0) player.yaw = rotateToward(player.yaw, Math.atan2(ax.x, ax.y), 14 * dt);
  if (player.attackT <= 0) player.anim.play(player.crouch ? 'crouch' : !moving ? 'idle' : player.sprint ? 'sprint' : 'walk', { speed: player.crouch && !moving ? 0.0001 : 1 });
  if (player.sprint && Math.random() < dt * 6) sound.play('impact-sounds/footstep_concrete_*', { volume: 0.25, minGap: 0.18 });
  player.root.position.set(player.x, 0.2, player.z); player.root.rotation.y = player.yaw;
  player.root.visible = player.hurtT <= 0 || Math.floor(player.hurtT * 20) % 2 === 0;
  player.anim.update(dt);
  // take-down
  const v = player.attackT <= 0 ? killable() : null;
  const pr = $('prompt');
  if (v) {
    const s = toScreen(v.x, 2.6, v.z);
    pr.style.display = 'block'; pr.style.left = s.x + 'px'; pr.style.top = s.y + 'px';
    pr.classList.toggle('target', v.kind === 'target'); pr.classList.toggle('civ', v.kind === 'civ');
    pr.textContent = v.kind === 'civ' ? 'E · (innocent!)' : 'E · TAKE DOWN';
    if (input.pressed('KeyE') || input.mouse.pressed) takeDown(v);
  } else pr.style.display = 'none';
  // extraction
  if (extracting && Math.hypot(exfil.position.x - player.x, exfil.position.z - player.z) < 2.2) { extracting = false; void missionComplete(); }
}

// ---------------------------------------------------------------- camera, buildings fade, HUD
const CAM = { y: 20, z: 13 };
const camPos = new THREE.Vector3(0, CAM.y, CAM.z);
function updateCamera(dt: number) {
  camPos.x = damp(camPos.x, player.x, 5, dt); camPos.z = damp(camPos.z, player.z + CAM.z, 5, dt); camPos.y = CAM.y;
  camera.position.copy(camPos); camera.lookAt(camPos.x, 0.5, camPos.z - CAM.z);
  sun.position.set(player.x - 30, 40, player.z + 20); sun.target.position.set(player.x, 0, player.z);
  // fade buildings that hide the player
  for (const b of blocks) {
    let hides = false;
    for (let k = 1; k <= 8 && !hides; k++) {
      const t = k / 8, x = player.x + (camPos.x - player.x) * t, y = 1 + (camPos.y - 1) * t, z = player.z + (camPos.z - player.z) * t;
      hides = Math.abs(x - b.x) < b.h + 0.5 && Math.abs(z - b.z) < b.h + 0.5 && y < b.height;
    }
    for (const m of b.mats) { const o = damp(m.opacity, hides ? 0.25 : 1, 10, dt); m.opacity = o; m.transparent = o < 0.99; m.depthWrite = o > 0.6; }
  }
}
function updateHud() {
  const left = npcs.filter((n) => n.kind === 'target' && n.state !== 'dead').length;
  $('targets').innerHTML = extracting ? '<span style="color:#40ff90">REACH EXTRACTION</span>' : `TARGETS <b style="color:#ff4050">${targetsTotal - left}/${targetsTotal}</b>`;
  $('score').textContent = String(score);
  $('hearts').textContent = '♥'.repeat(Math.max(0, player.hp)) + '♡'.repeat(Math.max(0, P.hp - player.hp));
  const hunting = npcs.some((n) => n.kind === 'guard' && n.state === 'hunt'), sus = npcs.some((n) => n.kind === 'guard' && n.state === 'sus');
  const al = $('alert'); al.textContent = hunting ? 'HUNTED' : sus ? 'SUSPICIOUS' : 'HIDDEN';
  al.className = 'bar top-c ' + (hunting ? 'red' : sus ? 'yellow' : 'green');
  music.setIntensity(hunting ? 3 : sus ? 2 : 1);
  // arrow toward nearest objective
  let gx = exfil.position.x, gz = exfil.position.z, has = extracting;
  if (!extracting) { let bd = Infinity; for (const n of npcs) if (n.kind === 'target' && n.state !== 'dead') { const d = Math.hypot(n.x - player.x, n.z - player.z); if (d < bd) { bd = d; gx = n.x; gz = n.z; has = true; } } }
  arrowPivot.visible = has && state === 'play';
  arrowPivot.position.set(player.x, 0.35, player.z); arrowPivot.rotation.y = Math.atan2(gx - player.x, gz - player.z);
  (arrow.material as THREE.MeshBasicMaterial).color.setHex(extracting ? 0x40ff90 : 0xff3040);
}

loop((rawDt) => {
  if (input.pressed('KeyM')) audio.toggleMute();
  if ((state === 'menu' || state === 'over') && (input.pressed('Space') || input.pressed('Enter') || input.pressed('KeyR'))) void startRun();
  let dt = rawDt;
  if (hitstop > 0) { hitstop -= rawDt; dt = rawDt * 0.05; }
  else if (slowmo > 0) { slowmo -= rawDt; dt = rawDt * 0.35; }
  if (state === 'play' || state === 'between' || state === 'over') {
    if (state === 'play') missionT += dt;
    updatePlayer(dt);
    updateNpcs(dt);
  }
  debris.update(dt);
  for (let k = tracers.length - 1; k >= 0; k--) { const t = tracers[k]; t.t -= rawDt; (t.line.material as THREE.LineBasicMaterial).opacity = t.t / 0.12; if (t.t <= 0) { scene.remove(t.line); tracers.splice(k, 1); } }
  exRing.scale.setScalar(1 + Math.sin(performance.now() / 200) * 0.08);
  updateCamera(rawDt);
  updateHud();
  (window as any).__playtest = { state, mission, score, hp: player.hp, targetsLeft: npcs.filter((n) => n.kind === 'target' && n.state !== 'dead').length, hunters: npcs.filter((n) => n.state === 'hunt').length, dead: npcs.filter((n) => n.state === 'dead').length, extracting, log: (window as any).__log };
  input.endFrame();
});

(window as any).__debug = {
  get npcs() { return npcs; }, player, blocks,
  /** teleport right behind target i, facing it */
  behind(i = 0) { const t = npcs.filter((n) => n.kind === 'target' && n.state !== 'dead')[i]; if (!t) return; player.x = t.x - Math.sin(t.yaw) * 1.2; player.z = t.z - Math.cos(t.yaw) * 1.2; player.yaw = t.yaw; for (const g of npcs) if (g.follow === t) { g.follow = null; g.x += 20; } return t; },
  /** silent take-down of target i (teleports behind it) */
  killTarget(i = 0) { const t = this.behind(i); if (t) takeDown(t); },
  toExfil() { player.x = exfil.position.x; player.z = exfil.position.z; },
};

/**
 * Horror 3 — Temple Run in a graveyard. Jack runs with his teddy; a zombie horde chases;
 * Slenderina bursts out of the graves (ahead of you or from the side) and then hunts you from behind.
 * Lanes: A/D · jump: W/Space · slide: S. One stumble = zombies close in; a second one while they're close = caught.
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { createInput } from '@kit/input';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { damp, clamp, TAU } from '@kit/math';
import { rng } from '@kit/rng';
import { store } from '@kit/save';
import { loadModel, animate, loadTexture, loadHdri, sound } from '@kit/assets';
import { T } from './config';

const save = store('horror-3', { best: 0 });
const Q = new URLSearchParams(location.search);
const GOD = Q.has('god');
if (Q.has('speed')) T.startSpeed = Number(Q.get('speed'));

const FOG = 0x0b1220;
const { scene, camera, loop, hud, shake } = bootThree({ background: FOG, fog: { near: 16, far: 72 }, shadows: true, bloom: { strength: 0.55, radius: 0.5, threshold: 0.75 }, fov: 62 });
const game = (window as any).__game;
const input = createInput(document.body);
const lanes = () => [-T.laneWidth, 0, T.laneWidth];

// ------------------------------------------------------------------ lights
scene.add(new THREE.HemisphereLight(0x6f86c9, 0x1a1420, 0.9));
const moon = new THREE.DirectionalLight(0xb8c8ff, 1.6);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
scene.add(moon, moon.target);
loadHdri(scene, 'satara_night', { intensity: 0.35 }).catch(() => {});

// ------------------------------------------------------------------ ground (follows Jack; textures scroll so the world feels fixed)
const PATH_W = T.laneWidth * 3 + 1.4, GROUND_L = 200;
const pathMat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 });
const grassMat = new THREE.MeshStandardMaterial({ color: 0x3b4a34, roughness: 1 });
const path = new THREE.Mesh(new THREE.PlaneGeometry(PATH_W, GROUND_L), pathMat);
const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, GROUND_L), grassMat);
path.rotation.x = grass.rotation.x = -Math.PI / 2;
path.position.y = 0.01; grass.position.y = -0.01;
path.receiveShadow = grass.receiveShadow = true;
scene.add(path, grass);
const PATH_REP: [number, number] = [2, 50], GRASS_REP: [number, number] = [16, 40];
Promise.all([loadTexture('dirt_floor', { repeat: PATH_REP }), loadTexture('leafy_grass', { repeat: GRASS_REP })]).then(([d, g]) => {
  Object.assign(pathMat, d); Object.assign(grassMat, g); pathMat.needsUpdate = grassMat.needsUpdate = true;
}).catch(() => {});

// ------------------------------------------------------------------ models
const proto = new Map<string, THREE.Group>();
async function prep(id: string, height: number) { proto.set(id, await loadModel(id, { height })); }
const make = (id: string) => proto.get(id)!.clone();

const STONES = ['graveyard-kit/gravestone-round', 'graveyard-kit/gravestone-cross', 'graveyard-kit/gravestone-wide', 'graveyard-kit/gravestone-bevel', 'kaykit-halloween-bits/pumpkin-orange-jackolantern'];
const BLOCKS = ['graveyard-kit/crypt-small', 'graveyard-kit/pillar-obelisk', 'graveyard-kit/column-large'];
const DECOR = ['graveyard-kit/gravestone-round', 'graveyard-kit/gravestone-cross-large', 'graveyard-kit/gravestone-broken', 'graveyard-kit/gravestone-decorative', 'graveyard-kit/cross', 'graveyard-kit/pine-crooked', 'graveyard-kit/pine', 'kaykit-halloween-bits/tree-dead-large', 'kaykit-halloween-bits/tree-dead-medium', 'graveyard-kit/crypt', 'graveyard-kit/urn-round', 'kaykit-halloween-bits/skull-candle', 'graveyard-kit/grave'];
const DECOR_H: Record<string, number> = { 'graveyard-kit/pine-crooked': 6, 'graveyard-kit/pine': 7, 'kaykit-halloween-bits/tree-dead-large': 6.5, 'kaykit-halloween-bits/tree-dead-medium': 4.5, 'graveyard-kit/crypt': 4, 'graveyard-kit/gravestone-cross-large': 2, 'kaykit-halloween-bits/skull-candle': 0.6, 'graveyard-kit/urn-round': 0.9, 'graveyard-kit/grave': 0.5 };

const jack = new THREE.Group();
let jackAnim: ReturnType<typeof animate>;
let teddy: THREE.Group;
const zombies: { obj: THREE.Group; anim: ReturnType<typeof animate>; ox: number; oz: number }[] = [];
let slender: THREE.Group, slenderAnim: ReturnType<typeof animate>;
const coinGeoProto = { obj: null as THREE.Group | null };

async function loadAll() {
  await Promise.all([
    ...STONES.map((id) => prep(id, id.includes('pumpkin') ? 0.8 : 1.0)),
    prep('graveyard-kit/crypt-small', 2.6), prep('graveyard-kit/pillar-obelisk', 2.8), prep('graveyard-kit/column-large', 2.6),
    prep('graveyard-kit/pillar-small', 2),
    prep('graveyard-kit/iron-fence', 1.2), prep('graveyard-kit/lightpost-single', 3.2),
    ...DECOR.map((id) => prep(id, DECOR_H[id] ?? 1.3)),
    loadModel('kaykit-dungeon-remastered/coin.gltf').then((c) => {
      // the coin lies flat: stand it on its edge and size it by its diameter
      const sz = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
      c.scale.setScalar(0.6 / Math.max(sz.x, sz.z)); c.rotation.x = Math.PI / 2;
      coinGeoProto.obj = new THREE.Group().add(c);
    }),
  ]);
  const kid = await loadModel('mini-characters/character-male-c', { height: 1.45 });
  kid.rotation.y = Math.PI; // Kenney rigs face +z; Jack runs toward -z
  jackAnim = animate(kid); jackAnim.play('sprint');
  teddy = await loadModel('furniture-kit/bear', { height: 0.5 });
  teddy.rotation.y = -0.4;
  jack.add(kid, teddy);
  scene.add(jack);
  for (let i = 0; i < 6; i++) {
    const z = await loadModel('graveyard-kit/character-zombie', { height: rng.range(1.6, 1.85) });
    z.rotation.y = Math.PI;
    const anim = animate(z); anim.play(i % 2 ? 'sprint' : 'walk', { speed: i % 2 ? 1 : 1.8 });
    anim.mixer.setTime(rng.range(0, 2));
    scene.add(z);
    zombies.push({ obj: z, anim, ox: (i % 3 - 1) * 1.7 + rng.range(-0.4, 0.4), oz: Math.floor(i / 3) * 1.1 + rng.range(0, 0.4) });
  }
  // Slenderina: a tall, thin, near-black figure (vampire rig stretched and darkened) with glowing white eyes
  slender = await loadModel('graveyard-kit/character-vampire', { height: 2.9, tint: 0x2a2630 });
  slender.scale.x *= 0.7; slender.scale.z *= 0.7;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
    eye.position.set(sx, 2.55, 0.24);
    slender.add(eye); eye.scale.setScalar(1 / slender.scale.y); eye.position.divide(slender.scale);
  }
  slenderAnim = animate(slender); slenderAnim.play('sprint', { speed: 1.4 });
  slender.visible = false;
  scene.add(slender);
}

// ------------------------------------------------------------------ world spawning
type Kind = 'stone' | 'block' | 'log' | 'beam';
interface Obstacle { obj: THREE.Object3D; z: number; lanes: number[]; kind: Kind; hit: boolean; vy: number; spin: number }
interface Coin { obj: THREE.Object3D; x: number; y: number; z: number; taken: boolean; t: number }
interface Decor { obj: THREE.Object3D; z: number }
let obstacles: Obstacle[] = [], coins: Coin[] = [], decor: Decor[] = [];
let nextRow = 0, nextDecor = 0;

function place(obj: THREE.Object3D, x: number, z: number, y = 0) { obj.position.set(x, y, z); scene.add(obj); return obj; }

// a fallen log across all three lanes (y = 0: jump it; raised on posts: slide under it)
const logGeo = new THREE.CylinderGeometry(0.32, 0.36, PATH_W + 0.8, 10);
const logMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.95 });
loadTexture('wood_floor_worn', { repeat: [1, 3] }).then((t) => { Object.assign(logMat, t); logMat.color.set(0x8a6040); logMat.needsUpdate = true; }).catch(() => {});
function spanLog(y: number) {
  const g = new THREE.Group();
  const log = new THREE.Mesh(logGeo, logMat);
  log.rotation.z = Math.PI / 2; log.position.y = y + 0.32;
  log.castShadow = log.receiveShadow = true;
  g.add(log);
  return g;
}

function spawnRow(z: number) {
  const r = rng.next();
  const L = lanes();
  let row: Obstacle;
  if (r < 0.14 && elapsed > 4) {
    const g = spanLog(0);
    row = { obj: place(g, 0, z), z, lanes: [0, 1, 2], kind: 'log', hit: false, vy: 0, spin: 0 };
  } else if (r < 0.28 && elapsed > 8) {
    const g = spanLog(1.15);
    for (const sx of [-PATH_W / 2 - 0.2, PATH_W / 2 + 0.2]) { const p = make('graveyard-kit/pillar-small'); p.position.x = sx; g.add(p); }
    row = { obj: place(g, 0, z), z, lanes: [0, 1, 2], kind: 'beam', hit: false, vy: 0, spin: 0 };
  } else {
    const kind: Kind = rng.next() < 0.5 ? 'stone' : 'block';
    const count = rng.next() < 0.45 ? 2 : 1;
    const picks = rng.shuffle([0, 1, 2]).slice(0, count);
    const g = new THREE.Group();
    for (const li of picks) {
      const o = make(rng.pick(kind === 'stone' ? STONES : BLOCKS));
      o.position.x = L[li]; o.rotation.y = rng.range(-0.15, 0.15);
      g.add(o);
    }
    row = { obj: place(g, 0, z), z, lanes: picks, kind, hit: false, vy: 0, spin: 0 };
    // a coin trail in a free lane, or arcing over a gravestone
    const free = [0, 1, 2].filter((l) => !picks.includes(l));
    if (kind === 'stone' && rng.next() < 0.4) coinArc(L[picks[0]], z);
    else if (free.length && rng.next() < 0.7) coinLine(L[rng.pick(free)], z + 3, rng.int(4, 7));
  }
  obstacles.push(row);
}
function addCoin(x: number, y: number, z: number) {
  if (!coinGeoProto.obj) return;
  const o = coinGeoProto.obj.clone();
  place(o, x, z, y);
  coins.push({ obj: o, x, y, z, taken: false, t: rng.range(0, TAU) });
}
function coinLine(x: number, z: number, n: number) { for (let i = 0; i < n; i++) addCoin(x, 0.6, z - i * 1.6); }
function coinArc(x: number, z: number) { for (let i = -3; i <= 3; i++) addCoin(x, 0.6 + 1.6 * (1 - (i / 3.5) ** 2), z + i * 1.2); }

function spawnDecor(z: number) {
  for (const side of [-1, 1]) {
    const id = rng.pick(DECOR);
    const big = (DECOR_H[id] ?? 1) > 3;
    const o = make(id);
    o.rotation.y = rng.range(0, TAU);
    if (!big) o.rotation.y = side > 0 ? -Math.PI / 2 + rng.range(-0.3, 0.3) : Math.PI / 2 + rng.range(-0.3, 0.3);
    place(o, side * (PATH_W / 2 + (big ? rng.range(4, 12) : rng.range(1.2, 5))), z + rng.range(-1.5, 1.5));
    decor.push({ obj: o, z });
  }
  // iron fence along both edges, a lamp post every so often
  if (Math.round(-z / 3.5) % 2 === 0) for (const side of [-1, 1]) {
    const f = make('graveyard-kit/iron-fence');
    f.rotation.y = Math.PI / 2;
    decor.push({ obj: place(f, side * (PATH_W / 2 + 0.5), z), z });
  }
  if (Math.round(-z / 3.5) % 8 === 0) {
    const side = rng.sign();
    const lp = make('graveyard-kit/lightpost-single');
    decor.push({ obj: place(lp, side * (PATH_W / 2 + 0.9), z), z });
    const light = lamps[lampI++ % lamps.length];
    light.position.set(side * (PATH_W / 2 + 0.6), 3, z);
  }
}
const lamps = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffb060, 18, 12, 1.6); l.position.y = -50; scene.add(l); return l; });
let lampI = 0;

// ------------------------------------------------------------------ particles (dirt, coin sparkle)
interface Spark { mesh: THREE.Mesh; v: THREE.Vector3; t: number; life: number }
const sparks: Spark[] = [];
const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
function burst(at: THREE.Vector3, color: number, n = 14, speed = 5, emissive = false) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.position.copy(at);
    scene.add(m);
    const a = rng.range(0, TAU);
    sparks.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * rng.range(0.3, 1) * speed, rng.range(2, 7), Math.sin(a) * rng.range(0.3, 1) * speed), t: 0, life: rng.range(0.5, 0.9) });
  }
}

// ------------------------------------------------------------------ HUD
hud.innerHTML = `
  <style>
    .hud { font-family: 'Press Start 2P', monospace !important; }
    .hud .stat { position:absolute; top:18px; font-size:18px; letter-spacing:2px; text-shadow: 0 0 10px currentColor; }
    .hud .overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; background:rgba(4,4,10,.62); pointer-events:auto; cursor:pointer; text-align:center; }
    .hud .overlay h1 { margin:0; font-size:clamp(34px,8vw,80px); color:#e0102a; text-shadow:0 0 22px #e0102a, 0 4px 0 #4a0008; }
    .hud .overlay p { margin:0; color:#c8c2d8; font-size:12px; line-height:1.8; }
    .hud .hidden { display:none !important; }
    #flash { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 40%, rgba(160,0,0,.75)); opacity:0; }
    #vig { position:absolute; inset:0; background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.7)); }
    #danger { position:absolute; left:50%; bottom:22px; transform:translateX(-50%); font-size:12px; color:#9fdc7a; text-shadow:0 0 8px #000; }
  </style>
  <div id="vig"></div><div id="flash"></div>
  <div class="stat" style="left:24px;color:#ffd84a">🪙 <span id="coins">0</span></div>
  <div class="stat" style="right:24px;color:#e8e2ff"><span id="dist">0</span>m</div>
  <div id="danger"></div>
  <div class="overlay" id="menu"><h1>HORROR 3</h1><p>Jack has to escape Slenderina and her zombies.<br>Hold on to your teddy and RUN.</p>
    <p>A / D or ← → change lane · W / SPACE jump · S slide<br>(swipe on touch)</p><p id="best"></p><p id="loading" style="color:#fff">LOADING...</p></div>
  <div class="overlay hidden" id="pause"><h1>PAUSED</h1><p>ESC to keep running</p></div>
  <div class="overlay hidden" id="over"><h1 id="overTitle">CAUGHT!</h1><p id="final"></p><p style="color:#fff">CLICK OR PRESS SPACE TO RUN AGAIN</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
$('best').textContent = save.get('best') ? `BEST ${save.get('best')}` : '';

// ------------------------------------------------------------------ state
let state: 'loading' | 'menu' | 'play' | 'dying' | 'over' = 'loading';
let pz = 0, px = 0, py = 0, vy = 0, lane = 1, speed = T.startSpeed, elapsed = 0, coinCount = 0;
let slideT = 0, gap = 2, stumbleT = 0, stumbles = 0, stepT = 0, killer: 'zombies' | 'slender' = 'zombies';
let sl: 'off' | 'ambush' | 'chase' | 'vanish' = 'off', slT = 0, slTimer = 0, slX = 0, slZ = 0, slY = 0, slSide = 0, slLane = 1, slEncounters = 0, heartT = 0, dodged = 0;

function clearWorld() {
  for (const o of [...obstacles, ...coins, ...decor]) scene.remove(o.obj);
  obstacles = []; coins = []; decor = [];
}
function start() {
  if (state === 'loading') return;
  clearWorld();
  pz = 0; px = 0; py = 0; vy = 0; lane = 1; speed = T.startSpeed; elapsed = 0; coinCount = 0;
  slideT = 0; gap = 2; stumbleT = 0; stumbles = 0; dodged = 0;
  sl = 'off'; slTimer = Q.has('slender') ? 2.5 : rng.range(5, 12); slender.visible = false; slEncounters = 0;
  nextRow = -30; nextDecor = 10;
  jack.position.set(0, 0, 0); jack.rotation.set(0, 0, 0);
  jackAnim.play('sprint', { speed: 1.2 });
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  state = 'play';
  if (!music.playing) music.play(SONGS.ambient);
  sound.play('voiceover-pack/go', { volume: 0.6 });
}
function caught(by: 'zombies' | 'slender') {
  if (GOD) return;
  state = 'dying'; killer = by;
  jackAnim.play('die', { once: true });
  shake(by === 'slender' ? 1.2 : 0.7);
  sfx.play('hurt'); sfx.play('bigBoom', { volume: 0.6 });
  $('flash').style.opacity = '1';
  const score = Math.floor(-pz) + coinCount * 10;
  const best = save.best('best', score);
  $('overTitle').textContent = by === 'slender' ? 'SLENDERINA GOT YOU' : 'THE ZOMBIES GOT YOU';
  $('final').textContent = `${Math.floor(-pz)}m · ${coinCount} coins · SCORE ${score}${best ? ' · NEW BEST!' : ''}`;
  setTimeout(() => { state = 'over'; $('over').classList.remove('hidden'); sound.play('voiceover-pack/game_over', { volume: 0.6 }); }, 1500);
}
function stumble(o?: Obstacle) {
  stumbleT = 0.5; stumbles++;
  shake(0.45);
  sfx.play('thud'); sound.play('impact-sounds/impactwood_heavy_*', { volume: 0.6 });
  if (o) { o.hit = true; o.vy = 7; o.spin = rng.range(-6, 6); burst(new THREE.Vector3(px, 0.8, pz - 0.6), 0x7a6a58, 18, 5); }
  $('flash').style.opacity = '0.7';
  if (sl === 'chase') return caught('slender');
  if (gap < T.zombieCatchGap) return caught('zombies');
  gap = 1.8; speed = Math.max(T.startSpeed * 0.8, speed * 0.75);
}

// touch swipes
let sw: { x: number; y: number } | null = null;
const swipe = { l: false, r: false, u: false, d: false };
addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', (e) => {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
  if (Math.abs(dx) > Math.abs(dy)) swipe[dx < 0 ? 'l' : 'r'] = true; else swipe[dy < 0 ? 'u' : 'd'] = true;
});
for (const id of ['menu', 'over']) $(id).addEventListener('click', () => start());

// ------------------------------------------------------------------ slenderina
function updateSlender(dt: number) {
  slT += dt;
  const L = lanes();
  if (sl === 'off') {
    slTimer -= dt;
  }
  if (sl === 'off' && slTimer <= 0) {
    // no warning: she just appears
    sl = 'ambush'; slT = 0; slEncounters++;
    slSide = rng.next() < 0.5 ? 0 : rng.sign(); // 0 = rises out of a grave in a lane, ±1 = bursts out from the side
    slLane = slSide ? lane : (rng.next() < 0.6 ? lane : rng.int(0, 2));
    slX = slSide ? slSide * (PATH_W / 2 + 5) : L[slLane];
    slZ = pz - 34; slY = slSide ? 0 : -3;
    slender.visible = true; slender.rotation.y = 0; // faces +z, toward Jack
    slenderAnim.play('sprint', { speed: 1.5 });
    if (!slSide) burst(new THREE.Vector3(slX, 0.2, slZ), 0x4a3a2a, 30, 4);
    sfx.play('shockwave'); sfx.play('hurt', { volume: 0.5 });
    $('flash').style.opacity = '0.5';
  } else if (sl === 'ambush') {
    slZ += T.slenderLunge * dt;
    slY = damp(slY, 0, 6, dt);
    const d = slZ - pz;
    if (slSide && d < -16) slLane = lane; // tracks Jack's lane until she's close, then commits
    slX = damp(slX, L[slLane], slSide ? 5 : 20, dt);
    if (Math.abs(d) < 0.8 && Math.abs(slX - px) < 1.0 && state === 'play') { caught('slender'); return; }
    if (d > 1.2) { sl = 'chase'; slT = 0; slender.rotation.y = Math.PI; dodged++; sfx.play('powerup', { volume: 0.3 }); }
  } else if (sl === 'chase') {
    // she turns and hunts Jack from behind for a few seconds: stumble now and she has you
    slZ = pz + damp(slZ - pz, 1.7, 3, dt);
    slX = damp(slX, px + 0.9, 3, dt);
    if (slT > 3.5) { sl = 'vanish'; slT = 0; burst(new THREE.Vector3(slX, 1.2, slZ), 0x111111, 30, 3); }
  } else if (sl === 'vanish') {
    slZ = pz + 1.7 + slT * 6; slY -= dt * 6;
    if (slT > 0.6) { sl = 'off'; slender.visible = false; slTimer = Math.max(T.slenderEveryMin, T.slenderEvery - elapsed * 0.06) * rng.range(0.8, 1.2); }
  }
  slender.position.set(slX, slY, slZ);
  if (sl === 'ambush' || sl === 'chase') {
    heartT -= dt;
    if (heartT <= 0) { heartT = sl === 'chase' ? 0.32 : 0.45; sfx.play('thud', { volume: 0.5 }); }
  }
}

// ------------------------------------------------------------------ loop
const camLook = new THREE.Vector3();
let fpsN = 0, fpsT = performance.now(), fps = 0;
loop((dt) => {
  fpsN++; if (performance.now() - fpsT > 1000) { fps = fpsN; fpsN = 0; fpsT = performance.now(); }
  if (input.pressed('KeyM')) audio.toggleMute();
  if (input.pressed('Escape') && (state === 'play' || game.paused)) {
    game.paused = !game.paused; $('pause').classList.toggle('hidden', !game.paused);
  }
  if (state === 'loading') { input.endFrame(); return; }
  if (state === 'menu' || state === 'over') {
    if (input.pressed('Space') || input.pressed('Enter')) start();
  }
  const L = lanes();

  if (state === 'play') {
    elapsed += dt;
    speed = Math.min(T.maxSpeed, speed + T.speedRamp * dt);
    if (stumbleT > 0) stumbleT -= dt;
    pz -= speed * dt;

    // input
    const left = input.pressed('KeyA') || input.pressed('ArrowLeft') || swipe.l;
    const right = input.pressed('KeyD') || input.pressed('ArrowRight') || swipe.r;
    const up = input.pressed('KeyW') || input.pressed('ArrowUp') || input.pressed('Space') || swipe.u;
    const down = input.pressed('KeyS') || input.pressed('ArrowDown') || swipe.d;
    swipe.l = swipe.r = swipe.u = swipe.d = false;
    if (left && lane > 0) { lane--; sfx.play('dash', { volume: 0.2 }); }
    if (right && lane < 2) { lane++; sfx.play('dash', { volume: 0.2 }); }
    if (up && py <= 0.001) { vy = T.jumpVel; slideT = 0; jackAnim.play('jump', { fade: 0.08 }); sfx.play('jump'); }
    if (down) { slideT = T.slideTime; if (py > 0) vy = -T.jumpVel * 1.4; jackAnim.play('crouch', { fade: 0.08, speed: 1.4 }); sound.play('impact-sounds/footstep_grass_*', { volume: 0.5 }); }

    px = damp(px, L[lane], T.laneLerp, dt);
    vy -= T.gravity * dt; py += vy * dt;
    if (py <= 0) { if (vy < -2 && slideT <= 0) { jackAnim.play('sprint', { fade: 0.1, speed: 1.2 }); burst(new THREE.Vector3(px, 0.05, pz), 0x6a5a48, 6, 2); } py = 0; vy = 0; }
    if (slideT > 0) { slideT -= dt; if (slideT <= 0 && py === 0) jackAnim.play('sprint', { fade: 0.1, speed: 1.2 }); }
    jackAnim.update(dt * (0.6 + speed / 20));

    // footsteps
    stepT -= dt;
    if (py === 0 && slideT <= 0 && stepT <= 0) { stepT = 4.2 / speed; sound.play('impact-sounds/footstep_grass_*', { volume: 0.18 }); }

    // spawn ahead, drop behind
    const rowGap = Math.max(T.obstacleGapMin, T.obstacleGap - elapsed * 0.08);
    while (nextRow > pz - 110) { spawnRow(nextRow); nextRow -= rowGap * rng.range(0.85, 1.25); }
    while (nextDecor > pz - 110) { spawnDecor(nextDecor); nextDecor -= 3.5; }

    // collisions
    for (const o of obstacles) {
      if (o.hit || Math.abs(o.z - pz) > 0.6) continue;
      const inLane = o.lanes.some((li) => Math.abs(L[li] - px) < 0.95);
      if (!inLane) continue;
      const clear = (o.kind === 'stone' && py > 0.85) || (o.kind === 'log' && py > 0.55) || (o.kind === 'beam' && slideT > 0);
      if (!clear) stumble(o);
      if (state !== 'play') break;
    }
    // coins
    for (const c of coins) {
      if (c.taken) continue;
      if (Math.abs(c.z - pz) < 0.9 && Math.abs(c.x - px) < 0.9 && Math.abs(c.y - (py + 0.7)) < 1.1) {
        c.taken = true; c.t = 0; coinCount++;
        sfx.play('coin', { volume: 0.3 });
        burst(c.obj.position, 0xffd84a, 6, 3, true);
      }
    }
    // zombies close back in, then fall away when Jack runs clean
    gap = Math.min(T.zombieSafeGap, gap + T.zombieRecover * dt);
    updateSlender(dt);
  } else if (state === 'dying') {
    jackAnim.update(dt);
    if (killer === 'zombies') gap = damp(gap, 0.6, 4, dt);
    else { slZ = damp(slZ, pz + 0.9, 6, dt); slX = damp(slX, px, 6, dt); slender.position.set(slX, 0, slZ); slender.rotation.y = Math.PI; }
  } else if (state === 'menu') {
    jackAnim.update(dt);
  }

  // Jack
  jack.position.set(px, py, pz);
  jack.rotation.z = damp(jack.rotation.z, (px - L[lane]) * 0.25, 10, dt);
  jack.scale.set(1, slideT > 0 ? 0.6 : 1, 1);
  if (teddy) { const bob = Math.sin(elapsed * speed * 0.9) * 0.05; teddy.position.set(0.36, 0.62 + bob, -0.18); }

  // zombies
  for (const z of zombies) {
    z.obj.position.set(damp(z.obj.position.x, px * 0.6 + z.ox, 3, dt), 0, pz + gap + z.oz);
    z.obj.visible = gap + z.oz < 7;
    z.anim.update(dt * (state === 'play' || state === 'dying' ? 1.2 : 0.5));
  }
  if (slender?.visible) slenderAnim.update(dt);

  // world bits
  for (const c of coins) {
    c.t += dt;
    c.obj.rotation.y += dt * 4;
    if (c.taken) { c.obj.position.y += dt * 6; c.obj.scale.multiplyScalar(Math.pow(0.02, dt)); }
  }
  for (const o of obstacles) if (o.hit) { o.vy -= 20 * dt; o.obj.position.y += o.vy * dt; o.obj.position.z -= speed * 0.4 * dt; o.obj.rotation.x += o.spin * dt; }
  const behind = pz + 12;
  obstacles = obstacles.filter((o) => (o.z > behind || o.obj.position.y < -6 ? (scene.remove(o.obj), false) : true));
  coins = coins.filter((c) => (c.z > behind || (c.taken && c.t > 0.5) ? (scene.remove(c.obj), false) : true));
  decor = decor.filter((d) => (d.z > behind ? (scene.remove(d.obj), false) : true));
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.t += dt; s.v.y -= 18 * dt; s.mesh.position.addScaledVector(s.v, dt);
    if (s.mesh.position.y < 0.05) { s.mesh.position.y = 0.05; s.v.multiplyScalar(0.5); }
    s.mesh.scale.setScalar(Math.max(0, 1 - s.t / s.life));
    if (s.t > s.life) { scene.remove(s.mesh); sparks.splice(i, 1); }
  }

  // ground follows Jack, textures scroll to stay put in the world
  const gz = pz - GROUND_L / 2 + 15;
  path.position.z = grass.position.z = gz;
  if (pathMat.map) for (const m of [pathMat.map, pathMat.normalMap, pathMat.roughnessMap]) if (m) m.offset.y = -gz / GROUND_L * PATH_REP[1];
  if (grassMat.map) for (const m of [grassMat.map, grassMat.normalMap, grassMat.roughnessMap]) if (m) m.offset.y = -gz / GROUND_L * GRASS_REP[1];
  moon.position.set(px + 6, 18, pz + 4); moon.target.position.set(px, 0, pz - 6);

  // camera: behind and above Jack; swings around to face the killer on death
  const dying = state === 'dying' || state === 'over';
  const camZ = dying ? pz - 4.5 : pz + 7.6, camY = dying ? 2.2 : 4.6;
  camera.position.x = damp(camera.position.x, px * 0.55, 6, dt);
  camera.position.y = damp(camera.position.y, camY + py * 0.3, 4, dt);
  camera.position.z = state === 'play' ? camZ : damp(camera.position.z, camZ, 2.5, dt);
  camLook.set(px * 0.35, dying ? 1.1 : 1.0, dying ? pz + 1 : pz - 8);
  camera.lookAt(camLook);
  (camera as THREE.PerspectiveCamera).fov = damp((camera as THREE.PerspectiveCamera).fov, 58 + speed * 0.45, 3, dt);
  camera.updateProjectionMatrix();

  // HUD
  const fl = $('flash'); fl.style.opacity = String(Math.max(0, Number(fl.style.opacity || 0) - dt * 2.5));
  $('coins').textContent = String(coinCount);
  $('dist').textContent = String(Math.floor(-pz));
  $('danger').textContent = state === 'play' && gap < T.zombieCatchGap ? '🧟 ZOMBIES RIGHT BEHIND YOU!' : '';
  (window as any).__playtest = { state, dist: Math.floor(-pz), coins: coinCount, speed: +speed.toFixed(1), gap: +gap.toFixed(1), slender: sl, slEncounters, dodged, stumbles, obstacles: obstacles.length, fps };
  input.endFrame();
});

loadAll().then(() => {
  state = 'menu';
  $('loading').textContent = 'CLICK OR PRESS SPACE TO RUN';
  // menu backdrop: spawn some graveyard so the title screen isn't empty
  nextDecor = 10; while (nextDecor > -100) { spawnDecor(nextDecor); nextDecor -= 3.5; }
  if (Q.has('autostart')) start();
}).catch((e) => { console.error(e); $('loading').textContent = 'FAILED TO LOAD: ' + e.message; });

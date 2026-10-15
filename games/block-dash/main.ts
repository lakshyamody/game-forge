/**
 * Block Dash — Temple Run in a Minecraft world. Run an endless voxel path, swap lanes, jump TNT and lava gaps,
 * slide under log beams, turn at corners, and stay ahead of the zombie horde.
 * Debug params: ?tune (sliders) ?god (can't die) ?auto (autopilot runs for you; also the menu attract mode) ?speed=20
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { Debris } from '@kit/three/debris';
import { createInput } from '@kit/input';
import { loadModel, loadHdri, animate, sound } from '@kit/assets';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { damp, clamp } from '@kit/math';
import { store } from '@kit/save';
import { C } from './config';
import { makeBlocks, BLOCK_COLOR } from './blocks';
import { World, GROUND, fwd, type Seg } from './world';

const q = new URLSearchParams(location.search);
const GOD = q.has('god');
let AUTO = q.has('auto');
const save = store('block-dash', { best: 0 });

const game = bootThree({ fov: 62, shadows: true, fog: { color: 0xbcd4ea, near: 40, far: 120 }, bloom: { strength: 0.22, radius: 0.45, threshold: 0.92 } });
const { scene, camera, loop, hud, shake } = game;
await loadHdri(scene, 'kloofendal_48d_partly_cloudy_puresky', { background: true, intensity: 0.7 });
scene.add(new THREE.HemisphereLight(0xdcebff, 0x5a6a40, 0.6));
const sun = new THREE.DirectionalLight(0xfff1d8, 2.8);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 140 });
scene.add(sun, sun.target);
const input = createInput(document.body);

// ------------------------------------------------------------------ world
const B = makeBlocks();
let world: World;
const debris = new Debris(scene, 800, new THREE.MeshLambertMaterial({ color: 0xffffff }));
const far = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ roughness: 1 }));
far.rotation.x = -Math.PI / 2; far.position.y = GROUND - 0.05; far.receiveShadow = true;
scene.add(far);
function setFarGround(tile: string) {
  const m = world.groundMat(tile).clone(); m.map = m.map!.clone(); m.map.repeat.set(700, 700); m.map.needsUpdate = true;
  (far.material as THREE.Material).dispose(); far.material = m;
}

// ------------------------------------------------------------------ characters
const rig = new THREE.Group(), body = new THREE.Group();
const hero = await loadModel('blocky-characters/character-b', { height: 1.5 });
body.add(hero); rig.add(body); scene.add(rig);
const anim = animate(hero); anim.play('idle');
const zombies: { m: THREE.Group; a: ReturnType<typeof animate>; side: number; back: number }[] = [];
for (const [side, back] of [[-0.95, 0], [0.95, 0.7], [0, 2.4]]) {   // flanking, so they never hide the hero from the camera
  const m = await loadModel('graveyard-kit/character-zombie', { height: 1.45 });
  scene.add(m); const a = animate(m); a.play('sprint', { speed: 1.2 });
  zombies.push({ m, a, side, back });
}
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; scene.add(blob);

// ------------------------------------------------------------------ HUD
hud.innerHTML = `
  <div class="bar"><div class="chip"><span class="dim">Score</span> <b id="score">0</b></div><div class="chip gold"><i class="ingot"></i><b id="coins">0</b></div><div class="chip"><b id="dist">0</b><span class="dim">m</span></div><div class="spacer"></div><div class="chip"><span class="dim">Best</span> <b id="best">0</b></div></div>
  <div class="toast" id="toast"></div>
  <div class="turn" id="turn"></div>
  <div class="danger" id="danger"></div>
  <div class="overlay" id="menu"><h1>BLOCK DASH</h1><p>Outrun the zombies. Don't miss a turn.</p><p class="keys"><kbd>A</kbd><kbd>D</kbd> lanes &amp; turns · <kbd>W</kbd> / <kbd>Space</kbd> jump · <kbd>S</kbd> slide · swipe on touch</p><div class="go">Press Space to run</div></div>
  <div class="overlay hidden" id="over"><h1 id="why">CAUGHT!</h1><p id="final"></p><div class="go">Press Space to run again</div></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
$('best').textContent = String(save.get('best'));
let toastT = 0;
const toast = (t: string, s = 1.4) => { $('toast').textContent = t; $('toast').style.opacity = '1'; toastT = s; };

// ------------------------------------------------------------------ run state
type State = 'menu' | 'play' | 'dying' | 'over';
let state: State = 'menu';
let seg: Seg, s = 0, o = 0, lane = 0, y = 0, vy = 0, slideT = 0, speed = C.speed, metres = 0, coins = 0, bonus = 0;
let falling = false, chase = C.chaseNear, stumbleT = 0, combo = 0, comboT = 0, stepT = 0, yaw = Math.PI, yawV = Math.PI, deathT = 0, lastBiome = '';
let turnBuf = 0, turnBufT = 0;
const snap = new THREE.Vector3(), pos = new THREE.Vector3(), rpos = new THREE.Vector3();
const trail: { d: number; x: number; z: number }[] = [];

function reset() {
  world?.segs.forEach((g) => scene.remove(g.group));
  world = new World(scene, B, String(Date.now()), () => C.biomeEvery);
  world.ensure(0);
  seg = world.seg(0); s = 4; o = 0; lane = 0; y = 0; vy = 0; slideT = 0; falling = false;
  speed = Number(q.get('speed')) || C.speed; metres = 0; coins = 0; bonus = 0; combo = 0; chase = 4; stumbleT = 1;
  yaw = yawV = Math.PI; snap.set(0, 0, 0); trail.length = 0; lastBiome = seg.biome.name;
  setFarGround(seg.biome.ground);
  for (let k = 0; k < 40; k++) trail.push({ d: -40 + k, x: 0, z: -4 + 40 - k });
  body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
}
reset();

function start() {
  if (state === 'play' || state === 'dying') return;
  const fromMenu = state === 'menu';
  if (!fromMenu || AUTO) reset();
  if (!q.has('auto')) AUTO = false;
  state = 'play';
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  anim.play('sprint'); zombies.forEach((z) => z.a.play('sprint', { speed: 1.2 }));
  if (!music.playing) music.play(SONGS.chiptune ?? Object.values(SONGS)[0]);
  sfx.play('select'); sfx.play('hurt', { volume: 0.3 });
  toast('RUN!', 0.9);
}
let deathWhy = '';
function die(title: string, why: string) {
  if (GOD) return false;
  state = 'dying'; deathT = 0; deathWhy = why;
  $('why').textContent = title;
  anim.play('die', { once: true, fade: 0.1 });
  shake(0.6); music.duck(0.2, 900); sfx.play('hurt'); sfx.play('thud');
  return true;
}
function gameOver() {
  state = 'over';
  const score = scoreNow();
  const isBest = save.best('best', score);
  $('best').textContent = String(save.get('best'));
  $('final').innerHTML = `${deathWhy}<br><br>${score.toLocaleString()} points · ${Math.floor(metres)} m · ${coins} gold${isBest && score > 0 ? '<br><span class="newbest">NEW BEST!</span>' : ''}`;
  $('over').classList.remove('hidden');
  if (isBest && score > 0) sfx.notes('coin', [0, 4, 7, 12], 0.09);
}
const scoreNow = () => Math.floor(metres) + coins * C.coinValue + bonus;
for (const id of ['menu', 'over']) $(id).addEventListener('pointerdown', () => start());

// pause on Esc / tab blur
const setPause = (p: boolean) => { if (state !== 'play') return; game.paused = p; toast(p ? 'PAUSED' : '', p ? 1e9 : 0.01); if (p) music.duck(0.15, 1e6); else music.duck(1, 1); };
addEventListener('keydown', (e) => { if (e.code === 'Escape') setPause(!game.paused); });
addEventListener('blur', () => setPause(true));

// touch swipes
let sw: { x: number; y: number } | null = null, swipe = '';
addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', (e) => {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
  swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
});

// ------------------------------------------------------------------ moves
function steer(dir: number) {
  const inWindow = s >= seg.len - C.turnWindow;
  if (dir === seg.turn && inWindow) return turn();
  if (dir === seg.turn && s >= seg.len - C.turnWindow - 4) { turnBuf = dir; turnBufT = 0.5; return; }
  if (clamp(lane + dir, -1, 1) !== lane) { lane += dir; sfx.play('dash', { volume: 0.25 }); }
}
function turn() {
  const old = world.at(seg, s, o);
  const t = seg.turn, ds = s - seg.len, oldO = o;
  seg = world.seg(seg.i + 1);
  s = t * oldO; o = clamp(-t * ds, -1, 1); lane = Math.round(o);
  snap.add(old.sub(world.at(seg, s, o)));
  yaw -= t * Math.PI / 2;
  turnBuf = 0;
  world.ensure(seg.i);
  sfx.play('dash', { volume: 0.4 }); sound.play('impact-sounds/footstep_concrete_*', { volume: 0.4 });
  debris.burst(rpos.x, 0.1, rpos.z, [BLOCK_COLOR[seg.biome.path[0]] ?? 0x888888], 6, 3, 3, 0.18);
  bonus += 25; pop('+25 turn', '#9ef0ff');
  if (seg.biome.name !== lastBiome) { lastBiome = seg.biome.name; toast(seg.biome.name.toUpperCase(), 2); setFarGround(seg.biome.ground); sfx.notes('blip', [0, 7, 12], 0.08); }
}
function jump() {
  if (y > 0.01 || falling) return;
  vy = C.jumpV; slideT = 0;
  sfx.play('jump');
  body.scale.set(0.85, 1.2, 0.85);
}
function slide() {
  if (falling) return;
  if (y > 0.01) vy = -24;
  if (slideT <= 0) sfx.play('dash', { volume: 0.5 });
  slideT = C.slideTime;
}
let popN = 0;
function pop(text: string, color = '#ffe14d') {
  const d = document.createElement('div');
  d.className = 'pop'; d.textContent = text; d.style.color = color; d.style.left = `${50 + ((popN++ % 3) - 1) * 6}%`;
  hud.appendChild(d); setTimeout(() => d.remove(), 900);
}

/** Hit an obstacle: smash it into voxels. A second hit while the zombies are close is game over. */
function stumble(ob: { kind: string; group?: THREE.Group }) {
  const colors = ob.kind === 'tnt' ? [0xc83228, 0xececec, 0xffb040, 0x333333] : ob.kind === 'beam' ? [0x685232, 0xb08f58] : [0x808080, 0x5a5a5a];
  ob.group?.children.forEach((m) => debris.burst(m.position.x, m.position.y, m.position.z, colors, ob.kind === 'tnt' ? 22 : 12, ob.kind === 'tnt' ? 11 : 6, 8, 0.28));
  if (ob.group) ob.group.visible = false;
  if (ob.kind === 'tnt') { sfx.play('bigBoom'); shake(0.9); flash('#ffb040'); } else { sound.play('impact-sounds/impactmining_*', { volume: 0.8 }); shake(0.45); flash('#ff3030'); }
  combo = 0;
  if (chase < C.chaseFar * 0.55 && !GOD) { chase = 0.6; die('CAUGHT!', 'The zombies got you.'); return; }
  chase = C.chaseNear; stumbleT = C.chaseRecover; speed = Math.max(C.speed, speed * 0.82);
  sfx.play('hurt'); music.duck(0.3, 500);
  $('danger').style.opacity = '1';
  toast('WATCH OUT!', 1);
}
function flash(c: string) {
  const d = document.createElement('div'); d.className = 'flash'; d.style.background = c; hud.appendChild(d);
  setTimeout(() => d.remove(), 260);
}

// ------------------------------------------------------------------ autopilot (attract mode + ?auto)
function autopilot() {
  const look = s + 1 + speed * 0.32;
  for (const ob of seg.obs) {
    if (ob.hit || ob.s + ob.len < s - 0.3 || ob.s > look) continue;
    if (ob.kind === 'beam') { if (ob.s - s < speed * 0.2) slide(); return; }
    if (ob.kind === 'gap') { if (ob.s - s < speed * 0.12 + 0.6) jump(); return; }
    if (!ob.lanes.includes(lane)) return;
    const free = [-1, 0, 1].filter((l) => !ob.lanes.includes(l)).sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane));
    if (ob.kind === 'tnt' && (!free.length || Math.abs(free[0] - lane) > 1)) { if (ob.s - s < speed * 0.16 + 0.8) jump(); return; }
    if (free.length) steer(Math.sign(free[0] - lane));
    return;
  }
  if (s > seg.len - 1.5) steer(seg.turn);
}

// ------------------------------------------------------------------ loop
const camPos = new THREE.Vector3(), look = new THREE.Vector3(), v3 = new THREE.Vector3();
let t = 0;
loop((dt) => {
  t += dt;
  if (input.pressed('KeyM')) audio.toggleMute();
  if ((state === 'menu' || state === 'over') && (input.anyPressed('Space', 'Enter', 'KeyR') || (state === 'over' && swipe === 'up'))) start();
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').style.opacity = '0';

  const running = state === 'play' || (state === 'menu' && AUTO);
  if (running) {
    if (state === 'menu' && AUTO) autopilot();
    if (state === 'play') {
      if (AUTO) autopilot();
      if (input.anyPressed('KeyA', 'ArrowLeft') || swipe === 'left') steer(-1);
      if (input.anyPressed('KeyD', 'ArrowRight') || swipe === 'right') steer(1);
      if (input.anyPressed('KeyW', 'ArrowUp', 'Space') || swipe === 'up') jump();
      if (input.anyPressed('KeyS', 'ArrowDown') || swipe === 'down') slide();
    }
    if (turnBufT > 0) { turnBufT -= dt; if (turnBuf && s >= seg.len - C.turnWindow) turn(); }

    speed = Math.min(C.speedMax, speed + C.accel * dt);
    s += speed * dt; metres += speed * dt;
    o = damp(o, lane, C.laneSnap, dt);
    // vertical
    const over = seg.obs.find((ob) => ob.kind === 'gap' && s > ob.s - 0.25 && s < ob.s + ob.len - 0.75);
    if (over && y <= 0.01 && vy <= 0) falling = true;
    if (y > 0 || vy > 0 || falling) { vy -= C.gravity * dt; y += vy * dt; }
    if (!falling && y <= 0 && vy <= 0) { if (y < 0 || vy < -1) { body.scale.set(1.2, 0.8, 1.2); debris.burst(rpos.x, 0.05, rpos.z, [BLOCK_COLOR[seg.biome.path[0]] ?? 0x888888], 4, 2, 2, 0.15); } y = 0; vy = 0; }
    if (falling && y < -2.2) {
      if (GOD || state === 'menu') { falling = false; y = 0.5; vy = 6; }
      else if (die('LAVA!', 'You fell into the lava.')) { sfx.play('explode'); }
    }
    slideT -= dt;
    // missed the corner
    if (s > seg.len + 1.4 && state !== 'dying') {
      if (GOD || state === 'menu') turn();
      else { s = seg.len + 1.4; die('SPLAT!', 'You ran into the wall. Turn at the corners!'); flash('#ffffff'); }
    }
    // obstacles
    for (const ob of seg.obs) {
      if (ob.hit || ob.kind === 'gap' || Math.abs(s - ob.s) > 0.75 || !ob.lanes.some((l) => Math.abs(o - l) < 0.7)) continue;
      const h = slideT > 0 ? 0.6 : 1.45;
      const hit = ob.kind === 'tnt' ? y < 0.95 : ob.kind === 'wall' ? y < 1.95 : y + h > 1.05 && y < 1.95;
      if (hit) { ob.hit = true; if (state === 'play') stumble(ob); else if (ob.group) ob.group.visible = false; }
    }
    // coins
    for (const c of seg.coins) {
      if (!c.alive || Math.abs(s - c.s) > 0.8 || Math.abs(o - c.o) > 0.8 || Math.abs(y + 0.7 - c.y) > 1.1) continue;
      c.alive = false; coins++; combo++; comboT = 0.6;
      sfx.play('coin', { freq: 1400 * 2 ** (Math.min(combo, 14) / 12), volume: 0.3 });
      world.at(seg, c.s, c.o, v3, c.y);
      debris.burst(v3.x, v3.y, v3.z, [0xf8d23c, 0xfff6b0], 3, 2, 3, 0.1);
      if (combo % 10 === 0) { bonus += 50; pop(`x${combo} COMBO +50`); sfx.notes('blip', [0, 4, 7], 0.06); }
    }
    if ((comboT -= dt) <= 0) combo = 0;
    // zombies fall back after a stumble
    stumbleT -= dt;
    chase = damp(chase, stumbleT > 0 ? C.chaseNear : C.chaseFar, stumbleT > 0 ? 3 : 0.6, dt);
    if (stumbleT <= 0) $('danger').style.opacity = String(clamp((C.chaseFar * 0.55 - chase) / 4, 0, 1));
    // footsteps
    if (y <= 0 && !falling && (stepT -= dt * speed) <= 0) { stepT = 2.2; sound.play(`impact-sounds/footstep_${seg.biome.tree === 'spruce' ? 'snow' : seg.biome.tree === 'cactus' ? 'grass' : 'concrete'}_*`, { volume: 0.18 }); }
    music.setIntensity(speed > 17 ? 2 : speed > 13 ? 1 : 0);
    // turn hint
    const toCorner = seg.len - s;
    $('turn').textContent = seg.turn > 0 ? 'TURN ➜' : '⬅ TURN';
    $('turn').style.opacity = state === 'play' && toCorner < 16 ? (toCorner < C.turnWindow ? '1' : '0.55') : '0';
    $('turn').classList.toggle('now', toCorner < C.turnWindow);
  }
  if (state === 'dying') {
    deathT += dt;
    if (falling) { vy -= C.gravity * dt; y = Math.max(y + vy * dt, GROUND + 0.6 - 0); }
    chase = damp(chase, 0.9, 3, dt);
    if (deathT > 1.4) gameOver();
  }

  // world → render position (snap offset smooths the corner jump)
  world.at(seg, s, o, pos, y);
  snap.multiplyScalar(Math.exp(-10 * dt));
  rpos.copy(pos).add(snap);
  rig.position.copy(rpos);
  yawV = damp(yawV, yaw, 14, dt);
  rig.rotation.y = yawV + (lane - o) * -0.25 * (state === 'play' ? 1 : 0);
  // body: slide = lean back, jump = tuck + squash recovery
  const sl = slideT > 0 && y <= 0.01;
  body.rotation.x = damp(body.rotation.x, sl ? -1.25 : y > 0.2 ? 0.25 : 0, 18, dt);
  body.position.y = damp(body.position.y, sl ? 0.25 : 0, 18, dt);
  body.scale.x = damp(body.scale.x, 1, 12, dt); body.scale.y = damp(body.scale.y, 1, 12, dt); body.scale.z = damp(body.scale.z, 1, 12, dt);
  if (state === 'play' || (state === 'menu' && AUTO)) anim.play('sprint', { speed: 0.6 + speed / 18 });
  anim.update(dt);
  blob.visible = !falling; blob.position.set(rpos.x, 0.02, rpos.z); blob.scale.setScalar(1 / (1 + Math.max(0, y) * 0.5));

  // zombie horde follows the trail you ran
  if (state === 'play' || state === 'dying' || AUTO) {
    const last = trail[trail.length - 1];
    if (!last || metres - last.d > 0.25) trail.push({ d: metres, x: pos.x, z: pos.z });
    while (trail.length > 400) trail.shift();
  }
  for (const z of zombies) {
    const d = metres - chase - z.back;
    let k = trail.length - 1; while (k > 0 && trail[k - 1].d > d) k--;
    const a = trail[Math.max(0, k - 1)], b = trail[k];
    const f = b.d === a.d ? 0 : clamp((d - a.d) / (b.d - a.d), 0, 1);
    const hx = b.x - a.x, hz = b.z - a.z, hl = Math.hypot(hx, hz) || 1;
    const zx = a.x + hx * f - (hz / hl) * z.side, zz = a.z + hz * f + (hx / hl) * z.side;
    z.m.position.set(zx, 0, zz);
    z.m.rotation.y = Math.atan2(hx, hz);
    z.m.visible = state !== 'menu' || AUTO;
    if (state === 'dying' && !falling && z.back < 1 && deathT > 0.3) z.a.play('attack-melee-right'); else if (state === 'over') z.a.play('idle'); else z.a.play('sprint', { speed: 0.7 + speed / 22 });
    z.a.update(dt);
  }

  // camera: behind and above, turns smoothly with the path
  const fx = Math.sin(yawV), fz = Math.cos(yawV);
  const close = clamp((7 - chase) / 4, 0, 1);   // lift the camera when the horde is right behind
  camPos.set(rpos.x - fx * 6.2, Math.max(rpos.y * 0.5, -1) + 3.9 + close * 0.9, rpos.z - fz * 6.2);
  if (state === 'menu' && !AUTO) camPos.set(rpos.x + fx * 4 + fz * 2.5, 2.2, rpos.z + fz * 4 - fx * 2.5);
  camera.position.lerp(camPos, 1 - Math.exp(-(state === 'menu' ? 2 : 9) * dt));
  look.set(rpos.x + fx * 5, 0.9 + Math.max(0, y) * 0.3, rpos.z + fz * 5);
  if (state === 'menu' && !AUTO) look.set(rpos.x, 1.1, rpos.z);
  camera.lookAt(look);
  sun.target.position.copy(rpos); sun.position.set(rpos.x + 30, 50, rpos.z + 20);
  far.position.x = Math.round(rpos.x); far.position.z = Math.round(rpos.z);

  for (const g of world.segs) if (Math.abs(g.i - seg.i) <= 2) world.updateCoins(g, t);
  debris.update(dt);

  const score = scoreNow();
  $('score').textContent = score.toLocaleString();
  $('coins').textContent = String(coins);
  $('dist').textContent = String(Math.floor(metres));
  (window as any).__playtest = { state, score, metres: Math.floor(metres), coins, speed: +speed.toFixed(1), seg: seg.i, biome: seg.biome.name, chase: +chase.toFixed(1) };
  (window as any).__debug = { world, C, get seg() { return seg; }, get s() { return s; } };
  swipe = '';
  input.endFrame();
});

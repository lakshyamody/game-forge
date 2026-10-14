/**
 * Siteline — tactical 1v3 first-person shooter. Attack alone: buy, take a site, plant the spike, survive.
 * Debug: ?god ?auto (bot plays you) ?freelook (no pointer lock) ?round=4 ?credits=9000 ?tune
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { Debris } from '@kit/three/debris';
import { createInput } from '@kit/input';
import { sfx, audio } from '@kit/audio';
import { clamp, damp, lerp, angleDiff } from '@kit/math';
import { store } from '@kit/save';
import { action } from '@kit/tune';
import { loadModel, loadHdri, sound } from '@kit/assets';
import { MOVE, ROUND, ECON, AI, PLAYER, ABIL, GUNS, CELL, type GunId } from './config';
import { buildMap, grid, toWorld, toCell, walkable, posts, spawns, lineClear, rayWall, slide, siteAt, W, H, blocked } from './map';
import { Defender } from './defender';

const q = new URLSearchParams(location.search);
const AUTO = q.has('auto'), GOD = q.has('god');
const save = store('siteline', { wins: 0, losses: 0, bestKills: 0 });

const { scene, camera, renderer, loop, hud, shake } = bootThree({ background: 0xf3b27a, fog: { color: 0xf0c49a, near: 40, far: 110 }, fov: 78, shadows: true, maxPixelRatio: 1.5 });
camera.near = 0.03; camera.far = 300; camera.updateProjectionMatrix();
scene.add(camera);
const input = createInput(renderer.domElement);

// ---------------------------------------------------------------- world
const sun = new THREE.DirectionalLight(0xffe2c0, 2.2); sun.position.set(-30, 45, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 30, bottom: -30, near: 5, far: 120 }); sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, new THREE.HemisphereLight(0xffe0c0, 0x6a4a30, 0.5));
const debris = new Debris(scene);
const defenders = [0, 1, 2, 3].map((i) => new Defender(scene, i));
const [labels] = await Promise.all([
  buildMap(scene), loadHdri(scene, 'belfast_sunset_puresky', { background: true, intensity: 0.45 }),
  ...defenders.map((d) => d.ready),
  sound.load('impact-sounds/footstep_concrete_*', 'sci-fi-sounds/laserlarge_*', 'impact-sounds/impactmetal_light_*'),
]);
void labels;
const voice = (line: string) => sound.play(`voiceover-pack/${line}`, { volume: 0.8, minGap: 0 });

// spike
const spike = new THREE.Group();
spike.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.6, roughness: 0.4 })));
const spikeLight = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 16), new THREE.MeshBasicMaterial({ color: 0xff4655 }));
spikeLight.rotation.x = Math.PI / 2; spikeLight.position.y = 0.2; spike.add(spikeLight);
spike.position.y = 0.25; spike.visible = false; scene.add(spike);

// viewmodel
const view = new THREE.Group(); camera.add(view);
const flash = new THREE.PointLight(0xffc070, 0, 6, 2); flash.position.set(0.25, -0.15, -1.1); camera.add(flash);
const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd080, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending }));
flashSprite.scale.setScalar(0.18); flashSprite.renderOrder = 20; camera.add(flashSprite);
const gunModels: Partial<Record<GunId, THREE.Object3D>> = {};
for (const id of Object.keys(GUNS) as GunId[]) {
  const m = await loadModel(`blaster-kit/${GUNS[id].model}`, { scale: 1.2, shadows: false });
  m.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { (mesh.material as THREE.Material).depthTest = true; mesh.renderOrder = 5; } });
  m.visible = false; view.add(m); gunModels[id] = m;
}

// tracers + smokes
const tracers: { line: THREE.Line; t: number }[] = [];
function tracer(a: THREE.Vector3, b: THREE.Vector3, color = 0xfff0c0) {
  let tr = tracers.find((t) => t.t <= 0);
  if (!tr) { tr = { line: new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ transparent: true })), t: 0 }; tracers.push(tr); scene.add(tr.line); }
  tr.line.geometry.setFromPoints([a, b]); (tr.line.material as THREE.LineBasicMaterial).color.setHex(color); tr.t = 0.08; tr.line.visible = true;
}
interface Smoke { mesh: THREE.Mesh; x: number; z: number; t: number }
const smokes: Smoke[] = [];
const smokeBlocks = (ax: number, az: number, bx: number, bz: number) => smokes.some((s) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = clamp(((s.x - ax) * dx + (s.z - az) * dz) / l2, 0, 1);
  return Math.hypot(ax + dx * t - s.x, az + dz * t - s.z) < ABIL.smokeRadius * Math.min(1, s.t * 3);
});

// ---------------------------------------------------------------- state
type State = 'menu' | 'buy' | 'live' | 'post' | 'over' | 'paused';
let state: State = 'menu', resume: State = 'live';
const P = { x: 0, z: 0, vx: 0, vz: 0, hp: PLAYER.hp, alive: true, gun: 'pistol' as GunId, owned: 'pistol' as GunId, ammo: 12, fireT: 0, reloadT: 0, bloom: 0, recoil: 0, dashT: 0, dashX: 0, dashZ: 0, dashes: ABIL.dashCharges, smokes: ABIL.smokes, recon: ABIL.recon, reconT: 0, stepT: 0, hurtT: 0, plantT: 0, ads: false };
const cam = { yaw: 0, pitch: 0 };
const M = { round: 0, score: [0, 0], credits: Number(q.get('credits') ?? ECON.start), timer: 0, kills: 0, heads: 0, hits: 0, roundKills: 0, planted: false, spikeT: 0, spikeX: 0, spikeZ: 0, postT: 0, lastResult: '' };
const alive = () => defenders.filter((d) => d.alive && d.root.visible);
const active = () => defenders.slice(0, M.round >= 3 ? 4 : 3);

// ---------------------------------------------------------------- HUD
hud.innerHTML = `
  <canvas id="map" width="${W * 5}" height="${H * 5}"></canvas>
  <div class="top"><span class="att" id="sA">0</span><div class="mid"><div id="timer">1:30</div><div id="pips"></div></div><span class="def" id="sD">0</span></div>
  <div id="cross"><i></i><i></i><i></i><i></i></div><div id="hitx"></div>
  <div id="banner"></div><div id="sub"></div><div id="hurt"></div>
  <div id="plant"><div id="plantFill"></div><span>PLANTING</span></div>
  <div class="hp"><b id="hp">100</b><small>HP</small></div>
  <div class="abil"><div id="aQ"><b>Q</b>DASH<i id="nQ"></i></div><div id="aE"><b>E</b>SMOKE<i id="nE"></i></div><div id="aC"><b>C</b>RECON<i id="nC"></i></div></div>
  <div class="gun"><div id="gname">SIDEARM</div><div><b id="ammo">12</b> / <span id="mag">12</span></div><div class="cr">¤ <span id="credits">800</span></div></div>
  <div id="hint"></div>
  <div class="ov hidden" id="buy"><h2>BUY PHASE <span id="buyT"></span></h2><div class="cards" id="cards"></div><p>Press <b>1–4</b> to buy · you keep your gun if you survive</p></div>
  <div class="ov" id="menu"><h1>SITE<span>LINE</span></h1><p class="tag">You attack alone. Take a site. Plant the spike. Survive.</p>
    <p class="keys">WASD move · SHIFT walk (silent, accurate) · MOUSE aim · CLICK shoot · RIGHT CLICK zoom · R reload<br>Q dash · E smoke · C recon · hold 4 on a site to plant the spike<br><em>Stop moving before you shoot — moving shots go wide.</em></p>
    <p id="record" class="dim"></p><p class="go">CLICK TO PLAY</p></div>
  <div class="ov hidden" id="pause"><h1>PAUSED</h1><p class="go">CLICK TO RESUME</p></div>
  <div class="ov hidden" id="end"><h1 id="endT"></h1><p id="endS" class="big"></p><p id="endStats"></p><p class="go">CLICK OR R FOR A REMATCH</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
const mapCtx = ($('map') as HTMLCanvasElement).getContext('2d')!;
let bannerT = 0, hitT = 0;
function banner(html: string, secs = 2) { const b = $('banner'); b.innerHTML = html; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); bannerT = secs; }
$('record').textContent = save.get('wins') + save.get('losses') ? `Record ${save.get('wins')}W ${save.get('losses')}L · best ${save.get('bestKills')} kills` : '';

// ---------------------------------------------------------------- flow
function startMatch() {
  M.round = Number(q.get('round') ?? 1) - 1; M.score = [0, 0]; M.credits = Number(q.get('credits') ?? ECON.start); M.kills = M.heads = M.hits = 0;
  P.owned = 'pistol';
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); hud.classList.add('playing');
  lockPointer(); nextRound();
}
function nextRound() {
  M.round++; M.planted = false; M.timer = ROUND.length; M.roundKills = 0; spike.visible = false;
  const s = spawns[Math.floor(Math.random() * spawns.length)];
  Object.assign(P, { x: s.x, z: s.z, vx: 0, vz: 0, hp: PLAYER.hp, alive: true, dashes: ABIL.dashCharges, smokes: ABIL.smokes, recon: ABIL.recon, reconT: 0, plantT: 0, bloom: 0, recoil: 0, reloadT: 0 });
  if (!P.alive || P.owned === undefined) P.owned = 'pistol';
  equip(P.owned);
  cam.yaw = 0; cam.pitch = 0;
  smokes.forEach((s) => scene.remove(s.mesh)); smokes.length = 0;
  defenders.forEach((d) => { d.root.visible = false; d.alive = false; });
  active().forEach((d, i) => { const p = posts[i]; d.spawn(p.x, p.z); });
  state = 'buy'; M.postT = ROUND.buy;
  renderCards(); $('buy').classList.remove('hidden');
  banner(`<small>ROUND ${M.round}</small>${M.score[0] === ROUND.toWin - 1 || M.score[1] === ROUND.toWin - 1 ? 'MATCH POINT' : 'BUY PHASE'}`, 1.6);
  voice(M.round === 1 ? 'ready' : 'round');
}
function goLive() { state = 'live'; $('buy').classList.add('hidden'); banner('GO', 0.8); voice('go'); sfx.play('select'); }
function endRound(won: boolean, why: string) {
  if (state !== 'live') return;
  state = 'post'; M.postT = ROUND.between;
  M.score[won ? 0 : 1]++;
  M.credits = Math.min(9000, M.credits + (won ? ECON.win : ECON.loss));
  if (!P.alive) P.owned = 'pistol';
  banner(`${won ? 'ROUND WON' : 'ROUND LOST'}<small>${why}</small>`, ROUND.between);
  voice(won ? 'objective_achieved' : 'mission_failed');
}
function endMatch() {
  state = 'over'; document.exitPointerLock?.(); hud.classList.remove('playing');
  const won = M.score[0] > M.score[1];
  save.set(won ? 'wins' : 'losses', save.get(won ? 'wins' : 'losses') + 1);
  save.set('bestKills', Math.max(save.get('bestKills'), M.kills));
  $('endT').textContent = won ? 'VICTORY' : 'DEFEAT'; $('endT').style.color = won ? '#18e5b7' : '#ff4655';
  $('endS').textContent = `${M.score[0]} – ${M.score[1]}`;
  $('endStats').innerHTML = `${M.kills} kills · ${M.hits ? Math.round((M.heads / M.hits) * 100) : 0}% headshots<br>Record ${save.get('wins')}W ${save.get('losses')}L`;
  $('end').classList.remove('hidden'); voice(won ? 'you_win' : 'you_lose');
}

// ---------------------------------------------------------------- buying
const ORDER: GunId[] = ['pistol', 'smg', 'rifle', 'sniper'];
function renderCards() {
  $('buyT').textContent = String(Math.ceil(M.postT));
  $('cards').innerHTML = ORDER.map((id, i) => {
    const g = GUNS[id], own = P.owned === id, can = M.credits >= g.cost;
    return `<div class="card ${own ? 'own' : can ? '' : 'poor'}"><b>${i + 1}</b><h3>${g.name}</h3><p>${g.cost ? '¤ ' + g.cost : 'FREE'}</p><small>${own ? 'EQUIPPED' : id === 'sniper' ? 'one-shot body' : id === 'rifle' ? 'one-tap heads' : id === 'smg' ? 'fast spray' : 'accurate taps'}</small></div>`;
  }).join('');
}
function buy(id: GunId) {
  const g = GUNS[id];
  if (P.owned === id) return;
  if (M.credits < g.cost) { sfx.play('denied'); return; }
  M.credits -= g.cost; P.owned = id; equip(id); sfx.play('coin'); renderCards();
}
function equip(id: GunId) {
  P.gun = id; P.ammo = GUNS[id].mag; P.reloadT = 0;
  for (const k of ORDER) gunModels[k]!.visible = k === id;
}

// ---------------------------------------------------------------- shooting
const raycaster = new THREE.Raycaster();
const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), muzzle = new THREE.Vector3();
function hitSphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc); return t > 0 ? t : Infinity;
}
const HEAD = { y: 1.42, r: 0.3 }, BODY = [{ y: 0.95, r: 0.32 }, { y: 0.5, r: 0.3 }];
function fire() {
  const g = GUNS[P.gun];
  P.ammo--; P.fireT = 1 / g.rate;
  const speed = Math.hypot(P.vx, P.vz);
  const moving = clamp((speed - 0.8) / (MOVE.speed - 0.8), 0, 1);
  let spread = lerp(g.still, g.moving, moving) + P.bloom;
  if (P.gun === 'sniper' && !P.ads) spread += 0.05;
  else if (P.ads) spread *= 0.7;
  camera.getWorldDirection(dir);
  dir.x += (Math.random() - 0.5) * 2 * spread; dir.y += (Math.random() - 0.5) * 2 * spread; dir.z += (Math.random() - 0.5) * 2 * spread; dir.normalize();
  const o = camera.getWorldPosition(tmp.clone());
  // wall distance (only counts if the ray is still below the wall tops there)
  const horiz = Math.hypot(dir.x, dir.z) || 1e-6;
  let tWall = rayWall(o.x, o.z, dir.x, dir.z, 140) / horiz;
  if (o.y + dir.y * tWall > 4.2 || o.y + dir.y * tWall < 0) tWall = o.y + dir.y * 999 < 0 ? -o.y / dir.y : 300;
  let best: Defender | null = null, bestT = tWall, head = false;
  const c = new THREE.Vector3();
  for (const d of alive()) {
    const th = hitSphere(o, dir, c.set(d.x, HEAD.y, d.z), HEAD.r);
    if (th < bestT) { best = d; bestT = th; head = true; }
    for (const b of BODY) { const tb = hitSphere(o, dir, c.set(d.x, b.y, d.z), b.r); if (tb < bestT) { best = d; bestT = tb; head = false; } }
  }
  const end = o.clone().addScaledVector(dir, Math.min(bestT, 200));
  muzzle.set(0.22, -0.16, -0.75); camera.localToWorld(muzzle);
  tracer(muzzle, end);
  if (best) {
    M.hits++; if (head) M.heads++;
    const killed = best.damage(Math.round(g.dmg * (head ? g.head : 1)));
    hitT = 0.12; $('hitx').className = head ? 'head' : '';
    sfx.play(head ? 'coin' : 'hit', { volume: head ? 0.6 : 0.4 });
    debris.burst(end.x, end.y, end.z, [0xff4655, 0xaa1020], head ? 10 : 5, 3, 2, 0.05);
    if (killed) onKill(best, head);
    else { best.lastSeen = { x: P.x, z: P.z }; best.seeT = Math.max(best.seeT, AI.reaction * 0.6); }
  } else if (bestT < 200) {
    debris.burst(end.x, end.y, end.z, [0xe8d2b0, 0xb89a78], 4, 2.5, 2, 0.06);
    sound.play('impact-sounds/impactmetal_light_*', { volume: 0.12 });
  }
  P.bloom = Math.min(0.08, P.bloom + g.bloom);
  cam.pitch += g.kick; P.recoil += g.kick;
  view.position.z = 0.06; view.rotation.x = g.kick * 3;
  flash.intensity = 6; (flashSprite.material as THREE.SpriteMaterial).opacity = 1;
  flashSprite.position.set(0.22, -0.13, -0.85 - (P.gun === 'sniper' ? 0.2 : 0));
  sound.play(P.gun === 'sniper' ? 'sci-fi-sounds/laserlarge_*' : P.gun === 'pistol' ? 'sci-fi-sounds/laserretro_*' : 'sci-fi-sounds/laserlarge_*', { volume: P.gun === 'sniper' ? 0.7 : 0.35, rate: P.gun === 'smg' ? 1.5 : P.gun === 'rifle' ? 1.15 : 1, minGap: 0 });
  shake(P.gun === 'sniper' ? 0.25 : 0.05);
  // gunfire is loud: the nearest defenders turn to hunt you
  hear(AI.hearShot);
  if (P.ammo <= 0) reload();
}
function onKill(d: Defender, head: boolean) {
  M.kills++; M.roundKills++; M.credits = Math.min(9000, M.credits + ECON.kill);
  banner(`${head ? '<em>HEADSHOT</em>' : ''}${'✦'.repeat(M.roundKills)}`, 1);
  sfx.notes('select', head ? [0, 7, 12] : [0, 7], 0.05);
  if (M.roundKills >= 3) voice('war_target_destroyed');
  void d;
}
function reload() {
  if (P.reloadT > 0 || P.ammo === GUNS[P.gun].mag) return;
  P.reloadT = GUNS[P.gun].reload; sfx.play('blip', { volume: 0.3 });
}
function hear(range: number) {
  const list = alive().filter((d) => !d.sees && d.state !== 'defuse' && Math.hypot(d.x - P.x, d.z - P.z) < range).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
  list.forEach((d, i) => {
    d.watchYaw = Math.atan2(-(P.x - d.x), -(P.z - d.z));
    if (i === 0 && d.state === 'hold') { d.state = 'hunt'; d.goTo(P.x, P.z); }
  });
}

// ---------------------------------------------------------------- abilities
function dash() {
  if (P.dashes <= 0 || P.dashT > 0) return;
  const a = input.axis();
  let dx = a.x, dz = a.y;
  if (!dx && !dz) dz = -1;
  const cs = Math.cos(cam.yaw), sn = Math.sin(cam.yaw);
  const wx = dx * cs + dz * sn, wz = -dx * sn + dz * cs, l = Math.hypot(wx, wz) || 1;
  P.dashX = wx / l; P.dashZ = wz / l; P.dashT = MOVE.dashTime; P.dashes--;
  sfx.play('dash'); shake(0.1);
}
function throwSmoke() {
  if (P.smokes <= 0) return;
  camera.getWorldDirection(dir);
  const h = Math.hypot(dir.x, dir.z) || 1;
  const dist = Math.min(22, rayWall(P.x, P.z, dir.x, dir.z, 22) - 1);
  const x = P.x + (dir.x / h) * dist, z = P.z + (dir.z / h) * dist;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(ABIL.smokeRadius, 20, 14), new THREE.MeshStandardMaterial({ color: 0x9db4d8, emissive: 0x24304a, transparent: true, opacity: 0.94, roughness: 1, side: THREE.DoubleSide, depthWrite: false }));
  mesh.position.set(x, ABIL.smokeRadius * 0.55, z); mesh.scale.setScalar(0.01); scene.add(mesh);
  smokes.push({ mesh, x, z, t: 0 }); P.smokes--;
  sound.play('sci-fi-sounds/forcefield_*', { volume: 0.5 });
}
function recon() {
  if (P.recon <= 0) return;
  P.recon--; P.reconT = ABIL.reconTime;
  sound.play('sci-fi-sounds/computernoise_*', { volume: 0.6 }); sfx.play('powerup', { volume: 0.4 });
}

// ---------------------------------------------------------------- input
function lockPointer() { const r = renderer.domElement.requestPointerLock?.() as unknown; if (r instanceof Promise) r.catch(() => {}); }
const locked = () => document.pointerLockElement === renderer.domElement;
document.addEventListener('mousemove', (e) => {
  if (state === 'menu' || state === 'over' || state === 'paused' || (!locked() && !q.has('freelook'))) return;
  const sens = 0.0021 / (P.ads ? GUNS[P.gun].zoom : 1);
  cam.yaw -= e.movementX * sens; cam.pitch = clamp(cam.pitch - e.movementY * sens, -1.45, 1.45);
});
document.addEventListener('pointerlockchange', () => { if (!locked() && !q.has('freelook') && (state === 'live' || state === 'buy' || state === 'post')) { resume = state; state = 'paused'; $('pause').classList.remove('hidden'); } });
hud.addEventListener('click', () => {
  if (state === 'menu' || state === 'over') startMatch();
  else if (state === 'paused') { state = resume; $('pause').classList.add('hidden'); lockPointer(); }
});
renderer.domElement.addEventListener('click', () => { if (!locked() && state !== 'menu' && state !== 'over') lockPointer(); });
action('Kill all defenders', () => alive().forEach((d) => d.damage(999)));
action('+5000 credits', () => (M.credits += 5000));

// ---------------------------------------------------------------- auto pilot (playtests)
let autoPath: { x: number; z: number }[] = [], autoSite = Math.random() < 0.5 ? 'A' : 'B', autoRepath = 0;
function autopilot(dt: number) {
  // aim at the closest visible defender, otherwise walk to the site and plant
  const seen = alive().filter((d) => lineClear(P.x, P.z, d.x, d.z) && !smokeBlocks(P.x, P.z, d.x, d.z)).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  let mx = 0, mz = 0, shoot = false;
  if (seen) {
    const dx = seen.x - P.x, dz = seen.z - P.z, d = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(HEAD.y - 0.15 - MOVE.eye, d);
    cam.yaw += angleDiff(cam.yaw, yaw) * Math.min(1, dt * 12); cam.pitch = damp(cam.pitch, pitch, 12, dt);
    shoot = Math.abs(angleDiff(cam.yaw, yaw)) < 0.25 / Math.max(d, 1);   // only fire when the crosshair is on them
  } else if (!(M.planted)) {
    autoRepath -= dt;
    if (autoRepath <= 0 || !autoPath.length) {
      const tgt = grid.findAll((c) => c === autoSite)[7]; autoRepath = 2;
      const p = grid.path(toCell(P.x, P.z), tgt!, walkable); autoPath = p ? p.slice(1).map((c) => toWorld(c.x, c.y)) : [];
    }
    const n = autoPath[0];
    if (n) {
      const dx = n.x - P.x, dz = n.z - P.z, d = Math.hypot(dx, dz);
      if (d < 0.4) autoPath.shift();
      cam.yaw += angleDiff(cam.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 6); cam.pitch = damp(cam.pitch, 0, 5, dt);
      mz = -1;
    }
  }
  return { mx, mz, shoot, plant: !seen && !!siteAt(P.x, P.z) && !M.planted };
}

// ---------------------------------------------------------------- AI
function aiUpdate(d: Defender, dt: number) {
  if (!d.alive) { d.update(dt, false); return; }
  const dx = P.x - d.x, dz = P.z - d.z, dist = Math.hypot(dx, dz);
  const toP = Math.atan2(-dx, -dz);
  const inFov = Math.abs(angleDiff(d.yaw, toP)) < (AI.fovDeg * Math.PI) / 360 || d.seeT > 0 || d.state === 'hunt';
  d.sees = P.alive && dist < AI.sight && inFov && lineClear(d.x, d.z, P.x, P.z) && !smokeBlocks(d.x, d.z, P.x, P.z);
  let moving = false;
  if (M.planted && d.state !== 'defuse' && !d.sees) { d.state = 'defuse'; d.goTo(M.spikeX, M.spikeZ); }
  if (d.sees) {
    d.lastSeen = { x: P.x, z: P.z }; d.lostT = 0;
    d.seeT += dt;
    d.yaw += angleDiff(d.yaw, toP) * Math.min(1, dt * 10);
    const react = Math.max(AI.reactionMin, AI.reaction - (M.round - 1) * 0.03);
    if (d.seeT > react) {
      // peek-strafe while shooting
      d.strafeT -= dt;
      if (d.strafeT <= 0) { d.strafeT = 0.3 + Math.random() * 0.5; d.strafe = Math.random() < 0.4 ? 0 : Math.random() < 0.5 ? -1 : 1; }
      if (d.strafe) { const sx = Math.cos(d.yaw) * d.strafe * 2.2 * dt, sz = -Math.sin(d.yaw) * d.strafe * 2.2 * dt; slide(d, sx, sz, 0.3); moving = true; }
      d.fireT -= dt;
      if (d.fireT <= 0) { d.fireT = AI.fireEvery * (0.8 + Math.random() * 0.5); aiShoot(d, dist); }
    }
  } else {
    d.seeT = Math.max(0, d.seeT - dt * 0.5);
    if (d.lastSeen) { d.lostT += dt; if (d.lostT > 1.2 && d.state === 'hold') { d.state = 'hunt'; d.goTo(d.lastSeen.x, d.lastSeen.z); d.lastSeen = null; } }
    if (d.state === 'defuse') {
      if (Math.hypot(M.spikeX - d.x, M.spikeZ - d.z) < 1.3) {
        d.defuseT += dt; d.play('crouch');
        if (d.defuseT >= ROUND.defuseTime) endRound(false, 'SPIKE DEFUSED');
      } else { moving = d.walk(dt); if (!moving && !d.path.length) d.goTo(M.spikeX, M.spikeZ); }
    } else if (d.state === 'hunt') {
      moving = d.walk(dt);
      if (!moving) { d.state = 'hold'; d.watchYaw = d.yaw; }
    } else {
      d.yaw += angleDiff(d.yaw, d.watchYaw + Math.sin(elapsed * 0.7 + d.id) * 0.35) * Math.min(1, dt * 3);
    }
  }
  if (d.state !== 'defuse' || Math.hypot(M.spikeX - d.x, M.spikeZ - d.z) >= 1.3) d.play(moving ? 'walk' : d.sees ? 'holding-both-shoot' : 'holding-both');
  d.marker.visible = P.reconT > 0;
  d.update(dt, P.reconT > 0);
}
function aiShoot(d: Defender, dist: number) {
  const pm = Math.hypot(P.vx, P.vz) > 3.5 ? 0.7 : 1;
  const acc = Math.min(0.85, AI.accuracy + (M.round - 1) * AI.accuracyPerRound) * pm * clamp(1.25 - dist / 45, 0.35, 1);
  const from = new THREE.Vector3(d.x, 1.15, d.z).addScaledVector(new THREE.Vector3(-Math.sin(d.yaw), 0, -Math.cos(d.yaw)), 0.5);
  const hit = Math.random() < acc;
  const to = new THREE.Vector3(P.x + (hit ? 0 : (Math.random() - 0.5) * 2.5), MOVE.eye - 0.3 + (hit ? 0 : (Math.random() - 0.3) * 1.2), P.z + (hit ? 0 : (Math.random() - 0.5) * 2.5));
  tracer(from, to, 0xff6070);
  sound.play('sci-fi-sounds/laserlarge_*', { volume: clamp(0.5 - dist / 80, 0.1, 0.5), rate: 1.3, minGap: 0 });
  if (hit && P.alive && !GOD) {
    const head = Math.random() < AI.headChance;
    P.hp -= AI.damage * (head ? 3 : 1); P.hurtT = 0.35; shake(head ? 0.35 : 0.15);
    sound.play('impact-sounds/impactpunch_medium_*', { volume: 0.5 });
    if (P.hp <= 0) { P.hp = 0; P.alive = false; P.plantT = 0; sfx.play('hurt'); if (!M.planted) endRound(false, 'YOU WERE ELIMINATED'); }
  }
}

// ---------------------------------------------------------------- loop
let elapsed = 0;
loop((rawDt) => {
  const dt = Math.min(rawDt, 0.05);
  elapsed += dt;
  if (input.pressed('KeyM')) audio.toggleMute();
  if (state === 'over' && input.pressed('KeyR')) startMatch();

  if (state === 'buy') {
    M.postT -= dt; renderCards();
    ORDER.forEach((id, i) => { if (input.pressed(`Digit${i + 1}`)) buy(id); });
    if (AUTO && M.postT < ROUND.buy - 0.5) { const want = [...ORDER].reverse().find((g) => GUNS[g].cost <= M.credits && GUNS[g].cost > GUNS[P.owned].cost); if (want) buy(want); }
    if (M.postT <= 0) goLive();
  } else if (state === 'post') {
    M.postT -= dt;
    if (M.postT <= 0) { if (M.score[0] >= ROUND.toWin || M.score[1] >= ROUND.toWin) endMatch(); else nextRound(); }
  }

  const playing = state === 'live' || state === 'buy' || state === 'post';
  if (playing) {
    // ---- player
    const g = GUNS[P.gun];
    let a = input.axis(), shootHeld = input.mouse.down, plantHeld = input.down('Digit4') || input.down('KeyF');
    if (AUTO && state === 'live' && P.alive) { const ap = autopilot(dt); a = { x: ap.mx, y: ap.mz }; shootHeld = ap.shoot; plantHeld = ap.plant; }
    const canMove = state !== 'buy' && P.alive;
    const walk = input.down('ShiftLeft') || input.down('ShiftRight');
    P.ads = input.mouse.right && P.alive;
    const target = walk || P.ads ? MOVE.walkSpeed : MOVE.speed;
    const cs = Math.cos(cam.yaw), sn = Math.sin(cam.yaw);
    const wx = a.x * cs + a.y * sn, wz = -a.x * sn + a.y * cs;
    const want = canMove && P.plantT <= 0 ? 1 : 0;
    P.vx = damp(P.vx, wx * target * want, 14, dt); P.vz = damp(P.vz, wz * target * want, 14, dt);
    if (P.dashT > 0) { P.dashT -= dt; const s = MOVE.dashDist / MOVE.dashTime; P.vx = P.dashX * s; P.vz = P.dashZ * s; if (P.dashT <= 0) { P.vx *= 0.25; P.vz *= 0.25; } }
    if (canMove) slide(P, P.vx * dt, P.vz * dt, MOVE.radius);
    const speed = Math.hypot(P.vx, P.vz);
    // footsteps: running is loud, walking is silent
    if (speed > 3.6 && canMove) { P.stepT -= dt; if (P.stepT <= 0) { P.stepT = 0.36; sound.play('impact-sounds/footstep_concrete_*', { volume: 0.22 }); if (state === 'live') hear(AI.hearRun); } }

    if (state === 'live' && P.alive) {
      if (input.pressed('KeyQ')) dash();
      if (input.pressed('KeyE')) throwSmoke();
      if (input.pressed('KeyC')) recon();
      if (input.pressed('KeyR')) reload();
      P.fireT -= dt;
      if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) P.ammo = g.mag; }
      else if (shootHeld && P.fireT <= 0 && P.ammo > 0 && P.plantT <= 0 && (g.auto || input.mouse.pressed || AUTO)) fire();
      // plant
      const site = siteAt(P.x, P.z);
      if (plantHeld && site && !M.planted && speed < 1) {
        if (P.plantT <= 0) sfx.play('blip', { volume: 0.4 });
        P.plantT += dt;
        if (P.plantT >= ROUND.plantTime) {
          M.planted = true; M.spikeT = ROUND.spikeTimer; M.spikeX = P.x; M.spikeZ = P.z; P.plantT = 0;
          spike.position.set(P.x, 0.25, P.z); spike.visible = true;
          M.credits += ECON.plant; banner(`SPIKE PLANTED<small>SITE ${site} · hold them off for ${ROUND.spikeTimer}s</small>`, 2.2);
          voice('objective_achieved'); sfx.play('powerup');
        }
      } else P.plantT = 0;
    }
    P.bloom = Math.max(0, P.bloom - dt * 0.25);
    const rec = P.recoil * Math.min(1, dt * 7); cam.pitch -= rec; P.recoil -= rec;

    // ---- round clock + spike
    if (state === 'live') {
      if (M.planted) {
        M.spikeT -= dt;
        const beep = M.spikeT < 8 ? 0.25 : M.spikeT < 18 ? 0.5 : 1;
        if (Math.floor(M.spikeT / beep) !== Math.floor((M.spikeT + dt) / beep)) sfx.play('blip', { volume: 0.25, freq: 1400 });
        spikeLight.visible = Math.floor(M.spikeT / beep * 2) % 2 === 0;
        if (M.spikeT <= 0) {
          debris.burst(M.spikeX, 1, M.spikeZ, [0xff4655, 0xffd0a0, 0xffffff], 80, 18, 12, 0.2); shake(1);
          sound.play('sci-fi-sounds/explosioncrunch_*', { volume: 1 });
          alive().forEach((d) => { if (Math.hypot(d.x - M.spikeX, d.z - M.spikeZ) < 14) d.damage(999); });
          spike.visible = false; endRound(true, 'SPIKE DETONATED');
        }
      } else {
        M.timer -= dt;
        if (M.timer <= 0) endRound(false, 'TIME RAN OUT');
        if (Math.floor(M.timer) === 20 && Math.floor(M.timer + dt) === 21) voice('hurry_up');
      }
      if (state === 'live' && !alive().length) endRound(true, 'SITE CLEARED');
    }
    for (const d of defenders) if (d.root.visible) state === 'live' ? aiUpdate(d, dt) : d.update(dt, false);

    // ---- camera + viewmodel
    const eye = P.alive ? MOVE.eye : 0.5;
    camera.position.set(P.x, eye + (speed > 3.6 ? Math.abs(Math.sin(elapsed * 11)) * 0.035 : 0), P.z);
    camera.rotation.set(cam.pitch, cam.yaw, P.alive ? 0 : 0.5, 'YXZ');
    const fov = P.ads ? 78 / g.zoom : 78;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 18, dt); camera.updateProjectionMatrix(); }
    view.visible = P.alive && !(P.ads && P.gun === 'sniper');
    const bob = speed > 0.5 ? Math.sin(elapsed * 9) : 0;
    view.position.x = damp(view.position.x, (P.ads ? 0.0 : 0.26) + bob * 0.012, 14, dt);
    view.position.y = damp(view.position.y, (P.ads ? -0.17 : -0.27) + Math.abs(bob) * 0.01 - (P.reloadT > 0 ? 0.2 : 0), 14, dt);
    view.position.z = damp(view.position.z, P.ads ? -0.42 : -0.55, 20, dt);
    view.rotation.x = damp(view.rotation.x, P.reloadT > 0 ? -0.6 : 0, 12, dt);
    flash.intensity = damp(flash.intensity, 0, 40, dt);
    (flashSprite.material as THREE.SpriteMaterial).opacity = damp((flashSprite.material as THREE.SpriteMaterial).opacity, 0, 40, dt);
  }

  // smokes + tracers + fx
  for (const s of smokes) { s.t += dt; s.mesh.scale.setScalar(Math.min(1, s.t * 3)); if (s.t > ABIL.smokeTime) { (s.mesh.material as THREE.MeshStandardMaterial).opacity -= dt; } }
  for (let i = smokes.length - 1; i >= 0; i--) if (smokes[i].t > ABIL.smokeTime + 1) { scene.remove(smokes[i].mesh); smokes.splice(i, 1); }
  for (const t of tracers) if (t.t > 0) { t.t -= dt; if (t.t <= 0) t.line.visible = false; }
  debris.update(dt);
  P.reconT -= dt; P.hurtT -= dt;

  if (state === 'menu') {
    const t = elapsed * 0.06;
    camera.position.set(Math.sin(t) * 26, 22, Math.cos(t) * 14 + 4); camera.lookAt(0, 0, 0);
    view.visible = false;
    for (const d of defenders) d.update(dt, false);
  }

  // ---- HUD
  if (playing) {
    const g = GUNS[P.gun];
    $('sA').textContent = String(M.score[0]); $('sD').textContent = String(M.score[1]);
    const tt = Math.max(0, Math.ceil(state === 'buy' ? M.postT : M.planted ? M.spikeT : M.timer));
    $('timer').textContent = M.planted && state === 'live' ? `◆ ${tt}` : `${Math.floor(tt / 60)}:${String(tt % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('red', M.planted || (state === 'live' && M.timer < 15));
    $('pips').innerHTML = active().map((d) => `<i class="${d.alive ? '' : 'dead'}"></i>`).join('');
    $('hp').textContent = String(Math.ceil(P.hp)); $('hp').classList.toggle('low', P.hp < 35);
    $('gname').textContent = g.name; $('ammo').textContent = P.reloadT > 0 ? '··' : String(P.ammo); $('mag').textContent = String(g.mag);
    $('credits').textContent = String(M.credits);
    $('nQ').textContent = '●'.repeat(P.dashes) || '–'; $('nE').textContent = '●'.repeat(P.smokes) || '–'; $('nC').textContent = '●'.repeat(P.recon) || '–';
    const speed = Math.hypot(P.vx, P.vz);
    const spread = lerp(g.still, g.moving, clamp((speed - 0.8) / (MOVE.speed - 0.8), 0, 1)) + P.bloom;
    $('cross').style.setProperty('--gap', `${4 + spread * 260}px`);
    $('cross').style.display = P.ads && P.gun === 'sniper' ? 'none' : '';
    hud.classList.toggle('scoped', P.ads && P.gun === 'sniper' && P.alive);
    hitT -= rawDt; $('hitx').style.opacity = hitT > 0 ? '1' : '0';
    $('hurt').style.opacity = String(clamp(P.hurtT * 2, 0, 0.8) + (P.alive ? 0 : 0.35));
    $('plant').style.opacity = P.plantT > 0 ? '1' : '0'; $('plantFill').style.width = `${(P.plantT / ROUND.plantTime) * 100}%`;
    const site = siteAt(P.x, P.z);
    $('hint').textContent = !P.alive && state === 'live' ? (M.planted ? 'YOU DIED — the spike is still ticking…' : '') : state === 'live' && site && !M.planted && P.plantT <= 0 ? `SITE ${site} — hold 4 to plant` : '';
    bannerT -= rawDt;
    drawMap();
  }
  (window as any).__playtest = { state, round: M.round, score: M.score.join('-'), hp: Math.ceil(P.hp), alive: P.alive, gun: P.gun, credits: M.credits, kills: M.kills, defenders: alive().length, planted: M.planted, fps: Math.round(1 / Math.max(rawDt, 1e-3)) };
  input.endFrame();
});

function drawMap() {
  const c = mapCtx, s = 5;
  c.clearRect(0, 0, W * s, H * s);
  c.fillStyle = 'rgba(15,25,35,.85)'; c.fillRect(0, 0, W * s, H * s);
  grid.forEach((v, x, y) => {
    if (blocked(v)) { c.fillStyle = v === 'c' ? '#5a7488' : '#c9b79c'; c.fillRect(x * s, y * s, s, s); }
    else if (v === 'A' || v === 'B' || v === '1' || v === '3') { c.fillStyle = 'rgba(255,70,85,.25)'; c.fillRect(x * s, y * s, s, s); }
  });
  const px = (x: number) => (x / CELL + W / 2) * s, pz = (z: number) => (z / CELL + H / 2) * s;
  c.fillStyle = '#ff4655'; c.font = 'bold 12px Orbitron, sans-serif'; c.fillText('A', 6 * s, 3.8 * s); c.fillText('B', 27 * s, 3.8 * s);
  for (const d of alive()) if (P.reconT > 0 || (lineClear(P.x, P.z, d.x, d.z) && !smokeBlocks(P.x, P.z, d.x, d.z))) { c.fillStyle = '#ff4655'; c.beginPath(); c.arc(px(d.x), pz(d.z), 3.2, 0, Math.PI * 2); c.fill(); }
  for (const sm of smokes) { c.fillStyle = 'rgba(157,180,216,.6)'; c.beginPath(); c.arc(px(sm.x), pz(sm.z), (ABIL.smokeRadius / CELL) * s, 0, Math.PI * 2); c.fill(); }
  if (M.planted) { c.fillStyle = '#ffd060'; c.fillRect(px(M.spikeX) - 3, pz(M.spikeZ) - 3, 6, 6); }
  c.save(); c.translate(px(P.x), pz(P.z)); c.rotate(-cam.yaw);
  c.fillStyle = '#18e5b7'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 4); c.lineTo(-4, 4); c.closePath(); c.fill(); c.restore();
}

(window as any).__debug = { renderer, scene, P, M, cam, defenders, fire, buy, endRound, plantNow: () => { M.planted = true; M.spikeT = ROUND.spikeTimer; M.spikeX = P.x; M.spikeZ = P.z; spike.position.set(P.x, 0.25, P.z); spike.visible = true; } };

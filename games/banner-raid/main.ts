/**
 * Banner Raid — raid villages: drop troops outside the walls, they march and smash, defenses fight back.
 * Stars for 50% / Town Hall / 100%, loot gold, upgrade your army, face bigger villages.
 * Debug: ?auto (bot deploys + loops raids) ?level=5 ?gold=9999 ?tune
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { Debris } from '@kit/three/debris';
import { sfx, audio } from '@kit/audio';
import { clamp, damp } from '@kit/math';
import { store } from '@kit/save';
import { action } from '@kit/tune';
import { loadModel, loadTexture, loadHdri, animate, sound } from '@kit/assets';
import { N, TROOPS, ARMY, ECON, DEF, type TroopId } from './config';
import { Village, isDefense, worldToCell, cellToWorld, type Building } from './village';

const q = new URLSearchParams(location.search);
const AUTO = q.has('auto');
const IDS = Object.keys(TROOPS) as TroopId[];
const save = store('banner-raid', {
  gold: Number(q.get('gold') ?? ECON.startGold), level: Number(q.get('level') ?? 1), cap: ARMY.startCap, stars: 0,
  lvl: { barbarian: 1, archer: 1, giant: 1, wizard: 1 } as Record<TroopId, number>,
  army: { barbarian: 12, archer: 8, giant: 0, wizard: 0 } as Record<TroopId, number>,
});
if (q.get('gold')) save.set('gold', Number(q.get('gold')));
if (q.get('level')) save.set('level', Number(q.get('level')));

const { scene, camera, loop, hud, shake, renderer } = bootThree({ background: 0x9fd4ff, fog: { color: 0xbfe2ff, near: 60, far: 140 }, fov: 45, shadows: true, maxPixelRatio: 1.5 });
camera.far = 300; camera.updateProjectionMatrix();

// ---------------------------------------------------------------- world
const sun = new THREE.DirectionalLight(0xfff2dd, 2.4); sun.position.set(-18, 30, 14); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 90 }); sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, new THREE.HemisphereLight(0xd8eeff, 0x4a6a30, 0.6));
const grass = await loadTexture('leafy_grass', { repeat: 30 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ ...grass, color: 0x9ccf6a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
await loadHdri(scene, 'kloofendal_48d_partly_cloudy_puresky', { background: true, intensity: 0.5 });
// trees around the edge of the map
for (let i = 0; i < 70; i++) {
  const a = Math.random() * Math.PI * 2, r = N / 2 + 3 + Math.random() * 18;
  loadModel(`kaykit-medieval-hexagon/${['trees-a-large', 'trees-b-large', 'tree-single-a', 'trees-a-medium'][i % 4]}`, { height: 2.5 + Math.random() * 2 }).then((t) => { t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.rotation.y = Math.random() * 6; scene.add(t); });
}
const village = new Village(scene);
const debris = new Debris(scene);
// no-deploy zone: a faint red square over the village
const zone = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.1, depthWrite: false }));
zone.rotation.x = -Math.PI / 2; zone.position.y = 0.02; scene.add(zone);
const zoneLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
zoneLine.position.y = 0.03; scene.add(zoneLine);
await Promise.all(IDS.map((id) => loadModel(TROOPS[id].model)));   // warm the model cache

// ---------------------------------------------------------------- troops
interface Troop {
  id: TroopId; root: THREE.Group; anim: ReturnType<typeof animate>;
  x: number; z: number; hp: number; maxHp: number; alive: boolean; dps: number;
  target: Building | null; wall: Building | null; path: { x: number; z: number }[]; hitT: number; deadT: number; repath: number;
}
let troops: Troop[] = [];
const WEAPON = /(Axe|Shield|Sword|Crossbow|Knife|Throwable|Mug|Spellbook|Wand|Staff)/;
const mul = (id: TroopId) => 1 + (save.get('lvl')[id] - 1) * ARMY.levelMul;
async function spawnTroop(id: TroopId, x: number, z: number) {
  const d = TROOPS[id];
  const m = await loadModel(d.model, { height: d.height });
  m.traverse((o) => { if ((o as THREE.Mesh).isMesh && WEAPON.test(o.name) && !d.keep.includes(o.name)) o.visible = false; });
  const root = new THREE.Group(); root.add(m); root.position.set(x, 0, z); scene.add(root);
  const anim = animate(m); anim.play(d.run);
  const hp = Math.round(d.hp * mul(id));
  const t: Troop = { id, root, anim, x, z, hp, maxHp: hp, alive: true, dps: d.dps * mul(id), target: null, wall: null, path: [], hitT: 0.4, deadT: 0, repath: 0 };
  troops.push(t);
  debris.burst(x, 0.3, z, [0xffffff, 0xe0e0e0], 8, 2, 2, 0.12);
}
function pickTarget(t: Troop) {
  const pool = village.buildings.filter((b) => b.alive && b.kind !== 'wall');
  let list = TROOPS[t.id].prefers === 'defense' ? pool.filter(isDefense) : pool;
  if (!list.length) list = pool;
  let best: Building | null = null, bd = Infinity;
  for (const b of list) { const d = village.dist(b, t.x, t.z); if (d < bd) { bd = d; best = b; } }
  return best;
}
function planPath(t: Troop) {
  const b = t.target!; t.wall = null;
  const start = { x: clamp(worldToCell(t.x), 0, N - 1), y: clamp(worldToCell(t.z), 0, N - 1) };
  const goal = { x: clamp(worldToCell(t.x), b.x0, b.x0 + b.size - 1), y: clamp(worldToCell(t.z), b.y0, b.y0 + b.size - 1) };
  const isWall = (c: number) => c >= 0 && village.buildings[c].kind === 'wall';
  const open = village.occ.path(start, goal, (c) => c < 0 || c === b.id);
  const through = village.occ.path(start, goal, (c) => c < 0 || c === b.id || isWall(c));
  // walk around walls if that's not a big detour, otherwise smash through
  const p = open && (!through || open.length <= through.length + 10) ? open : through;
  t.path = (p ?? []).slice(1).map((c) => ({ x: cellToWorld(c.x), z: cellToWorld(c.y) }));
}
function updateTroop(t: Troop, dt: number) {
  t.anim.update(dt);
  if (!t.alive) { t.deadT += dt; if (t.deadT > 2.2) { t.root.position.y -= dt * 0.6; } return; }
  const d = TROOPS[t.id];
  if (!t.target || !t.target.alive) { t.target = pickTarget(t); if (!t.target) { t.anim.play('Cheer'); return; } planPath(t); }
  const victim = t.wall && t.wall.alive ? t.wall : t.target;
  if (village.dist(victim, t.x, t.z) <= d.range + (victim === t.wall ? 0.4 : 0.15)) {
    // attack
    face(t, victim.x - t.x, victim.z - t.z, dt);
    t.hitT -= dt;
    if (t.hitT <= 0) {
      t.hitT = 1;
      t.anim.play(d.attack, { once: true, fade: 0.08 });
      const dmg = t.dps;
      if (d.range > 1) shot(t.root.position.clone().setY(0.8), new THREE.Vector3(victim.x, 1, victim.z), t.id === 'wizard' ? 0xc58cff : 0xfff0a0, t.id === 'wizard' ? 0.35 : 0.22, () => {
        if (d.splash) { for (const b of village.buildings) if (b.alive && village.dist(b, victim.x, victim.z) < d.splash) hurt(b, dmg); } else hurt(victim, dmg);
      });
      else setTimeout(() => hurt(victim, dmg), 250);
    }
    return;
  }
  // move along the path; an alive wall in the next cell becomes the target
  const n = t.path[0];
  if (!n) { planPath(t); if (!t.path.length) { t.target = null; } return; }
  const cell = village.occ.get(worldToCell(n.x), worldToCell(n.z))!;
  if (cell >= 0 && village.buildings[cell].kind === 'wall' && village.buildings[cell].alive) { t.wall = village.buildings[cell]; return; }
  const dx = n.x - t.x, dz = n.z - t.z, dist = Math.hypot(dx, dz);
  if (dist < 0.15) { t.path.shift(); return; }
  const s = Math.min(dist, d.speed * dt);
  t.x += (dx / dist) * s; t.z += (dz / dist) * s;
  face(t, dx, dz, dt);
  if (t.anim.current !== d.run) t.anim.play(d.run);
  t.root.position.set(t.x, 0, t.z);
}
function face(t: Troop, dx: number, dz: number, dt: number) {
  const want = Math.atan2(dx, dz);   // KayKit rigs face +z
  let diff = want - t.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  t.root.rotation.y += diff * Math.min(1, dt * 10);
}
function hurtTroop(t: Troop, dmg: number) {
  if (!t.alive) return;
  t.hp -= dmg;
  if (t.hp <= 0) { t.alive = false; t.anim.play('Death_A', { once: true, fade: 0.1 }); sound.play('impact-sounds/impactsoft_medium_*', { volume: 0.3 }); }
}

// ---------------------------------------------------------------- buildings take damage
let loot = 0, thDown = false;
function hurt(b: Building, dmg: number) {
  if (!b.alive || state !== 'battle') return;
  b.hp -= dmg; b.flashT = 0.1;
  if (b.hp <= 0) {
    b.hp = 0; void village.destroy(b);
    debris.burst(b.x, 1, b.z, [0x9a7b5a, 0xc9b28c, 0x6d5a45, 0xd84a3a], b.kind === 'wall' ? 10 : 40, b.kind === 'wall' ? 4 : 7, 6, b.kind === 'wall' ? 0.15 : 0.25);
    sound.play(b.kind === 'wall' ? 'impact-sounds/impactmining_*' : 'impact-sounds/impactwood_heavy_*', { volume: 0.6 });
    shake(b.kind === 'wall' ? 0.08 : b.kind === 'townhall' ? 0.6 : 0.25);
    if (b.loot) { loot += b.loot; popup(b.x, b.z, `+${b.loot}`, '#ffd34d'); sound.play('rpg-audio/handlecoins*', { volume: 0.5 }); }
    if (b.kind === 'townhall') { thDown = true; banner('★ TOWN HALL DESTROYED'); }
    const st = starsNow(); if (st > lastStars) { lastStars = st; sfx.notes('powerup', [0, 4, 7, 12], 0.06); }
  } else if (Math.random() < 0.3) sound.play('impact-sounds/impactwood_light_*', { volume: 0.15 });
}

// ---------------------------------------------------------------- projectiles
interface Shot { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; arc: number; done: () => void }
const shots: Shot[] = [];
function shot(from: THREE.Vector3, to: THREE.Vector3, color: number, dur: number, done: () => void, arc = 0, size = 0.09) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({ color }));
  mesh.position.copy(from); scene.add(mesh);
  shots.push({ mesh, from, to, t: 0, dur, arc, done });
}
function defenses(dt: number) {
  for (const b of village.buildings) {
    if (!b.alive || !isDefense(b)) continue;
    b.cool -= dt; if (b.cool > 0) continue;
    const cat = b.kind === 'catapult', range = cat ? DEF.catapultRange : DEF.archerRange;
    let best: Troop | null = null, bd = range;
    for (const t of troops) if (t.alive) { const d = Math.hypot(t.x - b.x, t.z - b.z); if (d < bd && (!cat || d > 1.6)) { bd = d; best = t; } }
    if (!best) continue;
    const tgt = best, at = new THREE.Vector3(tgt.x, 0.4, tgt.z);
    if (cat) {
      b.cool = DEF.catapultRate;
      shot(new THREE.Vector3(b.x, 2.6, b.z), at, 0x5a4a3a, 1, () => {
        for (const t of troops) if (t.alive && Math.hypot(t.x - at.x, t.z - at.z) < DEF.catapultSplash) hurtTroop(t, DEF.catapultDmg);
        debris.burst(at.x, 0.2, at.z, [0x8a7a5a, 0x5a4a3a], 10, 3, 4, 0.12); sound.play('impact-sounds/impactplank_medium_*', { volume: 0.35 });
      }, 3.2, 0.22);
    } else {
      b.cool = DEF.archerRate;
      shot(new THREE.Vector3(b.x, 3, b.z), at, 0xffffff, 0.3, () => hurtTroop(tgt, DEF.archerDmg));
    }
  }
}

// ---------------------------------------------------------------- HUD
hud.innerHTML = `
  <div class="bar top-l"><b id="vname">Village</b><small>Loot <span id="lootAll">0</span></small></div>
  <div class="bar top-c"><span id="clock">2:30</span></div>
  <div class="bar top-r"><span id="stars">☆☆☆</span><b id="pct">0%</b></div>
  <div id="cards"></div>
  <button id="endBtn">END BATTLE</button>
  <div id="banner"></div><div id="msg"></div><div id="pops"></div><div id="hpbars"></div>
  <div class="ov" id="menu"><h1>BANNER <span>RAID</span></h1><p class="tag">Drop your troops. Smash the village. Steal the gold.</p>
    <p class="keys">Pick a troop (1–4 or click its card) · click / hold outside the red zone to deploy · drag right mouse or WASD to pan · wheel to zoom</p><p class="go">CLICK TO PLAY</p></div>
  <div class="ov hidden" id="camp"><h2>ARMY CAMP</h2><p class="gold">🪙 <span id="gold">0</span></p>
    <div id="campCards"></div><p id="capLine"></p><div class="row"><button id="capBtn"></button><button id="attackBtn" class="big"></button></div></div>
  <div class="ov hidden" id="result"><h1 id="resT"></h1><p id="resStars" class="starsBig"></p><p id="resInfo"></p><button id="homeBtn" class="big">RETURN HOME</button></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
let bannerT = 0, msgT = 0;
function banner(t: string) { const b = $('banner'); b.textContent = t; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); bannerT = 2; }
function msg(t: string) { $('msg').textContent = t; $('msg').style.opacity = '1'; msgT = 1.2; }
const v3 = new THREE.Vector3();
function screen(x: number, y: number, z: number) { v3.set(x, y, z).project(camera); return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight }; }
function popup(x: number, z: number, text: string, color: string) {
  const p = screen(x, 2.5, z), el = document.createElement('div');
  el.className = 'pop'; el.textContent = text; el.style.color = color; el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1100);
}

// ---------------------------------------------------------------- flow
type State = 'menu' | 'camp' | 'battle' | 'result';
let state: State = 'menu', clock = 0, selected: TroopId = 'barbarian', left: Record<TroopId, number> = { barbarian: 0, archer: 0, giant: 0, wizard: 0 }, lastStars = 0, endT = -1;
const space = () => IDS.reduce((s, id) => s + save.get('army')[id] * TROOPS[id].space, 0);
const upCost = (id: TroopId) => Math.round(ECON.upgradeBase * Math.pow(save.get('lvl')[id], 1.6) * (TROOPS[id].space > 1 ? 1.6 : 1));
function starsNow() { const p = village.destruction(); return (p >= 0.5 ? 1 : 0) + (thDown ? 1 : 0) + (p >= 1 ? 1 : 0); }

function showCamp() {
  state = 'camp'; $('camp').classList.remove('hidden'); $('result').classList.add('hidden'); $('menu').classList.add('hidden'); hud.classList.remove('playing');
  renderCamp();
}
function renderCamp() {
  const army = save.get('army'), lvl = save.get('lvl');
  $('gold').textContent = save.get('gold').toLocaleString();
  $('campCards').innerHTML = IDS.map((id) => {
    const d = TROOPS[id];
    return `<div class="tcard" style="--c:${d.color}"><h3>${d.name} <small>Lv ${lvl[id]}</small></h3><p>${d.space} space · ${Math.round(d.hp * mul(id))} hp · ${Math.round(d.dps * mul(id))} dps${d.prefers === 'defense' ? ' · hits defenses' : ''}${d.splash ? ' · splash' : ''}</p>
      <div class="row"><button data-minus="${id}">−</button><b>${army[id]}</b><button data-plus="${id}">+</button></div>
      <button data-up="${id}" ${lvl[id] >= 6 || save.get('gold') < upCost(id) ? 'disabled' : ''}>${lvl[id] >= 6 ? 'MAX' : `UPGRADE 🪙 ${upCost(id)}`}</button></div>`;
  }).join('');
  $('capLine').textContent = `Army ${space()} / ${save.get('cap')} space`;
  const capFull = save.get('cap') >= ARMY.maxCap;
  $('capBtn').textContent = capFull ? 'CAMP MAXED' : `BIGGER CAMP +${ARMY.capPerUpgrade} · 🪙 ${ECON.capCost * (save.get('cap') / 5 - 3)}`;
  ($('capBtn') as HTMLButtonElement).disabled = capFull || save.get('gold') < ECON.capCost * (save.get('cap') / 5 - 3);
  $('attackBtn').textContent = `⚔ ATTACK · Village Lv ${save.get('level')}`;
  ($('attackBtn') as HTMLButtonElement).disabled = space() === 0;
}
$('campCards').addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('button'); if (!el) return;
  const army = { ...save.get('army') }, lvl = { ...save.get('lvl') };
  const plus = el.dataset.plus as TroopId | undefined, minus = el.dataset.minus as TroopId | undefined, up = el.dataset.up as TroopId | undefined;
  if (plus) { if (space() + TROOPS[plus].space <= save.get('cap')) army[plus]++; else { sfx.play('denied'); } }
  if (minus && army[minus] > 0) army[minus]--;
  if (up && save.get('gold') >= upCost(up)) { save.set('gold', save.get('gold') - upCost(up)); lvl[up]++; sfx.notes('select', [0, 7, 12], 0.06); }
  save.set('army', army); save.set('lvl', lvl); sfx.play('blip', { volume: 0.3 }); renderCamp();
});
$('capBtn').addEventListener('click', () => { const c = ECON.capCost * (save.get('cap') / 5 - 3); if (save.get('gold') >= c) { save.set('gold', save.get('gold') - c); save.set('cap', save.get('cap') + ARMY.capPerUpgrade); sfx.play('powerup'); renderCamp(); } });
$('attackBtn').addEventListener('click', () => void startBattle());
$('homeBtn').addEventListener('click', showCamp);
$('endBtn').addEventListener('click', () => endBattle());
$('menu').addEventListener('click', () => { audio.ctx.resume(); showCamp(); });

async function startBattle() {
  $('camp').classList.add('hidden');
  troops.forEach((t) => scene.remove(t.root)); troops = []; shots.forEach((s) => scene.remove(s.mesh)); shots.length = 0;
  await village.generate(save.get('level'));
  const R = village.deployR * 2; zone.scale.set(R, R, 1); zoneLine.scale.set(R, 1, R);
  left = { ...save.get('army') }; selected = IDS.find((id) => left[id] > 0) ?? 'barbarian';
  loot = 0; thDown = false; lastStars = 0; endT = -1; clock = ARMY.battleSeconds;
  $('vname').textContent = `Village Lv ${save.get('level')}`; $('lootAll').textContent = String(village.buildings.reduce((s, b) => s + b.loot, 0));
  camTarget.set(0, 0, 3); camDist = 46;   // frame the whole map with the near deploy strip above the cards
  state = 'battle'; hud.classList.add('playing'); renderCards();
  banner('ATTACK!'); sound.play('voiceover-pack/go', { volume: 0.8 });
}
function endBattle() {
  if (state !== 'battle') return;
  state = 'result'; hud.classList.remove('playing');
  const st = starsNow(), bonus = st * 120 * save.get('level'), gain = loot + bonus;
  save.set('gold', save.get('gold') + gain); save.set('stars', save.get('stars') + st);
  if (st > 0) save.set('level', save.get('level') + 1);
  $('resT').textContent = st ? 'VICTORY' : 'DEFEAT'; $('resT').style.color = st ? '#ffd34d' : '#ff5a5a';
  $('resStars').innerHTML = [0, 1, 2].map((i) => `<i class="${i < st ? 'on' : ''}" style="animation-delay:${i * 0.35}s">★</i>`).join('');
  $('resInfo').innerHTML = `${Math.round(village.destruction() * 100)}% destroyed<br>Loot 🪙 ${loot} + star bonus 🪙 ${bonus}${st ? `<br>Next: Village Lv ${save.get('level')}` : '<br>Upgrade your troops and try again'}`;
  $('result').classList.remove('hidden');
  sound.play(`voiceover-pack/${st ? 'you_win' : 'you_lose'}`, { volume: 0.8 });
}
function renderCards() {
  $('cards').innerHTML = IDS.map((id, i) => `<div class="card ${id === selected ? 'sel' : ''} ${left[id] ? '' : 'empty'}" data-id="${id}" style="--c:${TROOPS[id].color}"><b>${i + 1}</b><span>${TROOPS[id].name}</span><em>×${left[id]}</em></div>`).join('');
}
$('cards').addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('.card'); if (el) { selected = el.dataset.id as TroopId; renderCards(); sfx.play('blip', { volume: 0.3 }); } });

// ---------------------------------------------------------------- input: deploy, pan, zoom
const camTarget = new THREE.Vector3(); let camDist = 46;
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), mouse = new THREE.Vector2(), hit = new THREE.Vector3();
let holding = false, deployT = 0, dragging = false, lastX = 0, lastY = 0;
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyM') audio.toggleMute();
  if (state === 'battle') { const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (i >= 0) { selected = IDS[i]; renderCards(); } }
});
addEventListener('keyup', (e) => keys.delete(e.code));
const cvs = renderer.domElement;
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
cvs.addEventListener('pointerdown', (e) => { if (e.button === 2) { dragging = true; lastX = e.clientX; lastY = e.clientY; } else if (state === 'battle') { holding = true; setMouse(e); deployT = ARMY.deployEvery * 2; deployAtMouse(); } });   // a tap deploys at once
addEventListener('pointerup', () => { holding = false; dragging = false; });
cvs.addEventListener('pointermove', (e) => {
  setMouse(e);
  if (dragging) { const k = camDist / 600; camTarget.x -= (e.clientX - lastX) * k; camTarget.z -= (e.clientY - lastY) * k; lastX = e.clientX; lastY = e.clientY; }
});
cvs.addEventListener('wheel', (e) => { camDist = clamp(camDist + e.deltaY * 0.03, 14, 60); }, { passive: true });
function deployAtMouse() { ray.setFromCamera(mouse, camera); if (ray.ray.intersectPlane(groundPlane, hit)) tryDeploy(hit.x, hit.z); }
function setMouse(e: PointerEvent) { mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }
function tryDeploy(x: number, z: number) {
  if (left[selected] <= 0) { const next = IDS.find((id) => left[id] > 0); if (!next) return; selected = next; renderCards(); }
  const cx = worldToCell(x), cz = worldToCell(z);
  if (cx < 0 || cz < 0 || cx >= N || cz >= N) { msg('Too far out!'); return; }
  if (Math.max(Math.abs(cx - N / 2 + 0.5), Math.abs(cz - N / 2 + 0.5)) < village.deployR) { msg('Drop troops outside the red zone'); (zone.material as THREE.MeshBasicMaterial).opacity = 0.35; return; }
  left[selected]--; void spawnTroop(selected, x, z); renderCards();
  sfx.play('pickup', { volume: 0.25 });
}
action('Destroy everything', () => village.buildings.forEach((b) => hurt(b, 1e6)));
action('+5000 gold', () => { save.set('gold', save.get('gold') + 5000); renderCamp(); });

// ---------------------------------------------------------------- auto pilot (playtests)
let autoT = 0, autoA = Math.random() * 6;
function autopilot(dt: number) {
  if (state === 'menu') { showCamp(); return; }
  autoT += dt;
  if (state === 'camp' && autoT > 1) { autoT = 0; void startBattle(); }
  if (state === 'result' && autoT > 3) { autoT = 0; showCamp(); }
  if (state === 'battle' && autoT > 0.22) {
    autoT = 0;
    const id = IDS.find((i) => left[i] > 0 && (i !== 'barbarian' || left.giant === 0)) ?? IDS.find((i) => left[i] > 0);
    if (!id) return;
    selected = id; const a = autoA + (Math.random() - 0.5) * 0.8, r = village.deployR + 1.5;
    const s = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    tryDeploy((Math.cos(a) / s) * r, (Math.sin(a) / s) * r);
  }
}

// ---------------------------------------------------------------- loop
const hpEls = new Map<number, HTMLElement>();
loop((rawDt, time) => {
  const dt = Math.min(rawDt, 0.05);
  if (AUTO) autopilot(dt);
  // camera
  const pan = 18 * dt * (camDist / 46);
  if (keys.has('KeyW') || keys.has('ArrowUp')) camTarget.z -= pan; if (keys.has('KeyS') || keys.has('ArrowDown')) camTarget.z += pan;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) camTarget.x -= pan; if (keys.has('KeyD') || keys.has('ArrowRight')) camTarget.x += pan;
  camTarget.x = clamp(camTarget.x, -22, 22); camTarget.z = clamp(camTarget.z, -22, 22);
  if (state === 'menu' || state === 'camp') {
    const a = time * 0.05;
    camera.position.set(Math.sin(a) * 40, 28, Math.cos(a) * 40); camera.lookAt(0, 0, 0);
  } else {
    camera.position.set(camTarget.x, camDist * 0.82, camTarget.z + camDist * 0.62); camera.lookAt(camTarget);
  }

  if (state === 'battle') {
    clock -= dt;
    if (holding) { deployT -= dt; if (deployT <= 0) { deployT = ARMY.deployEvery; deployAtMouse(); } }
    for (const t of troops) updateTroop(t, dt);
    defenses(dt);
    const zm = zone.material as THREE.MeshBasicMaterial; zm.opacity = damp(zm.opacity, 0.1, 3, dt);
    const anyLeft = IDS.some((id) => left[id] > 0), anyAlive = troops.some((t) => t.alive);
    if (endT < 0 && (clock <= 0 || village.destruction() >= 1 || (!anyLeft && !anyAlive && troops.length))) endT = 1.6;
    if (endT >= 0) { endT -= dt; if (endT <= 0) endBattle(); }
  } else for (const t of troops) t.anim.update(dt);
  // projectiles
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.t += dt; const k = Math.min(1, s.t / s.dur);
    s.mesh.position.lerpVectors(s.from, s.to, k); s.mesh.position.y += Math.sin(k * Math.PI) * s.arc;
    if (k >= 1) { s.done(); scene.remove(s.mesh); shots.splice(i, 1); }
  }
  for (let i = troops.length - 1; i >= 0; i--) if (!troops[i].alive && troops[i].deadT > 3.5) { scene.remove(troops[i].root); troops.splice(i, 1); }
  // building hit flash + hp bars
  for (const b of village.buildings) {
    b.flashT -= dt;
    const mats = b.root.userData.mats as THREE.MeshStandardMaterial[] | undefined;
    if (mats && b.alive) for (const m of mats) m.emissive.setHex(b.flashT > 0 ? 0x553322 : 0x000000);
    let el = hpEls.get(b.id);
    const show = state === 'battle' && b.alive && b.hp < b.maxHp && b.kind !== 'wall';
    if (show) {
      if (!el) { el = document.createElement('div'); el.className = 'hp'; el.innerHTML = '<i></i>'; $('hpbars').appendChild(el); hpEls.set(b.id, el); }
      const p = screen(b.x, b.size * 0.9 + 0.8, b.z); el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; (el.firstChild as HTMLElement).style.width = `${(b.hp / b.maxHp) * 100}%`;
    } else if (el) { el.remove(); hpEls.delete(b.id); }
  }
  debris.update(dt);

  if (state === 'battle') {
    const t = Math.max(0, Math.ceil(clock));
    $('clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const st = starsNow(); $('stars').textContent = '★'.repeat(st) + '☆'.repeat(3 - st);
    $('pct').textContent = `${Math.round(village.destruction() * 100)}%`;
  }
  bannerT -= rawDt; msgT -= rawDt; if (msgT <= 0) $('msg').style.opacity = '0';
  (window as any).__playtest = { state, level: save.get('level'), gold: save.get('gold'), stars: starsNow(), destruction: Math.round(village.destruction() * 100), troops: troops.filter((t) => t.alive).length, left: IDS.reduce((s, id) => s + left[id], 0), loot, fps: Math.round(1 / Math.max(rawDt, 1e-3)) };
});
(window as any).__debug = { village, troops: () => troops, save, startBattle, endBattle, spawnTroop, hurt, camTarget };

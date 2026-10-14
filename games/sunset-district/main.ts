/**
 * Sunset District — a GTA-style city sandbox: walk the streets, take the taxi, drive fares across a living downtown
 * (traffic, pedestrians) through a day → golden hour → night cycle.
 * Debug: ?hour=19.5 (start time) ?drive (start in the taxi) ?freelook (no pointer lock) ?tune
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { realism } from '@kit/three/realism';
import { buildCity } from '@kit/three/city';
import { buildCar } from '@kit/three/cars';
import { loadModel, loadClips, animate, sound, assetUrl } from '@kit/assets';
import { createInput } from '@kit/input';
import { sfx, audio } from '@kit/audio';
import { clamp, damp, angleDiff } from '@kit/math';
import { store } from '@kit/save';
import { CAR, WALK, CAM, WORLD, FARE } from './config';
import { spawnTraffic, updateTraffic, spawnPeople, updatePeople } from './life';

const q = new URLSearchParams(location.search);
const save = store('sunset-district', { best: 0, cash: 0 });
const game = bootThree({ fov: CAM.fov, maxPixelRatio: 1.5 });
const { scene, camera, renderer, hud, loop } = game;
camera.far = 2500; camera.updateProjectionMatrix();
const input = createInput(renderer.domElement);

hud.innerHTML = `<div class="load" id="load">Building the city…</div>`;
// ---------------------------------------------------------------- world
const fx = realism(game, { sun: { elevation: 30, azimuth: 250 }, shadowRange: 70, haze: 0.0011 });   // sky-lit, so golden hour and night really change the light
const city = await buildCity(scene, {
  blocks: [WORLD.blocks, WORLD.blocks], road: 'asphalt_02', sidewalk: 'concrete_floor_02',
  facades: ['red_brick_03', 'factory_brick', 'painted_plaster_wall', 'concrete_wall_008', 'grey_plaster', 'large_red_bricks', 'plaster_brick_pattern'],
  props: { lamp: 'polyhaven/street_lamp_01', extras: ['polyhaven/fire_hydrant', 'polyhaven/modular_street_seating', 'polyhaven/concrete_road_barrier'] },
});
const CAST = ['business-male-01', 'business-male-02', 'business-female-01', 'female-adult-01', 'female-adult-02', 'female-adult-03', 'female-adult-04', 'male-adult-02', 'male-adult-03', 'male-adult-04', 'male-adult-05', 'police-male-01', 'construction-male-01', 'medical-female-01', 'sports-female-01', 'delivery-male-01'];
const [male, female, speeds] = await Promise.all([loadClips('rocketbox/anims-male'), loadClips('rocketbox/anims-female'), fetch(assetUrl('models/rocketbox/_speeds.json')).then((r) => r.json()).catch(() => ({}))]);
const peds = await spawnPeople(scene, city, WORLD.pedestrians, CAST, { male, female }, speeds['anims-male'] ?? {});
const bots = spawnTraffic(scene, city, WORLD.traffic);

// ---------------------------------------------------------------- player: on foot + the taxi
const me = await loadModel('rocketbox/male-adult-01', { height: 1.8 });
const meRoot = new THREE.Group(); meRoot.add(me); scene.add(meRoot);
fx.prepare(meRoot); peds.forEach((p) => fx.prepare(p.root, true, false));
const meAnim = animate(me, male); meAnim.play('idle');
const [ox, oz] = city.origin, P = city.pitch;
const startX = ox + P + city.road + 3, startZ = oz + P + city.road + 10;
const taxi = buildCar('taxi'); scene.add(taxi.root);
// headlight beams (player car only — real light on the road, cars and people at night)
const beams = [-0.55, 0.55].map((x) => { const l = new THREE.SpotLight(0xfff1d8, 0, 45, 0.5, 0.5, 1.2); l.position.set(x, 0.75, -2.2); l.target.position.set(x * 2, 0, -18); taxi.root.add(l, l.target); return l; });
const C = { x: ox + P + city.road * 0.75, z: startZ + 6, yaw: 0,   // northbound lane, facing north (with the traffic)
  y: 0, speed: 0, vx: 0, vz: 0, steer: 0, inCar: q.has('drive') };
const F = { x: startX, z: startZ, yaw: Math.PI / 2, speed: 0 };
const cam = { yaw: 0, pitch: -0.18 };
let cash = save.get('cash'), crashes = 0, hour = Number(q.get('hour') ?? WORLD.startHour), honkT = 0;

// ---------------------------------------------------------------- fares
type Fare = { stage: 'pickup' | 'dropoff'; px: number; pz: number; dx: number; dz: number; time: number; pay: number; ped: THREE.Object3D | null };
let fare: Fare | null = null;
const markerMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
const marker = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 24, 1, true), markerMat(0x4dff8a)); scene.add(marker);
const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 40).rotateX(-Math.PI / 2), markerMat(0x4dff8a)); scene.add(ring);
function kerbPoint(): [number, number] {
  const L = city.loops[Math.floor(Math.random() * city.loops.length)], k = Math.floor(Math.random() * 4), a = L[k], b = L[(k + 1) % 4], t = 0.2 + Math.random() * 0.6;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
function newFare() {
  const [px, pz] = kerbPoint(); let [dx, dz] = kerbPoint();
  for (let i = 0; i < 10 && Math.hypot(dx - px, dz - pz) < 120; i++) [dx, dz] = kerbPoint();
  fare = { stage: 'pickup', px, pz, dx, dz, time: 0, pay: 0, ped: null };
  toast('NEW FARE — pick up the passenger (green)');
}

// ---------------------------------------------------------------- HUD
hud.innerHTML = `
  <div class="tl"><div id="cash">$0</div><div id="clock" class="sub">15:30</div></div>
  <div class="tc" id="fare"></div>
  <canvas id="map" width="190" height="190"></canvas>
  <div class="br"><div id="spd">0</div><div class="sub">KM/H</div></div>
  <div class="hint" id="hint"></div><div class="toast" id="toast"></div>
  <div class="ov" id="menu"><h1>SUNSET <span>DISTRICT</span></h1><p class="tag">Walk the city. Take the cab. Drive fares before the meter runs out.</p>
    <p class="keys">WASD walk / drive · SHIFT run · MOUSE look · E get in / out · SPACE handbrake · H horn · M mute</p><p class="go">CLICK TO START</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
let toastT = 0;
function toast(t: string) { $('toast').textContent = t; $('toast').style.opacity = '1'; toastT = 3; }
let started = false;
const lock = () => { if (!q.has('freelook')) renderer.domElement.requestPointerLock?.(); };
$('menu').onclick = () => { $('menu').style.display = 'none'; started = true; audio.ctx.resume(); lock(); if (!fare) newFare(); };
renderer.domElement.addEventListener('click', () => { if (started && document.pointerLockElement !== renderer.domElement) lock(); });
document.addEventListener('mousemove', (e) => {
  if (!started || (document.pointerLockElement !== renderer.domElement && !q.has('freelook'))) return;
  cam.yaw -= e.movementX * 0.0025; cam.pitch = clamp(cam.pitch - e.movementY * 0.0022, -0.7, 0.35);
});

// ---------------------------------------------------------------- driving
const tmp = new THREE.Vector3();
function drive(dt: number) {
  const ax = input.axis();
  const gas = ax.y < 0 ? -ax.y : 0, rev = ax.y > 0 ? ax.y : 0, hand = input.down('Space');
  const fwdX = -Math.sin(C.yaw), fwdZ = -Math.cos(C.yaw);
  let v = C.vx * fwdX + C.vz * fwdZ;   // forward speed
  if (gas) v += CAR.accel * gas * dt * (v < 0 ? 2.2 : 1);
  if (rev) v -= (v > 0.5 ? CAR.brake : CAR.accel * 0.7) * rev * dt;
  v -= v * CAR.drag * dt + Math.sign(v) * (gas || rev ? 0 : 2.5) * dt;
  if (Math.abs(v) < 0.05 && !gas && !rev) v = 0;
  v = clamp(v, -CAR.reverse, CAR.maxSpeed);
  C.steer = damp(C.steer, -ax.x * CAR.steer / (1 + Math.abs(v) * 0.035), CAR.steerSpeed, dt);
  C.yaw += (v / 2.8) * Math.tan(C.steer) * dt;
  // grip: velocity follows heading; handbrake lets the rear slide
  const g = hand ? CAR.handbrakeGrip : CAR.grip;
  C.vx = damp(C.vx, fwdX * v, g, dt); C.vz = damp(C.vz, fwdZ * v, g, dt);
  if (hand) { C.vx *= 1 - 0.6 * dt; C.vz *= 1 - 0.6 * dt; }
  C.x += C.vx * dt; C.z += C.vz * dt;
  C.speed = Math.hypot(C.vx, C.vz);
  // buildings + traffic
  for (const off of [-1.4, 1.4]) {
    const px = C.x + fwdX * off, pz = C.z + fwdZ * off, push = city.collide(px, pz, CAR.radius);
    if (push) { C.x += push.x; C.z += push.z; if (C.speed > 6) crash(); const n = Math.hypot(push.x, push.z) || 1, d = (C.vx * push.x + C.vz * push.z) / n; if (d < 0) { C.vx -= (push.x / n) * d * 1.4; C.vz -= (push.z / n) * d * 1.4; } }
  }
  for (const b of bots) {
    const dx = C.x - b.pos.x, dz = C.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d < 3.2) { const k = (3.2 - d) / (d || 1); C.x += dx * k; C.z += dz * k; if (C.speed > 5) crash(); C.vx *= 0.6; C.vz *= 0.6; }
  }
  C.y = damp(C.y, city.groundY(C.x, C.z), 12, dt);   // climb the kerb instead of sinking into the sidewalk
  taxi.root.position.set(C.x, C.y, C.z); taxi.root.rotation.y = C.yaw;
  for (const b of beams) b.intensity = hour > 18.2 || hour < 6.3 ? 60 : 0;
  taxi.roll(v * dt); taxi.steer(C.steer * 0.8); taxi.brake(rev > 0 && v > 0.5 || hand); taxi.lights(hour > 18.5 || hour < 6.5);
  taxi.body.rotation.z = damp(taxi.body.rotation.z, -C.steer * Math.min(1, C.speed / 20) * 0.05, 6, dt);
  if (input.pressed('KeyH') && honkT <= 0) { honkT = 0.4; sfx.play('laser', { volume: 0.5, freq: 330 }); }
}
let crashT = 0;
function crash() {
  if (crashT > 0) return; crashT = 0.6;
  sound.play('impact-sounds/impactmetal_heavy_*', { volume: Math.min(1, C.speed / 20) }); game.shake(Math.min(0.5, C.speed / 40));
  if (fare?.stage === 'dropoff') { crashes++; toast(`CRASH! −$${FARE.crashPenalty} tip`); }
}

// ---------------------------------------------------------------- walking
function walk(dt: number) {
  const ax = input.axis(), run = input.down('ShiftLeft') || input.down('ShiftRight');
  const mx = ax.x, my = ax.y, mag = Math.min(1, Math.hypot(mx, my));
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const wx = fx * -my + rx * mx, wz = fz * -my + rz * mx;
  const target = mag ? (run ? (speeds['anims-male']?.run ?? WALK.run) : (speeds['anims-male']?.walk ?? WALK.walk)) : 0;
  F.speed = damp(F.speed, target, 8, dt);
  if (mag) F.yaw += angleDiff(F.yaw, Math.atan2(wx, wz)) * Math.min(1, WALK.turn * dt);
  F.x += Math.sin(F.yaw) * F.speed * dt; F.z += Math.cos(F.yaw) * F.speed * dt;
  const push = city.collide(F.x, F.z, WALK.radius); if (push) { F.x += push.x; F.z += push.z; }
  meAnim.play(F.speed < 0.3 ? 'idle' : run && mag ? 'run' : 'walk', { fade: 0.25 });
  meRoot.position.set(F.x, city.groundY(F.x, F.z), F.z); meRoot.rotation.y = F.yaw;
}

// ---------------------------------------------------------------- loop
let mapCtx: CanvasRenderingContext2D | null = null;
hud.classList.add('playing');
loop((dt, t) => {
  if (input.pressed('KeyM')) audio.toggleMute();
  crashT -= dt; honkT -= dt; toastT -= dt; if (toastT <= 0) $('toast').style.opacity = '0';
  // time of day: sun follows the clock; night lights fade in after sunset
  if (started) hour = (hour + (dt * 24) / WORLD.dayLength) % 24;
  const elev = Math.sin(((hour - 6) / 12) * Math.PI) * 58;
  fx.setSun(elev, 250); city.setNight(clamp((0.5 - elev) / 7, 0, 1));
  // E: in / out of the taxi
  if (started && input.pressed('KeyE')) {
    if (C.inCar && C.speed < 2) { C.inCar = false; F.x = C.x + Math.cos(C.yaw) * 2.2; F.z = C.z - Math.sin(C.yaw) * 2.2; meRoot.visible = true; }
    else if (!C.inCar && Math.hypot(F.x - C.x, F.z - C.z) < 4) { C.inCar = true; meRoot.visible = false; sound.play('impact-sounds/impactplank_medium_*', { volume: 0.4 }); }
  }
  if (started && C.inCar) drive(dt); else { if (started) walk(dt); C.speed = 0; meAnim.update(dt); }
  meRoot.visible = !C.inCar; meAnim.update(dt);
  updateTraffic(bots, city, dt, t, [{ x: C.x, z: C.z }, ...(C.inCar ? [] : [{ x: F.x, z: F.z }])]);
  updatePeople(peds, dt, C.inCar ? { x: C.x, z: C.z, speed: C.speed } : null, city.groundY);
  // fares
  if (fare && started) {
    const tx = fare.stage === 'pickup' ? fare.px : fare.dx, tz = fare.stage === 'pickup' ? fare.pz : fare.dz;
    marker.position.set(tx, 20, tz); ring.position.set(tx, 0.2, tz);
    const col = fare.stage === 'pickup' ? 0x4dff8a : 0xffd84d; (marker.material as THREE.MeshBasicMaterial).color.setHex(col); (ring.material as THREE.MeshBasicMaterial).color.setHex(col);
    ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    const near = C.inCar && Math.hypot(C.x - tx, C.z - tz) < FARE.pickupRadius && C.speed < 3;
    if (fare.stage === 'dropoff') { fare.time -= dt; if (fare.time <= 0) { toast('Too slow — the passenger walked off. No fare.'); fare = null; setTimeout(newFare, 2500); } }
    if (fare && near) {
      if (fare.stage === 'pickup') {
        const dist = Math.hypot(fare.dx - fare.px, fare.dz - fare.pz) * 1.3;
        fare.stage = 'dropoff'; fare.time = Math.max(FARE.minTime, dist * FARE.secondsPerMeter); fare.pay = Math.round(FARE.base + dist * FARE.perMeter); crashes = 0;
        toast(`Passenger in! Drop-off is yellow — ${Math.round(fare.time)}s`); sfx.play('pickup');
      } else {
        const tip = Math.max(0, Math.round(fare.time * 0.4) - crashes * FARE.crashPenalty), total = fare.pay + tip;
        cash += total; save.set('cash', cash); save.set('best', Math.max(save.get('best'), total));
        toast(`Fare complete: $${fare.pay} + $${tip} tip`); sfx.notes('coin', [0, 4, 7, 12], 0.07);
        fare = null; setTimeout(newFare, 2500);
      }
    }
  }
  marker.visible = ring.visible = !!fare;
  // camera: chase cam in the car, orbit cam on foot
  const tgt = C.inCar ? tmp.set(C.x, 1.4, C.z) : tmp.set(F.x, 1.5 + city.groundY(F.x, F.z), F.z);
  if (C.inCar && document.pointerLockElement !== renderer.domElement) cam.yaw += angleDiff(cam.yaw, C.yaw) * Math.min(1, 2.5 * dt);
  else if (C.inCar) cam.yaw += angleDiff(cam.yaw, C.yaw) * Math.min(1, (C.speed > 3 ? 1.6 : 0) * dt);
  const dist = C.inCar ? CAM.car + C.speed * 0.05 : CAM.foot, height = C.inCar ? CAM.carHeight : CAM.footHeight;
  const want = new THREE.Vector3(tgt.x + Math.sin(cam.yaw) * dist * Math.cos(cam.pitch), tgt.y + height * 0.6 - Math.sin(cam.pitch) * dist, tgt.z + Math.cos(cam.yaw) * dist * Math.cos(cam.pitch));
  // keep the camera out of buildings: pull it in toward the player until the spot is clear
  for (let k = 1; k > 0.1; k -= 0.06) { const px = tgt.x + (want.x - tgt.x) * k, pz = tgt.z + (want.z - tgt.z) * k; if (!city.collide(px, pz, 0.45)) { want.x = px; want.z = pz; break; } }
  camera.position.lerp(want, Math.min(1, 10 * dt)); camera.lookAt(tgt.x, tgt.y + 0.4, tgt.z);
  camera.fov = damp(camera.fov, CAM.fov + C.speed * 0.25, 4, dt); camera.updateProjectionMatrix();
  fx.follow(tgt);
  // HUD
  $('cash').textContent = `$${cash.toLocaleString()}`;
  const hh = Math.floor(hour), mm = Math.floor((hour % 1) * 60); $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('spd').textContent = String(Math.round(C.speed * 3.6));
  $('fare').innerHTML = fare ? (fare.stage === 'pickup' ? 'PICK UP <b>●</b>' : `DROP OFF <b class="y">●</b> · ${Math.ceil(fare.time)}s · $${fare.pay}`) : '';
  $('hint').textContent = !started ? '' : !C.inCar && Math.hypot(F.x - C.x, F.z - C.z) < 4 ? 'E — get in the taxi' : !C.inCar ? 'Walk to the yellow taxi' : '';
  mapCtx ??= ($('map') as HTMLCanvasElement).getContext('2d');
  drawMap(mapCtx!, fare ? (fare.stage === 'pickup' ? [fare.px, fare.pz] : [fare.dx, fare.dz]) : null);
  (window as any).__playtest = { inCar: C.inCar, speed: Math.round(C.speed * 3.6), cash, fare: fare?.stage ?? null, hour: +hour.toFixed(2), peds: peds.length, traffic: bots.length };
  input.endFrame();
});

function drawMap(g: CanvasRenderingContext2D, target: [number, number] | null) {
  const S = 190, [W] = city.size, k = S / W * 0.9, cx = C.inCar ? C.x : F.x, cz = C.inCar ? C.z : F.z;
  g.clearRect(0, 0, S, S); g.fillStyle = 'rgba(12,16,22,.82)'; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2); g.scale(k * 2.2, k * 2.2); g.translate(-cx, -cz);
  g.fillStyle = '#3a4250'; for (const b of city.solids) g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  if (target) { g.fillStyle = fare?.stage === 'pickup' ? '#4dff8a' : '#ffd84d'; g.beginPath(); g.arc(target[0], target[1], 5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffcc00'; g.fillRect(C.x - 2, C.z - 2, 4, 4);
  g.restore();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(S / 2, S / 2, 3.5, 0, Math.PI * 2); g.fill();
  if (target) { const a = Math.atan2(target[1] - cz, target[0] - cx), d = Math.hypot(target[0] - cx, target[1] - cz); if (d * k * 2.2 > S / 2 - 8) { g.fillStyle = fare?.stage === 'pickup' ? '#4dff8a' : '#ffd84d'; g.beginPath(); g.arc(S / 2 + Math.cos(a) * (S / 2 - 10), S / 2 + Math.sin(a) * (S / 2 - 10), 5, 0, Math.PI * 2); g.fill(); } }
}
(window as any).__debug = { C, F, city, bots, peds, fx, setHour: (h: number) => (hour = h), get fare() { return fare; }, newFare };

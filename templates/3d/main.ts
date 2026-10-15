/**
 * {{TITLE}} — Three.js template: a grounded, good-looking 3D world to build on.
 * A real HDRI sky with soft image-based light, a warm sun with shadows that follow the player, photoscanned terrain,
 * scattered nature props, an animated character with a third-person camera, collectibles and a clean HUD.
 * Replace the gem hunt with your game, but keep the look: it's the visual bar every 3D game must clear
 * (make-game step 5). Swap the ground texture, props, character and sun for your setting (snow, desert, city, night…).
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { look } from '@kit/three/look';
import { createInput } from '@kit/input';
import { loadModel, loadTexture, animate, sound } from '@kit/assets';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { damp, clamp } from '@kit/math';
import { rng } from '@kit/rng';
import { store } from '@kit/save';
import { tune } from '@kit/tune';

const TITLE = '{{TITLE}}';
const WORLD = 60;                       // half-size of the playable area (the ground goes much further, so no edge shows)
const save = store('{{SLUG}}', { best: 0 });
/** Tuning knobs — open with ?tune for live sliders. */
const T = { walk: 4.2, run: 7.5, turn: 10, gems: 12, time: 60 };
tune(T, 'Tuning');

const game = bootThree({ fov: 50 });   // look() owns the sky, lights, shadows, fog and post-processing
const { scene, camera, loop, hud, shake } = game;
// One call for the whole look: sky, key/fill/rim lights, soft shadows that follow the player, bloom,
// filmic tone mapping, colour grade, vignette. Swap the preset for your setting — day, night, sunset,
// neon, horror, interior, toy, overcast — or pass your own `hdri` for a photoscanned sky like this one.
const fx = look(game, 'day', { hdri: 'kloofendal_48d_partly_cloudy_puresky' });
const input = createInput(document.body);

// ------------------------------------------------------------------ world: textured ground to the horizon, props
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ ...(await loadTexture('leafy_grass', { repeat: 200 })), color: 0xc8e6a0, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

const PROPS = ['tree_pineDefaultA', 'tree_pineRoundA', 'tree_oak', 'tree_default', 'tree_fat', 'rock_largeA', 'plant_bushLarge', 'plant_bush', 'mushroom_redGroup', 'grass_large'];
const solids: { x: number; z: number; r: number; m: THREE.Object3D }[] = [];
for (let i = 0; i < 140; i++) {
  const id = rng.pick(PROPS), tree = id.startsWith('tree'), rock = id.startsWith('rock'), big = tree || rock;
  const a = rng.range(0, Math.PI * 2), d = i < 40 ? rng.range(WORLD, WORLD + 30) : rng.range(8, WORLD);   // a ring of forest + scattered inside
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  // Kenney's nature kit is teal/salmon by design: tint it toward a natural palette (pick your own for your setting)
  const tint = tree ? 0x8fcf5f : rock ? 0xa9a49c : id.startsWith('mushroom') ? undefined : 0x9fd06a;
  const m = await loadModel(`nature-kit/${id}`, { height: tree ? rng.range(4, 8) : rock ? rng.range(0.9, 2) : rng.range(0.5, 1.2), tint });
  m.position.set(x, 0, z); m.rotation.y = rng.range(0, Math.PI * 2);
  fx.prepare(m); scene.add(m);
  if (big) solids.push({ x, z, r: rock ? 1.1 : 0.7, m });
}

// ------------------------------------------------------------------ player: an animated character, third-person camera
const player = await loadModel('mini-characters/character-female-b', { height: 1.7 });
fx.prepare(player); scene.add(player);
const anim = animate(player); anim.play('idle');
const vel = new THREE.Vector3();
let facing = 0, moving = '';

// ------------------------------------------------------------------ collectibles
const gems: { m: THREE.Group; alive: boolean }[] = [];
const gemModel = await loadModel('platformer-kit/jewel', { height: 0.8 });
function placeGem(g: { m: THREE.Group; alive: boolean }) {
  for (let tries = 0; tries < 30; tries++) {
    const x = rng.range(-WORLD + 6, WORLD - 6), z = rng.range(-WORLD + 6, WORLD - 6);
    if (solids.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + 2) && Math.hypot(x, z) > 6) { g.m.position.set(x, 0.9, z); break; }
  }
  g.alive = true; g.m.visible = true;
}
for (let i = 0; i < T.gems; i++) {
  const m = gemModel.clone(); fx.prepare(m); scene.add(m);
  const glow = new THREE.PointLight(0x7fe0ff, 6, 6, 2); glow.position.y = 0.3; m.add(glow);
  const g = { m, alive: false }; placeGem(g); gems.push(g);
}

// ------------------------------------------------------------------ HUD
hud.innerHTML = `
  <div class="bar"><div class="chip">💎 <b id="score">0</b></div><div class="chip"><span class="dim">Time</span> <b id="time">0</b></div><div class="spacer"></div><div class="chip"><span class="dim">Best</span> <b id="best">0</b></div></div>
  <div class="toast" id="toast"></div>
  <div class="overlay" id="menu"><h1>${TITLE}</h1><p>Collect as many gems as you can before time runs out.</p><p>WASD move · Shift run · M mute</p><div class="go">Click or press Space to play</div></div>
  <div class="overlay hidden" id="over"><h1>Time!</h1><p id="final"></p><div class="go">Click or press Space to play again</div></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
$('best').textContent = String(save.get('best'));
let toastT = 0;
const toast = (t: string) => { $('toast').textContent = t; $('toast').style.opacity = '1'; toastT = 1.2; };

let state: 'menu' | 'play' | 'over' = 'menu', score = 0, timeLeft = T.time, stepT = 0;
function start() {
  if (state === 'play') return;
  state = 'play'; score = 0; timeLeft = T.time;
  player.position.set(0, 0, 0); vel.set(0, 0, 0);
  gems.forEach(placeGem);
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  if (!music.playing) music.play(SONGS.chill ?? Object.values(SONGS)[0]);
  sfx.play('select');
}
function end() {
  state = 'over';
  const isBest = save.best('best', score);
  $('best').textContent = String(save.get('best'));
  $('final').textContent = `${score} gems${isBest && score > 0 ? ' · new best!' : ''}`;
  $('over').classList.remove('hidden');
  anim.play('idle');
}
for (const id of ['menu', 'over']) $(id).addEventListener('pointerdown', () => start());

// ------------------------------------------------------------------ loop
const camPos = new THREE.Vector3(0, 6, 9), lookAt = new THREE.Vector3();
loop((dt) => {
  if (input.pressed('KeyM')) audio.toggleMute();
  if (state !== 'play' && (input.pressed('Space') || input.pressed('Enter'))) start();
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').style.opacity = '0';

  if (state === 'play') {
    timeLeft -= dt; if (timeLeft <= 0) end();
    // move relative to the camera (it sits behind, looking along -z)
    const ax = input.axis(), run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = run ? T.run : T.walk;
    const want = new THREE.Vector3(ax.x, 0, ax.y).normalize().multiplyScalar(ax.x || ax.y ? speed : 0);
    vel.x = damp(vel.x, want.x, 10, dt); vel.z = damp(vel.z, want.z, 10, dt);
    player.position.addScaledVector(vel, dt);
    player.position.x = clamp(player.position.x, -WORLD, WORLD); player.position.z = clamp(player.position.z, -WORLD, WORLD);
    for (const s of solids) {   // slide around trees and rocks
      const dx = player.position.x - s.x, dz = player.position.z - s.z, d = Math.hypot(dx, dz), r = s.r + 0.4;
      if (d < r && d > 1e-4) { player.position.x = s.x + (dx / d) * r; player.position.z = s.z + (dz / d) * r; }
    }
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.3) facing = Math.atan2(vel.x, vel.z);
    player.rotation.y = facing;   // Kenney models face +z
    const clip = sp < 0.3 ? 'idle' : run ? 'sprint' : 'walk';
    if (clip !== moving) { anim.play(clip); moving = clip; }
    if (sp > 0.3 && (stepT -= dt * sp) <= 0) { stepT = 1.6; sound.play('impact-sounds/footstep_concrete_*', { volume: 0.25 }); }

    for (const g of gems) {
      if (!g.alive) continue;
      g.m.rotation.y += dt * 2; g.m.position.y = 0.9 + Math.sin(performance.now() / 300 + g.m.position.x) * 0.15;
      if (g.m.position.distanceTo(player.position) < 1.4) {
        g.alive = false; g.m.visible = false; score++;
        sound.play('interface-sounds/confirmation_00*', { volume: 0.5 }); shake(0.1);
        if (score % 5 === 0) toast(`${score} gems!`);
        setTimeout(() => state === 'play' && placeGem(g), 1500);
      }
    }
  }
  anim.update(dt);

  // third-person camera: behind and above, smoothed
  camPos.set(player.position.x, player.position.y + 6.5, player.position.z + 9.5);
  camera.position.lerp(camPos, 1 - Math.exp(-4 * dt));
  lookAt.set(player.position.x, player.position.y + 1.2, player.position.z - 2);
  camera.lookAt(lookAt);
  fx.follow(player.position);
  for (const s of solids) s.m.visible = Math.hypot(s.x - camera.position.x, s.z - camera.position.z) > 3.5;   // never fill the screen with a tree the camera backs into

  $('score').textContent = String(score);
  $('time').textContent = String(Math.max(0, Math.ceil(timeLeft)));
  (window as any).__playtest = { state, score, time: Math.round(T.time - timeLeft) };
  input.endFrame();
});

/**
 * A Minecraft player controller: WASD walk, Shift (or double-tap W) sprint, Space jump, Ctrl sneak, mouse look
 * (pointer lock on click; drag to look when pointer lock isn't available, e.g. headless or `?freelook`),
 * collides with a VoxelWorld (or a ground-height function), and drives a first- or third-person camera (V toggles).
 *
 *   const ctl = mcController(game, input, { world, body: hero.root, eye: 1.62, view: 'third' });
 *   loop((dt) => { ctl.update(dt); hero.anim.update(dt, ctl.speed); });
 *   ctl.pos / ctl.vel / ctl.yaw / ctl.pitch / ctl.onGround / ctl.speed (horizontal, units/s) / ctl.forward()
 *   ctl.teleport(x, y, z)  ·  ctl.enabled = false (cutscenes, menus)  ·  ctl.lookDir() for raycasts
 *
 * Speeds are Minecraft's: walk 4.3, sprint 5.6, sneak 1.3 blocks/s, jump 1.25 blocks. Tune with the options.
 */
import * as THREE from 'three';
import type { Input } from '@kit/input';
import type { VoxelWorld } from './world';

interface Game { camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer }
export interface ControllerOpts {
  world?: VoxelWorld;
  /** for games without a voxel world: ground height at (x, z) */
  ground?: (x: number, z: number) => number;
  body?: THREE.Object3D;
  view?: 'first' | 'third';
  eye?: number; width?: number; height?: number;
  walk?: number; sprint?: number; sneak?: number; jump?: number; gravity?: number;
  /** third-person camera distance + shoulder height */
  distance?: number;
  /** auto-climb 1-block steps (arcade feel). Minecraft itself = 0 */
  step?: number;
  sensitivity?: number;
}

export function mcController(game: Game, input: Input, o: ControllerOpts = {}) {
  const cam = game.camera, el = game.renderer.domElement;
  const pos = new THREE.Vector3(), vel = new THREE.Vector3();
  const hw = (o.width ?? 0.6) / 2, h = o.height ?? 1.8, eye = o.eye ?? 1.62;
  const walk = o.walk ?? 4.3, sprint = o.sprint ?? 5.6, sneakS = o.sneak ?? 1.3, g = o.gravity ?? 32;
  const jumpV = Math.sqrt(2 * g * (o.jump ?? 1.25));
  let yaw = 0, pitch = -0.15, view = o.view ?? 'third', onGround = false, sprinting = false, lastW = -1, t = 0, bob = 0;
  let camDist = o.distance ?? 4.5;
  const sens = o.sensitivity ?? 0.0025;
  const freelook = new URLSearchParams(location.search).has('freelook');

  // mouse look: pointer lock when we can get it, drag otherwise
  let dragging = false;
  el.addEventListener('click', () => { if (!freelook && api.enabled && document.pointerLockElement !== el) el.requestPointerLock?.()?.catch?.(() => {}); });
  el.addEventListener('pointerdown', () => { dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!api.enabled) return;
    if (document.pointerLockElement === el || dragging) { yaw -= e.movementX * sens; pitch = THREE.MathUtils.clamp(pitch - e.movementY * sens, -1.5, 1.5); }
  });
  el.addEventListener('wheel', (e) => { camDist = THREE.MathUtils.clamp(camDist + Math.sign(e.deltaY) * 0.6, 2, 12); }, { passive: true });

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), delta = new THREE.Vector3(), tmp = new THREE.Vector3();
  const api = {
    pos, vel, enabled: true,
    get yaw() { return yaw; }, set yaw(v: number) { yaw = v; },
    get pitch() { return pitch; }, set pitch(v: number) { pitch = v; },
    get onGround() { return onGround; },
    get view() { return view; }, set view(v: 'first' | 'third') { view = v; },
    get sprinting() { return sprinting; },
    get sneaking() { return input.down('ControlLeft') || input.down('KeyC'); },
    get speed() { return Math.hypot(vel.x, vel.z); },
    forward: () => fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
    lookDir: () => new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')),
    eyePos: () => new THREE.Vector3(pos.x, pos.y + (api.sneaking ? eye - 0.3 : eye), pos.z),
    teleport(x: number, y: number, z: number) { pos.set(x, y, z); vel.set(0, 0, 0); },
    jump() { if (onGround) { vel.y = jumpV; onGround = false; } },
    update(dt: number) {
      t += dt;
      dt = Math.min(dt, 0.05);
      if (input.pressed('KeyV')) view = view === 'first' ? 'third' : 'first';
      // movement intent relative to the camera yaw
      let mx = 0, mz = 0;
      if (api.enabled) {
        const ax = input.axis(); mx = ax.x; mz = ax.y;
        if (input.pressed('KeyW')) { if (t - lastW < 0.3) sprinting = true; lastW = t; }
        if (input.down('ShiftLeft') || input.down('ShiftRight')) sprinting = true;
        if (mz >= 0 || api.sneaking) sprinting = false;
        if ((input.pressed('Space') || input.down('Space')) && onGround) api.jump();
      }
      const target = api.sneaking ? sneakS : sprinting ? sprint : walk;
      api.forward(); right.set(-fwd.z, 0, fwd.x);
      const wish = tmp.set(0, 0, 0).addScaledVector(fwd, -mz).addScaledVector(right, mx);
      if (wish.lengthSq() > 1) wish.normalize();
      const k = onGround ? 14 : 3;                                   // snappy on the ground, floaty in the air
      vel.x += (wish.x * target - vel.x) * Math.min(1, k * dt);
      vel.z += (wish.z * target - vel.z) * Math.min(1, k * dt);
      vel.y -= g * dt;
      delta.copy(vel).multiplyScalar(dt);
      if (o.world) {
        const r = o.world.move(pos, delta, hw, h, o.step ?? 0);
        onGround = r.ground; if (r.ground && vel.y < 0) vel.y = 0; if (r.ceiling && vel.y > 0) vel.y = 0;
      } else {
        pos.add(delta);
        const gy = o.ground ? o.ground(pos.x, pos.z) : 0;
        onGround = pos.y <= gy; if (onGround) { pos.y = gy; vel.y = Math.max(0, vel.y); }
      }
      // body faces the move direction in third person, the look direction in first
      if (o.body) {
        o.body.position.copy(pos);
        const moving = api.speed > 0.3;
        const face = view === 'first' ? yaw + Math.PI : moving ? Math.atan2(vel.x, vel.z) : o.body.rotation.y;
        let d = face - o.body.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        o.body.rotation.y += d * Math.min(1, 12 * dt);
        o.body.visible = view === 'third';
      }
      // camera
      bob += api.speed * dt * (onGround ? 1 : 0);
      const ey = api.eyePos();
      if (view === 'first') {
        cam.position.copy(ey); cam.position.y += Math.abs(Math.sin(bob * 1.6)) * 0.05 * Math.min(1, api.speed / walk);
        cam.rotation.set(pitch, yaw, 0, 'YXZ');
      } else {
        const dir = api.lookDir();
        let dist = camDist;
        // pull the camera in when a block is between it and the player
        if (o.world) { const hit = o.world.raycast(ey, dir.clone().negate(), camDist); if (hit) dist = Math.max(0.6, hit.dist - 0.3); }
        cam.position.copy(ey).addScaledVector(dir, -dist);
        cam.position.y += 0.2;
        cam.lookAt(ey.x + dir.x * 2, ey.y + dir.y * 2 + 0.1, ey.z + dir.z * 2);
      }
    },
  };
  return api;
}

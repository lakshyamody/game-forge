/**
 * City life: AI traffic (lanes → smooth turns through intersections, keeps distance, brakes for obstacles)
 * and pedestrians (Rocketbox people walking sidewalk loops at their clip's real speed, stopping to idle / phone).
 */
import * as THREE from 'three';
import { buildCar, type Car, type CarKind } from '@kit/three/cars';
import { loadModel, animate } from '@kit/assets';
import type { City, Lane } from '@kit/three/city';
import { Rng } from '@kit/rng';

const rng = new Rng(42);
const PAINTS = [0x1f4fa0, 0x8a1c1c, 0x202326, 0xd8d8dc, 0x2f5d3a, 0x5b5f66, 0x0f2a52, 0x7a5a2a, 0xb9b9bd, 0x3d1f4f];
const KINDS: CarKind[] = ['sedan', 'sedan', 'hatch', 'suv', 'taxi', 'sports', 'van', 'sedan', 'suv', 'police'];

// ------------------------------------------------------------------ traffic
export interface Bot { car: Car; lane: Lane | null; t: number; turn: { p0: THREE.Vector3; p1: THREE.Vector3; p2: THREE.Vector3; len: number; next: Lane } | null; u: number; speed: number; cruise: number; pos: THREE.Vector3; yaw: number; stopped: number }
const laneLen = (l: Lane) => Math.hypot(l.bx - l.ax, l.bz - l.az);

export function spawnTraffic(scene: THREE.Scene, city: City, n: number) {
  const bots: Bot[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let li = rng.int(0, city.lanes.length - 1); while (used.has(li) && used.size < city.lanes.length) li = rng.int(0, city.lanes.length - 1);
    used.add(li);
    const car = buildCar(KINDS[i % KINDS.length], PAINTS[i % PAINTS.length]); scene.add(car.root);
    bots.push({ car, lane: city.lanes[li], t: rng.range(5, laneLen(city.lanes[li]) - 10), turn: null, u: 0, speed: 0, cruise: rng.range(9, 13), pos: new THREE.Vector3(), yaw: 0, stopped: 0 });
  }
  return bots;
}
/** pick a lane that starts near where this one ends (straight, left or right — never a U-turn) */
function nextLane(city: City, l: Lane) {
  const opts = city.lanes.filter((m) => m !== l && Math.hypot(m.ax - l.bx, m.az - l.bz) < 22 && !(m.dir[0] === -l.dir[0] && m.dir[1] === -l.dir[1]));
  return opts.length ? rng.pick(opts) : null;
}
export function updateTraffic(bots: Bot[], city: City, dt: number, time: number, obstacles: { x: number; z: number }[]) {
  for (const b of bots) {
    // where am I, which way am I facing
    if (b.turn) {
      const { p0, p1, p2 } = b.turn, u = b.u, a = (1 - u) * (1 - u), m = 2 * (1 - u) * u, c = u * u;
      b.pos.set(a * p0.x + m * p1.x + c * p2.x, 0, a * p0.z + m * p1.z + c * p2.z);
      const dx = 2 * (1 - u) * (p1.x - p0.x) + 2 * u * (p2.x - p1.x), dz = 2 * (1 - u) * (p1.z - p0.z) + 2 * u * (p2.z - p1.z);
      b.yaw = Math.atan2(-dx, -dz);
    } else if (b.lane) {
      const L = laneLen(b.lane), f = b.t / L;
      b.pos.set(b.lane.ax + (b.lane.bx - b.lane.ax) * f, 0, b.lane.az + (b.lane.bz - b.lane.az) * f);
      b.yaw = Math.atan2(-b.lane.dir[0], -b.lane.dir[1]);
    }
    // keep distance: anything in front within the braking zone slows us down
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    let gap = Infinity;
    for (const o of [...bots.map((x) => x.pos), ...obstacles]) {
      if (o === b.pos) continue;
      const dx = o.x - b.pos.x, dz = o.z - b.pos.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 18 && side < 2.4) gap = Math.min(gap, ahead);
    }
    const target = gap < 7 ? 0 : gap < 18 ? b.cruise * (gap - 7) / 11 : b.turn ? b.cruise * 0.6 : b.cruise;
    b.speed += Math.sign(target - b.speed) * Math.min(Math.abs(target - b.speed), (target < b.speed ? 14 : 4) * dt);
    b.stopped = b.speed < 0.3 ? b.stopped + dt : 0;
    const d = b.speed * dt;
    if (b.turn) {
      b.u += d / b.turn.len;
      if (b.u >= 1) { b.lane = b.turn.next; b.t = 0; b.turn = null; }
    } else if (b.lane) {
      b.t += d;
      if (b.t >= laneLen(b.lane)) {
        const n = nextLane(city, b.lane);
        if (n) {
          const p0 = new THREE.Vector3(b.lane.bx, 0, b.lane.bz), p2 = new THREE.Vector3(n.ax, 0, n.az);
          const straight = n.dir[0] === b.lane.dir[0] && n.dir[1] === b.lane.dir[1];
          const p1 = straight ? p0.clone().lerp(p2, 0.5) : new THREE.Vector3(b.lane.dir[0] !== 0 ? n.ax : b.lane.bx, 0, b.lane.dir[1] !== 0 ? n.az : b.lane.bz);
          b.turn = { p0, p1, p2, len: p0.distanceTo(p1) + p1.distanceTo(p2), next: n }; b.u = 0;
        } else b.t = 0;
      }
    }
    b.car.root.position.copy(b.pos); b.car.root.rotation.y = b.yaw;
    b.car.roll(d); b.car.steer(b.turn ? (b.turn.p1.clone().sub(b.pos).cross(new THREE.Vector3(fx, 0, fz)).y > 0 ? 0.35 : -0.35) : 0);
    b.car.brake(target < b.speed - 0.5 || b.speed < 0.5); b.car.update(time);
  }
}

// ------------------------------------------------------------------ pedestrians
export interface Ped { root: THREE.Group; anim: ReturnType<typeof animate>; loop: [number, number][]; seg: number; t: number; speed: number; state: 'walk' | 'idle'; stateT: number; female: boolean; alive: boolean; dodge: number; x: number; z: number }
export async function spawnPeople(scene: THREE.Scene, city: City, n: number, cast: string[], clips: { male: THREE.AnimationClip[]; female: THREE.AnimationClip[] }, speeds: Record<string, number>) {
  const models = await Promise.all(cast.map((id) => loadModel(`rocketbox/${id}`, { height: id.includes('child') ? 1.3 : rng.range(1.62, 1.86) }).then((m) => ({ id, m })).catch(() => null)));
  const ok = models.filter((x): x is { id: string; m: THREE.Group } => !!x);
  const peds: Ped[] = [];
  for (let i = 0; i < n && ok.length; i++) {
    const { id } = ok[i % ok.length], female = id.includes('female');
    const m = await loadModel(`rocketbox/${id}`, { height: id.includes('child') ? 1.3 : rng.range(1.62, 1.86) });
    const root = new THREE.Group(); root.add(m); scene.add(root);
    const anim = animate(m, female ? clips.female : clips.male);
    const loop = rng.pick(city.loops), stroll = rng.next() < 0.4;
    anim.play(stroll ? 'stroll' : 'walk', { speed: rng.range(0.92, 1.08) });
    const sp = (stroll ? speeds.stroll : speeds.walk) ?? 1.2;
    peds.push({ root, anim, loop: rng.next() < 0.5 ? loop : [...loop].reverse(), seg: rng.int(0, 3), t: rng.next(), speed: sp, state: 'walk', stateT: rng.range(8, 30), female, alive: true, dodge: 0, x: 0, z: 0 });
  }
  return peds;
}
export function updatePeople(peds: Ped[], dt: number, danger: { x: number; z: number; speed: number } | null, groundY: (x: number, z: number) => number) {
  for (const p of peds) {
    if (!p.alive) continue;
    p.anim.update(dt);
    p.stateT -= dt;
    if (p.stateT <= 0) {   // sometimes stop for a while: idle, look around, take a call
      if (p.state === 'walk') { p.state = 'idle'; p.stateT = rng.range(4, 10); p.anim.play(rng.pick(['idle', 'idle-look', 'phone', 'idle-wait'].filter((n) => p.anim.names.includes(n))), { fade: 0.4 }); }
      else { p.state = 'walk'; p.stateT = rng.range(15, 40); p.anim.play('walk', { fade: 0.4 }); }
    }
    const a = p.loop[p.seg], b = p.loop[(p.seg + 1) % p.loop.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (p.state === 'walk') { p.t += (p.speed * dt) / L; if (p.t >= 1) { p.t = 0; p.seg = (p.seg + 1) % p.loop.length; } }
    p.x = a[0] + (b[0] - a[0]) * p.t; p.z = a[1] + (b[1] - a[1]) * p.t;
    // step aside from a fast car coming close
    if (danger && danger.speed > 6) {
      const d = Math.hypot(p.x - danger.x, p.z - danger.z);
      if (d < 7) p.dodge = Math.min(2.2, p.dodge + dt * 6);
    }
    p.dodge = Math.max(0, p.dodge - dt * 0.8);
    const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;   // inward normal of the loop
    p.root.position.set(p.x + nx * p.dodge, groundY(p.x, p.z), p.z + nz * p.dodge);
    if (p.state === 'walk') p.root.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
}

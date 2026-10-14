/**
 * The city at night: procedural PBR buildings with lit windows, wet asphalt, sidewalks, crosswalks,
 * instanced street lamps with a pool of real spot lights that follows the player, parked cars and props.
 * Also owns collision (boxes), line of sight, and a 0.5 m navigation grid with A* + string-pulling,
 * so NPCs walk around cars, dumpsters and benches instead of getting stuck on them.
 */
import * as THREE from 'three';
import { loadModel, loadTexture, sizeOf, preloadModels } from '@kit/assets';
import { Grid, DIRS8 } from '@kit/grid';
import { rng } from '@kit/rng';
import { clamp } from '@kit/math';
import { CITY, HALF, EDGE, LIGHT } from './config';

export interface Box { x: number; z: number; hx: number; hz: number; low: boolean }
/** building blocks (tall, block sight) */
export const blocks: Box[] = [];
/** cars + street props (low: you can crouch behind them) */
export const obstacles: Box[] = [];
export const COLL = 4.2;                       // half-size of the building footprint in each block
const SLAB = CITY.BLOCK / 2 + 0.6;             // half-size of the sidewalk slab

// ---------------------------------------------------------------- street graph (intersections)
export const NN = CITY.BLOCKS + 1;
export const nodeX = (n: number) => -HALF + (n % NN) * CITY.CELL;
export const nodeZ = (n: number) => -HALF + Math.floor(n / NN) * CITY.CELL;
export const nearestNode = (x: number, z: number) => clamp(Math.round((x + HALF) / CITY.CELL), 0, NN - 1) + clamp(Math.round((z + HALF) / CITY.CELL), 0, NN - 1) * NN;
export function neighbours(n: number) {
  const i = n % NN, j = Math.floor(n / NN), out: number[] = [];
  if (i > 0) out.push(n - 1); if (i < NN - 1) out.push(n + 1); if (j > 0) out.push(n - NN); if (j < NN - 1) out.push(n + NN);
  return out;
}

// ---------------------------------------------------------------- facades (canvas: wall texture + windows)
const FACADE_M = 24;                            // one facade texture covers 24 m × 24 m = 8 × 8 windows of 3 m
async function facade(kind: 'brick' | 'concrete' | 'plaster' | 'glass', tint: string, litChance: number) {
  const S = 1024, C = S / 8;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')!] as const; };
  const [wall, g] = mk(), [em, e] = mk(), [ro, r] = mk();
  let normal: THREE.Texture | null = null;
  if (kind === 'glass') { g.fillStyle = '#1b222c'; g.fillRect(0, 0, S, S); }
  else {
    const t = await loadTexture(kind === 'brick' ? 'brick_wall_001' : kind === 'concrete' ? 'concrete_wall_003' : 'painted_plaster_wall');
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.drawImage(t.map.image as CanvasImageSource, x * 256, y * 256, 256, 256);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
    normal = t.normalMap?.clone() ?? null;
    if (normal) { normal.repeat.set(4, 4); normal.needsUpdate = true; }
  }
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  r.fillStyle = kind === 'glass' ? '#3a3a3a' : '#e6e6e6'; r.fillRect(0, 0, S, S);
  const warm = ['#ffcf8a', '#ffd9a0', '#ffe9c4', '#ffc070', '#c8dcff'];
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
    const x0 = cx * C, y0 = cy * C;
    const [wx, wy, ww, wh] = kind === 'glass' ? [x0 + 3, y0 + 10, C - 6, C - 16] : [x0 + C * 0.24, y0 + C * 0.2, C * 0.52, C * 0.56];
    if (kind !== 'glass') { g.fillStyle = '#cfc8ba'; g.fillRect(wx - 5, wy + wh, ww + 10, 7); g.fillStyle = '#2a2622'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6); }
    const grad = g.createLinearGradient(0, wy, 0, wy + wh); grad.addColorStop(0, '#26303d'); grad.addColorStop(1, '#0d1219');
    g.fillStyle = grad; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#1a1a1a'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh);                 // mullion
    r.fillStyle = '#202020'; r.fillRect(wx, wy, ww, wh);
    if (rng.chance(litChance)) {
      const col = rng.pick(warm), curtain = rng.chance(0.5) ? rng.range(0.15, 0.6) : 0;
      e.globalAlpha = rng.range(0.55, 1); e.fillStyle = col; e.fillRect(wx, wy + wh * curtain, ww, wh * (1 - curtain));
      e.globalAlpha = 1; e.fillStyle = '#000'; e.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    }
  }
  const tex = (c: HTMLCanvasElement, srgb: boolean) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  return new THREE.MeshStandardMaterial({
    map: tex(wall, true), emissiveMap: tex(em, true), emissive: 0xffffff, emissiveIntensity: LIGHT.windows,
    roughnessMap: tex(ro, false), roughness: 1, metalness: kind === 'glass' ? 0.4 : 0, ...(normal ? { normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8) } : {}),
  });
}
/** box with UVs in facade units, so windows stay 3 m apart whatever the building size */
function buildingGeo(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4), fw = face < 2 ? d : w, fh = face === 2 || face === 3 ? d : h;
    uv.setXY(i, (uv.getX(i) * fw) / FACADE_M, (uv.getY(i) * fh) / FACADE_M);
  }
  g.translate(0, h / 2, 0);
  return g;
}

// ---------------------------------------------------------------- lamps
export const lamps: THREE.Vector3[] = [];
const spots: THREE.SpotLight[] = [];
export function updateLamps(at: THREE.Vector3, fwdX: number, fwdZ: number) {
  // the closest lamps (biased toward where you're looking) get the real lights
  const bx = at.x + fwdX * 6, bz = at.z + fwdZ * 6;
  const order = lamps.map((p, i) => [Math.hypot(p.x - bx, p.z - bz), i] as const).sort((a, b) => a[0] - b[0]);
  spots.forEach((s, k) => { const p = lamps[order[k][1]]; s.position.copy(p); s.target.position.set(p.x, 0, p.z); });
}

// ---------------------------------------------------------------- build
export async function buildCity(scene: THREE.Scene) {
  // ground: wet asphalt (low roughness → lamp reflections)
  const asphalt = await loadTexture('asphalt_02', { repeat: 90 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(EDGE * 2 + 120, EDGE * 2 + 120), new THREE.MeshStandardMaterial({ ...asphalt, color: 0x55525a, roughness: LIGHT.wet }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const plaster = await loadTexture('painted_plaster_wall', { repeat: 3 });
  const walkMat = new THREE.MeshStandardMaterial({ ...plaster, color: 0x8a8680, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.95 });
  const facades = await Promise.all([
    facade('brick', '#c8a090', 0.32), facade('brick', '#9a7a6a', 0.25), facade('plaster', '#d8cdb8', 0.3),
    facade('plaster', '#a8b4bc', 0.28), facade('concrete', '#b8b8b8', 0.22), facade('glass', '#fff', 0.38),
  ]);
  const addBuilding = (x: number, z: number, w: number, d: number, h: number) => {
    const f = rng.pick(facades);
    const m = new THREE.Mesh(buildingGeo(w, h, d), [f, f, roofMat, roofMat, f, f]);
    m.position.set(x, 0, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3), roofMat); lip.position.set(x, h, z); scene.add(lip);
  };
  const floors = () => (rng.chance(0.12) ? rng.int(14, 22) : rng.int(3, 10)) * 3;
  for (let i = 0; i < CITY.BLOCKS; i++) for (let j = 0; j < CITY.BLOCKS; j++) {
    const x = -HALF + CITY.CELL * (i + 0.5), z = -HALF + CITY.CELL * (j + 0.5);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(SLAB * 2, 0.16, SLAB * 2), walkMat);
    slab.position.set(x, 0.08, z); slab.receiveShadow = true; scene.add(slab);
    blocks.push({ x, z, hx: COLL, hz: COLL, low: false });
    const S = COLL * 2, split = rng.int(1, 3);
    if (split === 1) addBuilding(x, z, S, S, floors());
    else if (split === 2) { const v = rng.chance(0.5); for (const s of [-1, 1]) addBuilding(x + (v ? s * S / 4 : 0), z + (v ? 0 : s * S / 4), v ? S / 2 : S, v ? S : S / 2, floors()); }
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBuilding(x + sx * S / 4, z + sz * S / 4, S / 2, S / 2, floors());
  }
  // skyline ring beyond the playable streets
  for (let k = -CITY.BLOCKS / 2 - 1; k <= CITY.BLOCKS / 2 + 1; k++) for (const side of [0, 1, 2, 3]) {
    const r = HALF + CITY.CELL * 0.75, t = k * CITY.CELL;
    const [x, z] = side === 0 ? [t, -r] : side === 1 ? [t, r] : side === 2 ? [-r, t] : [r, t];
    if ((side >= 2) && Math.abs(k) > CITY.BLOCKS / 2) continue;
    addBuilding(x, z, 12, 12, rng.int(6, 26) * 3);
  }

  // road markings: lane dashes + crosswalks (one instanced mesh)
  const paint: THREE.Matrix4[] = [];
  const ROT = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  for (let k = 0; k <= CITY.BLOCKS; k++) {
    const s = -HALF + k * CITY.CELL;
    for (let t = -HALF; t < HALF; t += 2.5) {
      const m = ((t + HALF) % CITY.CELL + CITY.CELL) % CITY.CELL;
      if (m < 5.5 || m > CITY.CELL - 5.5) continue;
      paint.push(new THREE.Matrix4().makeScale(0.12, 1, 1.2).setPosition(s, 0.015, t), ROT.clone().multiply(new THREE.Matrix4().makeScale(0.12, 1, 1.2)).setPosition(t, 0.015, s));
    }
  }
  for (let n = 0; n < NN * NN; n++) for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const cx = nodeX(n) + dx * 3.6, cz = nodeZ(n) + dz * 3.6;
    if (Math.abs(cx) > HALF || Math.abs(cz) > HALF) continue;
    for (let s = -2; s <= 2; s += 0.8) {
      const m = new THREE.Matrix4().makeScale(0.42, 1, 1.6);
      if (dx) m.premultiply(ROT);
      paint.push(m.setPosition(cx + (dz ? s : 0), 0.015, cz + (dx ? s : 0)));
    }
  }
  const paintMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.01, 1), new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.6 }), paint.length);
  paint.forEach((m, i) => paintMesh.setMatrixAt(i, m)); paintMesh.receiveShadow = true; scene.add(paintMesh);

  // street lamps: corners + mid-block, arm reaching over the road
  const posts: { x: number; z: number; ax: number; az: number }[] = [];
  const kerb = CITY.CELL / 2 - SLAB + 0.35;   // distance from street centre line to the post, on the sidewalk
  for (let n = 0; n < NN * NN; n++) {
    const x = nodeX(n), z = nodeZ(n);
    if (x < HALF && z < HALF) posts.push({ x: x + kerb + 0.6, z: z + kerb + 0.6, ax: -0.707, az: -0.707 });
    if (x < HALF) posts.push({ x: x + CITY.CELL / 2, z: z + (z < HALF ? kerb : -kerb), ax: 0, az: z < HALF ? -1 : 1 });
    if (z < HALF) posts.push({ x: x + (x < HALF ? kerb : -kerb), z: z + CITY.CELL / 2, ax: x < HALF ? -1 : 1, az: 0 });
  }
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.7 });
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 6, 8).translate(0, 3, 0), metal, posts.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.7).translate(0, 0, 0.85), metal, posts.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.1, 0.55), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd7a0, emissiveIntensity: 6 }), posts.length);
  const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: LIGHT.poolDecal, blending: THREE.AdditiveBlending, depthWrite: false }), posts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  posts.forEach((p, i) => {
    const yaw = Math.atan2(p.ax, p.az); q.setFromAxisAngle(up, yaw);
    const hx = p.x + p.ax * 1.6, hz = p.z + p.az * 1.6;
    pole.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z));
    arm.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 5.9, p.z), q, new THREE.Vector3(1, 1, 1)));
    head.setMatrixAt(i, m4.compose(new THREE.Vector3(hx, 5.85, hz), q, new THREE.Vector3(1, 1, 1)));
    pool.setMatrixAt(i, m4.compose(new THREE.Vector3(hx, 0.02, hz), new THREE.Quaternion(), new THREE.Vector3(4.5, 1, 4.5)));
    lamps.push(new THREE.Vector3(hx, 5.75, hz));
    obstacles.push({ x: p.x, z: p.z, hx: 0.12, hz: 0.12, low: false });
  });
  pole.castShadow = true; scene.add(pole, arm, head, pool);
  for (let k = 0; k < LIGHT.spots; k++) {
    const s = new THREE.SpotLight(0xffc98a, LIGHT.lamp, 22, 1.05, 0.7, 2);
    if (k < LIGHT.shadowSpots) { s.castShadow = true; s.shadow.mapSize.set(512, 512); s.shadow.bias = -0.0005; s.shadow.camera.near = 0.5; s.shadow.camera.far = 22; }
    scene.add(s, s.target); spots.push(s);
  }

  // parked cars (kerb side, never on crosswalks or in intersections)
  const CARS = ['car-sedan', 'car-taxi', 'car-hatchback', 'car-stationwagon', 'car-police'];
  await preloadModels(CARS.map((c) => `kaykit-city-builder/${c}`));
  for (let k = 0; k < 40 && obstacles.filter((o) => o.low).length < 24; k++) {
    const along = rng.int(0, CITY.BLOCKS - 1), line = rng.int(0, CITY.BLOCKS), vertical = rng.chance(0.5);
    const t = -HALF + CITY.CELL * (along + 0.5) + rng.range(-2.2, 2.2), side = rng.chance(0.5) ? 1.45 : -1.45;
    if ((line === 0 && side < 0) || (line === CITY.BLOCKS && side > 0)) continue;   // outer kerb: keep the edge street clear
    const x = vertical ? -HALF + line * CITY.CELL + side : t, z = vertical ? t : -HALF + line * CITY.CELL + side;
    if (obstacles.some((c) => c.low && Math.hypot(c.x - x, c.z - z) < 5.5)) continue;
    const m = await loadModel(`kaykit-city-builder/${CARS[k % CARS.length]}`);
    const s = sizeOf(m); m.scale.multiplyScalar(4.2 / Math.max(s.x, s.z));
    const s2 = sizeOf(m); m.rotation.y = (s2.x > s2.z) === vertical ? Math.PI / 2 : 0;
    if (side < 0) m.rotation.y += Math.PI;
    m.position.set(x, 0, z); scene.add(m);
    const s3 = sizeOf(m);
    obstacles.push({ x, z, hx: s3.x / 2, hz: s3.z / 2, low: true });
  }
  // street furniture on the sidewalks (solid, low cover)
  const PROPS = ['dumpster', 'bench', 'firehydrant', 'trash-a', 'box-a', 'bush'];
  for (const b of blocks) for (let k = 0; k < 3; k++) {
    const side = rng.int(0, 3), off = rng.range(-3.2, 3.2), e = COLL + 0.55;
    const x = b.x + (side === 0 ? e : side === 1 ? -e : off), z = b.z + (side === 2 ? e : side === 3 ? -e : off);
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 2)) continue;
    const m = await loadModel(`kaykit-city-builder/${rng.pick(PROPS)}`);
    const s = sizeOf(m); m.scale.multiplyScalar(Math.min(1.3 / Math.max(s.x, s.z), 1.3 / s.y));
    m.rotation.y = side < 2 ? Math.PI / 2 : 0; m.position.set(x, 0.16, z); scene.add(m);
    const s2 = sizeOf(m);
    obstacles.push({ x, z, hx: s2.x / 2, hz: s2.z / 2, low: true });
  }
  buildNav();
}

// ---------------------------------------------------------------- collision + sight
export function pushOut(o: { x: number; z: number }, r = 0.35) {
  for (const list of [blocks, obstacles]) for (const b of list) {
    const dx = o.x - b.x, dz = o.z - b.z, px = b.hx + r - Math.abs(dx), pz = b.hz + r - Math.abs(dz);
    if (px > 0 && pz > 0) { if (px < pz) o.x += Math.sign(dx) * px; else o.z += Math.sign(dz) * pz; }
  }
  o.x = clamp(o.x, -EDGE + r, EDGE - r); o.z = clamp(o.z, -EDGE + r, EDGE - r);
}
function segBox(ax: number, az: number, bx: number, bz: number, b: Box, shrink = 0) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, b.x - b.hx + shrink, b.x + b.hx - shrink], [az, dz, b.z - b.hz + shrink, b.z + b.hz - shrink]]) {
    if (Math.abs(d) < 1e-6) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false;
  }
  return true;
}
/** clear line of sight? Low cover (cars, dumpsters) only hides someone who is crouching. */
export function los(ax: number, az: number, bx: number, bz: number, lowCover = false) {
  for (const b of blocks) if (segBox(ax, az, bx, bz, b, 0.2)) return false;
  if (lowCover) for (const b of obstacles) if (b.low && segBox(ax, az, bx, bz, b)) return false;
  return true;
}

// ---------------------------------------------------------------- navigation grid
const RES = 0.5, NW = Math.ceil((EDGE * 2) / RES);
let nav: Grid<number>;
const toCell = (x: number, z: number) => ({ x: clamp(Math.floor((x + EDGE) / RES), 0, NW - 1), y: clamp(Math.floor((z + EDGE) / RES), 0, NW - 1) });
const cellX = (i: number) => -EDGE + (i + 0.5) * RES;
function buildNav() {
  const R = 0.4;
  nav = new Grid<number>(NW, NW, (i, j) => {
    const x = cellX(i), z = cellX(j);
    for (const list of [blocks, obstacles]) for (const b of list) if (Math.abs(x - b.x) < b.hx + R && Math.abs(z - b.z) < b.hz + R) return 1;
    return 0;
  });
}
const free = (x: number, z: number) => { const c = toCell(x, z); return nav.get(c.x, c.y) === 0; };
/** can an NPC walk straight from a to b without touching any obstacle? */
export function clearLine(ax: number, az: number, bx: number, bz: number) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.25);
  for (let k = 1; k <= n; k++) { const t = k / n; if (!free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}
function nearestFree(c: { x: number; y: number }) {
  if (nav.get(c.x, c.y) === 0) return c;
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (nav.get(c.x + dx, c.y + dy) === 0) return { x: c.x + dx, y: c.y + dy };
  return c;
}
/** A* on the nav grid, then string-pulled to a few straight legs. Returns world waypoints (excluding the start). */
export function findPath(ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] | null {
  const s = nearestFree(toCell(ax, az)), g = nearestFree(toCell(bx, bz));
  const cells = nav.path(s, g, (v) => v === 0, DIRS8);
  if (!cells) return null;
  const pts = cells.map((c) => ({ x: cellX(c.x), z: cellX(c.y) }));
  const out: { x: number; z: number }[] = [];
  let from = { x: ax, z: az }, k = 0;
  while (k < pts.length) {
    let far = k;
    for (let j = pts.length - 1; j > k; j--) if (clearLine(from.x, from.z, pts[j].x, pts[j].z)) { far = j; break; }
    out.push(pts[far]); from = pts[far]; k = far + 1;
  }
  return out;
}

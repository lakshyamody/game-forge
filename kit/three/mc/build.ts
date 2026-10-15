/**
 * Builders that stamp whole Minecraft structures into a VoxelWorld, so a game's setting is a few calls:
 *
 *   terrain(world, { size: 96, biome: 'plains', seed: 'x' })     // hills, grass/dirt/stone, trees, flowers, ponds → returns height(x, z)
 *   flat(world, { size: 64, top: 'grass' })                       // a flat ground slab (sports, racing, arenas)
 *   tree(world, x, y, z, 'oak' | 'pine' | 'birch' | 'maple' | 'palm')
 *   house(world, x, y, z, { w: 7, d: 6, floors: 1, wall: 'oak_planks', roof: 'shingles' })   // cottage with door, windows, pitched roof → { door: [x, y, z] }
 *   room(world, x0, y, z0, x1, z1, { h: 4, wall: 'wallpaper_floral', floor: 'dark_wood_floor' })   // interiors (Granny's house)
 *   pitch(world, cx, y, cz, { length: 64, width: 40 })            // football pitch: mown stripes, lines, circle, boxes → { goals: [[x,y,z,facing]…], halfLength, halfWidth }
 *   road(world, x0, z0, x1, z1, y, { lanes: 2 })                   // straight axis-aligned road with markings + kerbs + sidewalks
 *   raceTrack(world, points, y, { width: 9 })                      // closed loop through [x, z] points: asphalt, red/white kerbs, checkered start
 *   tower(world, x, y, z, { r: 3, h: 24 })                         // round stone tower with a top platform (viewpoints, castles)
 *   scatter(world, rng, n, area, fn)                               // call fn(x, topY, z) at n random ground spots
 */
import { Rng } from '@kit/rng';
import type { VoxelWorld } from './world';

type B = string;
const hash = (x: number, z: number, s: number) => { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** smooth value noise, 0..1 */
export function noise2(x: number, z: number, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t), u = s(xf), v = s(zf);
  const a = hash(xi, zi, seed), b = hash(xi + 1, zi, seed), c = hash(xi, zi + 1, seed), d = hash(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, z: number, seed: number) => noise2(x, z, seed) * 0.6 + noise2(x * 2.1, z * 2.1, seed + 7) * 0.28 + noise2(x * 4.3, z * 4.3, seed + 13) * 0.12;

export type Biome = 'plains' | 'forest' | 'desert' | 'snow' | 'jungle' | 'autumn';
const BIOMES: Record<Biome, { top: B; under: B; trees: ('oak' | 'pine' | 'birch' | 'maple' | 'palm')[]; treeChance: number; plants: B[]; plantChance: number }> = {
  plains: { top: 'grass', under: 'dirt', trees: ['oak', 'oak', 'birch'], treeChance: 0.006, plants: ['tall_grass', 'tall_grass', 'grass_tuft', 'flower_red', 'flower_yellow', 'flower_blue', 'flower_white'], plantChance: 0.14 },
  forest: { top: 'grass', under: 'dirt', trees: ['oak', 'birch', 'pine'], treeChance: 0.03, plants: ['fern', 'tall_grass', 'mushroom_brown', 'mushroom_red', 'bush'], plantChance: 0.12 },
  desert: { top: 'sand', under: 'sandstone', trees: ['palm'], treeChance: 0.002, plants: ['reeds'], plantChance: 0.01 },
  snow: { top: 'snowy_grass', under: 'dirt', trees: ['pine'], treeChance: 0.012, plants: ['fern'], plantChance: 0.02 },
  jungle: { top: 'grass', under: 'mud', trees: ['palm', 'oak', 'maple'], treeChance: 0.03, plants: ['fern', 'bush', 'tall_grass', 'flower_pink'], plantChance: 0.25 },
  autumn: { top: 'grass', under: 'dirt', trees: ['maple', 'maple', 'birch'], treeChance: 0.02, plants: ['tall_grass', 'mushroom_red', 'flower_yellow'], plantChance: 0.1 },
};

export interface TerrainOpts { size?: number; seed?: string | number; biome?: Biome; base?: number; hills?: number; scale?: number; water?: number | false; trees?: boolean; plants?: boolean; flatCenter?: number }
/** Rolling Minecraft hills centred on (0, 0). Returns the ground height function (y of the top block). */
export function terrain(world: VoxelWorld, o: TerrainOpts = {}) {
  const size = o.size ?? 96, half = size >> 1, base = o.base ?? 4, hills = o.hills ?? 7, scale = o.scale ?? 28;
  const seed = typeof o.seed === 'number' ? o.seed : [...String(o.seed ?? 'mc')].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) & 0xffff;
  const bio = BIOMES[o.biome ?? 'plains'], water = o.water === false ? -Infinity : o.water ?? base + 1;
  const rng = new Rng(seed);
  const height = (x: number, z: number) => {
    let h = base + Math.floor(fbm(x / scale, z / scale, seed) * hills);
    if (o.flatCenter) { const d = Math.max(Math.abs(x), Math.abs(z)), k = THREE_smooth(o.flatCenter, o.flatCenter + 10, d); h = Math.round(base + 1 + (h - base - 1) * k); }
    return h;
  };
  for (let z = -half; z < half; z++) for (let x = -half; x < half; x++) {
    const h = height(x, z);
    world.set(x, 0, z, 'bedrock');
    for (let y = 1; y <= h; y++) world.set(x, y, z, y < h - 3 ? 'stone' : y < h ? bio.under : h < water ? (o.biome === 'snow' ? 'gravel' : 'sand') : bio.top);
    for (let y = h + 1; y <= water; y++) world.set(x, y, z, o.biome === 'snow' && y === water ? 'ice' : 'water');
  }
  if (o.trees !== false) for (let z = -half + 3; z < half - 3; z++) for (let x = -half + 3; x < half - 3; x++) {
    const h = height(x, z);
    if (h < water + 0 || (o.flatCenter && Math.max(Math.abs(x), Math.abs(z)) < o.flatCenter + 4)) continue;
    if (rng.chance(bio.treeChance)) tree(world, x, h + 1, z, rng.pick(bio.trees), rng);
    else if (o.plants !== false && rng.chance(bio.plantChance) && world.get(x, h + 1, z) === 0) world.set(x, h + 1, z, rng.pick(bio.plants));
  }
  return height;
}
const THREE_smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A flat slab of ground: `top` on `depth` layers of `under`, y = 0..depth (top surface at y = depth + 1). */
export function flat(world: VoxelWorld, o: { size?: number; sizeZ?: number; top?: B; under?: B; depth?: number } = {}) {
  const hx = (o.size ?? 64) >> 1, hz = (o.sizeZ ?? o.size ?? 64) >> 1, d = o.depth ?? 2;
  world.fill(-hx, 0, -hz, hx - 1, d - 1, hz - 1, o.under ?? 'dirt');
  world.fill(-hx, d, -hz, hx - 1, d, hz - 1, o.top ?? 'grass');
  return d;   // y of the top layer
}

export function tree(world: VoxelWorld, x: number, y: number, z: number, kind: 'oak' | 'pine' | 'birch' | 'maple' | 'palm' = 'oak', rng = new Rng(x * 7 + z)) {
  const log = kind === 'birch' ? 'beech_log' : kind === 'palm' ? 'eucalyptus_log' : `${kind}_log`;
  const leaves = kind === 'birch' ? 'beech_leaves' : kind === 'palm' ? 'oak_leaves' : `${kind}_leaves`;
  const leaf = (lx: number, ly: number, lz: number) => { if (world.get(lx, ly, lz) === 0) world.set(lx, ly, lz, leaves); };
  if (kind === 'pine') {
    const h = rng.int(7, 10);
    for (let i = 0; i < h; i++) world.set(x, y + i, z, log);
    for (let ly = 2; ly <= h; ly++) { const r = ly === h ? 0 : (h - ly) % 3 === 0 ? 1 : Math.min(3, Math.ceil((h - ly) / 2.6)); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0)) leaf(x + dx, y + ly, z + dz); }
    leaf(x, y + h, z); leaf(x, y + h + 1, z);
    return;
  }
  if (kind === 'palm') {
    const h = rng.int(6, 8);
    for (let i = 0; i < h; i++) world.set(x + (i > h / 2 ? 1 : 0), y + i, z, log);
    const tx = x + 1, ty = y + h;
    leaf(tx, ty, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 3; k++) leaf(tx + dx * k, ty - (k === 3 ? 1 : 0), z + dz * k);
    return;
  }
  const h = rng.int(4, 6);
  for (let i = 0; i < h; i++) world.set(x, y + i, z, log);
  for (let ly = h - 2; ly <= h + 1; ly++) {
    const r = ly >= h ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && rng.chance(0.6)) continue;
      if (ly === h + 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
      leaf(x + dx, y + ly, z + dz);
    }
  }
}

export interface HouseOpts { w?: number; d?: number; floors?: number; wall?: B; corner?: B; floor?: B; roof?: B; trim?: B; door?: 'n' | 's' | 'e' | 'w'; lit?: boolean }
/** A cottage with log corners, windows on every side, a door gap and a stepped gable roof. (x, y, z) = the front-left ground corner. */
export function house(world: VoxelWorld, x: number, y: number, z: number, o: HouseOpts = {}) {
  const w = o.w ?? 7, d = o.d ?? 6, fh = 4, floors = o.floors ?? 1, H = fh * floors;
  const wall = o.wall ?? 'oak_planks', corner = o.corner ?? 'oak_log', roof = o.roof ?? 'shingles', floor = o.floor ?? 'dark_wood_floor';
  const x1 = x + w - 1, z1 = z + d - 1;
  world.fill(x, y - 1, z, x1, y - 1, z1, o.trim ?? 'cobblestone');
  world.fill(x, y, z, x1, y + H - 1, z1, wall, true);
  world.fill(x + 1, y, z + 1, x1 - 1, y + H - 1, z1 - 1, 0);
  for (let f = 0; f < floors; f++) world.fill(x + 1, y + f * fh - 1, z + 1, x1 - 1, y + f * fh - 1, z1 - 1, floor);
  for (const [cx, cz] of [[x, z], [x1, z], [x, z1], [x1, z1]]) world.fill(cx, y, cz, cx, y + H - 1, cz, corner);
  // windows: every 3rd block along each wall, at eye height on each floor
  const win = o.lit ? 'lit_window' : 'glass';
  for (let f = 0; f < floors; f++) {
    const wy = y + f * fh + 1;
    for (let i = 2; i < w - 2; i += 3) { world.set(x + i, wy, z, win); world.set(x + i, wy, z1, win); world.set(x + i, wy + 1, z, win); world.set(x + i, wy + 1, z1, win); }
    for (let i = 2; i < d - 2; i += 3) { world.set(x, wy, z + i, win); world.set(x1, wy, z + i, win); }
  }
  // door gap (2 high) in the middle of the chosen wall
  const side = o.door ?? 's', mx = x + (w >> 1), mz = z + (d >> 1);
  const door: [number, number, number] = side === 's' ? [mx, y, z] : side === 'n' ? [mx, y, z1] : side === 'w' ? [x, y, mz] : [x1, y, mz];
  world.set(door[0], y, door[2], 0); world.set(door[0], y + 1, door[2], 0);
  // gable roof along x: steps up from both long sides
  for (let k = 0; k <= (d >> 1) + 1; k++) {
    const ry = y + H + k, za = z - 1 + k, zb = z1 + 1 - k;
    if (za > zb) break;
    world.fill(x - 1, ry, za, x1 + 1, ry, za, roof); world.fill(x - 1, ry, zb, x1 + 1, ry, zb, roof);
    if (za + 1 <= zb - 1) { world.fill(x, ry, za + 1, x, ry, zb - 1, wall); world.fill(x1, ry, za + 1, x1, ry, zb - 1, wall); }
  }
  return { door, x0: x, z0: z, x1, z1, height: H };
}

/** An interior room (walls + floor + ceiling) between two corners; leaves door gaps you list as [x, z]. */
export function room(world: VoxelWorld, x0: number, y: number, z0: number, x1: number, z1: number, o: { h?: number; wall?: B; floor?: B; ceiling?: B; doors?: [number, number][]; windows?: boolean } = {}) {
  const h = o.h ?? 4;
  world.fill(x0, y - 1, z0, x1, y - 1, z1, o.floor ?? 'dark_wood_floor');
  world.fill(x0, y + h, z0, x1, y + h, z1, o.ceiling ?? 'plaster');
  for (let yy = y; yy < y + h; yy++) {
    world.fill(x0, yy, z0, x1, yy, z0, o.wall ?? 'wallpaper_floral'); world.fill(x0, yy, z1, x1, yy, z1, o.wall ?? 'wallpaper_floral');
    world.fill(x0, yy, z0, x0, yy, z1, o.wall ?? 'wallpaper_floral'); world.fill(x1, yy, z0, x1, yy, z1, o.wall ?? 'wallpaper_floral');
  }
  for (const [dx, dz] of o.doors ?? []) { world.set(dx, y, dz, 0); world.set(dx, y + 1, dz, 0); world.set(dx, y + 2, dz, 0); }
  if (o.windows) for (let i = x0 + 2; i < x1 - 1; i += 4) { world.set(i, y + 1, z0, 'window'); world.set(i, y + 1, z1, 'window'); }
}

/** A football pitch centred on (cx, cz), long axis along x, lines painted into the grass at height y. */
export function pitch(world: VoxelWorld, cx: number, y: number, cz: number, o: { length?: number; width?: number; stripe?: number } = {}) {
  const L = o.length ?? 64, W = o.width ?? 40, hl = L >> 1, hw = W >> 1, st = o.stripe ?? 4;
  for (let z = -hw - 4; z < hw + 4; z++) for (let x = -hl - 6; x < hl + 6; x++) {
    world.set(cx + x, y - 1, cz + z, 'dirt');
    world.fill(cx + x, y + 1, cz + z, cx + x, y + 16, cz + z, 0);   // clear hills / trees above the pitch
    const inside = Math.abs(x + 0.5) <= hl && Math.abs(z + 0.5) <= hw;
    world.set(cx + x, y, cz + z, inside && Math.floor((x + hl) / st) % 2 ? 'pitch_dark' : 'pitch');
  }
  const line = (x: number, z: number) => world.set(cx + x, y, cz + z, 'pitch_line');
  for (let x = -hl; x < hl; x++) { line(x, -hw); line(x, hw - 1); }
  for (let z = -hw; z < hw; z++) { line(-hl, z); line(hl - 1, z); line(0, z); }
  const R = Math.max(4, Math.round(W * 0.15));
  for (let a = 0; a < 360; a += 2) line(Math.round(Math.cos(a * Math.PI / 180) * R), Math.round(Math.sin(a * Math.PI / 180) * R));
  // penalty boxes + goal areas
  const box = (depth: number, half: number) => { for (const s of [-1, 1]) { const gx = s < 0 ? -hl : hl - 1, ix = gx - s * depth; for (let z = -half; z <= half; z++) line(ix, z); for (let k = 0; k <= depth; k++) { line(gx - s * k, -half); line(gx - s * k, half); } } };
  box(Math.round(L * 0.16), Math.round(W * 0.3)); box(Math.round(L * 0.06), Math.round(W * 0.14));
  line(Math.round(-hl + L * 0.11), 0); line(Math.round(hl - 1 - L * 0.11), 0);   // penalty spots
  return { goals: [[cx - hl, y + 1, cz, 1], [cx + hl, y + 1, cz, -1]] as [number, number, number, number][], halfLength: hl, halfWidth: hw };
}

/** Straight road between two points on one axis (x0 === x1 or z0 === z1), at height y. */
export function road(world: VoxelWorld, x0: number, z0: number, x1: number, z1: number, y: number, o: { lanes?: number; sidewalk?: number } = {}) {
  const lanes = o.lanes ?? 2, half = lanes * 2, sw = o.sidewalk ?? 3, alongX = z0 === z1;
  const [a, b] = alongX ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(z0, z1), Math.max(z0, z1)];
  const c = alongX ? z0 : x0;
  for (let t = a; t <= b; t++) for (let k = -half - sw; k < half + sw; k++) {
    const [x, z] = alongX ? [t, c + k] : [c + k, t];
    const edge = k === -half - 1 || k === half;
    const isRoad = k >= -half && k < half;
    world.set(x, y - 1, z, 'stone');
    if (isRoad) world.set(x, y - 1, z, (k === -1 || k === 0) && Math.abs(t) % 6 < 3 ? (alongX ? 'road_line' : 'road_line') : 'asphalt');
    else world.set(x, y, z, edge ? 'curb' : 'sidewalk');
  }
}

/** Closed race track through [x, z] control points (in order), asphalt at y-1 with alternating red/white kerbs; start line at points[0]. */
export function raceTrack(world: VoxelWorld, pts: [number, number][], y: number, o: { width?: number } = {}) {
  const hw = (o.width ?? 9) / 2, track = new Set<string>(), kerb = new Map<string, number>();
  const n = pts.length;
  // Catmull-Rom through the points → smooth centreline samples
  const samples: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let t = 0; t < 1; t += 0.02) {
      const t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      samples.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  samples.forEach(([sx, sz], i) => {
    for (let dz = -hw - 1; dz <= hw + 1; dz++) for (let dx = -hw - 1; dx <= hw + 1; dx++) {
      const d = Math.hypot(dx, dz), k = `${Math.round(sx + dx)},${Math.round(sz + dz)}`;
      if (d <= hw) track.add(k); else if (d <= hw + 1.2 && !kerb.has(k)) kerb.set(k, Math.floor(i / 6) % 2);
    }
  });
  for (const [k, c] of kerb) if (!track.has(k)) { const [x, z] = k.split(',').map(Number); world.set(x, y - 1, z, c ? 'race_red' : 'race_white'); }
  for (const k of track) { const [x, z] = k.split(',').map(Number); world.set(x, y - 1, z, 'asphalt'); }
  // checkered start line across the track at the first point
  const [sx, sz] = samples[0], [nx, nz] = samples[1], ang = Math.atan2(nz - sz, nx - sx);
  for (let s = -hw; s <= hw; s += 0.5) for (let w = 0; w < 2; w++) world.set(Math.round(sx - Math.sin(ang) * s + Math.cos(ang) * w), y - 1, Math.round(sz + Math.cos(ang) * s + Math.sin(ang) * w), 'checkered');
  return { samples, start: { x: sx, z: sz, heading: ang } };
}

export function tower(world: VoxelWorld, x: number, y: number, z: number, o: { r?: number; h?: number; wall?: B; top?: B } = {}) {
  const r = o.r ?? 3, h = o.h ?? 24, wall = o.wall ?? 'stone_bricks';
  for (let yy = y; yy < y + h; yy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dz);
    if (d <= r + 0.3 && d > r - 0.8) world.set(x + dx, yy, z + dz, (yy - y) % 6 === 3 && (dx === 0 || dz === 0) ? 'glass' : wall);
  }
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    const d = Math.hypot(dx, dz);
    if (d <= r + 1.3) world.set(x + dx, y + h, z + dz, o.top ?? 'oak_planks');
    if (d <= r + 1.3 && d > r + 0.3 && (dx + dz) % 2 === 0) world.set(x + dx, y + h + 1, z + dz, wall);
  }
  return { top: y + h + 1 };
}

/** Call fn at n random ground spots inside a square of half-size `area` around the origin. */
export function scatter(world: VoxelWorld, rng: Rng, n: number, area: number, fn: (x: number, y: number, z: number) => void) {
  for (let i = 0; i < n; i++) { const x = rng.int(-area, area), z = rng.int(-area, area), y = world.top(x, z); if (y > -Infinity) fn(x, y + 1, z); }
}

/**
 * The endless voxel path. The run is a chain of straight segments joined by 90° corners.
 * Segment coords: `s` = blocks along the segment from its start corner, `o` = lateral offset (lanes are o = -1, 0, 1).
 * The path surface is at y = 0, the ground far below at y = GROUND, held up by stone pillars.
 * Turns keep the overall heading within ±90° of north, so the path can never cross itself.
 */
import * as THREE from 'three';
import { Rng } from '@kit/rng';
import { type Blocks, tileTexture } from './blocks';

export const GROUND = -5;
/** sand and snow are near-white: darken the far-below ground so it doesn't blow out under the sun + fog */
const GROUND_TINT: Record<string, number> = { sand: 0xd8c08e, snow: 0xaebccc };
const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const fwd = (d: number) => DIRS[((d % 4) + 4) % 4];
export const right = (d: number) => fwd(d + 1);

export interface Biome { name: string; path: string[]; edge: string; ground: string; tree: 'oak' | 'spruce' | 'cactus'; hill: string; tint: number }
export const BIOMES: Biome[] = [
  { name: 'Plains', path: ['cobble', 'cobble', 'mossy', 'gravel', 'cobble'], edge: 'stonebrick', ground: 'grass_top', tree: 'oak', hill: 'grass', tint: 0xffffff },
  { name: 'Desert', path: ['sandstone', 'sandstone', 'sand'], edge: 'planks', ground: 'sand', tree: 'cactus', hill: 'sand', tint: 0xffffff },
  { name: 'Snowy Taiga', path: ['stonebrick', 'stone', 'cobble', 'gravel'], edge: 'stonebrick', ground: 'snow', tree: 'spruce', hill: 'snow', tint: 0xffffff },
];
export const biomeAt = (metres: number, every: number) => BIOMES[Math.floor(metres / every) % BIOMES.length];

export type ObKind = 'tnt' | 'wall' | 'beam' | 'gap';
export interface Ob { kind: ObKind; s: number; len: number; lanes: number[]; hit: boolean; group?: THREE.Group }
export interface Coin { s: number; o: number; y: number; alive: boolean }
export interface Seg {
  i: number; sx: number; sz: number; dir: number; len: number; turn: 1 | -1;
  /** metres run at this segment's start */
  start: number; biome: Biome;
  obs: Ob[]; coins: Coin[]; group: THREE.Group; coinMesh: THREE.InstancedMesh;
}

export class World {
  segs: Seg[] = [];
  private rng: Rng;
  private heading = 0;   // sum of turns so far, kept in -1..1
  private groundMats = new Map<string, THREE.MeshStandardMaterial>();
  private coinGeo: THREE.BoxGeometry;
  constructor(private scene: THREE.Scene, private B: Blocks, seed: string, private biomeEvery: () => number) {
    this.rng = new Rng(seed);
    this.coinGeo = B.geo.gold.clone().scale(0.42, 0.42, 0.42);
  }

  /** world x,z of a point on a segment */
  at(seg: Seg, s: number, o: number, out = new THREE.Vector3(), y = 0) {
    const f = fwd(seg.dir), r = right(seg.dir);
    return out.set(seg.sx + f[0] * s + r[0] * o, y, seg.sz + f[1] * s + r[1] * o);
  }

  groundMat(tile: string) {
    let m = this.groundMats.get(tile);
    if (!m) { const t = tileTexture(tile); m = new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: GROUND_TINT[tile] ?? 0xffffff }); this.groundMats.set(tile, m); }
    return m;
  }

  /** Make sure there are `ahead` segments in front of segment index `cur`; drop ones well behind. */
  ensure(cur: number, ahead = 5) {
    while (this.segs.length === 0 || this.segs[this.segs.length - 1].i < cur + ahead) this.add();
    while (this.segs.length && this.segs[0].i < cur - 1) {
      const s = this.segs.shift()!;
      this.scene.remove(s.group);
      s.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    }
  }
  seg(i: number) { return this.segs.find((s) => s.i === i)!; }

  private add() {
    const rng = this.rng, prev = this.segs[this.segs.length - 1];
    let sx = 0, sz = 0, dir = 0, start = 0, i = 0;
    if (prev) {
      const f = fwd(prev.dir);
      sx = prev.sx + f[0] * prev.len; sz = prev.sz + f[1] * prev.len;
      dir = prev.dir + prev.turn; start = prev.start + prev.len; i = prev.i + 1;
    }
    const len = i === 0 ? 70 : rng.int(32, 56);
    let turn: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    if (this.heading + turn > 1 || this.heading + turn < -1) turn = -turn as 1 | -1;
    this.heading += turn;
    const biome = biomeAt(start + len / 2, this.biomeEvery());
    const seg: Seg = { i, sx, sz, dir, len, turn, start, biome, obs: [], coins: [], group: new THREE.Group(), coinMesh: null! };
    this.plan(seg, prev?.turn ?? 0);
    this.build(seg, prev?.turn ?? 0);
    this.segs.push(seg);
    this.scene.add(seg.group);
  }

  /** Obstacles + coins. Density and variety ramp with distance. */
  private plan(seg: Seg, _prevTurn: number) {
    const rng = this.rng, D = seg.start;
    let s = seg.i === 0 ? 34 : 9;
    const end = seg.len - 9;
    while (s < end) {
      const kinds: ObKind[] = ['tnt', 'tnt', 'wall'];
      if (D + s > 60) kinds.push('beam', 'beam');
      if (D + s > 160) kinds.push('gap', 'gap');
      const kind = rng.pick(kinds);
      const lanes = rng.shuffle([-1, 0, 1]);
      let ob: Ob;
      if (kind === 'tnt') ob = { kind, s, len: 1, lanes: lanes.slice(0, D + s > 220 && rng.chance(0.35) ? 3 : rng.int(1, 2)), hit: false };
      else if (kind === 'wall') ob = { kind, s, len: 1, lanes: lanes.slice(0, rng.int(1, 2)), hit: false };
      else if (kind === 'beam') ob = { kind, s, len: 1, lanes: [-1, 0, 1], hit: false };
      else ob = { kind, s, len: rng.int(2, D > 600 ? 4 : 3), lanes: [-1, 0, 1], hit: false };
      seg.obs.push(ob);
      // coins: a line in a free lane before the obstacle, or an arc over a jumpable one
      const free = [-1, 0, 1].find((l) => !ob.lanes.includes(l));
      if ((kind === 'tnt' && ob.lanes.length === 3) || kind === 'gap') {
        const l = rng.pick([-1, 0, 1]);
        for (let k = -3; k <= 3 + ob.len; k++) { const t = (k + 3) / (6 + ob.len); seg.coins.push({ s: ob.s + k, o: l, y: 0.7 + Math.sin(t * Math.PI) * 1.7, alive: true }); }
      } else if (free !== undefined && rng.chance(0.75)) {
        for (let k = -5; k <= 1; k++) seg.coins.push({ s: ob.s + k, o: free, y: 0.7, alive: true });
      }
      const gap = Math.max(7, 15 - D / 120) + rng.range(0, 6) + ob.len;
      s += Math.round(gap);
    }
  }

  private build(seg: Seg, prevTurn: number) {
    const rng = this.rng, B = this.B, bi = seg.biome, len = seg.len;
    const cells = new Map<string, [string, number, number, number]>();
    const v = new THREE.Vector3();
    const put = (type: string, s: number, o: number, y: number) => {
      this.at(seg, s, o, v);
      const k = `${v.x},${y},${v.z}`;
      if (!cells.has(k)) cells.set(k, [type, v.x, y, v.z]);
    };
    const inGap = (s: number) => seg.obs.some((ob) => ob.kind === 'gap' && s >= ob.s && s < ob.s + ob.len);

    // corner walls first so the path never overwrites them: a dead end with a glowing arrow pointing the way
    const t = seg.turn;
    for (let o = -3; o <= 3; o++) for (let y = 0; y < 5; y++) {
      const ot = o * t, dy = Math.abs(y - 2);
      const arrow = (dy === 0 && ot >= -2) || (dy === 1 && (ot === 1 || ot === 2)) || (dy === 2 && ot === 1);
      put(arrow ? 'glowstone' : 'stonebrick', len + 3, o, y + 0.5);
    }
    for (let s = len - 2; s <= len + 3; s++) for (let y = 0; y < 5; y++) put('stonebrick', s, -t * 3, y + 0.5);

    // path surface + pillars + lanterns
    for (let s = 0; s <= len + 2; s++) {
      const corner = s >= len - 2;
      for (let o = -2; o <= 2; o++) {
        if (inGap(s)) continue;
        put(Math.abs(o) === 2 && !corner && (s > 2 || seg.i === 0) ? bi.edge : rng.pick(bi.path), s, o, -0.5);
      }
      if (inGap(s)) { for (let o = -2; o <= 2; o++) put('lava', s, o, GROUND + 0.5); continue; }
      if (s % 6 === 3 && s < len - 2) for (const o of [-2, 2]) for (let y = -1.5; y > GROUND; y--) put(bi.edge === 'planks' ? 'log' : 'stonebrick', s, o, y);
      if (s % 10 === 5 && s < len - 4) { const o = (s / 10) % 2 < 1 ? 2 : -2; put(bi.edge === 'planks' ? 'log' : 'stonebrick', s, o, 0.5); put('glowstone', s, o, 1.5); }
    }
    // obstacles: their own small groups so a stumble can smash them
    const box = (g: THREE.Group, type: string, s: number, o: number, y: number) => {
      const m = new THREE.Mesh(B.geo[type], B.material(type));
      this.at(seg, s, o, m.position, y); m.castShadow = m.receiveShadow = true; g.add(m);
    };
    for (const ob of seg.obs) {
      if (ob.kind === 'gap') continue;
      const g = new THREE.Group();
      if (ob.kind === 'tnt') for (const l of ob.lanes) box(g, 'tnt', ob.s, l, 0.5);
      if (ob.kind === 'wall') for (const l of ob.lanes) { box(g, 'cobble', ob.s, l, 0.5); box(g, 'cobble', ob.s, l, 1.5); }
      if (ob.kind === 'beam') { for (let o = -2; o <= 2; o++) box(g, 'log', ob.s, o, 1.5); box(g, 'log', ob.s, -2, 0.5); box(g, 'log', ob.s, 2, 0.5); }
      ob.group = g; seg.group.add(g);
    }

    // scenery on the ground: trees, hills. Keep clear of the next segment (turn side, near the corner) and the last one.
    const clear = (s: number, o: number) => !(Math.sign(o) === t && s > len - 13) && !(Math.sign(o) === prevTurn && s < 6) && s > -2;
    const tree = (s: number, o: number) => {
      const base = GROUND + 0.5;
      if (bi.tree === 'cactus') {
        const h = rng.int(5, 8); for (let y = 0; y < h; y++) put('cactus', s, o, base + y);
        if (rng.chance(0.5)) { const a = rng.pick([-1, 1]); put('cactus', s, o + a, base + 3); put('cactus', s, o + a, base + 4); }
        return;
      }
      const h = bi.tree === 'spruce' ? rng.int(8, 11) : rng.int(6, 9);
      for (let y = 0; y < h; y++) put('log', s, o, base + y);
      const leaf = bi.tree === 'spruce' ? 'spruce' : 'leaves';
      if (bi.tree === 'spruce') {
        for (let y = 3; y <= h; y++) { const r = Math.max(0, Math.round((h - y) / 2.5)); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (Math.abs(a) + Math.abs(b) <= r + 1 && (a || b || y >= h)) put(leaf, s + a, o + b, base + y); }
        put(leaf, s, o, base + h);
      } else {
        for (let y = h - 3; y <= h; y++) { const r = y >= h - 1 ? 1 : 2; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (!(Math.abs(a) === r && Math.abs(b) === r && rng.chance(0.6))) put(leaf, s + a, o + b, base + y); }
      }
    };
    for (let s = 0; s < len + 3; s += rng.int(2, 4)) for (const side of [-1, 1]) {
      const o = side * rng.int(5, 12);
      if (!clear(s, o) || rng.chance(0.35)) continue;
      if (rng.chance(0.7)) tree(s, o);
      else { const h = rng.int(1, 3); for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) for (let y = 0; y < h - (a === 1 ? 0 : 1); y++) put(bi.hill, s + a, o + b * side, GROUND + 0.5 + y); }
    }

    // one InstancedMesh per block type
    const byType = new Map<string, [number, number, number][]>();
    for (const [type, x, y, z] of cells.values()) { let a = byType.get(type); if (!a) byType.set(type, (a = [])); a.push([x, y, z]); }
    const m4 = new THREE.Matrix4();
    for (const [type, list] of byType) {
      const im = new THREE.InstancedMesh(B.geo[type], B.material(type), list.length);
      list.forEach(([x, y, z], k) => im.setMatrixAt(k, m4.makeTranslation(x, y, z)));
      im.castShadow = type !== 'lava' && type !== 'glowstone'; im.receiveShadow = true;
      im.computeBoundingSphere();
      seg.group.add(im);
    }
    // ground patch under this segment
    const gm = this.groundMat(bi.ground);
    const W = 34, L = len + 14;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, L), gm);
    plane.geometry.attributes.uv.array.forEach((_, k, a) => { (a as Float32Array)[k] *= k % 2 ? L : W; });
    plane.rotation.x = -Math.PI / 2; plane.rotation.z = -seg.dir * Math.PI / 2;
    this.at(seg, len / 2, 0, plane.position, GROUND + (seg.i % 2) * 0.004);
    plane.receiveShadow = true;
    seg.group.add(plane);
    // coins
    seg.coinMesh = new THREE.InstancedMesh(this.coinGeo, B.lit, Math.max(1, seg.coins.length));
    seg.coinMesh.castShadow = true; seg.coinMesh.frustumCulled = false;
    seg.group.add(seg.coinMesh);
    this.updateCoins(seg, 0);
  }

  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private sc = new THREE.Vector3(); private p = new THREE.Vector3(); private up = new THREE.Vector3(0, 1, 0);
  updateCoins(seg: Seg, t: number) {
    seg.coins.forEach((c, k) => {
      this.at(seg, c.s, c.o, this.p, c.y + Math.sin(t * 4 + c.s * 0.6) * 0.08);
      this.q.setFromAxisAngle(this.up, t * 3 + c.s * 0.4);
      this.sc.setScalar(c.alive ? 1 : 0);
      seg.coinMesh.setMatrixAt(k, this.m4.compose(this.p, this.q, this.sc));
    });
    seg.coinMesh.instanceMatrix.needsUpdate = true;
  }
}

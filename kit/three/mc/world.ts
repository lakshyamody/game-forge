/**
 * VoxelWorld: a Minecraft world you can edit. Blocks live in 16³ chunks; each chunk becomes one mesh per material
 * (hidden faces culled, Minecraft-style smooth corner shading baked into vertex colours), rebuilt only when it changes.
 * 1 block = 1 world unit; block (x, y, z) fills [x, x+1] × [y, y+1] × [z, z+1].
 *
 *   const blocks = await mcBlocks();
 *   const world = new VoxelWorld(blocks);  scene.add(world.group);
 *   world.fill(-32, 0, -32, 31, 3, 31, 'dirt');  world.fill(-32, 4, -32, 31, 4, 31, 'grass');
 *   world.set(0, 5, 0, 'oak_planks');  world.set(0, 5, 0, 0);          // 0 / 'air' removes
 *   world.update();                                                    // remesh what changed (call after edits, or every frame — it's cheap when clean)
 *   world.top(x, z)                                                    // y of the highest solid block in that column (or -Infinity)
 *   const hit = world.raycast(camera.position, dir, 6);                // { x, y, z, nx, ny, nz, id, dist } — break: set(hit) to 0, place: set(x+nx…)
 *   const r = world.move(pos, delta, 0.3, 1.8);                        // walk a feet-centred AABB (half-width, height) through the world → { ground, ceiling, wall }
 */
import * as THREE from 'three';
import type { McBlocks, BlockDef } from './blocks';

export const CS = 16;
type Bucket = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };
type MatKey = 'solid' | 'cutout' | 'glow' | 'water';

// faces: normal, 4 corners (counter-clockwise from outside), uvs follow corners (0,0) (1,0) (1,1) (0,1)
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tile: 1, shade: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tile: 1, shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: 0, shade: 1 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: 2, shade: 0.62 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tile: 1, shade: 0.9 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tile: 1, shade: 0.9 },
] as const;
const AO = [0.5, 0.68, 0.84, 1];

interface Chunk { data: Uint16Array; mesh: THREE.Group | null; dirty: boolean; cx: number; cy: number; cz: number }

export class VoxelWorld {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Chunk>();
  private kinds: BlockDef[];
  /** opaque: hides neighbours' faces + casts AO */
  private opaque: Uint8Array;
  private solid: Uint8Array;
  private cullSame: Uint8Array;
  /** Called with each new chunk mesh (e.g. to turn on shadows differently). */
  onMesh: ((m: THREE.Mesh) => void) | null = null;

  constructor(readonly blocks: McBlocks) {
    this.kinds = blocks.defs;
    const n = this.kinds.length;
    this.opaque = new Uint8Array(n); this.solid = new Uint8Array(n); this.cullSame = new Uint8Array(n);
    for (const d of this.kinds) {
      if (d.id === 0) continue;
      this.opaque[d.id] = +(d.kind === 'solid' || d.kind === 'glow');
      this.solid[d.id] = +(d.kind !== 'cross' && d.kind !== 'water');
      this.cullSame[d.id] = +(d.kind === 'water' || d.name.startsWith('glass') || d.name === 'window' || d.name === 'slime');
    }
    this.group.name = 'voxel-world';
  }

  private key(cx: number, cy: number, cz: number) { return `${cx},${cy},${cz}`; }
  private chunk(cx: number, cy: number, cz: number, create: boolean) {
    const k = this.key(cx, cy, cz);
    let c = this.chunks.get(k);
    if (!c && create) { c = { data: new Uint16Array(CS * CS * CS), mesh: null, dirty: true, cx, cy, cz }; this.chunks.set(k, c); }
    return c;
  }
  private last: Chunk | undefined;

  get(x: number, y: number, z: number): number {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = x >> 4, cy = y >> 4, cz = z >> 4;
    let c = this.last;
    if (!c || c.cx !== cx || c.cy !== cy || c.cz !== cz) { c = this.chunk(cx, cy, cz, false); if (!c) return 0; this.last = c; }
    return c.data[((y & 15) * CS + (z & 15)) * CS + (x & 15)];
  }
  def(x: number, y: number, z: number) { return this.kinds[this.get(x, y, z)]; }
  isSolid(x: number, y: number, z: number) { return this.solid[this.get(x, y, z)] === 1; }

  set(x: number, y: number, z: number, block: number | string) {
    const id = typeof block === 'string' ? (block === 'air' ? 0 : this.blocks.id(block)) : block;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = x >> 4, cy = y >> 4, cz = z >> 4, c = this.chunk(cx, cy, cz, id !== 0);
    if (!c) return;
    const i = ((y & 15) * CS + (z & 15)) * CS + (x & 15);
    if (c.data[i] === id) return;
    c.data[i] = id; c.dirty = true;
    // edge blocks change the neighbour chunk's faces + AO too
    const lx = x & 15, ly = y & 15, lz = z & 15;
    for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]]) {
      if ((dx < 0 && lx === 0) || (dx > 0 && lx === 15) || (dy < 0 && ly === 0) || (dy > 0 && ly === 15) || (dz < 0 && lz === 0) || (dz > 0 && lz === 15)) {
        const n = this.chunk(cx + dx, cy + dy, cz + dz, false); if (n) n.dirty = true;
      }
    }
  }
  /** Fill the inclusive box between two corners. `hollow` leaves the inside empty (rooms, boxes). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: number | string, hollow = false) {
    const id = typeof block === 'string' ? (block === 'air' ? 0 : this.blocks.id(block)) : block;
    const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0], [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0], [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0];
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      if (hollow && x > ax && x < bx && y > ay && y < by && z > az && z < bz) continue;
      this.set(x, y, z, id);
    }
  }
  /** y of the highest solid block in a column, searching down from `from`. */
  top(x: number, z: number, from = 128) {
    for (let y = from; y >= -64; y--) if (this.isSolid(x, y, z)) return y;
    return -Infinity;
  }
  clear() { for (const c of this.chunks.values()) this.dispose(c); this.chunks.clear(); this.last = undefined; }

  /** Remesh dirty chunks. Returns how many were rebuilt. */
  update(max = Infinity) {
    let n = 0;
    for (const c of this.chunks.values()) {
      if (!c.dirty) continue;
      this.mesh(c); c.dirty = false;
      if (++n >= max) break;
    }
    return n;
  }

  private dispose(c: Chunk) {
    if (!c.mesh) return;
    c.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.group.remove(c.mesh); c.mesh = null;
  }

  private mesh(c: Chunk) {
    this.dispose(c);
    const buckets: Partial<Record<MatKey, Bucket>> = {};
    const B = (k: MatKey) => (buckets[k] ??= { pos: [], nor: [], uv: [], col: [], idx: [] });
    const ox = c.cx * CS, oy = c.cy * CS, oz = c.cz * CS;
    const occ = (x: number, y: number, z: number) => this.opaque[this.get(x, y, z)];
    for (let ly = 0; ly < CS; ly++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const id = c.data[(ly * CS + lz) * CS + lx];
      if (!id) continue;
      const d = this.kinds[id], x = ox + lx, y = oy + ly, z = oz + lz;
      if (d.kind === 'cross') { this.cross(B('cutout'), d, lx, ly, lz); continue; }
      const b = B(d.kind);
      const waterTop = d.kind === 'water' && this.get(x, y + 1, z) !== id ? 14 / 16 : 1;
      for (const f of FACES) {
        const nid = this.get(x + f.n[0], y + f.n[1], z + f.n[2]);
        if (this.opaque[nid] || (nid === id && this.cullSame[id])) continue;
        const [u0, v0, u1, v1] = this.blocks.uv(d.tiles[f.tile]);
        const base = b.pos.length / 3;
        const ao: number[] = [];
        // tangent axes of this face
        const a = f.n[0] ? 0 : f.n[1] ? 1 : 2, t1 = a === 0 ? 1 : 0, t2 = a === 2 ? 1 : 2;
        for (let k = 0; k < 4; k++) {
          const cr = f.c[k];
          const py = cr[1] === 1 ? waterTop : 0;
          b.pos.push(lx + cr[0], ly + (d.kind === 'water' ? py : cr[1]), lz + cr[2]);
          b.nor.push(f.n[0], f.n[1], f.n[2]);
          b.uv.push(k === 0 || k === 3 ? u0 : u1, k < 2 ? v0 : v1);
          let l = 1;
          if (d.kind !== 'glow') {
            const p = [x + f.n[0], y + f.n[1], z + f.n[2]], s1 = [...p], s2 = [...p], cc = [...p];
            const d1 = cr[t1] ? 1 : -1, d2 = cr[t2] ? 1 : -1;
            s1[t1] += d1; s2[t2] += d2; cc[t1] += d1; cc[t2] += d2;
            const o1 = occ(s1[0], s1[1], s1[2]), o2 = occ(s2[0], s2[1], s2[2]), o3 = occ(cc[0], cc[1], cc[2]);
            const lvl = o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
            ao.push(lvl); l = AO[lvl] * f.shade;
          } else ao.push(3);
          b.col.push(l, l, l);
        }
        // flip the quad's diagonal so AO gradients don't crease
        if (ao[0] + ao[2] < ao[1] + ao[3]) b.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        else b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.Group();
    g.position.set(ox, oy, oz);
    for (const [k, b] of Object.entries(buckets) as [MatKey, Bucket][]) {
      if (!b.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, this.blocks.materials[k]);
      m.castShadow = k === 'solid' || k === 'cutout';
      m.receiveShadow = k !== 'glow';
      if (k === 'water') m.renderOrder = 1;
      this.onMesh?.(m);
      g.add(m);
    }
    if (g.children.length) { c.mesh = g; this.group.add(g); }
  }

  /** Flowers / grass: two crossed quads. */
  private cross(b: Bucket, d: BlockDef, lx: number, ly: number, lz: number) {
    const [u0, v0, u1, v1] = this.blocks.uv(d.tiles[0]);
    const k = 0.15;
    for (const [ax, az, bx, bz] of [[k, k, 1 - k, 1 - k], [k, 1 - k, 1 - k, k]]) {
      const base = b.pos.length / 3;
      b.pos.push(lx + ax, ly, lz + az, lx + bx, ly, lz + bz, lx + bx, ly + 1, lz + bz, lx + ax, ly + 1, lz + az);
      for (let i = 0; i < 4; i++) { b.nor.push(0, 1, 0); b.col.push(0.95, 0.95, 0.95); }
      b.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /** Voxel ray march (Amanatides & Woo). Hits anything that isn't air or water; `pick` filters further. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, max = 8, pick: (d: BlockDef) => boolean = (d) => d.kind !== 'water') {
    const d = dir.clone().normalize();
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
    let tx = (sx > 0 ? x + 1 - origin.x : origin.x - x) * tdx, ty = (sy > 0 ? y + 1 - origin.y : origin.y - y) * tdy, tz = (sz > 0 ? z + 1 - origin.z : origin.z - z) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= max) {
      const id = this.get(x, y, z);
      if (id && pick(this.kinds[id])) return { x, y, z, nx, ny, nz, id, dist: t, def: this.kinds[id] };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  /** Does a feet-centred box (half-width hw, height h) at p overlap a solid block? */
  overlaps(p: THREE.Vector3, hw: number, h: number) {
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + h - 1e-4); y++)
      for (let z = Math.floor(p.z - hw); z <= Math.floor(p.z + hw - 1e-4); z++)
        for (let x = Math.floor(p.x - hw); x <= Math.floor(p.x + hw - 1e-4); x++) if (this.isSolid(x, y, z)) return true;
    return false;
  }

  /**
   * Move a feet-centred AABB by `delta`, sliding along walls, one axis at a time (y first).
   * `step` auto-climbs ledges up to that height (0.6 ≈ slabs, 1.05 = whole blocks, for arcade games).
   */
  move(p: THREE.Vector3, delta: THREE.Vector3, hw = 0.3, h = 1.8, step = 0) {
    const out = { ground: false, ceiling: false, wall: false };
    const slice = (axis: 'x' | 'y' | 'z', amount: number) => {
      const n = Math.max(1, Math.ceil(Math.abs(amount) / 0.45));
      for (let i = 0; i < n; i++) {
        const prev = p[axis];
        p[axis] += amount / n;
        if (!this.overlaps(p, hw, h)) continue;
        if (axis !== 'y' && step > 0) {   // try stepping up
          const y0 = p.y;
          p.y = Math.floor(p.y) + 1 + 1e-3;
          if (p.y - y0 <= step + 1e-3 && !this.overlaps(p, hw, h)) continue;
          p.y = y0;
        }
        // snap to the block boundary
        if (axis === 'y') { if (amount < 0) { p.y = Math.floor(p.y) + 1; out.ground = true; } else { p.y = Math.floor(p.y + h) - h - 1e-3; out.ceiling = true; } }
        else { p[axis] = prev; out.wall = true; }
        return;
      }
    };
    slice('y', delta.y); slice('x', delta.x); slice('z', delta.z);
    if (!out.ground && delta.y <= 0) { p.y -= 0.01; out.ground = this.overlaps(p, hw, h); p.y += 0.01; }
    return out;
  }
}

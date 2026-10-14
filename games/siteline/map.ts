/**
 * The map: ASCII layout → walls, crates, site floors; grid line-of-sight and circle collision.
 * '#' wall · 'c' crate · 'A'/'B' plant sites · 'S' attacker spawn · '1'-'4' defender posts.
 */
import * as THREE from 'three';
import { Grid } from '@kit/grid';
import { loadTexture } from '@kit/assets';
import { CELL } from './config';

const ROWS = [
  '####################################',
  '#AAAAAAAAAA#.........#BBBBBBBBBBBBB#',
  '#AAcAA1AAAA#....c....#BBBBB3BBBcBBB#',
  '#AAAAAAAcAA..........BBBBBBBBBBBBBB#',
  '#AAAAAAAAAA#....2....#BBBcBBBBBBBBB#',
  '#AAAAAAAAAA#.........#BBBBBBBBBBBBB#',
  '#....#######...c.....#######...#...#',
  '#....#...............#.........#...#',
  '#....#..c.....##.....#....c..4.....#',
  '#..c.#........##.....#.........#...#',
  '#....#...............#...#######...#',
  '#..........c...........c...........#',
  '#....#...............#.............#',
  '#....####....####....####..........#',
  '#..................................#',
  '#.......c.....SSSS......c..........#',
  '#.............SSSS.................#',
  '####################################',
];
export const grid = Grid.fromAscii(ROWS, '#');
export const W = grid.w, H = grid.h;
export const blocked = (c: string | undefined) => c === undefined || c === '#' || c === 'c';
/** cell → world centre */
export const toWorld = (cx: number, cy: number) => ({ x: (cx + 0.5) * CELL - (W * CELL) / 2, z: (cy + 0.5) * CELL - (H * CELL) / 2 });
export const toCell = (x: number, z: number) => ({ x: Math.floor((x + (W * CELL) / 2) / CELL), y: Math.floor((z + (H * CELL) / 2) / CELL) });
export const cellAt = (x: number, z: number) => { const c = toCell(x, z); return grid.get(c.x, c.y); };
export const solidAt = (x: number, z: number) => blocked(cellAt(x, z));
export const siteAt = (x: number, z: number) => { const c = cellAt(x, z); return c === 'A' || c === '1' ? 'A' : c === 'B' || c === '3' ? 'B' : null; };
export const posts = ['1', '2', '3', '4'].map((k) => { const p = grid.find(k)!; return toWorld(p.x, p.y); });
export const spawns = grid.findAll('S').map((p) => toWorld(p.x, p.y));
export const walkable = (c: string) => !blocked(c);

/** distance along the xz ray to the first blocking cell (or max) — DDA through the grid */
export function rayWall(ox: number, oz: number, dx: number, dz: number, max = 120) {
  const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
  const step = 0.1;
  for (let t = 0; t < max; t += step) if (solidAt(ox + dx * t, oz + dz * t)) return t;
  return max;
}
/** clear line between two points (walls and crates block) */
export function lineClear(ax: number, az: number, bx: number, bz: number) {
  const d = Math.hypot(bx - ax, bz - az);
  return rayWall(ax, az, bx - ax, bz - az, d) >= d - 0.05;
}
/** move a circle through the grid with axis-separated collision */
export function slide(p: { x: number; z: number }, dx: number, dz: number, r: number) {
  const hit = (x: number, z: number) => solidAt(x - r, z - r) || solidAt(x + r, z - r) || solidAt(x - r, z + r) || solidAt(x + r, z + r);
  if (!hit(p.x + dx, p.z)) p.x += dx;
  if (!hit(p.x, p.z + dz)) p.z += dz;
}

/** Build the 3D level. Returns site markers for the HUD. */
export async function buildMap(scene: THREE.Scene) {
  const [plaster, sand, metal, concrete] = await Promise.all([
    loadTexture('painted_plaster_wall', { repeat: [1, 2] }), loadTexture('sand_01', { repeat: [W, H] }),
    loadTexture('rusty_metal_02', { repeat: 1 }), loadTexture('concrete_wall_003', { repeat: 1 }),
  ]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshStandardMaterial({ ...sand, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const walls: [number, number][] = [], crates: [number, number][] = [], site: [number, number, string][] = [];
  grid.forEach((c, x, y) => { if (c === '#') walls.push([x, y]); else if (c === 'c') crates.push([x, y]); if (c === 'A' || c === 'B' || c === '1' || c === '3') site.push([x, y, c]); });
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: [number, number][], y: number, tint?: (i: number) => number) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length); const o = new THREE.Object3D(); const col = new THREE.Color();
    list.forEach(([cx, cy], i) => { const w = toWorld(cx, cy); o.position.set(w.x, y, w.z); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (tint) m.setColorAt(i, col.setHex(tint(i))); });
    m.castShadow = m.receiveShadow = true; scene.add(m); return m;
  };
  inst(new THREE.BoxGeometry(CELL, 4.2, CELL), new THREE.MeshStandardMaterial({ ...plaster, color: 0xf2dcc0 }), walls, 2.1, (i) => (i % 7 === 0 ? 0xd8b48a : 0xffffff));
  inst(new THREE.BoxGeometry(CELL * 0.92, 2.2, CELL * 0.92), new THREE.MeshStandardMaterial({ ...metal, color: 0x7aa0b8 }), crates, 1.1);
  // site floors: concrete pads + a big painted letter
  const pad = new THREE.MeshStandardMaterial({ ...concrete, color: 0xc9c2b8 });
  inst(new THREE.BoxGeometry(CELL, 0.04, CELL), pad, site.map(([x, y]) => [x, y]), 0.02);
  const labels: { letter: string; x: number; z: number }[] = [];
  for (const L of ['A', 'B']) {
    const cells = site.filter((s) => s[2] === L || (L === 'A' ? s[2] === '1' : s[2] === '3'));
    const cx = cells.reduce((a, s) => a + s[0], 0) / cells.length, cy = cells.reduce((a, s) => a + s[1], 0) / cells.length;
    const w = toWorld(cx, cy);
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(255,70,85,.85)'; g.font = 'bold 110px Orbitron, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L, 64, 70);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(w.x, 0.06, w.z); scene.add(decal);
    labels.push({ letter: L, x: w.x, z: w.z });
  }
  return labels;
}

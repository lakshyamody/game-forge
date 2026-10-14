/**
 * Enemy village: generated layout for a level, KayKit medieval models fitted to footprints, walls,
 * and an occupancy grid (cell → building index) for troop pathing.
 */
import * as THREE from 'three';
import { Grid } from '@kit/grid';
import { Rng } from '@kit/rng';
import { loadModel, sizeOf } from '@kit/assets';
import { N, DEF } from './config';

export type Kind = 'townhall' | 'catapult' | 'archer' | 'mine' | 'storage' | 'barracks' | 'home' | 'wall';
const SPEC: Record<Kind, { model: string; size: number; hp: number; loot: number; name: string }> = {
  townhall: { model: 'kaykit-medieval-hexagon/building-castle-red', size: 4, hp: 1600, loot: 250, name: 'Town Hall' },
  catapult: { model: 'kaykit-medieval-hexagon/building-tower-catapult-red', size: 3, hp: 620, loot: 0, name: 'Catapult' },
  archer: { model: 'kaykit-medieval-hexagon/building-tower-a-red', size: 3, hp: 520, loot: 0, name: 'Archer Tower' },
  mine: { model: 'kaykit-medieval-hexagon/building-mine-red', size: 3, hp: 420, loot: 160, name: 'Gold Mine' },
  storage: { model: 'kaykit-medieval-hexagon/building-market-red', size: 3, hp: 760, loot: 380, name: 'Gold Storage' },
  barracks: { model: 'kaykit-medieval-hexagon/building-barracks-red', size: 3, hp: 380, loot: 0, name: 'Barracks' },
  home: { model: 'kaykit-medieval-hexagon/building-home-a-red', size: 2, hp: 260, loot: 30, name: 'Hut' },
  wall: { model: 'kaykit-medieval-hexagon/fence-stone-straight', size: 1, hp: 200, loot: 0, name: 'Wall' },
};

export interface Building {
  id: number; kind: Kind; x0: number; y0: number; size: number;
  hp: number; maxHp: number; alive: boolean; loot: number;
  x: number; z: number;                // world centre
  root: THREE.Group; flashT: number; cool: number; vertical?: boolean;
}
export const isDefense = (b: Building) => b.kind === 'catapult' || b.kind === 'archer';
export const cellToWorld = (c: number) => c - N / 2 + 0.5;
export const worldToCell = (w: number) => Math.floor(w + N / 2);

export class Village {
  buildings: Building[] = [];
  occ = new Grid<number>(N, N, -1);
  group = new THREE.Group();
  deployR = 0;   // Chebyshev half-size (cells, from centre) of the no-deploy square

  constructor(private scene: THREE.Scene) { scene.add(this.group); }

  async generate(level: number) {
    this.scene.remove(this.group); this.group = new THREE.Group(); this.scene.add(this.group);
    this.buildings = []; this.occ.cells.fill(-1);
    const rng = new Rng(`village-${level}`);
    const C = N / 2;
    const ring = level >= 2 ? 10 : 0, inner = level >= 4 ? 4 : 0;
    const onRing = (x: number, y: number, r: number) => r > 0 && Math.max(Math.abs(x - C + 0.5), Math.abs(y - C + 0.5)) === r - 0.5;
    const free = (x0: number, y0: number, s: number, pad = 1) => {
      for (let y = y0 - pad; y < y0 + s + pad; y++) for (let x = x0 - pad; x < x0 + s + pad; x++) {
        if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1 || this.occ.get(x, y)! >= 0) return false;
        if ((onRing(x, y, ring) || onRing(x, y, inner)) && y >= y0 && y < y0 + s && x >= x0 && x < x0 + s) return false;
      }
      return true;
    };
    const place = (kind: Kind, r0: number, r1: number) => {
      const s = SPEC[kind].size;
      for (let tries = 0; tries < 300; tries++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(r0, r1);
        const x0 = Math.round(C + Math.cos(a) * r - s / 2), y0 = Math.round(C + Math.sin(a) * r - s / 2);
        if (free(x0, y0, s)) return this.add(kind, x0, y0, level);
      }
      return null;
    };
    this.add('townhall', C - 2, C - 2, level);
    for (let i = 0; i < 1 + Math.floor(level / 3); i++) place('storage', inner ? 5.5 : 4, inner ? 7 : 6.5);
    for (let i = 0; i < 1 + Math.floor(level / 2); i++) place('catapult', 5, 8);
    for (let i = 0; i < 1 + Math.floor((level + 1) / 2); i++) place('archer', 5, 8.5);
    for (let i = 0; i < 2 + Math.floor(level / 2); i++) place('mine', ring ? 12 : 9, 14);
    place('barracks', ring ? 12 : 9, 14);
    for (let i = 0; i < 2 + level; i++) place('home', ring ? 12 : 8, 15);
    for (const r of [ring, inner]) if (r) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (onRing(x, y, r) && this.occ.get(x, y)! < 0) {
      const b = this.add('wall', x, y, level); b.vertical = Math.abs(x - C + 0.5) === r - 0.5 && Math.abs(y - C + 0.5) !== r - 0.5;
    }
    this.deployR = Math.max(...this.buildings.map((b) => Math.max(Math.abs(b.x0 - C), Math.abs(b.x0 + b.size - C), Math.abs(b.y0 - C), Math.abs(b.y0 + b.size - C)))) + 1;
    await Promise.all(this.buildings.map((b) => this.dress(b)));
  }

  private add(kind: Kind, x0: number, y0: number, level: number) {
    const s = SPEC[kind], hp = Math.round(s.hp * (1 + (level - 1) * DEF.hpPerLevel));
    const b: Building = { id: this.buildings.length, kind, x0, y0, size: s.size, hp, maxHp: hp, alive: true, loot: Math.round(s.loot * (1 + (level - 1) * 0.35)), x: cellToWorld(x0) + (s.size - 1) / 2, z: cellToWorld(y0) + (s.size - 1) / 2, root: new THREE.Group(), flashT: 0, cool: Math.random() };
    for (let y = y0; y < y0 + s.size; y++) for (let x = x0; x < x0 + s.size; x++) this.occ.set(x, y, b.id);
    this.buildings.push(b);
    return b;
  }

  private async dress(b: Building) {
    const m = await loadModel(SPEC[b.kind].model);
    const sz = sizeOf(m), fit = (b.size * (b.kind === 'wall' ? 1.02 : 0.92)) / Math.max(sz.x, sz.z);
    m.scale.multiplyScalar(b.kind === 'wall' ? 1 : fit);
    if (b.kind === 'wall') { m.scale.set(fit, fit * 1.6, fit); if (!b.vertical) m.rotation.y = Math.PI / 2; }   // the fence model runs along z
    const box = new THREE.Box3().setFromObject(m); m.position.y = -box.min.y;
    b.root.add(m); b.root.position.set(b.x, 0, b.z); this.group.add(b.root);
    b.root.userData.mats = [] as THREE.MeshStandardMaterial[];
    m.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { const mat = (mesh.material as THREE.MeshStandardMaterial).clone(); mesh.material = mat; b.root.userData.mats.push(mat); } });
  }

  /** knock a building down: swap to rubble, free its cells */
  async destroy(b: Building) {
    b.alive = false;
    for (let y = b.y0; y < b.y0 + b.size; y++) for (let x = b.x0; x < b.x0 + b.size; x++) this.occ.set(x, y, -1);
    b.root.clear();
    if (b.kind === 'wall') return;
    const r = await loadModel('kaykit-medieval-hexagon/building-destroyed');
    const sz = sizeOf(r); r.scale.multiplyScalar((b.size * 0.85) / Math.max(sz.x, sz.z));
    b.root.add(r);
  }

  name(b: Building) { return SPEC[b.kind].name; }
  /** distance from a point to the building's footprint edge */
  dist(b: Building, x: number, z: number) {
    const h = b.size / 2;
    const dx = Math.max(Math.abs(x - b.x) - h, 0), dz = Math.max(Math.abs(z - b.z) - h, 0);
    return Math.hypot(dx, dz);
  }
  destruction() {
    const list = this.buildings.filter((b) => b.kind !== 'wall');
    return list.filter((b) => !b.alive).length / list.length;
  }
}

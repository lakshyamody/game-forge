/**
 * Minecraft-style pixel textures generated in code → one 16px-tile atlas (copied from block-racer, + stone bricks, moss, gravel, emerald).
 * Each block type gets a BoxGeometry with per-face UVs into the atlas, so a whole
 * chunk of one block type is a single draw call (InstancedMesh).
 */
import * as THREE from 'three';
import { Rng } from '@kit/rng';

const T = 16, COLS = 8, ROWS = 4;
type RGB = [number, number, number];
const TILE: Record<string, number> = {};
let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D;

function tile(name: string, fn: (x: number, y: number, r: number, rng: Rng) => RGB) {
  const i = Object.keys(TILE).length;
  TILE[name] = i;
  const rng = new Rng(name);
  const ox = (i % COLS) * T, oy = Math.floor(i / COLS) * T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const [r, g, b] = fn(x, y, rng.next(), rng);
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  }
}
const vary = (c: RGB, r: number, amt: number): RGB => { const k = (r - 0.5) * amt; return [c[0] + k, c[1] + k, c[2] + k]; };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const DIRT: RGB = [134, 96, 67], GRASS: RGB = [95, 159, 53], STONE: RGB = [125, 125, 125];

function paint() {
  canvas = document.createElement('canvas');
  canvas.width = COLS * T; canvas.height = ROWS * T;
  ctx = canvas.getContext('2d')!;
  tile('grass_top', (_x, _y, r) => vary(GRASS, r, 40));
  tile('grass_side', (x, y, r, g) => (y < 3 || (y === 3 && g.chance(0.5)) || (y === 4 && x % 3 === 0 && r < 0.5) ? vary(GRASS, r, 35) : vary(DIRT, r, 35)));
  tile('dirt', (_x, _y, r) => vary(DIRT, r, 40));
  tile('stone', (_x, _y, r) => vary(STONE, r, r > 0.85 ? 60 : 25));
  tile('cobble', (x, y, r) => { const edge = (x * 7 + y * 3) % 5 === 0 || (x + y * 5) % 7 === 0; return vary(edge ? [85, 85, 85] : [130, 130, 130], r, 30); });
  tile('sand', (_x, _y, r) => vary([206, 184, 132], r, 20));
  tile('sandstone', (_x, y, r) => vary(y % 5 === 0 ? [168, 146, 98] : [200, 178, 128], r, 16));
  tile('snow', (_x, _y, r) => vary([240, 250, 252], r, 10));
  tile('snow_side', (x, y, r) => (y < 4 || (y === 4 && x % 2 === 0) ? vary([240, 250, 252], r, 10) : vary(DIRT, r, 35)));
  tile('log', (x, _y, r) => vary(x % 4 === 0 ? [80, 62, 38] : [104, 82, 50], r, 20));
  tile('log_top', (x, y, r) => { const d = Math.hypot(x - 7.5, y - 7.5); return vary(d > 6.5 ? [104, 82, 50] : Math.floor(d) % 2 ? [176, 143, 88] : [150, 120, 72], r, 12); });
  tile('leaves', (_x, _y, r) => (r < 0.18 ? [30, 70, 20] : vary([60, 140, 40], r, 50)));
  tile('spruce', (_x, _y, r) => (r < 0.2 ? [20, 45, 28] : vary([45, 92, 55], r, 35)));
  tile('planks', (x, y, r) => (y % 4 === 3 || (x === ((Math.floor(y / 4) * 5) % 16)) ? [110, 86, 50] : vary([168, 136, 82], r, 20)));
  tile('tnt_side', (x, y, r) => (y >= 5 && y <= 10 ? ((x >= 3 && x <= 12 && (y === 7 || y === 8) && x % 3 !== 0) ? [30, 30, 30] : vary([235, 235, 235], r, 10)) : vary([200, 50, 40], r, 30)));
  tile('tnt_top', (x, y, r) => (Math.hypot(x - 7.5, y - 7.5) < 2.5 ? [60, 60, 60] : vary([200, 60, 50], r, 25)));
  tile('gold', (x, y, r) => vary((x + y) % 7 === 0 ? [255, 250, 180] : [248, 210, 60], r, 25));
  tile('glowstone', (_x, _y, r) => vary(r > 0.7 ? [255, 240, 180] : [215, 165, 90], r, 40));
  tile('road', (_x, _y, r) => vary([72, 72, 78], r, r > 0.92 ? 40 : 14));
  tile('road_line', (x, _y, r) => (x >= 6 && x <= 9 ? vary([240, 220, 90], r, 12) : vary([72, 72, 78], r, 14)));
  tile('curb_red', (_x, _y, r) => vary([205, 45, 45], r, 18));
  tile('curb_white', (_x, _y, r) => vary([236, 236, 236], r, 10));
  tile('netherrack', (_x, _y, r, g) => vary(g.chance(0.2) ? [80, 25, 25] : [118, 42, 42], r, 30));
  tile('lava', (x, y, r) => mix([210, 80, 10], [255, 200, 50], (Math.sin(x * 0.9 + y * 0.6) * 0.5 + 0.5) * 0.8 + r * 0.2));
  tile('cactus', (x, _y, r) => vary(x % 4 === 1 ? [40, 100, 40] : [70, 145, 60], r, 20));
  tile('cactus_top', (_x, _y, r) => vary([90, 160, 75], r, 20));
  tile('ice', (_x, _y, r) => vary([150, 190, 250], r, 20));
  tile('obsidian', (_x, _y, r) => vary(r > 0.9 ? [80, 50, 120] : [25, 18, 38], r, 15));
  tile('stonebrick', (x, y, r) => (y % 8 === 7 || x === (y < 8 ? 0 : 8) ? vary([88, 88, 92], r, 12) : vary([138, 138, 142], r, 22)));
  tile('mossy', (x, y, r, g) => { const edge = (x * 7 + y * 3) % 5 === 0 || (x + y * 5) % 7 === 0; return g.chance(0.35) ? vary([76, 120, 52], r, 30) : vary(edge ? [85, 85, 85] : [128, 128, 124], r, 30); });
  tile('gravel', (_x, _y, r, g) => vary(g.chance(0.3) ? [100, 92, 88] : [150, 140, 136], r, 40));
  tile('emerald', (x, y, r) => vary((x + y) % 5 === 0 ? [200, 255, 220] : [40, 200, 100], r, 25));
}

export type Face = 'top' | 'side' | 'bottom';
const DEFS: Record<string, [string, string, string] | string> = {
  grass: ['grass_top', 'grass_side', 'dirt'], dirt: 'dirt', stone: 'stone', cobble: 'cobble',
  sand: 'sand', sandstone: 'sandstone', snow: ['snow', 'snow_side', 'dirt'], log: ['log_top', 'log', 'log_top'],
  leaves: 'leaves', spruce: 'spruce', planks: 'planks', tnt: ['tnt_top', 'tnt_side', 'tnt_top'], gold: 'gold',
  glowstone: 'glowstone', road: 'road', road_line: 'road_line', curb_red: 'curb_red', curb_white: 'curb_white',
  netherrack: 'netherrack', lava: 'lava', cactus: ['cactus_top', 'cactus', 'cactus_top'], ice: 'ice', obsidian: 'obsidian',
  stonebrick: 'stonebrick', mossy: 'mossy', gravel: 'gravel', emerald: 'emerald',
};
export type BlockType = keyof typeof DEFS;
/** Blocks drawn unlit (they glow). */
const GLOW = new Set(['glowstone', 'lava']);
/** One tile as its own repeating texture (ground planes). */
export function tileTexture(name: string) {
  const c = document.createElement('canvas'); c.width = c.height = T;
  const t = TILE[name], ox = (t % COLS) * T, oy = Math.floor(t / COLS) * T;
  c.getContext('2d')!.drawImage(canvas, ox, oy, T, T, 0, 0, T, T);
  const tx = new THREE.CanvasTexture(c);
  tx.magFilter = THREE.NearestFilter; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

/** Average colour of a block (for debris particles). */
export const BLOCK_COLOR: Record<string, number> = {
  grass: 0x5f9f35, dirt: 0x86603f, stone: 0x7d7d7d, cobble: 0x808080, sand: 0xdbcfa3, sandstone: 0xd8cb9b, snow: 0xf0fafc,
  log: 0x685232, leaves: 0x3c8c28, spruce: 0x2d5c37, planks: 0xa8884f, tnt: 0xc83228, gold: 0xf8d23c, glowstone: 0xf0c070,
  road: 0x48484e, road_line: 0xf0dc5a, curb_red: 0xcd2d2d, curb_white: 0xececec, netherrack: 0x762a2a, lava: 0xff8c1e,
  cactus: 0x46913c, ice: 0x96bef9, obsidian: 0x1a1226, stonebrick: 0x8a8a8e, mossy: 0x6a7a58, gravel: 0x8c8480, emerald: 0x28c864,
};

export interface Blocks { geo: Record<string, THREE.BoxGeometry>; lit: THREE.Material; glow: THREE.Material; material: (t: string) => THREE.Material; atlas: THREE.Texture }

export function makeBlocks(): Blocks {
  paint();
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.colorSpace = THREE.SRGBColorSpace;
  const lit = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.92, metalness: 0 });
  const glow = new THREE.MeshBasicMaterial({ map: atlas });
  const inset = 0.5 / T;
  const geo: Record<string, THREE.BoxGeometry> = {};
  for (const [name, def] of Object.entries(DEFS)) {
    const [top, side, bottom] = typeof def === 'string' ? [def, def, def] : def;
    const g = new THREE.BoxGeometry(1, 1, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // BoxGeometry faces: +x, -x, +y, -y, +z, -z — 4 vertices each
    for (let f = 0; f < 6; f++) {
      const t = TILE[f === 2 ? top : f === 3 ? bottom : side];
      const col = t % COLS, row = Math.floor(t / COLS);
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v, u0 = uv.getX(i), v0 = uv.getY(i);
        uv.setXY(i, (col + inset + u0 * (1 - 2 * inset)) / COLS, 1 - (row + inset + (1 - v0) * (1 - 2 * inset)) / ROWS);
      }
    }
    uv.needsUpdate = true;
    geo[name] = g;
  }
  return { geo, lit, glow, atlas, material: (t) => (GLOW.has(t) ? glow : lit) };
}

/** A texture with text on it (checkpoint banners). */
export function bannerTexture(text: string, bg = '#3a2a5e', fg = '#ffe14d') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 512, 64);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(3, 3, 506, 58);
  g.fillStyle = fg; g.font = '28px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Glowing chevron tile for boost pads. */
export function boostTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#123a5a'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#5ff0ff';
  for (const oy of [2, 14]) for (let i = 0; i < 6; i++) { g.fillRect(4 + i * 2, oy + 12 - i * 2, 2, 2); g.fillRect(26 - i * 2, oy + 12 - i * 2, 2, 2); g.fillRect(14, oy + 2, 4, 2); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

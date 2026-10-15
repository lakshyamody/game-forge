/**
 * Minecraft blocks: ~150 block types with 16 px textures (CC0 library art from `sprites/mc-blocks` + `sprites/voxel-pack`,
 * plus painted-in-code ones: wool and concrete in 16 colours, roads, football pitch, bricks, ore blocks, TNT, wallpaper,
 * tiles, neon…), packed into one atlas. VoxelWorld (world.ts) meshes them; you rarely touch this file directly.
 *
 *   const blocks = await mcBlocks();             // loads the PNGs once, builds the atlas + materials
 *   blocks.id('oak_planks')                      // numeric id stored in the world (0 = air)
 *   blocks.def(id).kind                          // 'solid' | 'cutout' (leaves, glass) | 'glow' | 'water' | 'cross' (flowers, grass tufts)
 *   blocks.cube('tnt')                           // a standalone 1×1×1 mesh of a block (falling blocks, pickups, UI)
 *   blocks.tileTexture('grass_top', 200)         // one tile as a repeating texture (giant ground planes)
 *   BLOCK_NAMES                                  // every block name (see the table below for what's there)
 *
 * Colours: wool_*, concrete_*, glass_* (stained), neon_* (glowing) exist for every DYES colour:
 * white orange magenta light_blue yellow lime pink gray light_gray cyan purple blue brown green red black.
 */
import * as THREE from 'three';
import { assetUrl } from '@kit/assets';
import { Rng } from '@kit/rng';
import { type RGB, rgb, vary, mix, shade, loadImage, pixelTexture } from './pixels';

export const T = 16;                          // pixels per block face
export type BlockKind = 'solid' | 'cutout' | 'glow' | 'water' | 'cross';
type Painter = (x: number, y: number, r: number, g: Rng) => RGB | null;
type Src = string | Painter | { sheet: string; col: number; row: number };   // PNG path | painted | a cell of a 16px tilemap
interface Spec { top: Src; side?: Src; bottom?: Src; kind?: BlockKind; color?: number }

// ---------------------------------------------------------------- library art (string literals: the ship script copies what it sees)
const NAT = (n: string) => `sprites/mc-blocks/natural/${n}.png`;
const STONES = (n: string) => `sprites/mc-blocks/stones/${n}.png`;
const VOX = (n: string) => `sprites/voxel-pack/PNG/Tiles/${n}.png`;
const PLANTS = 'sprites/mc-blocks/natural/_tilemap.png';            // rows 8+ of this 10×16 sheet are flowers, grass, crops
const plant = (col: number, row: number): Src => ({ sheet: PLANTS, col, row });

// ---------------------------------------------------------------- painters
export const DYES: Record<string, number> = {
  white: 0xe9ecec, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919, pink: 0xed8dac, gray: 0x3e4447,
  light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519,
};
const flat = (c: RGB, amt = 8): Painter => (_x, _y, r) => vary(c, r, amt);
const wool = (c: RGB): Painter => (x, y, r) => vary(shade(c, ((x + (y >> 1)) % 4 === 0 ? 0.9 : 1) * (y % 4 === 0 ? 0.95 : 1)), r, 22);
const concrete = (c: RGB): Painter => (_x, _y, r) => vary(c, r, 7);
const stained = (c: RGB): Painter => (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? shade(c, 0.75) : (x + y === 10 || x + y === 12) && x > 2 ? mix(c, [255, 255, 255], 0.5) : null);
const neon = (c: RGB): Painter => (x, y, r) => { const e = Math.min(x, y, 15 - x, 15 - y); return e === 0 ? shade(c, 0.55) : e === 1 ? mix(c, [255, 255, 255], 0.55) : vary(mix(c, [255, 255, 255], 0.2), r, 14); };
const bricks = (c: RGB, mortar: RGB): Painter => (x, y, r) => (y % 4 === 3 || x === ((y >> 2) % 2 ? 4 : 12) ? vary(mortar, r, 10) : vary(shade(c, y % 4 === 0 ? 1.12 : 1), r, 24));
const tiles = (a: RGB, b: RGB, n = 8): Painter => (x, y, r) => (x % n === n - 1 || y % n === n - 1 ? vary(shade(a, 0.75), r, 6) : vary(((x / n | 0) + (y / n | 0)) % 2 ? b : a, r, 8));
const metal = (c: RGB): Painter => (x, y, r) => (x === 0 || y === 0 ? shade(c, 1.25) : x === 15 || y === 15 ? shade(c, 0.7) : (x === 1 || y === 1) ? shade(c, 1.12) : vary(c, r, 10));
const gemBlock = (c: RGB): Painter => (x, y, r) => (x === 0 || y === 0 || x === 15 || y === 15 ? shade(c, 0.7) : (x + y) % 7 === 0 ? mix(c, [255, 255, 255], 0.6) : vary(c, r, 18));
const stripes = (a: RGB, b: RGB, w: number, vertical = false): Painter => (x, y, r) => vary(((vertical ? x : y) / w | 0) % 2 ? b : a, r, 10);
const wallpaper = (bg: RGB, fg: RGB): Painter => (x, y, r) => { const fx = (x + 4) % 8, fy = (y + (x >> 3) * 4) % 8; return fx >= 3 && fx <= 4 && fy >= 2 && fy <= 5 || fy >= 3 && fy <= 4 && fx >= 2 && fx <= 5 ? vary(fg, r, 12) : x % 8 === 0 ? shade(bg, 0.93) : vary(bg, r, 6); };
const grassy = (c: RGB): Painter => (_x, _y, r, g) => vary(g.chance(0.12) ? shade(c, 0.82) : c, r, 26);

const GRASS: RGB = [104, 168, 64], ASPHALT: RGB = [62, 63, 68], CHALK: RGB = [236, 238, 232];

const SPECS: Record<string, Spec> = {
  // natural (library art)
  grass: { top: NAT('grass_top'), side: NAT('grass_side'), bottom: NAT('dirt'), color: 0x6aa84f },
  dirt: { top: NAT('dirt'), color: 0x86603f }, mud: { top: NAT('mud'), color: 0x4f3d33 }, farmland: { top: NAT('farmland'), side: NAT('dirt'), color: 0x5c3f28 },
  stone: { top: NAT('stone_generic'), color: 0x7d7d7d }, cobblestone: { top: NAT('cobblestone'), color: 0x7a7a7a },
  mossy_cobblestone: { top: NAT('cobblestone_mossy'), color: 0x6a7a58 }, cobble_bricks: { top: NAT('cobblestone_bricks'), color: 0x7a7a7a },
  mossy_bricks: { top: NAT('cobblestone_bricks_mossy'), color: 0x6a7a58 },
  sand: { top: NAT('sand_ugly'), color: 0xdbcfa3 }, gravel: { top: NAT('gravel'), color: 0x8c8480 }, snow: { top: NAT('snow'), color: 0xf0fafc },
  snowy_grass: { top: NAT('snow'), side: NAT('grass_snowy_side'), bottom: NAT('dirt'), color: 0xf0fafc },
  sandstone: { top: NAT('sandstone_tiles'), side: NAT('sandstone'), color: 0xd8cb9b }, sandstone_bricks: { top: NAT('sandstone_bricks'), color: 0xd8cb9b },
  carved_sandstone: { top: NAT('sandstone_tiles'), side: NAT('sandstone_carved'), color: 0xd8cb9b },
  ice: { top: NAT('ice_glacier'), color: 0x96bef9 }, icicles: { top: NAT('ice_icicles'), color: 0x96bef9 }, glass: { top: NAT('glass'), kind: 'cutout', color: 0xdff4ff },
  obsidian: { top: NAT('obsidian'), color: 0x1a1226 }, granite: { top: NAT('granite'), color: 0x9a6b5a }, granite_bricks: { top: NAT('granite_bricks'), color: 0x9a6b5a },
  diorite: { top: NAT('diorite'), color: 0xc8c8c8 }, marble: { top: NAT('marble'), color: 0xe6e2dc }, marble_bricks: { top: NAT('marble_bricks'), color: 0xe6e2dc },
  marble_tiles: { top: NAT('marble_bricks3'), color: 0xe6e2dc }, limestone: { top: NAT('limestone'), color: 0xd6cfb4 }, limestone_bricks: { top: NAT('limestone_bricks'), color: 0xd6cfb4 },
  slate: { top: NAT('slate'), color: 0x55585e }, slate_tiles: { top: NAT('slate_tiles'), color: 0x55585e }, basalt: { top: NAT('basalt'), color: 0x48484c },
  mud_bricks: { top: NAT('mud_bricks'), color: 0x8a6a4a }, gabbro: { top: NAT('gabbro'), color: 0x4a4a4a }, schist: { top: NAT('schist'), color: 0x8a8a7a },
  rhyolite_tiles: { top: NAT('rhyolite_tiles'), color: 0xb08070 }, serpentine_bricks: { top: NAT('serpentine_bricks'), color: 0x5a7a5a },
  amethyst: { top: NAT('amethyst'), color: 0x8a5ab0 }, hay: { top: NAT('hay_top'), side: NAT('hay_side'), color: 0xd8b43c },
  crystal_ore: { top: NAT('stone_generic_ore_crystalline'), color: 0x8a9aaa }, nugget_ore: { top: NAT('stone_generic_ore_nuggets'), color: 0x9a8a6a },
  coral: { top: NAT('coral_block_brain'), color: 0xd06090 }, coral_blue: { top: NAT('coral_block_pore'), color: 0x4070d0 },
  coral_yellow: { top: NAT('coral_block_star'), color: 0xd0c040 }, coral_red: { top: NAT('coral_block_cauliflower'), color: 0xc04040 },
  // wood: log (bark sides, rings on top/bottom), planks, leaves
  oak_log: { top: NAT('oak_log_top'), side: NAT('oak_log_side'), color: 0x6b5232 }, oak_planks: { top: NAT('oak_planks'), color: 0xa8884f }, oak_leaves: { top: NAT('oak_leaves'), kind: 'cutout', color: 0x4c8c2c },
  pine_log: { top: NAT('pine_log_top'), side: NAT('pine_log_side'), color: 0x4a3a28 }, pine_planks: { top: NAT('pine_planks'), color: 0x7a5a3a }, pine_leaves: { top: NAT('pine_leaves'), kind: 'cutout', color: 0x2d5c37 },
  beech_log: { top: NAT('beech_log_top'), side: NAT('beech_log_side'), color: 0xb0a890 }, beech_planks: { top: NAT('beech_planks'), color: 0xc8b088 }, beech_leaves: { top: NAT('beech_leaves'), kind: 'cutout', color: 0x6a9a3a },
  maple_log: { top: NAT('maple_log_top'), side: NAT('maple_log_side'), color: 0x6a4a3a }, maple_planks: { top: NAT('maple_planks'), color: 0xb07050 }, maple_leaves: { top: NAT('maple_leaves'), kind: 'cutout', color: 0xc85a28 },
  eucalyptus_log: { top: NAT('eucalyptus_log_top'), side: NAT('eucalyptus_log_side'), color: 0x9a9a8a }, eucalyptus_planks: { top: NAT('eucalyptus_planks'), color: 0xb09a7a }, eucalyptus_leaves: { top: NAT('eucalyptus_leaves'), kind: 'cutout', color: 0x6a8a6a },
  // ores + utility blocks (Kenney voxel pack)
  coal_ore: { top: VOX('stone_coal'), color: 0x6a6a6a }, iron_ore: { top: VOX('stone_iron'), color: 0x8a7a6a }, gold_ore: { top: VOX('stone_gold'), color: 0x9a8a5a },
  diamond_ore: { top: VOX('stone_diamond'), color: 0x6a9aa0 }, emerald_ore: { top: VOX('redstone_emerald'), color: 0x8a5a4a }, silver_ore: { top: VOX('stone_silver'), color: 0x8a8a90 },
  crafting_table: { top: VOX('table'), side: NAT('oak_planks'), bottom: NAT('oak_planks'), color: 0xa8884f },
  furnace: { top: NAT('cobblestone'), side: VOX('oven'), color: 0x6a6a6a },
  // tiles of flowers, grass and crops (X-shaped cross quads, like Minecraft plants)
  flower_red: { top: plant(0, 8), kind: 'cross' }, flower_purple: { top: plant(2, 8), kind: 'cross' }, flower_yellow: { top: plant(3, 9), kind: 'cross' },
  flower_blue: { top: plant(6, 10), kind: 'cross' }, flower_white: { top: plant(6, 11), kind: 'cross' }, flower_pink: { top: plant(4, 11), kind: 'cross' },
  tall_grass: { top: plant(9, 9), kind: 'cross' }, grass_tuft: { top: plant(0, 10), kind: 'cross' }, fern: { top: plant(1, 10), kind: 'cross' },
  bush: { top: plant(4, 9), kind: 'cross' }, mushroom_brown: { top: plant(0, 11), kind: 'cross' }, mushroom_red: { top: plant(1, 11), kind: 'cross' },
  sapling: { top: plant(3, 12), kind: 'cross' }, reeds: { top: plant(5, 13), kind: 'cross' }, cobweb: { top: plant(7, 12), kind: 'cross' },
  wheat: { top: plant(9, 15), kind: 'cross' }, crystal: { top: plant(1, 8), kind: 'cross' },
  // painted: building + city
  bricks: { top: bricks([150, 74, 58], [170, 160, 150]), color: 0x96503c }, stone_bricks: { top: bricks([128, 128, 132], [88, 88, 92]), color: 0x808084 },
  dark_bricks: { top: bricks([70, 52, 50], [40, 34, 34]), color: 0x463432 }, white_bricks: { top: bricks([226, 222, 212], [170, 166, 158]), color: 0xe2ded4 },
  smooth_stone: { top: (x, y, r) => (y === 0 || y === 15 ? [112, 112, 112] : vary([158, 158, 158], r, 8)), color: 0x9e9e9e },
  quartz: { top: (x, y, r) => (y === 0 || x === 0 ? [250, 248, 244] : vary([232, 228, 220], r, 6)), color: 0xe8e4dc },
  plaster: { top: flat([226, 214, 190], 12), color: 0xe2d6be }, plaster_white: { top: flat([236, 234, 228], 8), color: 0xecebe4 },
  asphalt: { top: (_x, _y, r, g) => vary(g.chance(0.06) ? [86, 86, 92] : ASPHALT, r, 12), color: 0x3e3f44 },
  road_line: { top: (x, _y, r, g) => (x >= 6 && x <= 9 ? vary([240, 214, 70], r, 14) : vary(g.chance(0.06) ? [86, 86, 92] : ASPHALT, r, 12)), color: 0x3e3f44 },
  road_line_white: { top: (x, _y, r, g) => (x >= 6 && x <= 9 ? vary(CHALK, r, 10) : vary(g.chance(0.06) ? [86, 86, 92] : ASPHALT, r, 12)), color: 0x3e3f44 },
  crosswalk: { top: (x, _y, r) => (x % 8 < 5 ? vary(CHALK, r, 10) : vary(ASPHALT, r, 12)), color: 0x9a9a9a },
  sidewalk: { top: tiles([176, 172, 164], [168, 164, 156]), color: 0xb0aca4 }, curb: { top: (x, y, r) => (y < 3 ? vary([214, 214, 210], r, 8) : vary([150, 150, 148], r, 10)), color: 0xa0a0a0 },
  metal_plate: { top: metal([150, 154, 160]), color: 0x969aa0 }, rusty_metal: { top: (x, y, r, g) => (g.chance(0.25) ? vary([140, 80, 40], r, 30) : metal([120, 110, 100])(x, y, r, g)), color: 0x8a6a50 },
  window: { top: (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7 ? [60, 56, 54] : x + y === 9 || x + y === 22 ? [210, 236, 248] : null), kind: 'cutout', color: 0x9ac0d8 },
  lit_window: { top: (x, y, r) => (x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7 ? [60, 56, 54] : vary([255, 214, 120], r, 30)), kind: 'glow', color: 0xffd678 },
  shingles: { top: (x, y, r) => (y % 4 === 3 ? [70, 40, 34] : vary(shade([150, 70, 56], 1 - (x + (y >> 2) * 3) % 4 * 0.05), r, 16)), color: 0x964638 },
  slate_roof: { top: (x, y, r) => (y % 4 === 3 ? [34, 38, 46] : vary(shade([70, 78, 92], 1 - (x + (y >> 2) * 3) % 4 * 0.05), r, 14)), color: 0x464e5c },
  // painted: interiors (houses, Granny's place, offices, kitchens, bathrooms)
  wallpaper_floral: { top: wallpaper([214, 196, 160], [150, 90, 100]), color: 0xd6c4a0 }, wallpaper_green: { top: wallpaper([120, 140, 104], [190, 170, 110]), color: 0x788c68 },
  wallpaper_stripes: { top: stripes([200, 180, 150], [176, 150, 120], 3, true), color: 0xc8b496 }, wallpaper_blue: { top: stripes([140, 170, 200], [120, 150, 184], 4, true), color: 0x8caac8 },
  floor_tiles: { top: tiles([236, 236, 232], [222, 222, 218]), color: 0xececea }, checker_tiles: { top: tiles([236, 236, 232], [40, 40, 44]), color: 0x969696 },
  bathroom_tiles: { top: tiles([180, 220, 230], [170, 210, 222], 4), color: 0xb4dce6 }, carpet_red: { top: (x, y, r) => (x === 0 || y === 0 || x === 15 || y === 15 ? [170, 140, 60] : vary([150, 30, 40], r, 16)), color: 0x961e28 },
  dark_wood_floor: { top: (x, y, r) => (y % 4 === 3 || x === ((y >> 2) * 5) % 16 ? [50, 34, 22] : vary([92, 62, 40], r, 14)), color: 0x5c3e28 },
  bookshelf: { top: NAT('oak_planks'), side: (x, y, r, g) => (y === 0 || y === 15 || y === 7 || y === 8 ? [130, 100, 60] : x === 0 || x === 15 ? [110, 84, 50] : vary(g.pick<RGB>([[150, 40, 40], [40, 80, 140], [50, 110, 60], [170, 140, 60], [100, 60, 120]]), r, 20)), color: 0x8a6a40 },
  // painted: sport
  pitch: { top: grassy(GRASS), side: NAT('grass_side'), bottom: NAT('dirt'), color: 0x68a840 }, pitch_dark: { top: grassy(shade(GRASS, 0.86)), side: NAT('grass_side'), bottom: NAT('dirt'), color: 0x5a9038 },
  pitch_line: { top: grassy(CHALK), side: NAT('grass_side'), bottom: NAT('dirt'), color: 0xeceee8 },
  track: { top: (x, _y, r) => vary(x === 0 ? CHALK : [176, 80, 60], r, 14), color: 0xb0503c }, court: { top: flat([196, 120, 70], 10), color: 0xc47846 },
  ice_rink: { top: flat([226, 240, 248], 6), color: 0xe2f0f8 },
  race_red: { top: flat([206, 44, 44], 12), color: 0xce2c2c }, race_white: { top: flat([236, 236, 236], 8), color: 0xececec },
  checkered: { top: (x, y, r) => vary(((x >> 2) + (y >> 2)) % 2 ? [20, 20, 22] : [240, 240, 240], r, 8), color: 0x888888 },
  // painted: precious + special
  gold_block: { top: gemBlock([248, 206, 60]), color: 0xf8ce3c }, iron_block: { top: metal([214, 214, 214]), color: 0xd6d6d6 }, diamond_block: { top: gemBlock([96, 224, 216]), color: 0x60e0d8 },
  emerald_block: { top: gemBlock([40, 200, 100]), color: 0x28c864 }, redstone_block: { top: gemBlock([180, 20, 10]), color: 0xb4140a }, lapis_block: { top: gemBlock([34, 70, 160]), color: 0x2246a0 },
  coal_block: { top: gemBlock([30, 30, 32]), color: 0x1e1e20 },
  tnt: { top: (x, y, r) => (Math.hypot(x - 7.5, y - 7.5) < 2.5 ? [60, 60, 60] : vary([200, 60, 50], r, 25)), side: (x, y, r) => (y >= 5 && y <= 10 ? (x >= 3 && x <= 12 && (y === 7 || y === 8) && x % 3 !== 0 ? [30, 30, 30] : vary([235, 235, 235], r, 10)) : vary([200, 50, 40], r, 30)), color: 0xc83228 },
  pumpkin: { top: (x, y, r) => (Math.abs(x - 7.5) < 1.5 && Math.abs(y - 7.5) < 1.5 ? [90, 120, 40] : vary(shade([220, 130, 30], x % 4 === 0 ? 0.85 : 1), r, 16)), side: (x, _y, r) => vary(shade([220, 130, 30], x % 4 === 0 ? 0.85 : 1), r, 16), color: 0xdc821e },
  jack_o_lantern: { top: (x, _y, r) => vary(shade([220, 130, 30], x % 4 === 0 ? 0.85 : 1), r, 16), side: (x, y, r) => ((y === 5 || y === 6) && (x === 4 || x === 5 || x === 10 || x === 11)) || (y >= 9 && y <= 11 && x >= 3 && x <= 12 && !(y === 9 && (x === 5 || x === 9))) ? [255, 220, 90] : vary(shade([220, 130, 30], x % 4 === 0 ? 0.85 : 1), r, 16), kind: 'glow', color: 0xffa030 },
  melon: { top: (x, y, r) => vary((x + y) % 5 === 0 ? [200, 220, 80] : [90, 150, 40], r, 20), color: 0x5a9628 },
  glowstone: { top: (_x, _y, r) => vary(r > 0.7 ? [255, 240, 180] : [215, 165, 90], r, 40), kind: 'glow', color: 0xf0c070 },
  sea_lantern: { top: (x, y, r) => (x % 5 === 0 || y % 5 === 0 ? [180, 220, 210] : vary([230, 248, 240], r, 12)), kind: 'glow', color: 0xd0f0e8 },
  lava: { top: (x, y, r) => mix([210, 80, 10], [255, 200, 50], (Math.sin(x * 0.9 + y * 0.6) * 0.5 + 0.5) * 0.8 + r * 0.2), kind: 'glow', color: 0xff8c1e },
  water: { top: (x, y, r) => vary(mix([44, 92, 200], [70, 130, 230], Math.sin(x * 0.7 + y * 0.35) * 0.5 + 0.5), r, 12), kind: 'water', color: 0x3c6cd8 },
  netherrack: { top: (_x, _y, r, g) => vary(g.chance(0.2) ? [80, 25, 25] : [118, 42, 42], r, 30), color: 0x762a2a },
  bedrock: { top: (_x, _y, r, g) => vary(g.chance(0.4) ? [40, 40, 40] : [96, 96, 96], r, 30), color: 0x505050 },
  sponge: { top: (_x, _y, r, g) => (g.chance(0.15) ? [150, 140, 40] : vary([206, 196, 70], r, 20)), color: 0xcec446 },
  slime: { top: (x, y, r) => (x === 0 || y === 0 || x === 15 || y === 15 ? [70, 150, 60] : vary([120, 200, 100], r, 14)), kind: 'cutout', color: 0x78c864 },
  barrier: { top: (x, y) => (x === y || x === 15 - y ? [200, 30, 30] : null), kind: 'cutout' },
};
// one of each per dye colour
for (const [n, c] of Object.entries(DYES)) {
  const col = rgb(c);
  SPECS[`wool_${n}`] = { top: wool(col), color: c };
  SPECS[`concrete_${n}`] = { top: concrete(col), color: c };
  SPECS[`glass_${n}`] = { top: stained(col), kind: 'cutout', color: c };
  SPECS[`neon_${n}`] = { top: neon(col), kind: 'glow', color: c };
}
// the stones collection: a few dozen of the nicest (all 370 are in sprites/mc-blocks/stones/ if you want more)
for (const s of ['basalt_brick', 'basalt_tile', 'slate_tile', 'granite_red_brick', 'granite_black_brick', 'granite_gray_cracked_brick', 'jade_brick', 'marble_brick', 'travertine_brick',
  'tuff_grey_brick', 'tuff_red_brick', 'limestone_white_brick', 'quartz_brick', 'rose_quartz_brick', 'lapis_lazuli_brick', 'turquoise_brick', 'amethyst_brick', 'shale_cobble'] as const) {
  SPECS[s] = { top: STONES(s), color: 0x909090 };
}
for (const s of ['glow_sodalite_brick', 'glow_fluorite_brick', 'glow_apatite_brick', 'glow_willemite_brick'] as const) SPECS[s] = { top: STONES(s), kind: 'glow', color: 0x80c0ff };

export const BLOCK_NAMES = ['air', ...Object.keys(SPECS)] as const;
export interface BlockDef { id: number; name: string; kind: BlockKind; color: number; tiles: [number, number, number] /* top, side, bottom atlas tile */ }

export interface McBlocks {
  atlas: THREE.Texture; cols: number; rows: number;
  materials: Record<'solid' | 'cutout' | 'glow' | 'water', THREE.Material>;
  id(name: string): number;
  def(idOrName: number | string): BlockDef;
  defs: BlockDef[];
  /** UV rect of an atlas tile: [u0, v0, u1, v1] */
  uv(tile: number): [number, number, number, number];
  cube(name: string, size?: number): THREE.Mesh;
  tileTexture(tile: string, repeat?: number): THREE.Texture;
}

let cached: Promise<McBlocks> | null = null;
/** Load + build once; every call returns the same blocks. */
export const mcBlocks = () => (cached ??= build());

async function build(): Promise<McBlocks> {
  // collect the unique tile sources, load their images
  const srcKey = (s: Src) => (typeof s === 'string' ? s : typeof s === 'function' ? s : `${s.sheet}#${s.col},${s.row}`);
  const tileOf = new Map<unknown, number>(), list: Src[] = [];
  const add = (s: Src) => { const k = srcKey(s); if (!tileOf.has(k)) { tileOf.set(k, list.length); list.push(s); } return tileOf.get(k)!; };
  const defs: BlockDef[] = [{ id: 0, name: 'air', kind: 'solid', color: 0, tiles: [0, 0, 0] }];
  for (const [name, s] of Object.entries(SPECS)) {
    const top = add(s.top), side = add(s.side ?? s.top), bottom = add(s.bottom ?? s.side ?? s.top);
    defs.push({ id: defs.length, name, kind: s.kind ?? 'solid', color: s.color ?? 0xffffff, tiles: [top, side, bottom] });
  }
  const urls = [...new Set(list.map((s) => (typeof s === 'string' ? s : typeof s === 'function' ? null : s.sheet)).filter((u): u is string => !!u))];
  const imgs = new Map(await Promise.all(urls.map(async (u) => [u, await loadImage(assetUrl(u)).catch(() => null)] as const)));

  const cols = 16, rows = Math.ceil(list.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = cols * T; canvas.height = rows * T;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = true;   // only matters when shrinking the 128 px Kenney tiles to 16 px
  list.forEach((s, i) => {
    const ox = (i % cols) * T, oy = Math.floor(i / cols) * T;
    if (typeof s === 'function') {
      const img = g.createImageData(T, T), rng = new Rng(`tile${i}`);
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const c = s(x, y, rng.next(), rng), k = (y * T + x) * 4;
        if (c) { img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255; }
      }
      g.putImageData(img, ox, oy);
    } else {
      const img = imgs.get(typeof s === 'string' ? s : s.sheet);
      if (!img) { g.fillStyle = '#f0f'; g.fillRect(ox, oy, T, T); return; }   // missing art shows magenta, like Minecraft
      if (typeof s === 'string') g.drawImage(img, 0, 0, img.width, img.height, ox, oy, T, T);
      else g.drawImage(img, s.col * T, s.row * T, T, T, ox, oy, T, T);
    }
  });

  const atlas = pixelTexture(canvas);
  const common = { map: atlas, vertexColors: true };
  const materials = {
    solid: new THREE.MeshLambertMaterial(common),
    cutout: new THREE.MeshLambertMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true }),
    water: new THREE.MeshLambertMaterial({ ...common, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }),
  };
  const byName = new Map(defs.map((d) => [d.name, d]));
  const eps = 0.01 / T;
  const uv = (t: number): [number, number, number, number] => {
    const c = t % cols, r = Math.floor(t / cols);
    return [c / cols + eps, 1 - (r + 1) / rows + eps, (c + 1) / cols - eps, 1 - r / rows - eps];
  };
  const api: McBlocks = {
    atlas, cols, rows, materials, defs, uv,
    id(name) { const d = byName.get(name); if (!d) throw new Error(`unknown block '${name}' — see BLOCK_NAMES in kit/three/mc/blocks.ts`); return d.id; },
    def: (k) => (typeof k === 'number' ? defs[k] : byName.get(k)!) ?? defs[0],
    cube(name, size = 1) {
      const d = api.def(name), geo = new THREE.BoxGeometry(size, size, size), a = geo.attributes.uv as THREE.BufferAttribute;
      for (let f = 0; f < 6; f++) {   // BoxGeometry faces: +x −x +y −y +z −z
        const [u0, v0, u1, v1] = uv(d.tiles[f === 2 ? 0 : f === 3 ? 2 : 1]);
        for (let v = 0; v < 4; v++) { const i = f * 4 + v; a.setXY(i, u0 + a.getX(i) * (u1 - u0), v0 + a.getY(i) * (v1 - v0)); }
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(24 * 3).fill(1), 3));
      const m = new THREE.Mesh(geo, materials[d.kind === 'cross' ? 'cutout' : d.kind]);
      m.castShadow = m.receiveShadow = d.kind !== 'glow';
      return m;
    },
    tileTexture(tile, repeat = 1) {
      const d = api.def(tile), t = d.tiles[0], c = document.createElement('canvas'); c.width = c.height = T;
      c.getContext('2d')!.drawImage(canvas, (t % cols) * T, Math.floor(t / cols) * T, T, T, 0, 0, T, T);
      return pixelTexture(c, repeat);
    },
  };
  return api;
}

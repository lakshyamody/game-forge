import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { mcBlocks } from '@kit/three/mc/blocks';
import { VoxelWorld } from '@kit/three/mc/world';
import { mcSky } from '@kit/three/mc/sky';
import { terrain, house, pitch, tower, raceTrack, room } from '@kit/three/mc/build';

const q = new URLSearchParams(location.search);
const game = bootThree({ fov: 70 });
const sky = mcSky(game, { time: Number(q.get('time') ?? 10), fog: [70, 200] });
const blocks = await mcBlocks();
const world = new VoxelWorld(blocks);
game.scene.add(world.group);
const t0 = performance.now();
const h = terrain(world, { size: 128, biome: (q.get('biome') as never) ?? 'plains', seed: 'test', flatCenter: 20 });
const g = h(0, 0) + 1;
house(world, -14, g, 6, { w: 9, d: 7 });
house(world, 2, g, 8, { w: 7, d: 6, wall: 'white_bricks', roof: 'slate_roof', floors: 2, lit: true });
tower(world, 14, g, -10, { h: 16 });
pitch(world, 0, g - 1, -40, { length: 40, width: 26 });
// a block palette row
let i = 0; for (const d of blocks.defs) { if (!d.id || d.kind === 'water') continue; world.set(-30 + (i % 60), g + Math.floor(i / 60) * 2, -4, d.id); i++; }
world.update();
console.log('mesh ms', performance.now() - t0);
const views: Record<string, [number[], number[]]> = { a: [[18, g + 14, 34], [0, g, 0]], b: [[-10, g + 4, -12], [-10, g + 1, -4]], c: [[0, g + 30, -10], [0, g, -40]], d: [[-26, g + 3, 4], [-14, g + 2, -4]] };
const [p, t] = views[q.get('view') ?? 'a'];
game.camera.position.set(p[0], p[1], p[2]); game.camera.lookAt(t[0], t[1], t[2]);
game.loop((dt) => sky.update(dt, new THREE.Vector3(0, g, 0)));
(window as any).__playtest = { blocks: blocks.defs.length };

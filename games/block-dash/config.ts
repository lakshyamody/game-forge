/** Every tuning number for Block Dash. Open the game with ?tune for live sliders. */
import { tune } from '@kit/tune';

export const C = {
  speed: 10,          // starting run speed (blocks/s)
  speedMax: 23,       // top speed
  accel: 0.13,        // speed gained per second
  laneSnap: 16,       // how fast you slide between lanes
  jumpV: 9.6,         // jump launch speed
  gravity: 28,
  slideTime: 0.65,
  turnWindow: 5,      // blocks before the corner where a turn is accepted
  chaseFar: 13,       // zombie distance when you're safe
  chaseNear: 2.6,     // zombie distance right after you stumble
  chaseRecover: 6,    // seconds until the zombies fall back
  coinValue: 10,
  biomeEvery: 500,    // metres per biome
};
tune(C, 'Run');

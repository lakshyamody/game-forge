/** Silent Assassin tuning. Every number here shows up as a live slider with ?tune. */
import { tune } from '@kit/tune';

/** City grid: BLOCKS×BLOCKS building blocks, streets between them. Intersections ("nodes") are (BLOCKS+1)². */
export const CITY = { BLOCKS: 5, CELL: 16, BLOCK: 10 };
export const HALF = (CITY.BLOCKS * CITY.CELL) / 2;           // intersections run from -HALF to +HALF
export const EDGE = HALF + (CITY.CELL - CITY.BLOCK) / 2;      // outer edge of the outer streets

/** Night lighting: lit windows, wet streets, and the pool of real spot lights that follows the player. */
export const LIGHT = {
  windows: 1.4,            // emissive strength of lit windows
  wet: 0.32,               // asphalt roughness (lower = wetter, more reflections)
  poolDecal: 0.32,         // opacity of the warm light pools painted under every lamp
  spots: 8,                // real spot lights, moved to the lamps nearest the player
  shadowSpots: 2,          // how many of those cast shadows
  lamp: 90,                // spot light intensity (candela)
};
tune(LIGHT, 'Lighting');

export const P = {
  walk: 5.2, crouch: 2.6, sprint: 8.5,
  killRange: 1.9, hp: 5,
  sprintNoise: 8,          // guards within this range hear you sprint
};
tune(P, 'Player');

export const G = {
  viewRange: 12, viewAngle: 48,          // degrees, half-cone
  notice: 1.1,                           // suspicion/sec at the edge of view (faster up close)
  crouchMul: 0.45,                       // crouching is harder to spot
  decay: 0.35,
  patrolSpeed: 2.2, huntSpeed: 6.2,
  shootRange: 13, shootEvery: 1.1, hitChance: 0.4,
  giveUp: 6,                             // seconds without sight before a hunter goes back to patrol
  alarmRadius: 26,                       // guards this close to a scream come running
};
tune(G, 'Guards');

export const C = {
  walkSpeed: 1.8, fleeSpeed: 6, witnessRange: 11, count: 16,
};
tune(C, 'Civilians');

export const MISSION = {
  targets: (m: number) => Math.min(1 + Math.floor((m - 1) / 2) + (m > 1 ? 1 : 0), 4),
  guards: (m: number) => Math.min(4 + m * 2, 18),
};

export const SCORE = { targetSilent: 1000, targetLoud: 400, guardSilent: 150, guardLoud: 50, civilian: -300, extract: 500, timeBonus: 20 };

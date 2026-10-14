/** Every tuning number — ?tune shows live sliders. */
import { tune } from '@kit/tune';

export const CELL = 2;          // metres per map cell
export const MOVE = { speed: 5.4, walkSpeed: 2.9, accel: 60, eye: 1.6, radius: 0.35, dashDist: 7, dashTime: 0.16 };
export const ROUND = { buy: 8, length: 90, plantTime: 3.5, spikeTimer: 35, defuseTime: 7, toWin: 5, between: 4 };
export const ECON = { start: 800, win: 3000, loss: 1900, kill: 200, plant: 300 };
export const AI = { hp: 100, sight: 42, fovDeg: 110, reaction: 0.55, reactionMin: 0.28, fireEvery: 0.42, accuracy: 0.34, accuracyPerRound: 0.035, damage: 24, headChance: 0.12, speed: 3.6, hearRun: 15, hearShot: 34 };
export const PLAYER = { hp: 100 };
export const ABIL = { dashCharges: 2, smokes: 2, smokeRadius: 3.6, smokeTime: 12, recon: 1, reconTime: 3.5 };

export type GunId = 'pistol' | 'smg' | 'rifle' | 'sniper';
export interface Gun { name: string; cost: number; dmg: number; head: number; rate: number; mag: number; reload: number; still: number; moving: number; bloom: number; kick: number; zoom: number; auto: boolean; model: string }
export const GUNS: Record<GunId, Gun> = {
  pistol: { name: 'SIDEARM', cost: 0, dmg: 26, head: 3, rate: 6.5, mag: 12, reload: 1.5, still: 0.004, moving: 0.07, bloom: 0.012, kick: 0.012, zoom: 1.15, auto: false, model: 'blaster-c' },
  smg: { name: 'STINGER', cost: 1600, dmg: 26, head: 3, rate: 13, mag: 30, reload: 2.2, still: 0.012, moving: 0.03, bloom: 0.004, kick: 0.006, zoom: 1.15, auto: true, model: 'blaster-d' },
  rifle: { name: 'VANGUARD', cost: 2900, dmg: 40, head: 4, rate: 9.75, mag: 25, reload: 2.5, still: 0.0025, moving: 0.09, bloom: 0.007, kick: 0.011, zoom: 1.25, auto: true, model: 'blaster-h' },
  sniper: { name: 'LONGSHOT', cost: 4700, dmg: 150, head: 2, rate: 0.8, mag: 5, reload: 3, still: 0.0, moving: 0.12, bloom: 0, kick: 0.06, zoom: 3, auto: false, model: 'blaster-k' },
};

tune(MOVE, 'Movement'); tune(AI, 'Defenders'); tune(ROUND, 'Round'); tune(ABIL, 'Abilities');

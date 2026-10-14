import { tune } from '@kit/tune';

/** Tuning knobs. Open the game with ?tune for live sliders. */
export const T = {
  startSpeed: 11,       // m/s at the start
  maxSpeed: 26,
  speedRamp: 0.18,      // m/s gained per second
  laneWidth: 2.2,
  laneLerp: 14,         // how snappy a lane change is
  jumpVel: 9.5,
  gravity: 28,
  slideTime: 0.65,
  zombieSafeGap: 12,    // zombies fall back to this distance (off-screen behind the camera)
  zombieRecover: 0.8,   // m/s the gap re-opens after a stumble
  zombieCatchGap: 6.5,  // stumble while zombies are closer than this = caught
  obstacleGap: 16,      // metres between obstacle rows at start
  obstacleGapMin: 9,
  slenderEvery: 14,     // seconds between Slenderina attacks (first one sooner)
  slenderEveryMin: 7,
  slenderLunge: 9,      // her own speed toward Jack while ambushing
};
tune(T, 'Horror 3');

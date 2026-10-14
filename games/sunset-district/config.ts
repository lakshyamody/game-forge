/** Every tuning number — ?tune shows live sliders. */
import { tune } from '@kit/tune';

export const CAR = { accel: 13, brake: 28, maxSpeed: 36, reverse: 8, drag: 0.35, steer: 0.62, steerSpeed: 3.5, grip: 7, handbrakeGrip: 1.6, radius: 1.5 };
export const WALK = { walk: 1.25, run: 4.2, turn: 10, radius: 0.35 };
export const CAM = { car: 7.5, carHeight: 2.6, foot: 4.2, footHeight: 1.9, fov: 58 };
export const WORLD = { blocks: 4, traffic: 16, pedestrians: 30, dayLength: 360, startHour: 16.6 };
export const FARE = { base: 18, perMeter: 0.06, secondsPerMeter: 0.11, minTime: 25, pickupRadius: 6, crashPenalty: 4 };

tune(CAR, 'Car'); tune(WALK, 'On foot'); tune(WORLD, 'World'); tune(FARE, 'Fares');

// n8ao ships no types — the subset kit/three/realism uses
declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import type { Pass } from 'postprocessing';
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: { aoRadius: number; distanceFalloff: number; intensity: number; aoSamples: number; denoiseSamples: number; halfRes: boolean; depthAwareUpsampling: boolean; screenSpaceRadius: boolean; gammaCorrection: boolean; color: import('three').Color };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}

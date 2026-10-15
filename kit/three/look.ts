/**
 * Good-looking stylised 3D in one call — the low-poly counterpart to kit/three/realism.ts.
 * A gradient sky that the fog and image-based light are derived from (so the horizon never goes muddy),
 * a three-light rig with soft shadows, bloom, filmic AgX tone mapping, a colour grade and vignette.
 * Tuned for flat-shaded asset-library models, not photoreal: no ambient occlusion unless you ask.
 *
 *   const game = bootThree({ fov: 60, maxPixelRatio: 1.5 });   // no bloom/shadows/fog/background — look() owns them
 *   const fx = look(game, 'night');
 *   fx.prepare(model);                       // every mesh casts/receives shadows
 *   each frame: fx.follow(player.position)   // keeps the sharp shadow area around the player
 *   fx.setPreset('neon')                     // swap the whole look at runtime
 *
 * Presets: day · night · sunset · neon · horror · interior · toy · overcast.
 * For a photoreal game use realism() instead — it has a physical sky, AO and HDRI lighting.
 */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode, BrightnessContrastEffect, HueSaturationEffect, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { hex } from '../math';
import { loadHdri } from '../assets';

type Game = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; setRender(fn: ((dt: number) => void) | null): void; onResize(fn: (w: number, h: number) => void): void };

export type LookPreset = 'day' | 'night' | 'sunset' | 'neon' | 'horror' | 'interior' | 'toy' | 'overcast';

/** every number a preset controls — override any of them through LookOpts */
interface Style {
  zenith: number; horizon: number; ground: number; stars: number;
  key: number; keyI: number; elev: number; azim: number;
  fillSky: number; fillGround: number; fillI: number;
  rim: number; rimI: number;
  fog: number; fogDensity: number; env: number;
  bloom: number; saturation: number; contrast: number; vignette: number;
}

const PRESETS: Record<LookPreset, Style> = {
  day:      { zenith: 0x4a9fe0, horizon: 0xbfe3f5, ground: 0x6b7a52, stars: 0,   key: 0xfff3d6, keyI: 2.6, elev: 48, azim: 215, fillSky: 0x9fd0ff, fillGround: 0x6b6244, fillI: 0.75, rim: 0xfff0c0, rimI: 0.50, fog: 0xbfe3f5, fogDensity: 0.0035, env: 0.85, bloom: 0.40, saturation: 0.22, contrast: 0.10, vignette: 0.25 },
  night:    { zenith: 0x0c1838, horizon: 0x2e4a7a, ground: 0x0a1226, stars: 460, key: 0x9fb8ff, keyI: 1.1, elev: 28, azim: 200, fillSky: 0x3d5c96, fillGround: 0x10141c, fillI: 0.55, rim: 0x7fa8ff, rimI: 0.80, fog: 0x101c33, fogDensity: 0.0120, env: 0.50, bloom: 0.75, saturation: 0.26, contrast: 0.14, vignette: 0.42 },
  sunset:   { zenith: 0x2a4a8f, horizon: 0xff9a4d, ground: 0x4a3a2a, stars: 0,   key: 0xffb066, keyI: 2.4, elev:  8, azim: 250, fillSky: 0xffb98a, fillGround: 0x3a2e22, fillI: 0.70, rim: 0xff7a3a, rimI: 1.00, fog: 0xffa968, fogDensity: 0.0060, env: 0.80, bloom: 0.70, saturation: 0.30, contrast: 0.12, vignette: 0.30 },
  neon:     { zenith: 0x1d0a4e, horizon: 0x7a1aa8, ground: 0x10042a, stars: 320, key: 0xff4dd2, keyI: 1.4, elev: 35, azim: 140, fillSky: 0x6a3cff, fillGround: 0x12032a, fillI: 0.80, rim: 0x33f0ff, rimI: 1.60, fog: 0x1a0533, fogDensity: 0.0100, env: 0.70, bloom: 1.30, saturation: 0.45, contrast: 0.18, vignette: 0.40 },
  horror:   { zenith: 0x0a1018, horizon: 0x1b2634, ground: 0x05070a, stars: 200, key: 0x5f7596, keyI: 0.6, elev: 32, azim: 190, fillSky: 0x1b2838, fillGround: 0x06080c, fillI: 0.30, rim: 0x6f86b0, rimI: 0.55, fog: 0x05080e, fogDensity: 0.0300, env: 0.30, bloom: 0.50, saturation: -0.15, contrast: 0.20, vignette: 0.60 },
  interior: { zenith: 0x2b1d2e, horizon: 0x4a3340, ground: 0x241824, stars: 0,   key: 0xffe0b0, keyI: 2.2, elev: 52, azim: 235, fillSky: 0xfff1dd, fillGround: 0x6b4a3a, fillI: 1.10, rim: 0xffb36b, rimI: 0.70, fog: 0x2b1d2e, fogDensity: 0.0020, env: 0.70, bloom: 0.35, saturation: 0.18, contrast: 0.08, vignette: 0.35 },
  toy:      { zenith: 0x5fb0ff, horizon: 0xd8f0ff, ground: 0x7a8f5a, stars: 0,   key: 0xffffff, keyI: 1.5, elev: 60, azim: 200, fillSky: 0xffffff, fillGround: 0x445533, fillI: 1.30, rim: 0xffffff, rimI: 0.35, fog: 0xd8f0ff, fogDensity: 0.0025, env: 0.90, bloom: 0.25, saturation: 0.28, contrast: 0.06, vignette: 0.15 },
  overcast: { zenith: 0x9aa7b4, horizon: 0xc7d0d8, ground: 0x6e7366, stars: 0,   key: 0xdfe6ee, keyI: 1.2, elev: 55, azim: 210, fillSky: 0xc3ccd6, fillGround: 0x5c6054, fillI: 1.00, rim: 0xdfe6ee, rimI: 0.30, fog: 0xc2ccd4, fogDensity: 0.0060, env: 0.95, bloom: 0.30, saturation: 0.08, contrast: 0.08, vignette: 0.20 },
};

export interface LookOpts extends Partial<Style> {
  /** Poly Haven HDRI id for the sky and image-based light, instead of the procedural gradient.
   *  Richer for photoscanned settings; the light rig, post chain and follow() are unchanged. */
  hdri?: string;
  /** half-size (world units) of the sharp shadow area around fx.follow() */
  shadowRange?: number;
  /** false turns sun shadows off entirely (cheapest) */
  shadows?: boolean;
  shadowMap?: number;
  /** ambient occlusion is OFF by default — flat-shaded art barely shows it and it costs a lot */
  ao?: { radius?: number; intensity?: number };
}

/** equirectangular gradient sky, drawn on a canvas: cheap, stylised, and the fog colour comes from it */
function skyTexture(s: Style) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, hex(s.zenith)); gr.addColorStop(0.46, hex(s.horizon));
  gr.addColorStop(0.54, hex(s.ground)); gr.addColorStop(1, hex(s.ground));
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  // stars sit in the upper half only, denser toward the zenith
  for (let i = 0; i < s.stars; i++) {
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * 1024, Math.random() ** 1.5 * 236, Math.random() < 0.12 ? 2 : 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function look(game: Game, preset: LookPreset = 'day', o: LookOpts = {}) {
  const { renderer, scene, camera } = game;
  renderer.toneMapping = THREE.NoToneMapping;          // AgX runs in the effect chain instead
  const shadows = o.shadows ?? true;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---- lights: key (sun/moon, shadows) + hemisphere fill + a rim that separates models from the sky
  const key = new THREE.DirectionalLight(0xffffff, 1);
  const range = o.shadowRange ?? 40;
  Object.assign(key.shadow.camera, { left: -range, right: range, top: range, bottom: -range, near: 1, far: 260 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.setScalar(o.shadowMap ?? 2048);
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  key.castShadow = shadows;
  const fill = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const rim = new THREE.DirectionalLight(0xffffff, 0);
  scene.add(key, key.target, fill, rim, rim.target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const keyDir = new THREE.Vector3(), focus = new THREE.Vector3();
  let sky: THREE.CanvasTexture | null = null;
  let env: THREE.WebGLRenderTarget | null = null;
  let style: Style = { ...PRESETS[preset], ...o };

  scene.fog = new THREE.FogExp2(style.fog, style.fogDensity);

  function apply(s: Style) {
    // the sky texture and its PMREM env are the expensive part — only rebuild when the sky actually changed
    const reSky = !sky || s.zenith !== style.zenith || s.horizon !== style.horizon || s.ground !== style.ground || s.stars !== style.stars;
    style = s;
    keyDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - s.elev), THREE.MathUtils.degToRad(s.azim));
    key.color.set(s.key); key.intensity = s.keyI;
    fill.color.set(s.fillSky); fill.groundColor.set(s.fillGround); fill.intensity = s.fillI;
    // the rim sits opposite the key and never casts — it is what stops low-poly reading as flat
    rim.color.set(s.rim); rim.intensity = s.rimI;
    rim.position.copy(keyDir).multiplyScalar(-60).setY(28);
    (scene.fog as THREE.FogExp2).color.set(s.fog);
    (scene.fog as THREE.FogExp2).density = s.fogDensity;

    if (reSky && !o.hdri) {
      sky?.dispose(); env?.dispose();
      sky = skyTexture(s);
      scene.background = sky;
      env = pmrem.fromEquirectangular(sky);
      scene.environment = env.texture;
    }
    scene.environmentIntensity = s.env;

    bloom.intensity = s.bloom;
    hue.saturation = s.saturation;
    bc.contrast = s.contrast;
    vig.darkness = s.vignette;
  }

  // ---- post-processing: bloom → AgX → grade → vignette, then SMAA
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  let ao: N8AOPostPass | null = null;
  if (o.ao) {
    ao = new N8AOPostPass(scene, camera);
    Object.assign(ao.configuration, { aoRadius: o.ao.radius ?? 1.6, distanceFalloff: 1.2, intensity: o.ao.intensity ?? 1.8, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false });
    ao.setQualityMode('Performance');
    composer.addPass(ao);
  }
  const bloom = new BloomEffect({ intensity: 0.5, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, mipmapBlur: true });
  const hue = new HueSaturationEffect({ saturation: 0.2 });
  const bc = new BrightnessContrastEffect({ contrast: 0.1 });
  const vig = new VignetteEffect({ darkness: 0.3, offset: 0.32 });
  composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX }), hue, bc, vig));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));
  game.onResize((w, h) => composer.setSize(w, h));
  game.setRender((dt) => composer.render(dt));

  apply(style);
  // an HDRI replaces the gradient sky and its image-based light; everything else stays as the preset set it
  if (o.hdri) void loadHdri(scene, o.hdri, { background: true, intensity: style.env }).catch(() => {});

  return {
    key, fill, rim, composer, bloom, ao,
    get style() { return style; },
    /** swap the whole look (entering a cave, night falling); extra overrides merge over the preset */
    setPreset(name: LookPreset, over: Partial<Style> = {}) { apply({ ...PRESETS[name], ...over }); },
    /** nudge single values without changing preset, e.g. tune({ fogDensity: 0.02 }).
     *  Colour/light tweaks are cheap; changing zenith/horizon/ground/stars rebuilds the sky, so don't do that every frame. */
    tune(over: Partial<Style>) { apply({ ...style, ...over }); },
    /** keep the sharp shadow area centred on the player (call every frame) */
    follow(p: THREE.Vector3) {
      focus.copy(p);
      key.target.position.copy(focus);
      key.position.copy(focus).addScaledVector(keyDir, 90);
      // snap to shadow texels so edges don't shimmer while moving
      const texel = (range * 2) / key.shadow.mapSize.x;
      key.position.x = Math.round(key.position.x / texel) * texel; key.position.z = Math.round(key.position.z / texel) * texel;
      key.target.position.x = Math.round(key.target.position.x / texel) * texel; key.target.position.z = Math.round(key.target.position.z / texel) * texel;
      rim.position.copy(focus).addScaledVector(keyDir, -70).setY(focus.y + 28);
      rim.target.position.copy(focus);
      rim.target.updateMatrixWorld();
    },
    /** turn on shadows for every mesh under obj */
    prepare(obj: THREE.Object3D, cast = true, receive = true) { obj.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = cast && shadows; m.receiveShadow = receive && shadows; } }); return obj; },
  };
}

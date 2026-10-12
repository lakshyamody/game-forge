/**
 * Realistic rendering in one call — the "GTA-ish" lighting stack for Three.js games:
 * physical sky with a sun (time of day), image-based lighting (HDRI or the sky itself), soft sun shadows that
 * follow the player, ambient occlusion (N8AO), bloom on bright lights, filmic AgX tone mapping, a light colour
 * grade, SMAA anti-aliasing and distance haze.
 *
 *   const game = bootThree({ fov: 55, maxPixelRatio: 1.5 });
 *   const fx = realism(game, { sun: { elevation: 35, azimuth: 210 } });   // lit by the physical sky (follows time of day)
 *   const fx = realism(game, { hdri: 'urban_street_01' });                 // or a fixed HDRI: richer reflections, fixed time of day
 *   fx.prepare(model);                  // every loaded mesh casts/receives shadows
 *   each frame: fx.follow(player.position)   // keeps the sharp shadow area around the player
 *   fx.setSun(8, 260)                   // sunset; negative elevation = night (street lights + bloom carry it)
 */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode, BrightnessContrastEffect, HueSaturationEffect, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { assetUrl } from '../assets';

type Game = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; setRender(fn: ((dt: number) => void) | null): void; onResize(fn: (w: number, h: number) => void): void };
export interface RealismOpts {
  /** Poly Haven HDRI id for reflections/ambient light (city skies look great); omit to light from the sky itself */
  hdri?: string;
  /** degrees above the horizon / compass direction */
  sun?: { elevation: number; azimuth: number };
  /** half-size (m) of the sharp shadow area around fx.follow() */
  shadowRange?: number;
  ao?: false | { radius?: number; intensity?: number };
  bloom?: number;
  /** haze density (FogExp2); 0 = none */
  haze?: number;
  saturation?: number; contrast?: number;
}

export function realism(game: Game, o: RealismOpts = {}) {
  const { renderer, scene, camera } = game;
  renderer.toneMapping = THREE.NoToneMapping;            // tone mapping happens in the effect chain
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  // ---- sky + sun
  // the sky box must sit inside the camera's far plane (corners are √3 × half the size away)
  const sky = new Sky(); sky.scale.setScalar(Math.min(4000, camera.far * 0.9)); scene.add(sky); scene.background = null;
  const su = sky.material.uniforms;
  su.turbidity.value = 6; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const range = o.shadowRange ?? 60;
  Object.assign(sun.shadow.camera, { left: -range, right: range, top: range, bottom: -range, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.castShadow = true; scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4035, 0.35); scene.add(hemi);
  const sunDir = new THREE.Vector3(), focus = new THREE.Vector3();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envFromSky: THREE.WebGLRenderTarget | null = null, hdrEnv: THREE.Texture | null = null;
  scene.fog = new THREE.FogExp2(0xbfd1e5, o.haze ?? 0.0022);

  const nightSky = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#02040b'); gr.addColorStop(0.42, '#08122a'); gr.addColorStop(0.5, '#2a2638'); gr.addColorStop(0.53, '#3b2a2a'); gr.addColorStop(1, '#05060a');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 700; i++) { const y = Math.random() ** 1.6 * 240; g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`; g.fillRect(Math.random() * 1024, y, Math.random() < 0.1 ? 2 : 1, 1); }
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // night: the starry navy sky also lights the scene (city glow), plus a cool moon — never pitch black
  const nightEnv = pmrem.fromEquirectangular(nightSky).texture;
  const moon = new THREE.DirectionalLight(0x8fa6d8, 0); moon.position.set(-60, 120, 40); scene.add(moon);
  const FOG_DAY = new THREE.Color(0xa9bdd4), FOG_SUNSET = new THREE.Color(0xf2a36b), FOG_NIGHT = new THREE.Color(0x0b1122);
  let lastEnvElev = 999;
  function setSun(elevation: number, azimuth: number) {
    const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
    sunDir.setFromSphericalCoords(1, phi, theta);
    su.sunPosition.value.copy(sunDir);
    const day = THREE.MathUtils.clamp(elevation / 25, 0, 1), dusk = THREE.MathUtils.clamp(1 - Math.abs(elevation - 6) / 14, 0, 1);
    // sun stays strong down to the horizon (warm, low, long shadows) and fades out just below it
    sun.intensity = 2.7 * THREE.MathUtils.clamp((elevation + 1.5) / 10, 0, 1) * (0.75 + 0.25 * day);
    sun.color.setHSL(0.1 - 0.06 * (1 - day), 0.85 * (1 - day) + 0.12, 0.6 + 0.32 * day);
    hemi.intensity = 0.16 + 0.3 * day + 0.12 * dusk;
    const night = elevation < -3; sky.visible = !night; scene.background = night ? nightSky : null;
    const dark = THREE.MathUtils.clamp((1.5 - elevation) / 5, 0, 1);   // twilight starts as the sun touches the horizon
    moon.intensity = 0.55 * dark; hemi.color.set(0xbcd4ff).lerp(new THREE.Color(0x5b6fa8), dark); hemi.intensity = Math.max(hemi.intensity, 0.45 * dark);
    // haze: day blue-grey → sunset amber → night navy
    const fog = (scene.fog as THREE.FogExp2).color, golden = dusk * (1 - day);
    fog.copy(FOG_NIGHT).lerp(FOG_DAY, THREE.MathUtils.clamp((elevation + 4) / 20, 0, 1)).lerp(FOG_SUNSET, golden * 0.85);
    // light the world from the sky itself (re-baked only when the sun has moved a little, so per-frame setSun is cheap)
    if (!hdrEnv && elevation < 0) { if (scene.environment !== nightEnv) { scene.environment = nightEnv; lastEnvElev = 999; } scene.environmentIntensity = 0.9; }
    else if (!hdrEnv && Math.abs(elevation - lastEnvElev) > 1.2) {
      lastEnvElev = elevation;
      envFromSky?.dispose();
      const s = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(1000); Object.assign(sk.material.uniforms.sunPosition.value, sunDir);
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'] as const) sk.material.uniforms[k].value = su[k].value;
      s.add(sk); envFromSky = pmrem.fromScene(s, 0.04); scene.environment = envFromSky.texture;
    }
    if (hdrEnv || elevation >= 0) scene.environmentIntensity = hdrEnv ? 0.3 + 0.7 * day : 0.45 + 0.2 * day + 0.3 * dusk;
  }
  setSun(o.sun?.elevation ?? 35, o.sun?.azimuth ?? 210);
  if (o.hdri) new HDRLoader().loadAsync(assetUrl(`hdri/${o.hdri}.hdr`)).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; hdrEnv = t; scene.environment = t; envFromSky?.dispose(); envFromSky = null; });

  // ---- post-processing chain
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  let ao: N8AOPostPass | null = null;
  if (o.ao !== false) {
    ao = new N8AOPostPass(scene, camera);
    Object.assign(ao.configuration, { aoRadius: o.ao?.radius ?? 2.2, distanceFalloff: 1.2, intensity: o.ao?.intensity ?? 2.6, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false });
    ao.setQualityMode('Medium');
    composer.addPass(ao);
  }
  const bloom = new BloomEffect({ intensity: o.bloom ?? 0.55, luminanceThreshold: 0.85, luminanceSmoothing: 0.2, mipmapBlur: true });
  const grade = [new HueSaturationEffect({ saturation: o.saturation ?? 0.18 }), new BrightnessContrastEffect({ contrast: o.contrast ?? 0.1 })];
  composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX }), ...grade, new VignetteEffect({ darkness: 0.35, offset: 0.35 })));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));
  game.onResize((w, h) => composer.setSize(w, h));
  game.setRender((dt) => composer.render(dt));

  return {
    sun, sky, composer, ao, bloom,
    setSun,
    /** keep the high-res shadow area centred on the player (call every frame) */
    follow(p: THREE.Vector3) {
      focus.copy(p);
      sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(sunDir, 150);
      // snap to shadow texels so edges don't shimmer while moving
      const texel = (range * 2) / sun.shadow.mapSize.x;
      sun.position.x = Math.round(sun.position.x / texel) * texel; sun.position.z = Math.round(sun.position.z / texel) * texel;
      sun.target.position.x = Math.round(sun.target.position.x / texel) * texel; sun.target.position.z = Math.round(sun.target.position.z / texel) * texel;
    },
    /** turn on shadows for every mesh under obj */
    prepare(obj: THREE.Object3D, cast = true, receive = true) { obj.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return obj; },
  };
}

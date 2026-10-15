/**
 * The Minecraft sky + light: gradient sky dome, square pixel sun and moon, drifting blocky clouds, stars at night,
 * distance fog that matches the horizon, and a sun with shadows that follow the player. Turns off filmic tone mapping
 * so block colours stay true (Minecraft looks flat and bright, not cinematic).
 *
 *   const sky = mcSky(game, { time: 10 });       // game = bootThree() result. time in hours: 6 sunrise, 12 noon, 18 sunset, 0 midnight
 *   loop((dt) => sky.update(dt, player.position));   // clouds drift, shadows follow
 *   sky.setTime(20)                               // night (call every frame for a day/night cycle; sky.time is the current hour)
 *   sky.fogDistance(40, 120)                      // tighter fog for horror (Granny), wider for racing
 *   sky.night                                     // 0 (day) … 1 (night) — use it to switch on lit windows, torches, street lamps
 */
import * as THREE from 'three';
import { Rng } from '@kit/rng';
import { type RGB, rgb, mix, paint, pixelTexture } from './pixels';

interface Game { scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.Camera }
export interface McSkyOpts {
  time?: number;
  fog?: [near: number, far: number];
  clouds?: boolean;
  cloudHeight?: number;
  shadows?: boolean;
  /** half-size of the sharp shadow area around the follow point */
  shadowSize?: number;
  /** override sky colours, e.g. a red horror sky: { day: [0x330000, 0x661111] } */
  colors?: Partial<Record<'day' | 'dusk' | 'night', [zenith: number, horizon: number]>>;
}

const DEFAULT = { day: [0x78a7ff, 0xc0d8ff], dusk: [0x3a4a8a, 0xf0a060], night: [0x05070f, 0x101830] } as Record<'day' | 'dusk' | 'night', [number, number]>;

export function mcSky(game: Game, o: McSkyOpts = {}) {
  const { scene, renderer } = game;
  renderer.toneMapping = THREE.NoToneMapping;
  if (o.shadows !== false) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; }
  const colors = { ...DEFAULT, ...o.colors };

  // ---------------------------------------------------------------- dome
  const uniforms = { zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 zenith; uniform vec3 horizon; varying vec3 vP; void main(){ float t = pow(clamp(vP.y, 0.0, 1.0), 0.55); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0); }',
  }));
  dome.renderOrder = -10; dome.frustumCulled = false;
  scene.add(dome);
  scene.background = null;
  scene.fog = new THREE.Fog(0xc0d8ff, o.fog?.[0] ?? 60, o.fog?.[1] ?? 180);

  // ---------------------------------------------------------------- sun, moon, stars (on a pivot that turns with the time)
  const celestial = new THREE.Group(); scene.add(celestial);
  const sunTex = pixelTexture(paint(16, 16, (x, y) => { const e = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return e < 5 ? (e < 3.5 ? [255, 255, 220] : [255, 236, 120]) : e < 7 ? [255, 210, 90] : null; }, 'sun'));
  const moonTex = pixelTexture(paint(16, 16, (x, y, r) => { const e = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return e < 5 ? ((x === 6 && y === 6) || (x === 9 && y === 9) || (x === 5 && y === 9) ? [150, 160, 180] : [210 + r * 20, 220 + r * 20, 235]) : null; }, 'moon'));
  const disc = (tex: THREE.Texture, size: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    m.renderOrder = -9; return m;
  };
  const sunDisc = disc(sunTex, 90), moonDisc = disc(moonTex, 70);
  sunDisc.position.set(-700, 0, 0); moonDisc.position.set(700, 0, 0);
  sunDisc.lookAt(0, 0, 0); moonDisc.lookAt(0, 0, 0);          // planes face the centre; the pivot turns them through the sky
  celestial.add(sunDisc, moonDisc);
  const rng = new Rng('stars'), sp: number[] = [];
  for (let i = 0; i < 900; i++) { const v = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize().multiplyScalar(800); sp.push(v.x, v.y, v.z); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  stars.renderOrder = -9; celestial.add(stars);

  // ---------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7a66, 1.9);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  const S = o.shadowSize ?? 40;
  if (o.shadows !== false) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 300 });
  }
  scene.add(hemi, sun, sun.target);

  // ---------------------------------------------------------------- clouds: flat 12×12 blocks, 4 thick, from a noise grid
  const clouds = new THREE.Group();
  if (o.clouds !== false) {
    const cr = new Rng('clouds'), cell = 12, n = 48, grid: boolean[] = [];
    // blobby: seed points, grow
    for (let i = 0; i < n * n; i++) grid.push(false);
    for (let k = 0; k < 70; k++) {
      let x = cr.int(0, n - 1), z = cr.int(0, n - 1);
      for (let s = 0; s < cr.int(4, 14); s++) { grid[z * n + x] = true; if (cr.chance(0.5)) x = (x + cr.sign() + n) % n; else z = (z + cr.sign() + n) % n; }
    }
    const geos: THREE.BufferGeometry[] = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) if (grid[z * n + x]) geos.push(new THREE.BoxGeometry(cell, 4, cell).translate((x - n / 2) * cell, 0, (z - n / 2) * cell));
    if (geos.length) {
      // merge by hand (keeps this file free of addon imports)
      const merged = mergeBoxes(geos);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, emissive: 0x888888, depthWrite: false });
      for (const dx of [-1, 0, 1]) { const m = new THREE.Mesh(merged, mat); m.position.x = dx * n * cell; clouds.add(m); }
    }
    clouds.position.y = o.cloudHeight ?? 110;
    clouds.renderOrder = 2;
    scene.add(clouds);
  }

  let time = o.time ?? 11, night = 0, cloudX = 0;
  const follow = new THREE.Vector3();
  const tmpA: RGB = [0, 0, 0];
  function apply() {
    const a = ((time - 6) / 24) * Math.PI * 2;                 // 6:00 → sun on the horizon (east), 12:00 → overhead
    const elev = Math.sin(a);
    celestial.rotation.z = -a;                                 // sun rises at −x, overhead at noon, sets at +x
    // colours: day ↔ dusk ↔ night by sun elevation
    const day = THREE.MathUtils.smoothstep(elev, -0.05, 0.35), dusk = 1 - Math.min(1, Math.abs(elev) / 0.3);
    night = 1 - THREE.MathUtils.smoothstep(elev, -0.25, 0.05);
    const pick = (i: 0 | 1) => { const d = rgb(colors.day[i]), k = rgb(colors.dusk[i]), nn = rgb(colors.night[i]); const base = mix(nn, d, day); return mix(base, k, dusk * 0.85 * (i === 1 ? 1 : 0.5)); };
    const z = pick(0), h = pick(1);
    uniforms.zenith.value.setRGB(z[0] / 255, z[1] / 255, z[2] / 255, THREE.SRGBColorSpace);
    uniforms.horizon.value.setRGB(h[0] / 255, h[1] / 255, h[2] / 255, THREE.SRGBColorSpace);
    (scene.fog as THREE.Fog).color.copy(uniforms.horizon.value);
    (stars.material as THREE.PointsMaterial).opacity = night;
    tmpA[0] = 255; tmpA[1] = 240 - dusk * 60; tmpA[2] = 220 - dusk * 110;
    sun.color.setRGB(tmpA[0] / 255, tmpA[1] / 255, tmpA[2] / 255, THREE.SRGBColorSpace);
    sun.intensity = 2.1 * day + 0.35 * night;                  // moonlight at night
    hemi.intensity = 0.5 + 1.4 * day;
    hemi.color.setHex(night > 0.5 ? 0x8090c0 : 0xdfeaff);
    const cloud = clouds.children[0] as THREE.Mesh | undefined;
    if (cloud) (cloud.material as THREE.MeshLambertMaterial).emissive.setScalar(0.55 * day + 0.04);
    // shadow direction: from the sun by day, from the moon by night
    const dir = new THREE.Vector3(-Math.cos(a), Math.max(0.25, Math.abs(elev)), 0.35).normalize();
    if (elev < 0) dir.x *= -1;
    sun.position.copy(follow).addScaledVector(dir, 120);
    sun.target.position.copy(follow);
  }
  apply();

  return {
    sun, hemi, dome, clouds,
    get time() { return time; },
    get night() { return night; },
    setTime(h: number) { time = ((h % 24) + 24) % 24; apply(); },
    fogDistance(near: number, far: number) { const f = scene.fog as THREE.Fog; f.near = near; f.far = far; },
    update(dt: number, around?: THREE.Vector3) {
      if (around) follow.copy(around);
      dome.position.copy(game.camera.position);
      celestial.position.copy(game.camera.position);
      cloudX = (cloudX + dt * 1.2) % (48 * 12);
      clouds.position.x = Math.floor(game.camera.position.x / (48 * 12)) * 48 * 12 + cloudX;
      apply();
    },
  };
}

function mergeBoxes(geos: THREE.BufferGeometry[]) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index!.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, ov * 3); nor.set(g.attributes.normal.array as Float32Array, ov * 3);
    const src = g.index!.array; for (let i = 0; i < src.length; i++) idx[oi + i] = src[i] + ov;
    ov += g.attributes.position.count; oi += src.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

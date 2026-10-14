/**
 * The CC0 asset library (assets/ — see assets/CATALOG.md, or browse /assets.html).
 *
 * Three.js:
 *   const car = await loadModel('car-kit/race');                    // THREE.Group (clone — use as many as you like)
 *   const hero = await loadModel('mini-characters/character-male-b');
 *   const anim = animate(hero);  anim.play('walk');  each frame: anim.update(dt)
 *   const anim = animate(person, await loadClips('rocketbox/anims-male'));   // shared clip library (Rocketbox people)
 *   const floor = await loadTexture('wood_floor_worn', { repeat: 8 });  // { map, normalMap, roughnessMap } → spread into a material
 *   await loadHdri(scene, 'stadium_01', { background: true });        // image-based lighting + optional sky
 * Sound (any engine):
 *   await sound.load('impact-sounds/footstep_wood_*');                 // preload (optional — play() loads lazily)
 *   sound.play('impact-sounds/footstep_wood_*', { volume: 0.5 })       // '*' = random variant each time
 * Anything (Phaser images, CSS, etc):
 *   assetUrl('sprites/tiny-dungeon/Tilemap/tilemap_packed.png')
 *
 * Files are served as-is from assets/ (Vite publicDir), so paths stay stable in dev, builds and itch.io zips.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { audio } from './audio';

/** Asset root, relative to the current page: games and templates live two levels down (<root>/games/<slug>/), the arcade at <root>/. */
const ROOT = new URL(/\/(games|templates)\/[^/]+\/?[^/]*$/.test(location.pathname) ? '../../' : './', location.href.replace(/[^/]*$/, ''));
export const assetUrl = (path: string) => new URL(path.replace(/^\/+/, ''), ROOT).href;

// ---------------------------------------------------------------- catalog (lazy, for wildcards + validation)
interface Catalog { models: Record<string, { name: string; animations?: string[] }[]>; sounds: Record<string, string[]>; textures: string[]; hdri: string[] }
let catalogP: Promise<Catalog> | null = null;
export const catalog = (): Promise<Catalog> => (catalogP ??= fetch(assetUrl('catalog.json')).then((r) => r.json() as Promise<Catalog>));

// ---------------------------------------------------------------- models
const gltfLoader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();
function gltf(id: string) {
  let p = gltfCache.get(id);
  if (!p) {
    p = gltfLoader.loadAsync(assetUrl(`models/${id}.glb`)).catch((e) => { gltfCache.delete(id); throw new Error(`loadModel('${id}') failed — check assets/CATALOG.md for the exact name. ${e}`); });
    gltfCache.set(id, p);
  }
  return p;
}

export interface ModelOpts {
  /** uniform scale, or a target height in metres via `height` */
  scale?: number; height?: number;
  /** enable shadows on every mesh (default true) */
  shadows?: boolean;
  /** tint every material (keeps texture detail) */
  tint?: number;
}
/** Load a model by "pack/name" (no .glb). Returns a fresh clone each call; skinned rigs are cloned correctly. */
export async function loadModel(id: string, o: ModelOpts = {}): Promise<THREE.Group> {
  let g: GLTF;
  // a missing model logs an error (playtests catch typos) but the game keeps running with a grey stand-in box
  try { g = await gltf(id); } catch (e) { console.error(`[assets] ${(e as Error).message}`); return placeholder(id, o); }
  const obj = SkeletonUtils.clone(g.scene) as THREE.Group;
  obj.userData.animations = g.animations;
  obj.userData.assetId = id;
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = o.shadows ?? true;
    if (o.tint !== undefined) { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(o.tint)); }
  });
  // measure posed geometry: skinned meshes need their bones' world matrices first, and `precise` bounds them by the skinned vertices
  if (o.height) { obj.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(obj, true); obj.scale.setScalar(o.height / Math.max(1e-6, b.max.y - b.min.y)); }
  else if (o.scale) obj.scale.setScalar(o.scale);
  return obj;
}
/** grey box standing in for a model that isn't in the library (sized like the request) */
function placeholder(id: string, o: ModelOpts): THREE.Group {
  const h = o.height ?? o.scale ?? 1;
  const box = new THREE.Mesh(new THREE.BoxGeometry(h * 0.5, h, h * 0.5).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.8 }));
  box.castShadow = box.receiveShadow = o.shadows ?? true;
  const g = new THREE.Group(); g.add(box); g.userData.animations = []; g.userData.assetId = id; g.userData.missing = true;
  return g;
}
/** Preload several models in parallel (cache only). */
export const preloadModels = (ids: string[]) => Promise.all(ids.map(gltf));

/** Bounding size of a model (after scale). */
export function sizeOf(obj: THREE.Object3D) { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj, true).getSize(new THREE.Vector3()); }

/** Animation helper for rigged models (Kenney characters share one rig: idle, walk, sprint, jump, die, attack-*, holding-*…). */
/** Animation clips from a library GLB (e.g. `loadClips('rocketbox/anims-female')`), playable on any model with the same skeleton. */
export const loadClips = async (id: string) => (await gltf(id)).animations as THREE.AnimationClip[];

export function animate(obj: THREE.Object3D, extraClips: THREE.AnimationClip[] = []) {
  const mixer = new THREE.AnimationMixer(obj);
  const clips = [...((obj.userData.animations ?? []) as THREE.AnimationClip[]), ...extraClips];
  let current: THREE.AnimationAction | null = null, currentName = '';
  return {
    mixer,
    names: clips.map((c) => c.name),
    /** Crossfade to a clip. once=true plays it a single time and holds the last frame. */
    play(name: string, o: { fade?: number; once?: boolean; speed?: number } = {}) {
      if (name === currentName && !o.once) { if (current && o.speed) current.timeScale = o.speed; return current; }
      const clip = clips.find((c) => c.name === name);
      if (!clip) { console.warn(`[assets] no animation "${name}" — have: ${clips.map((c) => c.name).join(', ')}`); return null; }
      const next = mixer.clipAction(clip);
      next.reset(); next.timeScale = o.speed ?? 1;
      next.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = !!o.once;
      if (current && current !== next) current.crossFadeTo(next, o.fade ?? 0.15, false);
      next.play();
      current = next; currentName = name;
      return next;
    },
    get current() { return currentName; },
    update(dt: number) { mixer.update(dt); },
  };
}

// ---------------------------------------------------------------- textures + skies
const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, Promise<THREE.Texture>>();
function tex(url: string, srgb: boolean) {
  const key = url + srgb;
  let p = texCache.get(key);
  if (!p) { p = texLoader.loadAsync(url).then((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t; }); texCache.set(key, p); }
  return p;
}
/** Poly Haven PBR set → material params: new THREE.MeshStandardMaterial({ ...(await loadTexture('brick_wall_001', { repeat: 4 })) }) */
export async function loadTexture(id: string, o: { repeat?: number | [number, number] } = {}) {
  const [map, normalMap, roughnessMap] = await Promise.all([
    // missing texture: a neutral grey map (the material's own colour shows through) instead of a crash
    tex(assetUrl(`textures/${id}/diff.jpg`), true).catch(() => { console.warn(`[assets] texture '${id}' isn't in the library — using plain grey`); return flat(); }),
    tex(assetUrl(`textures/${id}/nor.jpg`), false).catch(() => null),
    tex(assetUrl(`textures/${id}/rough.jpg`), false).catch(() => null),
  ]);
  const rep = Array.isArray(o.repeat) ? o.repeat : [o.repeat ?? 1, o.repeat ?? 1];
  const out: { map: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture } = { map: map.clone() };
  if (normalMap) out.normalMap = normalMap.clone();
  if (roughnessMap) out.roughnessMap = roughnessMap.clone();
  for (const t of Object.values(out)) if (t) { t.repeat.set(rep[0], rep[1]); t.needsUpdate = true; }
  return out;
}
function flat() { const t = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; }
/** Load an image from the library as a texture (sprites, particles, UI). */
export const loadImage = (path: string) => tex(assetUrl(path), true);

/** HDRI sky: sets scene.environment (realistic lighting/reflections) and optionally the visible background. */
export async function loadHdri(scene: THREE.Scene, id: string, o: { background?: boolean; renderer?: THREE.WebGLRenderer; intensity?: number; blur?: number } = {}) {
  // missing HDRI: a soft sky gradient keeps the scene lit (and has a sky) instead of a crash
  const hdr = await new HDRLoader().loadAsync(assetUrl(`hdri/${id}.hdr`)).catch(() => { console.warn(`[assets] HDRI '${id}' isn't in the library — using a plain sky`); return skyGradient(); });
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.environmentIntensity = o.intensity ?? 1;
  if (o.background) { scene.background = hdr; scene.backgroundBlurriness = o.blur ?? 0; scene.backgroundIntensity = o.intensity ?? 1; }
  return hdr;
}

/** equirectangular sky → horizon → ground gradient, used when an HDRI is missing */
function skyGradient() {
  const w = 4, h = 32, d = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const t = 1 - y / (h - 1);   // data row 0 is the bottom of the sphere: t 0 = top (sky) … 1 = bottom (ground)
    const c = t < 0.5 ? new THREE.Color(0x9cc4ff).lerp(new THREE.Color(0xdfe9f5), t * 2) : new THREE.Color(0x8a8578).lerp(new THREE.Color(0x4a463e), (t - 0.5) * 2);
    for (let x = 0; x < w; x++) d.set([c.r, c.g, c.b, 1], (y * w + x) * 4);
  }
  const tex = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType); tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- sound files
const bufCache = new Map<string, Promise<AudioBuffer>>();
const groupCache = new Map<string, Promise<string[]>>();
const lastPlay = new Map<string, number>();
async function expand(pattern: string): Promise<string[]> {
  if (!pattern.includes('*')) return [pattern];
  let p = groupCache.get(pattern);
  if (!p) {
    p = catalog().then((c) => {
      const [pack, glob] = pattern.split('/');
      const re = new RegExp('^' + glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      const hits = (c.sounds[pack] ?? []).filter((n) => re.test(n)).map((n) => `${pack}/${n}`);
      if (!hits.length) console.warn(`[assets] no sounds match "${pattern}"`);
      return hits;
    });
    groupCache.set(pattern, p);
  }
  return p;
}
function buffer(id: string) {
  let p = bufCache.get(id);
  if (!p) { p = fetch(assetUrl(`sounds/${id}.ogg`)).then((r) => { if (!r.ok) throw new Error(`sound "${id}" not found`); return r.arrayBuffer(); }).then((a) => audio.ctx.decodeAudioData(a)); bufCache.set(id, p); }
  return p;
}
export const sound = {
  /** Preload a sound or wildcard group so the first play has no delay. */
  async load(...patterns: string[]) { for (const pat of patterns) for (const id of await expand(pat)) await buffer(id).catch(() => {}); },
  /** Play a recorded sound. Routed through the kit audio bus, so mute/volume apply. */
  async play(pattern: string, o: { volume?: number; rate?: number; pan?: number; detune?: number; minGap?: number } = {}) {
    if (audio.muted || audio.ctx.state !== 'running') return;
    const now = audio.ctx.currentTime;
    if (now - (lastPlay.get(pattern) ?? -1) < (o.minGap ?? 0.04)) return;
    lastPlay.set(pattern, now);
    const ids = await expand(pattern);
    if (!ids.length) return;
    const buf = await buffer(ids[Math.floor(Math.random() * ids.length)]).catch((e) => { console.warn('[assets]', e.message); return null; });
    if (!buf) return;
    const src = audio.ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.06);
    if (o.detune) src.detune.value = o.detune;
    const g = audio.ctx.createGain(); g.gain.value = o.volume ?? 1;
    let node: AudioNode = g;
    if (o.pan) { const pn = audio.ctx.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(pn); node = pn; }
    src.connect(g); node.connect(audio.output); src.start();
  },
};

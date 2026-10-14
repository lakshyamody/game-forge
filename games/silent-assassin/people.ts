/**
 * Human-proportioned people: Quaternius UAL mannequins (CC0, one rig + 46 clips) dressed by an outfit shader.
 * The shader colours the mesh by region of its T-pose bind position (shoes, trousers, shirt/jacket, sleeves,
 * hands, face, hair, sunglasses, shirt + tie for suits), so every NPC gets its own clothes with no textures.
 *
 *   const p = await makePerson(civOutfit());   p.root, p.anim.play('Walk_Loop'), p.hand (right hand bone)
 */
import * as THREE from 'three';
import { loadModel, preloadModels, animate, sizeOf } from '@kit/assets';
import { rng } from '@kit/rng';

export interface Outfit {
  skin: number; hair: number; top: number; pants: number; shoes: number;
  shortSleeves?: boolean; glasses?: boolean; suit?: { shirt: number; tie: number }; bald?: boolean; female?: boolean;
}
const SKIN = [0xf2cfb0, 0xe3b28e, 0xc98e64, 0xa06a45, 0x6e452c];
const HAIR = [0x16110d, 0x2e1f14, 0x5a3a20, 0xa0784a, 0x262626, 0x8c8c8c];
const TOPS = [0x7a2630, 0x2d4a7a, 0x3d6a4a, 0xbfb07e, 0xdedad2, 0x5e507e, 0xc0763a, 0x3c4045, 0x8a8f96, 0x1e5a63];
const PANTS = [0x22304a, 0x252525, 0x54463a, 0x67675f, 0x1b2838, 0x3a3f2c];
const SHOES = [0x1a1a1a, 0x3a2a1e, 0xd8d8d8, 0x5a3a24];

export const civOutfit = (): Outfit => ({
  skin: rng.pick(SKIN), hair: rng.pick(HAIR), top: rng.pick(TOPS), pants: rng.pick(PANTS), shoes: rng.pick(SHOES),
  shortSleeves: rng.chance(0.4), bald: rng.chance(0.1), female: rng.chance(0.45),
});
/** security: black suit, white shirt, black tie, sunglasses */
export const guardOutfit = (): Outfit => ({
  skin: rng.pick(SKIN), hair: rng.pick(HAIR.slice(0, 5)), top: 0x15171b, pants: 0x15171b, shoes: 0x0a0a0a,
  glasses: true, suit: { shirt: 0xe8e8e8, tie: 0x0c0c0c }, bald: rng.chance(0.3),
});
/** the VIP: sharp coloured suit with a red tie so you can pick them out of a crowd */
export const targetOutfit = (): Outfit => ({
  skin: rng.pick(SKIN), hair: rng.pick(HAIR), top: rng.pick([0x5a1a22, 0x2a2f5a, 0x8a8478, 0x3c2a1e]), pants: 0x22242a, shoes: 0x2a1a10,
  suit: { shirt: 0xf2f0ea, tie: 0xc01020 },
});

const vert = /* glsl */`varying vec3 vBind;`;
const frag = /* glsl */`
varying vec3 vBind;
uniform vec3 uSkin, uHair, uTop, uPants, uShoes, uShirt, uTie;
uniform float uShort, uGlasses, uSuit, uBald, uSX, uSY;
vec3 outfit(vec3 q) {
  vec3 p = vec3(q.x * uSX, q.y * uSY, q.z);          // normalise to the 1.83 m male proportions
  float ax = abs(p.x);
  if (ax > 0.72) return uSkin;                                         // hands
  if (ax > 0.22 && p.y > 1.2) return (uShort > 0.5 && ax > 0.44) ? uSkin : uTop;   // arms (T-pose)
  if (p.y > 1.52) {                                                    // head
    if (uGlasses > 0.5 && p.z > 0.05 && p.y > 1.635 && p.y < 1.68) return vec3(0.015);
    bool hair = uBald < 0.5 && (p.y > 1.74 || (p.y > 1.6 && p.z < -0.02));
    return hair ? uHair : uSkin;
  }
  if (p.y > 1.47) return uSuit > 0.5 ? uShirt : uSkin;                 // neck / collar
  if (p.y > 0.97) {                                                    // torso
    if (uSuit > 0.5 && p.z > 0.04 && ax < 0.075 && p.y > 1.12) return ax < 0.022 && p.y < 1.45 ? uTie : uShirt;
    return uTop;
  }
  if (p.y > 0.085) return uPants;
  return uShoes;
}`;
function outfitMaterial(o: Outfit, sx: number, sy: number) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  const c = (h: number) => ({ value: new THREE.Color(h) });
  const u = {
    uSkin: c(o.skin), uHair: c(o.hair), uTop: c(o.top), uPants: c(o.pants), uShoes: c(o.shoes),
    uShirt: c(o.suit?.shirt ?? o.top), uTie: c(o.suit?.tie ?? o.top),
    uShort: { value: o.shortSleeves ? 1 : 0 }, uGlasses: { value: o.glasses ? 1 : 0 }, uSuit: { value: o.suit ? 1 : 0 }, uBald: { value: o.bald ? 1 : 0 },
    uSX: { value: sx }, uSY: { value: sy },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = vert + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    s.fragmentShader = frag + s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = outfit(vBind);');
  };
  m.customProgramCacheKey = () => 'outfit';
  return m;
}

let clips: THREE.AnimationClip[] = [];
export async function preloadPeople() {
  await preloadModels(['quaternius-ual/mannequin', 'quaternius-ual/mannequin-female']);
  clips = (await loadModel('quaternius-ual/mannequin')).userData.animations;
}

export interface Person { root: THREE.Group; model: THREE.Group; anim: ReturnType<typeof animate>; hand: THREE.Object3D | null; head: THREE.Object3D | null }
export async function makePerson(o: Outfit, height = 1.8): Promise<Person> {
  const model = await loadModel(o.female ? 'quaternius-ual/mannequin-female' : 'quaternius-ual/mannequin');
  model.userData.animations = clips;
  const size = sizeOf(model);
  const sx = 1.94 / size.x, sy = 1.83 / size.y;              // bind pose: arm span 1.94 m, height 1.83 m on the male
  const mat = outfitMaterial(o, sx, sy);
  model.traverse((c) => { const m = c as THREE.SkinnedMesh; if (m.isMesh) { m.material = mat; m.castShadow = true; m.receiveShadow = true; } });
  model.scale.setScalar(height / size.y);
  const root = new THREE.Group(); root.add(model);
  return { root, model, anim: animate(model), hand: model.getObjectByName('hand_r') ?? null, head: model.getObjectByName('Head') ?? null };
}

/** a plain black pistol, built from boxes (reads as a real handgun, unlike the toy blaster kit) */
export function pistol() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.35, metalness: 0.6 });
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.036, 0.19), mat); slide.position.set(0, 0.03, 0.05);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.11, 0.045), mat); grip.position.set(0, -0.025, -0.02); grip.rotation.x = -0.25;
  g.add(slide, grip); g.traverse((c) => { (c as THREE.Mesh).castShadow = true; });
  return g;
}

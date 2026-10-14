/**
 * Procedural cars for realistic scenes (free realistic car models are almost non-existent, so we build them):
 * extruded side profile with wheel arches and rounded edges, tinted glass cabin, clearcoat metallic paint,
 * spoked rims, emissive head/brake lights, plus taxi sign / police light bar. Front faces -z, origin at the ground.
 *
 *   const car = buildCar('sedan', 0x1f4fa0);   scene.add(car.root);
 *   each frame: car.wheels.forEach(w => w.spin.rotation.x -= speed * dt / car.wheelRadius); car.steer(angle); car.brake(on); car.update(t)
 */
import * as THREE from 'three';

export type CarKind = 'sedan' | 'sports' | 'suv' | 'taxi' | 'police' | 'van' | 'hatch';
interface Spec { L: number; W: number; H: number; clear: number; hood: number; deck: number; ws: number; roofA: number; roofB: number; rear: number; r: number; front: number; back: number }
const SPECS: Record<CarKind, Spec> = {
  // L length · W width · H roof · hood/deck heights · ws windscreen base · roofA/roofB roof span · rear glass base · r wheel radius · front/back axle x (from rear)
  sedan: { L: 4.7, W: 1.86, H: 1.45, clear: 0.2, hood: 0.92, deck: 0.98, ws: 3.25, roofA: 2.75, roofB: 1.55, rear: 0.95, r: 0.34, front: 3.85, back: 0.95 },
  taxi: { L: 4.7, W: 1.86, H: 1.47, clear: 0.2, hood: 0.92, deck: 0.98, ws: 3.25, roofA: 2.75, roofB: 1.5, rear: 0.9, r: 0.34, front: 3.85, back: 0.95 },
  police: { L: 4.9, W: 1.9, H: 1.48, clear: 0.2, hood: 0.94, deck: 1.0, ws: 3.35, roofA: 2.85, roofB: 1.55, rear: 0.95, r: 0.35, front: 4.0, back: 1.0 },
  sports: { L: 4.5, W: 1.98, H: 1.18, clear: 0.12, hood: 0.78, deck: 0.92, ws: 2.95, roofA: 2.35, roofB: 1.45, rear: 0.7, r: 0.35, front: 3.65, back: 0.95 },
  hatch: { L: 4.05, W: 1.78, H: 1.5, clear: 0.18, hood: 0.92, deck: 1.0, ws: 2.95, roofA: 2.5, roofB: 0.55, rear: 0.12, r: 0.32, front: 3.35, back: 0.72 },
  suv: { L: 4.85, W: 1.98, H: 1.8, clear: 0.28, hood: 1.15, deck: 1.15, ws: 3.55, roofA: 3.15, roofB: 0.55, rear: 0.18, r: 0.4, front: 3.95, back: 0.95 },
  van: { L: 5.2, W: 2.0, H: 2.15, clear: 0.24, hood: 1.15, deck: 1.15, ws: 4.35, roofA: 4.0, roofB: 0.2, rear: 0.05, r: 0.37, front: 4.4, back: 0.95 },
};
export const CAR_KINDS = Object.keys(SPECS) as CarKind[];

const mats = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1118, metalness: 0.9, roughness: 0.06, clearcoat: 1 }),
  black: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 1, roughness: 0.25 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe0e4ea, metalness: 1, roughness: 0.12 }),
};
const paint = (c: number) => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 });

/** side silhouette in the x (length) / y (height) plane, with wheel-arch cut-outs along the bottom */
function profile(s: Spec, cabin = false) {
  const sh = new THREE.Shape();
  if (cabin) {
    const e = 0.025;
    sh.moveTo(s.rear + 0.06, s.deck - e);
    sh.lineTo(s.roofB, s.H + e); sh.lineTo(s.roofA, s.H + e); sh.lineTo(s.ws, s.hood - e); sh.closePath();
    return sh;
  }
  const a = s.r + 0.06;
  sh.moveTo(0.05, s.clear);
  sh.lineTo(s.back - a, s.clear); sh.absarc(s.back, s.clear + 0.04, a, Math.PI, 0, true);
  sh.lineTo(s.front - a, s.clear); sh.absarc(s.front, s.clear + 0.04, a, Math.PI, 0, true);
  sh.lineTo(s.L - 0.08, s.clear);
  sh.quadraticCurveTo(s.L, s.clear + 0.05, s.L, s.clear + 0.3);
  sh.quadraticCurveTo(s.L - 0.02, s.hood - 0.06, s.L - 0.35, s.hood - 0.02);
  // body stops at the beltline; the glasshouse + roof are separate (narrower, so it reads as a real cabin)
  sh.lineTo(s.ws, s.hood);
  sh.lineTo(s.rear + 0.06, s.deck);
  sh.quadraticCurveTo(0, s.deck, 0, s.deck - 0.25);
  sh.lineTo(0, s.clear + 0.2); sh.quadraticCurveTo(0, s.clear, 0.05, s.clear);
  return sh;
}
function extrude(shape: THREE.Shape, width: number, bevel: number, m: THREE.Material) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 14 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return new THREE.Mesh(g, m);
}

export function buildCar(kind: CarKind = 'sedan', color = 0x1f4fa0) {
  const s = SPECS[kind];
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // the profile runs along +x from the rear; turn it so the nose points -z and centre it
  body.rotation.y = Math.PI / 2; body.position.z = s.L / 2;
  const P = paint(kind === 'taxi' ? 0xf2b705 : kind === 'police' ? 0xf4f4f4 : color);
  const BEV = 0.13, front = s.L + BEV, rearX = -BEV;   // bevel grows the shell beyond the profile
  body.add(extrude(profile(s), s.W, BEV, P));
  body.add(extrude(profile(s, true), s.W - 0.34, 0.06, mats.glass));
  // roof panel, pillars, bumpers, grille, mirrors
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.z = rz; body.add(b); return b; };
  box(Math.abs(s.roofA - s.roofB) + 0.08, 0.07, s.W - 0.3, kind === 'police' ? mats.black : P, (s.roofA + s.roofB) / 2, s.H + 0.06, 0);
  for (const side of [-1, 1]) {
    const bx = (s.ws + s.rear) / 2 + 0.1;
    box(0.12, s.H - s.deck + 0.1, 0.05, P, bx, (s.H + s.deck) / 2, side * (s.W / 2 - 0.17));                    // B-pillar
    box(0.24, 0.12, 0.14, P, s.ws - 0.05, s.hood + 0.12, side * (s.W / 2 + 0.07));                               // mirror
    box(Math.abs(s.ws - s.rear) * 0.8, 0.04, 0.03, mats.chrome, (s.ws + s.rear) / 2, s.hood + 0.02, side * (s.W / 2 + 0.005));   // beltline chrome
  }
  box(0.14, 0.22, s.W - 0.1, mats.black, front, s.clear + 0.16, 0);           // front bumper lip
  box(0.14, 0.24, s.W - 0.1, mats.black, rearX, s.clear + 0.16, 0);           // rear bumper
  box(0.04, 0.18, s.W * 0.45, mats.black, front + 0.01, s.clear + 0.42, 0);  // grille
  box(0.03, 0.12, 0.52, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }), rearX - 0.01, s.clear + 0.42, 0);   // number plate
  // lights (emissive so bloom catches them)
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 1.5 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a10, emissiveIntensity: 0.6 });
  for (const side of [-1, 1]) {
    box(0.05, 0.12, 0.42, head, front + 0.005, s.clear + 0.55, side * (s.W / 2 - 0.3));
    box(0.05, 0.13, 0.46, tail, rearX - 0.005, s.deck - 0.2, side * (s.W / 2 - 0.3));
  }
  if (kind === 'taxi') { const sign = box(0.25, 0.16, 0.6, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9a0, emissiveIntensity: 0.8 }), (s.roofA + s.roofB) / 2, s.H + 0.14, 0); sign.name = 'taxiSign'; }
  const beacons: THREE.MeshStandardMaterial[] = [];
  if (kind === 'police') {
    box(0.25, 0.08, s.W - 0.5, mats.black, (s.roofA + s.roofB) / 2, s.H + 0.1, 0);
    for (const [z, c] of [[-0.35, 0xff2020], [0.35, 0x2050ff]] as const) { const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 }); beacons.push(m); box(0.22, 0.1, 0.5, m, (s.roofA + s.roofB) / 2, s.H + 0.18, z); }
    // black doors + hood: the classic two-tone
    const blk = paint(0x111114);
    for (const side of [-1, 1]) box(1.7, 0.42, 0.02, blk, (s.front + s.back) / 2, s.clear + 0.5, side * (s.W / 2 + 0.01));
  }
  if (kind === 'suv' || kind === 'van') for (const side of [-1, 1]) box(Math.abs(s.roofA - s.roofB) - 0.3, 0.05, 0.05, mats.black, (s.roofA + s.roofB) / 2, s.H + 0.08, side * (s.W / 2 - 0.2));   // roof rails

  // wheels: steer pivot → spinning tyre + rim with spokes
  const wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  const tw = 0.26;
  for (const [x, front] of [[s.front, true], [s.back, false]] as const) for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(x, s.r, side * (s.W / 2 - tw / 2 + 0.03)); body.add(pivot);   // flush with the body sides
    const spin = new THREE.Group(); pivot.add(spin);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, tw, 28), mats.tyre); tyre.rotation.x = Math.PI / 2; spin.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.62, s.r * 0.62, tw + 0.01, 24), mats.rim); rim.rotation.x = Math.PI / 2; spin.add(rim);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(s.r * 1.1, 0.05, tw + 0.03), mats.black); sp.rotation.z = (k / 5) * Math.PI; spin.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, tw + 0.04, 12), mats.chrome); hub.rotation.x = Math.PI / 2; spin.add(hub);
    wheels.push({ pivot, spin, front });
  }
  body.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return {
    root, body, wheels, kind, paint: P, length: s.L, width: s.W, wheelRadius: s.r,
    /** front wheel steering angle (rad) */
    steer(a: number) { for (const w of wheels) if (w.front) w.pivot.rotation.y = a; },
    /** roll the wheels by distance travelled (m) */
    roll(d: number) { for (const w of wheels) w.spin.rotation.z -= d / s.r; },
    brake(on: boolean) { tail.emissiveIntensity = on ? 3 : 0.6; },
    lights(on: boolean) { head.emissiveIntensity = on ? 4 : 1.5; },
    /** police beacons flash when sirenOn */
    update(t: number, sirenOn = false) { beacons.forEach((m, i) => (m.emissiveIntensity = sirenOn && Math.floor(t * 6 + i) % 2 === 0 ? 8 : 0)); },
  };
}
export type Car = ReturnType<typeof buildCar>;

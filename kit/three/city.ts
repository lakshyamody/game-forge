/**
 * Procedural downtown for realistic Three.js games: a grid of city blocks with 4-lane roads (PBR asphalt, lane
 * markings, crosswalks), raised sidewalks, buildings (textured facades for low-rise, glass towers with lit windows
 * at night), rooftop clutter and street props from the library. Exposes traffic lanes, sidewalk loops and
 * building colliders.
 *
 *   const city = await buildCity(scene, { blocks: [4, 4], facades: ['Facade001', 'red_brick_03'], road: 'asphalt_02', sidewalk: 'PavingStones070' });
 *   city.solids            // axis-aligned building boxes {x0,z0,x1,z1} for collision
 *   city.lanes             // straight lane segments with direction (traffic follows them, turns at intersections)
 *   city.loops             // closed sidewalk loops around each block (pedestrians walk them)
 *   city.setNight(0..1)    // window lights + street lamp glow
 */
import * as THREE from 'three';
import { loadTexture, loadModel } from '../assets';
import { Rng } from '../rng';

export interface CityOpts {
  blocks?: [number, number]; block?: number; road?: string; sidewalk?: string; facades?: string[];
  seed?: number; maxHeight?: number; props?: { lamp?: string; tree?: string[]; extras?: string[] };
}
export interface Lane { ax: number; az: number; bx: number; bz: number; dir: [number, number] }
export interface Box { x0: number; z0: number; x1: number; z1: number; h: number }

const ROAD = 15, WALK = 4.5, CURB = 0.16;   // road width (4 lanes), sidewalk width, kerb height

/** BoxGeometry with UVs in world metres (so textures tile at real-world scale on any size of box) */
function worldBox(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2, z = p.getZ(i) + d / 2, ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.setXY(i, (ax > 0.5 ? z : x) / tile, (ay > 0.5 ? z : y) / tile);
  }
  return g;
}
/** storefront strip: glass panes, mullions, doors, a sign band — one canvas drives colour (day) and glow (night) */
function shopTextures(rng: Rng) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d')!;
  const e = document.createElement('canvas'); e.width = 512; e.height = 128; const eg = e.getContext('2d')!;
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 512, 128);
  const signs = ['#c8402c', '#1f5fa8', '#2d7a3e', '#d39a1c', '#7a2d7a', '#222a33'];
  for (let s = 0; s < 4; s++) {
    const x0 = s * 128, sign = rng.pick(signs), warm = rng.pick(['#ffd9a0', '#fff1d6', '#cfe4ff', '#ffe2b8']);
    g.fillStyle = sign; g.fillRect(x0, 0, 128, 22);                       // sign band
    g.fillStyle = '#ffffffcc'; g.fillRect(x0 + 18, 8, 92, 6);              // lettering
    eg.fillStyle = '#ffffff'; eg.fillRect(x0 + 18, 8, 92, 6);
    const glass = g.createLinearGradient(0, 24, 0, 128); glass.addColorStop(0, '#4a5866'); glass.addColorStop(1, '#232a31');
    g.fillStyle = glass; g.fillRect(x0 + 2, 24, 124, 104);
    eg.fillStyle = warm; eg.globalAlpha = 0.55 + rng.next() * 0.45; eg.fillRect(x0 + 2, 24, 124, 104); eg.globalAlpha = 1;
    g.fillStyle = '#15181c'; for (const mx of [x0, x0 + 42, x0 + 86, x0 + 127]) g.fillRect(mx, 22, 3, 106);   // mullions
    eg.fillStyle = '#000'; for (const mx of [x0, x0 + 42, x0 + 86, x0 + 127]) eg.fillRect(mx, 22, 3, 106);
    if (rng.next() < 0.6) { g.fillStyle = '#101317'; g.fillRect(x0 + 48, 40, 34, 88); eg.fillStyle = '#000'; eg.fillRect(x0 + 48, 40, 34, 88); }   // door
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const x of [t, te]) { x.wrapS = THREE.RepeatWrapping; x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; }
  return { map: t, emissiveMap: te };
}
/** curtain-wall glass texture with a random set of lit windows (same canvas drives colour + emission) */
function towerTextures(rng: Rng) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d')!;
  const e = document.createElement('canvas'); e.width = 256; e.height = 512; const eg = e.getContext('2d')!;
  const tint = rng.pick(['#2b3a4a', '#30404c', '#26323d', '#3a3f45', '#1f2c3a']);
  g.fillStyle = tint; g.fillRect(0, 0, 256, 512); eg.fillStyle = '#000'; eg.fillRect(0, 0, 256, 512);
  const cols = 8, rows = 16, cw = 256 / cols, rh = 512 / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const shade = 0.85 + rng.next() * 0.3;
    g.fillStyle = `rgba(${150 * shade | 0},${175 * shade | 0},${195 * shade | 0},0.55)`; g.fillRect(k * cw + 2, r * rh + 3, cw - 4, rh - 6);
    if (rng.next() < 0.38) { eg.fillStyle = rng.pick(['#ffe6b0', '#fff2d6', '#d7e8ff', '#ffd59a']); eg.fillRect(k * cw + 3, r * rh + 4, cw - 6, rh - 8); }
  }
  g.fillStyle = '#1a1f24'; for (let r = 0; r <= rows; r++) g.fillRect(0, r * rh - 1, 256, 3);   // floor slabs
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  for (const x of [t, te]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; }
  return { map: t, emissiveMap: te, floors: rows, cols };
}

export async function buildCity(scene: THREE.Scene, o: CityOpts = {}) {
  const rng = new Rng(o.seed ?? 7);
  const [nx, nz] = o.blocks ?? [4, 4], B = o.block ?? 64, P = B + ROAD;   // block size (incl. sidewalks) and pitch
  const W = nx * P + ROAD, D = nz * P + ROAD, ox = -W / 2, oz = -D / 2;
  const group = new THREE.Group(); scene.add(group);
  const solids: Box[] = [], lanes: Lane[] = [], loops: [number, number][][] = [];
  const windowMats: THREE.MeshStandardMaterial[] = [], lampGlows: THREE.MeshBasicMaterial[] = [];

  // ---- ground: one asphalt plane under everything; blocks sit on it
  const asphalt = await loadTexture(o.road ?? 'asphalt_02', { repeat: [W / 6, D / 6] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, D + 400), new THREE.MeshStandardMaterial({ ...asphalt, roughness: 0.9 }));
  (['map', 'normalMap', 'roughnessMap'] as const).forEach((k) => (ground.material as any)[k]?.repeat.set((W + 400) / 6, (D + 400) / 6));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // ---- lane markings + crosswalks (thin planes with polygon offset)
  const mark = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8a51c, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  const marks: THREE.Matrix4[] = [], yel: THREE.Matrix4[] = [];
  const m4 = (x: number, z: number, sx: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0.012, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(sx, sz, 1));
  for (let i = 0; i <= nx; i++) {   // north-south roads
    const cx = ox + i * P + ROAD / 2;
    for (let j = 0; j < nz; j++) {
      const z0 = oz + j * P + ROAD, z1 = z0 + B;
      yel.push(m4(cx - 0.12, (z0 + z1) / 2, 0.12, B), m4(cx + 0.12, (z0 + z1) / 2, 0.12, B));
      for (let z = z0 + 2; z < z1 - 2; z += 9) for (const s of [-1, 1]) marks.push(m4(cx + s * ROAD / 4, z + 1.5, 0.14, 3));
      for (let k = -3; k <= 3; k++) { marks.push(m4(cx + k * 2, z0 + 1.6, 1.1, 2.6)); marks.push(m4(cx + k * 2, z1 - 1.6, 1.1, 2.6)); }   // crosswalks
      // right-hand traffic: northbound (−z) keeps to +x, southbound to −x
      lanes.push({ ax: cx + ROAD / 4, az: z1, bx: cx + ROAD / 4, bz: z0, dir: [0, -1] });
      lanes.push({ ax: cx - ROAD / 4, az: z0, bx: cx - ROAD / 4, bz: z1, dir: [0, 1] });
    }
  }
  for (let j = 0; j <= nz; j++) {   // east-west roads
    const cz = oz + j * P + ROAD / 2;
    for (let i = 0; i < nx; i++) {
      const x0 = ox + i * P + ROAD, x1 = x0 + B;
      yel.push(m4((x0 + x1) / 2, cz - 0.12, B, 0.12), m4((x0 + x1) / 2, cz + 0.12, B, 0.12));
      for (let x = x0 + 2; x < x1 - 2; x += 9) for (const s of [-1, 1]) marks.push(m4(x + 1.5, cz + s * ROAD / 4, 3, 0.14));
      for (let k = -3; k <= 3; k++) { marks.push(m4(x0 + 1.6, cz + k * 2, 2.6, 1.1)); marks.push(m4(x1 - 1.6, cz + k * 2, 2.6, 1.1)); }
      lanes.push({ ax: x0, az: cz + ROAD / 4, bx: x1, bz: cz + ROAD / 4, dir: [1, 0] }, { ax: x1, az: cz - ROAD / 4, bx: x0, bz: cz - ROAD / 4, dir: [-1, 0] });
    }
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  for (const [list, mat] of [[marks, mark], [yel, yellow]] as const) { const im = new THREE.InstancedMesh(plane, mat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.receiveShadow = true; group.add(im); }

  // ---- blocks: sidewalk slab + buildings
  const walkTex = await loadTexture(o.sidewalk ?? 'concrete_wall_003', { repeat: 1 });
  const walkMat = new THREE.MeshStandardMaterial({ ...walkTex, roughness: 0.85 });
  const facadeMats = await Promise.all((o.facades ?? ['brick_wall_001', 'concrete_wall_003', 'painted_plaster_wall']).map(async (id) => new THREE.MeshStandardMaterial({ ...(await loadTexture(id, { repeat: 1 })), roughness: 0.85 })));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7, metalness: 0.3 });
  const towers = [0, 1, 2, 3].map(() => towerTextures(rng));
  const shops = [0, 1, 2, 3, 4, 5].map(() => shopTextures(rng));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const bx = ox + i * P + ROAD, bz = oz + j * P + ROAD;
    const slab = new THREE.Mesh(worldBox(B, CURB, B, 3), walkMat); slab.position.set(bx + B / 2, CURB / 2, bz + B / 2); slab.receiveShadow = true; group.add(slab);
    // sidewalk loop for pedestrians (mid-sidewalk, clockwise)
    const w = WALK / 2 + 0.3; loops.push([[bx + w, bz + w], [bx + B - w, bz + w], [bx + B - w, bz + B - w], [bx + w, bz + B - w]]);
    // lots: split the inner area into 2×2 or 3×2 buildings with alleys
    const inner = B - WALK * 2, ix = bx + WALK, iz = bz + WALK;
    const cols = rng.pick([2, 2, 3]), rows = 2, gap = 3;
    const centre = Math.hypot(bx + B / 2, bz + B / 2) / (Math.hypot(W, D) / 2);   // 0 at downtown core → taller
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
      const lw = (inner - gap * (cols - 1)) / cols, ld = (inner - gap * (rows - 1)) / rows;
      const x0 = ix + a * (lw + gap), z0 = iz + b * (ld + gap);
      const tall = rng.next() < 0.55 - centre * 0.4;
      const h = tall ? rng.range(45, o.maxHeight ?? 130) * (1.2 - centre) : rng.range(9, 26);
      let mesh: THREE.Mesh;
      if (tall) {
        const tt = rng.pick(towers), floor = 3.6;
        const mat = new THREE.MeshStandardMaterial({ map: tt.map, emissiveMap: tt.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.65, roughness: 0.15 });
        // one texture repeat = 16 floors × 8 bays (~3.2 m bays)
        for (const t of [mat.map!, mat.emissiveMap!]) t.repeat.set(1 / (8 * 3.2), 1 / (tt.floors * floor));
        mesh = new THREE.Mesh(worldBox(lw, h, ld, 1), mat); windowMats.push(mat);
      } else mesh = new THREE.Mesh(worldBox(lw, h, ld, 3.2), rng.pick(facadeMats));
      mesh.position.set(x0 + lw / 2, h / 2 + CURB, z0 + ld / 2); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
      solids.push({ x0, z0, x1: x0 + lw, z1: z0 + ld, h });
      // roof slab, parapet trim and rooftop clutter
      const roof = new THREE.Mesh(new THREE.BoxGeometry(lw - 0.6, 0.5, ld - 0.6), roofMat); roof.position.set(x0 + lw / 2, h + CURB + 0.25, z0 + ld / 2); group.add(roof);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(lw + 0.3, 0.6, ld + 0.3), trimMat); trim.position.set(x0 + lw / 2, h + CURB - 0.1, z0 + ld / 2); group.add(trim);
      for (let k = 0; k < rng.int(1, 4); k++) { const u = new THREE.Mesh(new THREE.BoxGeometry(rng.range(1.5, 3.5), rng.range(1, 2.5), rng.range(1.5, 3.5)), trimMat); u.position.set(x0 + rng.range(2, lw - 2), h + CURB + 1, z0 + rng.range(2, ld - 2)); u.castShadow = true; group.add(u); }
      // ground-floor storefront band on low-rise: darker glass strip with a lit sign band
      if (!tall) {
        const st = rng.pick(shops);
        const sf = new THREE.MeshStandardMaterial({ map: st.map, emissiveMap: st.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.35, roughness: 0.18 });
        windowMats.push(sf);
        for (const [sx, sz, w2, d2] of [[x0 + lw / 2, z0 - 0.05, lw - 1, 0.1], [x0 + lw / 2, z0 + ld + 0.05, lw - 1, 0.1], [x0 - 0.05, z0 + ld / 2, 0.1, ld - 1], [x0 + lw + 0.05, z0 + ld / 2, 0.1, ld - 1]]) {
          const g2 = new THREE.Mesh(worldBox(w2, 3.2, d2, 1), sf); g2.position.set(sx, CURB + 1.75, sz); group.add(g2);
          for (const t of [sf.map!, sf.emissiveMap!]) t.repeat.set(1 / 16, 1 / 3.2);   // 4 shops per 16 m, full height
        }
      }
    }
  }

  // ---- street props from the library (lamps along every sidewalk edge; trees + extras sprinkled)
  const lampId = o.props?.lamp ?? 'polyhaven/street_lamp_01';
  const lamp = await loadModel(lampId, { height: 6.5 }).catch(() => null);
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,214,150,0.9)'); r.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const pool = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffe2b0 }); lampGlows.push(pool);
  const lampPos: [number, number, number][] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const bx = ox + i * P + ROAD, bz = oz + j * P + ROAD;
    for (let t = 6; t < B - 4; t += 18) { lampPos.push([bx + t, bz + 0.8, 0], [bx + t, bz + B - 0.8, Math.PI], [bx + 0.8, bz + t, -Math.PI / 2], [bx + B - 0.8, bz + t, Math.PI / 2]); }
  }
  for (const [x, z, ry] of lampPos) {
    if (lamp) { const l = lamp.clone(); l.position.set(x, CURB, z); l.rotation.y = ry; l.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; }); group.add(l); }
    const g = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), pool); g.rotation.x = -Math.PI / 2; g.position.set(x, CURB + 0.02, z); group.add(g);
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), bulb); bb.position.set(x, CURB + 6.2, z); group.add(bb);
  }
  const extras = [...(o.props?.tree ?? []), ...(o.props?.extras ?? [])];
  const loaded = await Promise.all(extras.map((id) => loadModel(id).catch(() => null)));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const bx = ox + i * P + ROAD, bz = oz + j * P + ROAD;
    for (let k = 0; k < 6; k++) {
      const m = rng.pick(loaded); if (!m) continue;
      const side = rng.int(0, 3), t = rng.range(10, B - 10), inset = 1.6;
      const [x, z] = side === 0 ? [bx + t, bz + inset] : side === 1 ? [bx + t, bz + B - inset] : side === 2 ? [bx + inset, bz + t] : [bx + B - inset, bz + t];
      const c = m.clone(); c.position.set(x, CURB, z); c.rotation.y = rng.range(0, Math.PI * 2); c.traverse((q) => { if ((q as THREE.Mesh).isMesh) q.castShadow = q.receiveShadow = true; }); group.add(c);
    }
  }

  return {
    group, solids, lanes, loops, size: [W, D] as const, origin: [ox, oz] as const, pitch: P, road: ROAD, block: B, curb: CURB,
    /** 0 = day, 1 = full night: windows, storefronts and lamp pools light up */
    setNight(n: number) {
      for (const m of windowMats) m.emissiveIntensity = n * (m.metalness > 0.5 ? 1.1 : 1.8);   // towers dimmer than shopfronts, so bloom doesn't blow them out
      pool.opacity = n * 0.75; bulb.color.setScalar(0.6 + n * 2);
    },
    /** is a circle at (x,z) inside any building? returns push-out vector or null */
    collide(x: number, z: number, r: number) {
      for (const b of solids) {
        const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1)), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d < r) { if (d < 1e-4) return { x: 0, z: -r }; return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) }; }
      }
      return null;
    },
    /** height of the ground at (x,z): sidewalks are raised */
    groundY(x: number, z: number) {
      const lx = ((x - ox) % P + P) % P, lz = ((z - oz) % P + P) % P;
      return lx > ROAD && lz > ROAD ? CURB : 0;
    },
  };
}
export type City = Awaited<ReturnType<typeof buildCity>>;

/**
 * Defender AI: hold a post watching the attacker side, hear running and gunfire, engage on sight
 * after a reaction delay, hunt the last known position, rush the spike to defuse.
 */
import * as THREE from 'three';
import { loadModel, animate } from '@kit/assets';
import { angleDiff } from '@kit/math';
import { AI, CELL } from './config';
import { grid, toCell, toWorld, walkable, slide } from './map';

const LOOKS = ['character-male-c', 'character-female-b', 'character-male-f', 'character-female-e'];

export class Defender {
  root = new THREE.Group();
  gun = new THREE.Group();
  marker: THREE.Sprite;
  x = 0; z = 0; yaw = Math.PI; watchYaw = Math.PI;
  hp = AI.hp; alive = true;
  state: 'hold' | 'hunt' | 'defuse' = 'hold';
  path: { x: number; z: number }[] = [];
  seeT = 0; fireT = 0; lostT = 0; sees = false;
  lastSeen: { x: number; z: number } | null = null;
  strafeT = 0; strafe = 0;
  defuseT = 0; hurtT = 0;
  ready: Promise<void>;
  private anim: ReturnType<typeof animate> | null = null;
  private clip = '';
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(scene: THREE.Scene, public id: number) {
    scene.add(this.root);
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    g.fillStyle = '#ff4655'; g.beginPath(); g.moveTo(32, 60); g.lineTo(8, 20); g.lineTo(56, 20); g.closePath(); g.fill();
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    this.marker.scale.setScalar(0.6); this.marker.position.y = 2.4; this.marker.renderOrder = 10; this.marker.visible = false;
    this.root.add(this.marker);
    this.ready = (async () => {
      const m = await loadModel(`mini-characters/${LOOKS[id % LOOKS.length]}`, { height: 1.8 });
      m.rotation.y = Math.PI;   // Kenney characters face +z; ours face -z
      m.traverse((o) => {
        const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone(); mat.emissive = new THREE.Color(0x3a0008); mesh.material = mat; this.mats.push(mat);
      });
      this.root.add(m);
      this.anim = animate(m); this.play('holding-both');
      const gm = await loadModel('blaster-kit/blaster-h', { scale: 2.2 });
      this.gun.add(gm); this.gun.position.set(0.16, 1.05, -0.38); this.root.add(this.gun);
    })();
  }

  play(clip: string, once = false) { if (clip !== this.clip) { this.clip = clip; this.anim?.play(clip, { fade: 0.15, once }); } }

  spawn(x: number, z: number) {
    Object.assign(this, { x, z, hp: AI.hp, alive: true, state: 'hold', path: [], seeT: 0, fireT: 0, lostT: 0, sees: false, lastSeen: null, defuseT: 0, yaw: Math.PI, watchYaw: Math.PI + (Math.random() - 0.5) * 0.8 });
    this.root.visible = true; this.clip = ''; this.play('holding-both');
  }

  damage(n: number) {
    if (!this.alive) return false;
    this.hp -= n; this.hurtT = 0.12; this.defuseT = 0;
    if (this.hp <= 0) { this.alive = false; this.play('die', true); this.marker.visible = false; return true; }
    return false;
  }

  goTo(x: number, z: number) {
    const a = toCell(this.x, this.z), b = toCell(x, z);
    const p = grid.path(a, b, walkable);
    this.path = p ? p.slice(1).map((c) => toWorld(c.x, c.y)) : [];
    if (this.path.length) this.path[this.path.length - 1] = { x, z };
  }

  /** move along the path; returns true while moving */
  walk(dt: number) {
    const n = this.path[0]; if (!n) return false;
    const dx = n.x - this.x, dz = n.z - this.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { this.path.shift(); return this.path.length > 0; }
    const s = Math.min(d, AI.speed * dt);
    slide(this, (dx / d) * s, (dz / d) * s, 0.3);
    this.yaw += angleDiff(this.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
    return true;
  }

  update(dt: number, flash: boolean) {
    this.anim?.update(dt);
    this.hurtT -= dt;
    for (const m of this.mats) m.emissive.setHex(this.hurtT > 0 ? 0xff2030 : flash ? 0x5a0010 : 0x3a0008);
    this.root.position.set(this.x, 0, this.z); this.root.rotation.y = this.yaw;
    this.gun.visible = this.alive;
  }

  get headY() { return 1.62; }
  get cellSize() { return CELL; }
}

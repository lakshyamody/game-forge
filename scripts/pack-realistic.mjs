#!/usr/bin/env node
/**
 * node scripts/pack-realistic.mjs
 * Packs the realistic asset packs that Game Forge Studio downloads after install (they're left out of the installer):
 * dist-studio/realistic/realistic-textures.zip (textures + hdri), realistic-models.zip (Poly Haven props + Rocketbox
 * people) and realistic.json (name, size, sha256 of each). Upload all three to the GitHub release `realistic-v1`
 * (studio/main/library.mjs downloads from there). Each zip stays under GitHub's 2 GB file limit.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib/common.mjs';

const A = join(root, 'assets'), out = join(root, 'dist-studio/realistic');
const PACKS = { 'realistic-textures.zip': ['textures', 'hdri'], 'realistic-models.zip': ['models/polyhaven', 'models/rocketbox'] };
const sha256 = (f) => new Promise((ok) => { const h = createHash('sha256'); createReadStream(f).on('data', (c) => h.update(c)).on('end', () => ok(h.digest('hex'))); });

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const files = [];
for (const [name, dirs] of Object.entries(PACKS)) {
  const zip = join(out, name);
  console.log(`▸ ${name} (${dirs.join(', ')})`);
  execFileSync('zip', ['-qr', '-1', zip, ...dirs, '-x', '*.DS_Store'], { cwd: A, stdio: 'inherit' });   // paths relative to assets/
  const size = statSync(zip).size;
  if (size >= 2 * 1024 ** 3) throw new Error(`${name} is over GitHub's 2 GB limit: split it`);
  files.push({ name, size, sha256: await sha256(zip) });
  console.log(`  ${(size / 1048576).toFixed(0)} MB`);
}
writeFileSync(join(out, 'realistic.json'), JSON.stringify({ version: 1, files }, null, 2));
console.log(`✔ ${out}\n  upload: gh release create realistic-v1 ${out}/* (or gh release upload realistic-v1 … --clobber)`);

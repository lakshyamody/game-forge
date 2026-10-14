#!/usr/bin/env node
/**
 * npm run ship -- <slug>
 * Builds one game as a standalone static site in ship/<slug>/ and zips it to ship/<slug>.zip,
 * ready to upload to itch.io ("HTML" project, "This file will be played in the browser"),
 * Netlify Drop, GitHub Pages, or any static host.
 */
import { build } from 'vite';
import { existsSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync, cpSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';

import { root, walk } from './lib/common.mjs';
const slug = process.argv[2];
if (!slug || !existsSync(resolve(root, 'games', slug, 'index.html'))) { console.error('usage: npm run ship -- <slug>   (a folder in games/)'); process.exit(1); }
process.env.GAME = slug;
await build({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'warn' });
const out = resolve(root, 'ship', slug);

// copy only the library assets this game references (string literals like 'car-kit/race', 'impact-sounds/footstep_*',
// template prefixes like `voiceover-pack/${line}`, or explicit 'sprites/...'/'textures' ids)
const A = resolve(root, 'assets');
const sources = walk(resolve(root, 'games', slug)).filter((f) => /\.(ts|js)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
const literals = [...sources.matchAll(/(['"`])([a-z0-9_.\-/*]+(?:\$\{[^}]*\})?[a-z0-9_.\-/*]*)\1/gi)].map((m) => m[2]);
const keep = new Set(['catalog.json', 'LICENSES.md']);
const add = (p) => { if (existsSync(join(A, p))) keep.add(p); };
for (const lit of literals) {
  if (lit.length < 3 || lit.startsWith('.') || lit.startsWith('/')) continue;   // '' or './x' must not match whole folders
  const dynamic = lit.includes('${') || lit.includes('*');
  const [pack] = lit.split('/');
  if (lit.startsWith('sprites/') || lit.startsWith('models/') || lit.startsWith('sounds/')) { add(lit); continue; }
  for (const kind of ['models', 'sounds', 'sprites']) {
    if (!pack || !existsSync(join(A, kind, pack)) || !lit.includes('/')) continue;
    if (dynamic) {
      const prefix = lit.split(/\$\{|\*/)[0].slice(pack.length + 1);
      for (const f of readdirSync(join(A, kind, pack))) if (f.startsWith(prefix) && !f.startsWith('_')) keep.add(`${kind}/${pack}/${f}`);
    } else { add(`models/${lit}.glb`); add(`sounds/${lit}.ogg`); }
  }
  if (!lit.includes('/')) { add(`hdri/${lit}.hdr`); if (existsSync(join(A, 'textures', lit))) for (const f of readdirSync(join(A, 'textures', lit))) keep.add(`textures/${lit}/${f}`); }
}
// licence notices travel with the files that need them (MIT: Rocketbox people)
for (const p of [...keep]) { const lic = p.replace(/[^/]+$/, 'LICENSE.md'); if (p.startsWith('models/') && existsSync(join(A, lic))) keep.add(lic); }
let bytes = 0;
for (const p of keep) { if (statSync(join(A, p)).isDirectory()) continue; const d = join(out, p); mkdirSync(dirname(d), { recursive: true }); cpSync(join(A, p), d); bytes += statSync(join(A, p)).size; }
console.log(`  assets: ${keep.size} files (${(bytes / 1048576).toFixed(1)} MB) of the library`);
// hosts expect index.html at the zip root → redirect into the game
writeFileSync(resolve(out, 'index.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=games/${slug}/"><script>location.replace('games/${slug}/')</script>`);
const zip = resolve(root, 'ship', `${slug}.zip`);
rmSync(zip, { force: true });
if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}'`]);
else execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
console.log(`✔ ship/${slug}/  (static site)\n✔ ship/${slug}.zip  (upload to itch.io as an HTML game)`);

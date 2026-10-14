/** KayKit packs (Kay Lousberg, CC0) straight from GitHub: one embedded GLB per model, animations resampled. */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { walk } from '../lib/common.mjs';
import { A, io, download, unzip, tempDir, writeLicense } from './shared.mjs';

export const KAYKIT = {
  adventurers: 'Character-Pack-Adventures', skeletons: 'Character-Pack-Skeletons', 'medieval-hexagon': 'Medieval-Hexagon-Pack',
  'dungeon-remastered': 'Dungeon-Remastered', 'city-builder': 'City-Builder-Bits', 'prototype-bits': 'Prototype-Bits', 'halloween-bits': 'Halloween-Bits',
  'restaurant-bits': 'Restaurant-Bits', 'furniture-bits': 'Furniture-Bits', 'space-base': 'Space-Base-Bits',
};

export async function addKayKit(name) {
  const repo = KAYKIT[name];
  if (!repo) throw new Error(`unknown KayKit pack "${name}" — one of: ${Object.keys(KAYKIT).join(', ')}`);
  const tmp = tempDir('kaykit');
  process.stdout.write(`  ↓ kaykit-${name} … `);
  await download(`https://codeload.github.com/KayKit-Game-Assets/KayKit-${repo}-1.0/zip/HEAD`, join(tmp, 'pack.zip'));
  unzip(join(tmp, 'pack.zip'), join(tmp, 'x'));
  const files = walk(join(tmp, 'x'));
  // one copy of each model: prefer .glb, else .gltf (+ .bin + png); skip fbx/obj/engine folders
  const models = new Map();
  for (const f of files.filter((f) => /\.(glb|gltf)$/i.test(f) && !/(fbx|obj|godot|unity)/i.test(dirname(relative(tmp, f))))) {
    const id = basename(f).replace(/\.(glb|gltf)$/i, '').toLowerCase().replace(/[\s_]+/g, '-');
    if (!models.has(id) || f.endsWith('.glb')) models.set(id, f);
  }
  const slug = `kaykit-${name}`, out = join(A, 'models', slug);
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  for (const [id, f] of models) {
    const doc = await io.read(f);
    await doc.transform(resample(), dedup(), prune());   // drop redundant keyframes → animated rigs shrink a lot
    await io.write(join(out, `${id}.glb`), doc);
  }
  const lic = files.find((f) => /^license\.txt$/i.test(basename(f)));
  writeLicense(`KayKit — ${name}`, `https://github.com/KayKit-Game-Assets/KayKit-${repo}-1.0`, lic && /CC0|Zero/i.test(readFileSync(lic, 'utf8')) ? 'CC0' : 'see repo');
  rmSync(tmp, { recursive: true, force: true });
  console.log(`✔ ${slug}: ${models.size} models`);
}

/** ambientCG PBR materials (CC0, via their API) → assets/textures/<id>/{diff,nor,rough,ao,metal}.jpg at 1k. */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { walk } from '../lib/common.mjs';
import { A, getJson, download, unzip, tempDir, writeLicense } from './shared.mjs';

const MAPS = [['NormalGL', 'nor'], ['Roughness', 'rough'], ['AmbientOcclusion', 'ao'], ['Metalness', 'metal']];

export async function addMaterial(id, o) {
  const out = join(A, 'textures', id);
  if (existsSync(join(out, 'diff.jpg')) && !o.flag('force')) return console.log(`· ${id} (have it)`);
  const tmp = tempDir('acg');
  await download(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, join(tmp, 'm.zip'));
  unzip(join(tmp, 'm.zip'), join(tmp, 'x'));
  const files = walk(join(tmp, 'x'));
  const pick = (suffix) => files.find((f) => new RegExp(`_${suffix}\\.jpe?g$`, 'i').test(f));
  const color = pick('Color');
  if (!color) throw new Error(`${id}: no colour map (not a material?)`);
  mkdirSync(out, { recursive: true });
  cpSync(color, join(out, 'diff.jpg'));
  for (const [suffix, name] of MAPS) { const f = pick(suffix); if (f) cpSync(f, join(out, `${name}.jpg`)); }
  writeFileSync(join(out, 'meta.json'), JSON.stringify({ source: 'ambientCG', category: o.opt('category') ?? id.replace(/\d+[A-Z]?$/, '') }));
  rmSync(tmp, { recursive: true, force: true });
  writeLicense('ambientCG — PBR materials', 'https://ambientcg.com', 'CC0');
  console.log(`✔ ambientcg ${id}`);
}

/** material ids for --category / --q / --limit, most popular first */
export async function listIds(o) {
  const p = new URLSearchParams({ type: 'Material', sort: 'Popular', limit: String(o.opt('limit') ?? 20), include: 'tagData' });
  if (o.opt('category')) p.set('category', o.opt('category'));
  if (o.opt('q')) p.set('q', o.opt('q'));
  const d = await getJson(`https://ambientcg.com/api/v2/full_json?${p}`);
  return (d.foundAssets ?? []).map((a) => a.assetId);
}

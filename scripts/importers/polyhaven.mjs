/** Poly Haven (CC0, via their public API): PBR textures, HDRI skies and photoscanned models. */
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dedup, prune } from '@gltf-transform/functions';
import { A, io, getJson, download, tempDir, updateJson, writeLicense } from './shared.mjs';

const API = 'https://api.polyhaven.com';
export const TYPES = { texture: 'textures', hdri: 'hdris', model: 'models' };

/** is this id already in the library? */
export const have = (kind, id) => kind === 'model' ? existsSync(join(A, 'models/polyhaven', `${id}.glb`)) : kind === 'hdri' ? existsSync(join(A, 'hdri', `${id}.hdr`)) : existsSync(join(A, 'textures', id, 'diff.jpg'));

/** texture → assets/textures/<id>/{diff,nor,rough}.jpg; hdri → assets/hdri/<id>.hdr (1k) */
export async function addTextureOrHdri(id, kind) {
  const files = await getJson(`${API}/files/${id}`);
  const info = await getJson(`${API}/info/${id}`).catch(() => ({}));
  if (kind === 'hdri') {
    const url = files.hdri?.['1k']?.hdr?.url;
    if (!url) throw new Error(`no 1k HDRI for ${id}`);
    mkdirSync(join(A, 'hdri'), { recursive: true });
    await download(url, join(A, 'hdri', `${id}.hdr`));
    updateJson(join(A, 'hdri', '_meta.json'), (m) => { m[id] = { source: 'Poly Haven', categories: info.categories ?? [] }; });
  } else {
    const pick = (k) => files[k]?.['1k']?.jpg?.url;
    const maps = { diff: pick('Diffuse'), nor: pick('nor_gl'), rough: pick('Rough') };
    if (!maps.diff) throw new Error(`no 1k texture for ${id}`);
    const out = join(A, 'textures', id); mkdirSync(out, { recursive: true });
    for (const [k, url] of Object.entries(maps)) if (url) await download(url, join(out, `${k}.jpg`));
    writeFileSync(join(out, 'meta.json'), JSON.stringify({ source: 'Poly Haven', category: (info.categories ?? [])[0] ?? 'misc', categories: info.categories ?? [] }));
  }
  writeLicense(`Poly Haven — ${kind === 'hdri' ? 'HDRI skies' : 'PBR textures'}`, 'https://polyhaven.com', 'CC0');
  console.log(`✔ ${kind} ${id}`);
}

/** photoscanned model (real-world metres, 1k textures) → assets/models/polyhaven/<id>.glb; refuses files over --max-mb */
export async function addModel(id, o) {
  const files = await getJson(`${API}/files/${id}`);
  const g = files.gltf?.['1k']?.gltf ?? files.gltf?.['2k']?.gltf;
  if (!g) throw new Error(`no glTF for ${id}`);
  const tmp = tempDir('ph');
  await download(g.url, join(tmp, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include ?? {})) { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); await download(f.url, join(tmp, rel)); }
  const out = join(A, 'models', 'polyhaven'), glb = join(out, `${id}.glb`); mkdirSync(join(out, '_preview'), { recursive: true });
  const doc = await io.read(join(tmp, `${id}.gltf`));
  await doc.transform(dedup(), prune());
  await io.write(glb, doc);
  rmSync(tmp, { recursive: true, force: true });
  const mb = statSync(glb).size / 1e6, max = Number(o.opt('max-mb') ?? 25);
  if (mb > max) { rmSync(glb); throw new Error(`${id} is ${mb.toFixed(0)} MB (> --max-mb ${max}); skipped to keep the repo light`); }
  await download(`https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`, join(out, '_preview', `${id}.png`)).catch(() => {});
  const info = await getJson(`${API}/info/${id}`).catch(() => ({}));
  updateJson(join(out, '_meta.json'), (m) => { m[id] = { categories: info.categories ?? [], dimensions: info.dimensions ?? null }; });
  writeLicense('Poly Haven — models', 'https://polyhaven.com/models', 'CC0');
  console.log(`✔ model ${id}`);
}

/** ids for --category / --exclude / --limit / --all, most-downloaded first */
export async function listIds(kind, o) {
  const cat = o.opt('category'), all = await getJson(`${API}/assets?t=${TYPES[kind]}${cat ? `&c=${encodeURIComponent(cat)}` : ''}`);
  const ex = (o.opt('exclude') ?? '').split(',').filter(Boolean);   // e.g. --exclude indoor,studio (Poly Haven tags studios as urban too)
  const ids = Object.entries(all).filter(([, a]) => !ex.some((e) => (a.categories ?? []).includes(e))).sort((a, b) => (b[1].download_count ?? 0) - (a[1].download_count ?? 0)).map(([id]) => id);
  return o.flag('all') ? ids : ids.slice(0, Number(o.opt('limit') ?? 20));
}

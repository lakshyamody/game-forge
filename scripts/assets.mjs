#!/usr/bin/env node
/**
 * Asset library manager. Everything it imports is CC0 (public domain).
 *
 *   npm run assets -- add car-kit furniture-kit       # Kenney packs by slug (kenney.nl/assets/<slug>)
 *   npm run assets -- add car-kit --from ./downloads  # use an already-downloaded/unzipped pack dir
 *   npm run assets -- kaykit adventurers skeletons   # KayKit packs (github.com/KayKit-Game-Assets), e.g. medieval-hexagon
 *   npm run assets -- model street_lamp_01 fire_hydrant         # Poly Haven photoscanned models (1k textures, real-world metres)
 *   npm run assets -- model --category industrial --limit 40    # bulk: most-downloaded first (texture / hdri take the same flags; --all, --exclude indoor,studio)
 *   npm run assets -- rocketbox [Police_Male_01 …]            # Microsoft Rocketbox realistic people + mocap clip libraries (MIT; FBX converted in Chromium)
 *   npm run assets -- ambientcg Asphalt033 Bricks076            # ambientCG PBR materials (1k) → assets/textures/<id>/
 *   npm run assets -- ambientcg --category Bricks --limit 10
 *   npm run assets -- texture wood_floor_worn         # Poly Haven PBR texture (1k: diffuse, normal, rough)
 *   npm run assets -- hdri kloofendal_48d_partly_cloudy_puresky   # Poly Haven HDRI sky (1k)
 *   npm run assets -- catalog                          # rebuild assets/CATALOG.md + assets/catalog.json
 *
 * Layout written:
 *   assets/models/<pack>/<name>.glb      self-contained GLBs (textures embedded → safe for production builds)
 *   assets/models/<pack>/_preview/*.png  thumbnails (asset browser)
 *   assets/sprites/<pack>/...            2D tiles, sheets, UI, icons, particles
 *   assets/sounds/<pack>/*.ogg           sound effects, jingles, voice lines
 *   assets/textures/<id>/{diff,nor,rough}.jpg     assets/hdri/<id>.hdr
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const A = join(root, 'assets');
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const names = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);   // keep texture transforms, materials etc. intact

// Poly Haven's API terms ask every client to identify itself; we credit Poly Haven + ambientCG in README, LICENSES and the asset browser
const UA = { 'User-Agent': 'GameForge-AssetImporter/1.0 (+https://github.com/npmiaman/game-forge)' };
const getJson = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
async function download(url, dest) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}
function unzip(zip, dir) {
  mkdirSync(dir, { recursive: true });
  try { execFileSync('unzip', ['-qo', zip, '-d', dir]); } catch { execFileSync('tar', ['-xf', zip, '-C', dir]); }
}

// ---------------------------------------------------------------- Kenney
async function addKenney(slug) {
  let src = opt('from') ? resolve(opt('from'), slug) : null;
  if (!src || !existsSync(src)) {
    const page = await (await fetch(`https://kenney.nl/assets/${slug}`)).text();
    const url = page.match(new RegExp(`https://kenney\\.nl/media/pages/assets/${slug}/[^"]+\\.zip`))?.[0];
    if (!url) throw new Error(`no download found for "${slug}" — check https://kenney.nl/assets/${slug}`);
    const tmp = mkdtempSync(join(tmpdir(), 'kenney-'));
    process.stdout.write(`  ↓ ${slug} … `);
    await download(url, join(tmp, 'pack.zip'));
    unzip(join(tmp, 'pack.zip'), join(tmp, 'x'));
    src = join(tmp, 'x');
  }
  const files = walk(src);
  const glbDir = ['Models/GLB format', 'Models/GLTF format'].map((d) => join(src, d)).find((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.glb')));
  const oggs = files.filter((f) => f.endsWith('.ogg'));
  let summary = '';
  if (glbDir) {
    const out = join(A, 'models', slug); rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, '_preview'), { recursive: true });
    let n = 0;
    for (const f of readdirSync(glbDir).filter((f) => f.endsWith('.glb'))) {
      const doc = await io.read(join(glbDir, f));          // resolves external Textures/colormap.png
      await io.write(join(out, f), doc);                    // writes a GLB with everything embedded
      const name = basename(f, '.glb');
      const prev = [join(src, 'Previews', `${name}.png`), join(src, 'Isometric', `${name}_NE.png`), join(src, 'Isometric', `${name}_SE.png`)].find(existsSync);
      if (prev) cpSync(prev, join(out, '_preview', `${name}.png`));
      n++;
    }
    summary = `${n} models`;
  } else {
    const parts = [];
    // 2D: keep tiles, tilemaps/sheets, PNG folders, fonts; skip engine projects and vector sources
    const keep = files.filter((f) => /\.(png|txt|xml|tmx|tsx|ttf)$/i.test(f) && !/(Construct 3|Unity|Vector|Visit |Isometric|Side|Black background|Spritesheet\/.*black|Preview\.png|Sample)/i.test(relative(src, f)) && !/License/i.test(basename(f)));
    if (keep.some((f) => f.endsWith('.png'))) {
      const out = join(A, 'sprites', slug); rmSync(out, { recursive: true, force: true });
      for (const f of keep) { const d = join(out, relative(src, f).replace(/PNG \(Transparent\)\//, '')); mkdirSync(dirname(d), { recursive: true }); cpSync(f, d); }
      const prev = files.find((f) => /^preview\.png$/i.test(basename(f)));
      if (prev) cpSync(prev, join(out, '_preview.png'));
      parts.push(`${keep.length} sprite files`);
    }
    if (oggs.length) {
      const out = join(A, 'sounds', slug); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
      for (const f of oggs) cpSync(f, join(out, basename(f).toLowerCase().replace(/\s+/g, '_')));
      parts.push(`${oggs.length} sounds`);
    }
    summary = parts.join(' + ') || 'nothing importable';
  }
  const lic = files.find((f) => /^license\.txt$/i.test(basename(f)));
  writeLicense(`Kenney — ${slug}`, `https://kenney.nl/assets/${slug}`, lic ? readFileSync(lic, 'utf8').match(/License:?\s*\(?([^)\n]+)/i)?.[1]?.trim() ?? 'CC0' : 'CC0');
  console.log(`✔ ${slug}: ${summary}`);
}

// ---------------------------------------------------------------- KayKit (Kay Lousberg, CC0, on GitHub)
const KAYKIT = {
  adventurers: 'Character-Pack-Adventures', skeletons: 'Character-Pack-Skeletons', 'medieval-hexagon': 'Medieval-Hexagon-Pack',
  'dungeon-remastered': 'Dungeon-Remastered', 'city-builder': 'City-Builder-Bits', 'prototype-bits': 'Prototype-Bits', 'halloween-bits': 'Halloween-Bits',
  'restaurant-bits': 'Restaurant-Bits', 'furniture-bits': 'Furniture-Bits', 'space-base': 'Space-Base-Bits',
};
async function addKayKit(name) {
  const repo = KAYKIT[name];
  if (!repo) throw new Error(`unknown KayKit pack "${name}" — one of: ${Object.keys(KAYKIT).join(', ')}`);
  const tmp = mkdtempSync(join(tmpdir(), 'kaykit-'));
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

// ---------------------------------------------------------------- Poly Haven
async function polyhaven(id, kind) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const info = await getJson(`https://api.polyhaven.com/info/${id}`).catch(() => ({}));
  if (kind === 'hdri') {
    const url = files.hdri?.['1k']?.hdr?.url;
    if (!url) throw new Error(`no 1k HDRI for ${id}`);
    mkdirSync(join(A, 'hdri'), { recursive: true });
    await download(url, join(A, 'hdri', `${id}.hdr`));
    const mp = join(A, 'hdri', '_meta.json'), meta = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : {};
    meta[id] = { source: 'Poly Haven', categories: info.categories ?? [] }; writeFileSync(mp, JSON.stringify(meta, null, 1));
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

// ---------------------------------------------------------------- Microsoft Rocketbox people (MIT): FBX → GLB in headless Chromium
const RB_CAST = ['Adults/Male_Adult_01', 'Adults/Male_Adult_02', 'Adults/Male_Adult_03', 'Adults/Male_Adult_04', 'Adults/Male_Adult_05', 'Adults/Male_Adult_06', 'Adults/Male_Adult_07', 'Adults/Male_Adult_08',
  'Adults/Female_Adult_01', 'Adults/Female_Adult_02', 'Adults/Female_Adult_03', 'Adults/Female_Adult_04', 'Adults/Female_Adult_05', 'Adults/Female_Adult_06', 'Adults/Female_Adult_07', 'Adults/Female_Adult_08',
  'Professions/Business_Male_01', 'Professions/Business_Male_02', 'Professions/Business_Female_01', 'Professions/Police_Male_01', 'Professions/Police_Female_01', 'Professions/Construction_Male_01',
  'Professions/Medical_Female_01', 'Professions/Fire_Male_01', 'Professions/Military_Male_01', 'Professions/Security_Male_01', 'Professions/Sports_Male_01', 'Professions/Sports_Female_01',
  'Professions/Delivery_Male_01', 'Professions/Chef_Female_01', 'Children/Male_Child_01', 'Children/Female_Child_01'];
// clip name → [Rocketbox file stem, root-motion folder?]
const RB_ANIMS = { idle: ['idle_neutral_01'], 'idle-look': ['idle_look_around_01'], 'idle-wait': ['idle_waiting_01'], phone: ['cell_phone_talk_01'], wave: ['wave_01'], sit: ['sit_chair_idle_neutral_01'], crouch: ['crouch_idle'],
  walk: ['walk_neutral_01', 1], 'walk-fast': ['walk_fast_01', 1], stroll: ['walk_stroll_01', 1], run: ['run_neutral_01', 1], 'run-fast': ['run_fast_01', 1], drunk: ['walk_drunk', 1], cheer: ['cheer_02', 1] };
async function rocketbox() {
  const RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/';
  const src = opt('from') ? resolve(opt('from')) : join(root, '.scratch', 'rocketbox');
  const get = async (rel) => { const p = join(src, rel); if (!existsSync(p)) { mkdirSync(dirname(p), { recursive: true }); await download(RAW + rel, p); } return p; };
  const tree = await getJson('https://api.github.com/repos/microsoft/Microsoft-Rocketbox/git/trees/HEAD?recursive=1').catch(() => null);
  const files = tree ? tree.tree.map((t) => t.path) : walk(src).map((f) => 'Assets/' + relative(src, f));
  const { fbxConverter } = await import('./fbx2glb.mjs');
  const conv = await fbxConverter();
  const out = join(A, 'models', 'rocketbox'); mkdirSync(join(out, '_preview'), { recursive: true });
  const only = names.length ? names : RB_CAST;
  for (const who of only) {
    const name = who.split('/').pop(), slug = name.toLowerCase().replace(/_/g, '-');
    if (existsSync(join(out, `${slug}.glb`)) && !args.includes('--force')) { console.log(`· ${slug}`); continue; }
    const dir = `Avatars/${who.includes('/') ? who : RB_CAST.find((c) => c.endsWith('/' + who)) ?? who}`;
    const mine = files.filter((f) => f.startsWith(`Assets/${dir}/`)).map((f) => f.slice(7));
    for (const f of mine.filter((f) => /\/Textures\/.*\.tga$/i.test(f) || f.endsWith(`/Export/${name}.fbx`) || f === `${dir}/${name}.png`)) await get(f);
    await conv.model(join(src, dir, 'Export', `${name}.fbx`), { texturesDir: join(src, dir, 'Textures') }, join(out, `${slug}.glb`));
    if (existsSync(join(src, dir, `${name}.png`))) cpSync(join(src, dir, `${name}.png`), join(out, '_preview', `${slug}.png`));
    console.log(`✔ ${slug}`);
  }
  const speeds = {};
  for (const [lib, p] of [['anims-male', 'm'], ['anims-female', 'f']]) {
    const items = [];
    for (const [clip, [stem, moving]] of Object.entries(RB_ANIMS)) {
      const rel = `Animations/all_animations_max_motextr_${moving ? 'xy' : 'static'}/${p}_${stem}.max.fbx`;
      const alt = `Animations/all_animations_max_motextr_${moving ? 'static' : 'xy'}/${p}_${stem}.max.fbx`;
      const pick = files.includes('Assets/' + rel) ? rel : files.includes('Assets/' + alt) ? alt : null;
      if (pick) items.push({ path: await get(pick), name: clip, inPlace: pick.includes('_xy/') });
    }
    speeds[lib] = await conv.anims(items, join(out, `${lib}.glb`));
    console.log(`✔ ${lib}: ${items.map((i) => i.name).join(', ')}`);
  }
  writeFileSync(join(out, '_speeds.json'), JSON.stringify(speeds, null, 1));   // m/s of each moving clip (match move speed → no foot sliding)
  await conv.close();
  await download(RAW.replace('Assets/', 'LICENSE.md'), join(out, 'LICENSE.md')).catch(() => {});   // MIT: the notice travels with the files
  writeLicense('Microsoft Rocketbox — avatars + animations', 'https://github.com/microsoft/Microsoft-Rocketbox', 'MIT');
}

// ---------------------------------------------------------------- Poly Haven models (photoscanned, real-world scale)
async function polyhavenModel(id) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const g = files.gltf?.['1k']?.gltf ?? files.gltf?.['2k']?.gltf;
  if (!g) throw new Error(`no glTF for ${id}`);
  const tmp = mkdtempSync(join(tmpdir(), 'ph-'));
  await download(g.url, join(tmp, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include ?? {})) { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); await download(f.url, join(tmp, rel)); }
  const out = join(A, 'models', 'polyhaven'); mkdirSync(join(out, '_preview'), { recursive: true });
  const doc = await io.read(join(tmp, `${id}.gltf`));
  await doc.transform(dedup(), prune());
  await io.write(join(out, `${id}.glb`), doc);
  const mb = statSync(join(out, `${id}.glb`)).size / 1e6, max = Number(opt('max-mb') ?? 25);
  if (mb > max) { rmSync(join(out, `${id}.glb`)); rmSync(tmp, { recursive: true, force: true }); throw new Error(`${id} is ${mb.toFixed(0)} MB (> --max-mb ${max}); skipped to keep the repo light`); }
  await download(`https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`, join(out, '_preview', `${id}.png`)).catch(() => {});
  const info = await getJson(`https://api.polyhaven.com/info/${id}`).catch(() => ({}));
  const mp = join(out, '_meta.json'), meta = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : {};
  meta[id] = { categories: info.categories ?? [], dimensions: info.dimensions ?? null }; writeFileSync(mp, JSON.stringify(meta, null, 1));
  rmSync(tmp, { recursive: true, force: true });
  writeLicense('Poly Haven — models', 'https://polyhaven.com/models', 'CC0');
  console.log(`✔ model ${id}`);
}
/** ids for --category / --all, most-downloaded first */
async function polyhavenIds(type) {
  const cat = opt('category'), all = await getJson(`https://api.polyhaven.com/assets?t=${type}${cat ? `&c=${encodeURIComponent(cat)}` : ''}`);
  const ex = (opt('exclude') ?? '').split(',').filter(Boolean);   // e.g. --exclude indoor,studio (Poly Haven tags studios as urban too)
  const ids = Object.entries(all).filter(([, a]) => !ex.some((e) => (a.categories ?? []).includes(e))).sort((a, b) => (b[1].download_count ?? 0) - (a[1].download_count ?? 0)).map(([id]) => id);
  return args.includes('--all') ? ids : ids.slice(0, Number(opt('limit') ?? 20));
}

// ---------------------------------------------------------------- ambientCG materials (CC0)
async function ambientcg(id, category) {
  const out = join(A, 'textures', id);
  if (existsSync(join(out, 'diff.jpg')) && !args.includes('--force')) return console.log(`· ${id} (have it)`);
  const tmp = mkdtempSync(join(tmpdir(), 'acg-'));
  await download(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, join(tmp, 'm.zip'));
  unzip(join(tmp, 'm.zip'), join(tmp, 'x'));
  const files = walk(join(tmp, 'x'));
  const pick = (suffix) => files.find((f) => new RegExp(`_${suffix}\\.jpe?g$`, 'i').test(f));
  const color = pick('Color');
  if (!color) throw new Error(`${id}: no colour map (not a material?)`);
  mkdirSync(out, { recursive: true });
  cpSync(color, join(out, 'diff.jpg'));
  for (const [suffix, name] of [['NormalGL', 'nor'], ['Roughness', 'rough'], ['AmbientOcclusion', 'ao'], ['Metalness', 'metal']]) { const f = pick(suffix); if (f) cpSync(f, join(out, `${name}.jpg`)); }
  writeFileSync(join(out, 'meta.json'), JSON.stringify({ source: 'ambientCG', category: category ?? id.replace(/\d+[A-Z]?$/, '') }));
  rmSync(tmp, { recursive: true, force: true });
  writeLicense('ambientCG — PBR materials', 'https://ambientcg.com', 'CC0');
  console.log(`✔ ambientcg ${id}`);
}
async function ambientcgIds() {
  const p = new URLSearchParams({ type: 'Material', sort: 'Popular', limit: String(opt('limit') ?? 20), include: 'tagData' });
  if (opt('category')) p.set('category', opt('category')); if (opt('q')) p.set('q', opt('q'));
  const d = await getJson(`https://ambientcg.com/api/v2/full_json?${p}`);
  return (d.foundAssets ?? []).map((a) => a.assetId);
}

// ---------------------------------------------------------------- licenses + catalog
function writeLicense(title, url, license) {
  const p = join(A, 'LICENSES.md');
  const head = '# Asset licenses\n\nEvery asset here is free for commercial use and redistribution. Almost all are public domain (CC0, credit appreciated, not required); the Microsoft Rocketbox people are MIT — keep `models/rocketbox/LICENSE.md` with them. Poly Haven and ambientCG assets were fetched through their APIs (thanks!).\n\n| Asset | Source | License |\n|---|---|---|\n';
  const lines = existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Asset') ) : [];
  const row = `| ${title} | ${url} | ${license.includes('CC0') || license.includes('Zero') ? 'CC0' : license} |`;
  const rows = [...new Set([...lines.filter((l) => !l.startsWith(`| ${title} |`)), row])].sort();
  writeFileSync(p, head + rows.join('\n') + '\n');
}

function glbAnimations(file) {
  const b = readFileSync(file);
  const len = b.readUInt32LE(12);
  try { return (JSON.parse(b.subarray(20, 20 + len).toString()).animations ?? []).map((a) => a.name); } catch { return []; }
}

function catalog() {
  const cat = { models: {}, sprites: {}, sounds: {}, textures: [], hdri: [] };
  for (const pack of existsSync(join(A, 'models')) ? readdirSync(join(A, 'models')).sort() : []) {
    const dir = join(A, 'models', pack);
    cat.models[pack] = readdirSync(dir).filter((f) => f.endsWith('.glb')).sort().map((f) => {
      const anims = glbAnimations(join(dir, f));
      return { name: basename(f, '.glb'), preview: existsSync(join(dir, '_preview', basename(f, '.glb') + '.png')), ...(anims.length ? { animations: anims } : {}) };
    });
  }
  for (const pack of existsSync(join(A, 'sprites')) ? readdirSync(join(A, 'sprites')).sort() : []) cat.sprites[pack] = walk(join(A, 'sprites', pack)).filter((f) => f.endsWith('.png') && !f.endsWith('_preview.png')).map((f) => relative(join(A, 'sprites', pack), f)).sort();
  for (const pack of existsSync(join(A, 'sounds')) ? readdirSync(join(A, 'sounds')).sort() : []) cat.sounds[pack] = readdirSync(join(A, 'sounds', pack)).filter((f) => f.endsWith('.ogg')).map((f) => basename(f, '.ogg')).sort();
  cat.textures = existsSync(join(A, 'textures')) ? readdirSync(join(A, 'textures')).sort() : [];
  cat.hdri = existsSync(join(A, 'hdri')) ? readdirSync(join(A, 'hdri')).filter((f) => f.endsWith('.hdr')).map((f) => basename(f, '.hdr')).sort() : [];
  writeFileSync(join(A, 'catalog.json'), JSON.stringify(cat));

  // compact Markdown for agents: names collapse numbered variants (impact_01..05 → impact_0{1..5})
  const collapse = (list) => {
    const groups = new Map();
    for (const n of list) { const m = n.match(/^(.*?)(\d+)$/); const k = m ? m[1] : n; (groups.get(k) ?? groups.set(k, []).get(k)).push(m ? m[2] : null); }
    return [...groups].map(([k, v]) => (v[0] === null || v.length === 1 ? (v[0] === null ? k : k + v[0]) : `${k}{${v[0]}..${v.at(-1)}}`)).join(', ');
  };
  const nModels = Object.values(cat.models).reduce((a, l) => a + l.length, 0);
  const nSounds = Object.values(cat.sounds).reduce((a, l) => a + l.length, 0);
  let md = `# Asset catalog\n\nGenerated by \`npm run assets -- catalog\`. All free to ship: CC0, except Microsoft Rocketbox people (MIT, notice in models/rocketbox/LICENSE.md) — see LICENSES.md. Browse visually at \`/assets.html\` in the dev server.\n\n`;
  md += `**${nModels} 3D models · ${Object.values(cat.sprites).reduce((a, l) => a + l.length, 0)} sprites · ${nSounds} sounds · ${cat.textures.length} PBR textures · ${cat.hdri.length} HDRI skies**\n\n`;
  md += `Load them with \`kit/assets.ts\`: \`await loadModel('car-kit/race')\`, \`await loadTexture('wood_floor_worn')\`, \`await loadHdri(scene, 'stadium_01')\`, \`sound.play('impact-sounds/footstep_wood_*')\`, \`assetUrl('sprites/tiny-dungeon/Tilemap/tilemap_packed.png')\`.\n\n`;
  md += `## 3D models (\`assets/models/<pack>/<name>.glb\`)\n\n`;
  for (const [pack, list] of Object.entries(cat.models)) {
    md += `### ${pack} (${list.length})\n${collapse(list.map((m) => m.name))}\n\n`;
    const animated = list.filter((m) => m.animations);
    if (animated.length) md += `Animated (${animated.map((m) => m.name).join(', ')}): ${animated[0].animations.join(', ')}\n\n`;
  }
  md += `## Sprites (\`assets/sprites/<pack>/…\`)\n\n`;
  for (const [pack, list] of Object.entries(cat.sprites)) {
    const dirs = [...new Set(list.map((f) => dirname(f)))];
    md += `### ${pack} (${list.length})\n${dirs.map((d) => `- \`${d}/\`: ${collapse(list.filter((f) => dirname(f) === d).map((f) => basename(f, '.png')))}`).join('\n')}\n\n`;
  }
  md += `## Sounds (\`assets/sounds/<pack>/<name>.ogg\`)\n\n`;
  for (const [pack, list] of Object.entries(cat.sounds)) md += `### ${pack} (${list.length})\n${collapse(list)}\n\n`;
  const texCat = {};
  for (const id of cat.textures) { let c = 'misc'; try { c = JSON.parse(readFileSync(join(A, 'textures', id, 'meta.json'), 'utf8')).category || 'misc'; } catch { /* older import */ } (texCat[c] ??= []).push(id); }
  md += `## PBR textures (\`assets/textures/<id>/{diff,nor,rough}.jpg\` + sometimes ao/metal, 1k, tileable) — \`loadTexture('<id>', { repeat })\`\n`;
  for (const [c, ids] of Object.entries(texCat).sort()) md += `- **${c}** (${ids.length}): ${ids.join(', ')}\n`;
  let hmeta = {}; try { hmeta = JSON.parse(readFileSync(join(A, 'hdri', '_meta.json'), 'utf8')); } catch { /* none */ }
  const hCat = {}; for (const id of cat.hdri) { const c = hmeta[id]?.categories?.find((x) => !/^(natural light|high contrast|low contrast|medium contrast)$/.test(x)) ?? 'misc'; (hCat[c] ??= []).push(id); }
  md += `\n## HDRI skies (\`assets/hdri/<id>.hdr\`, 1k) — \`loadHdri(scene, '<id>')\`\n`;
  for (const [c, ids] of Object.entries(hCat).sort()) md += `- **${c}** (${ids.length}): ${ids.join(', ')}\n`;
  md += '\n';
  md += `## Adding more\n\`npm run assets -- add <kenney-slug>\` (any pack at kenney.nl/assets), \`npm run assets -- texture <polyhaven-id>\`, \`npm run assets -- hdri <polyhaven-id>\` (polyhaven.com), then \`npm run assets -- catalog\`.\n`;
  writeFileSync(join(A, 'CATALOG.md'), md);
  console.log(`✔ catalog: ${nModels} models, ${nSounds} sounds, ${cat.textures.length} textures, ${cat.hdri.length} hdri`);
}

// ---------------------------------------------------------------- main
mkdirSync(A, { recursive: true });
try {
  // one bad id shouldn't abort a batch
  const each = async (fn) => { let failed = 0; for (const n of names) { try { await fn(n); } catch (e) { failed++; console.error(`✖ ${n}: ${e.message}`); } } catalog(); if (failed) process.exitCode = 1; };
  if (cmd === 'add') await each(addKenney);
  else if (cmd === 'kaykit') await each(addKayKit);
  else if (cmd === 'texture' || cmd === 'hdri' || cmd === 'model') {
    if (!names.length) names.push(...(await polyhavenIds(cmd === 'texture' ? 'textures' : cmd === 'hdri' ? 'hdris' : 'models')));
    const have = (id) => cmd === 'model' ? existsSync(join(A, 'models/polyhaven', `${id}.glb`)) : cmd === 'hdri' ? existsSync(join(A, 'hdri', `${id}.hdr`)) : existsSync(join(A, 'textures', id, 'diff.jpg'));
    const todo = names.filter((id) => args.includes('--force') || !have(id)); names.length = 0; names.push(...todo);
    console.log(`  ${todo.length} to import`);
    await each((id) => (cmd === 'model' ? polyhavenModel(id) : polyhaven(id, cmd)));
  }
  else if (cmd === 'rocketbox') { await rocketbox(); catalog(); }
  else if (cmd === 'ambientcg') { if (!names.length) names.push(...(await ambientcgIds())); await each((id) => ambientcg(id, opt('category'))); }
  else if (cmd === 'catalog') catalog();
  else { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); process.exit(cmd ? 1 : 0); }
} catch (e) { console.error('✖', e.message); process.exit(1); }

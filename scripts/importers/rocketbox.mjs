/**
 * Microsoft Rocketbox people (MIT): FBX + TGA from GitHub → embedded GLBs (converted in headless Chromium, see
 * scripts/fbx2glb.mjs), plus two shared mocap libraries (anims-male / anims-female) and their walking speeds.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { root, walk } from '../lib/common.mjs';
import { A, getJson, download, writeLicense } from './shared.mjs';

const RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/';
export const CAST = ['Adults/Male_Adult_01', 'Adults/Male_Adult_02', 'Adults/Male_Adult_03', 'Adults/Male_Adult_04', 'Adults/Male_Adult_05', 'Adults/Male_Adult_06', 'Adults/Male_Adult_07', 'Adults/Male_Adult_08',
  'Adults/Female_Adult_01', 'Adults/Female_Adult_02', 'Adults/Female_Adult_03', 'Adults/Female_Adult_04', 'Adults/Female_Adult_05', 'Adults/Female_Adult_06', 'Adults/Female_Adult_07', 'Adults/Female_Adult_08',
  'Professions/Business_Male_01', 'Professions/Business_Male_02', 'Professions/Business_Female_01', 'Professions/Police_Male_01', 'Professions/Police_Female_01', 'Professions/Construction_Male_01',
  'Professions/Medical_Female_01', 'Professions/Fire_Male_01', 'Professions/Military_Male_01', 'Professions/Security_Male_01', 'Professions/Sports_Male_01', 'Professions/Sports_Female_01',
  'Professions/Delivery_Male_01', 'Professions/Chef_Female_01', 'Children/Male_Child_01', 'Children/Female_Child_01'];
// clip name → [Rocketbox file stem, root-motion folder?]
export const ANIMS = { idle: ['idle_neutral_01'], 'idle-look': ['idle_look_around_01'], 'idle-wait': ['idle_waiting_01'], phone: ['cell_phone_talk_01'], wave: ['wave_01'], sit: ['sit_chair_idle_neutral_01'], crouch: ['crouch_idle'],
  walk: ['walk_neutral_01', 1], 'walk-fast': ['walk_fast_01', 1], stroll: ['walk_stroll_01', 1], run: ['run_neutral_01', 1], 'run-fast': ['run_fast_01', 1], drunk: ['walk_drunk', 1], cheer: ['cheer_02', 1] };

export async function addRocketbox(o) {
  const src = o.opt('from') ? resolve(o.opt('from')) : join(root, '.scratch', 'rocketbox');   // raw-download cache
  const get = async (rel) => { const p = join(src, rel); if (!existsSync(p)) { mkdirSync(dirname(p), { recursive: true }); await download(RAW + 'Assets/' + rel, p); } return p; };
  const tree = await getJson('https://api.github.com/repos/microsoft/Microsoft-Rocketbox/git/trees/HEAD?recursive=1').catch(() => null);
  const files = tree ? tree.tree.map((t) => t.path) : walk(src).map((f) => 'Assets/' + relative(src, f).split(sep).join('/'));   // ids are '/' paths like the GitHub tree's
  const { fbxConverter } = await import('../fbx2glb.mjs');
  const conv = await fbxConverter();
  const out = join(A, 'models', 'rocketbox'); mkdirSync(join(out, '_preview'), { recursive: true });

  for (const who of o.names.length ? o.names : CAST) {
    const name = who.split('/').pop(), slug = name.toLowerCase().replace(/_/g, '-');
    if (existsSync(join(out, `${slug}.glb`)) && !o.flag('force')) { console.log(`· ${slug}`); continue; }
    const dir = `Avatars/${who.includes('/') ? who : CAST.find((c) => c.endsWith('/' + who)) ?? who}`;
    const mine = files.filter((f) => f.startsWith(`Assets/${dir}/`)).map((f) => f.slice(7));
    for (const f of mine.filter((f) => /\/Textures\/.*\.tga$/i.test(f) || f.endsWith(`/Export/${name}.fbx`) || f === `${dir}/${name}.png`)) await get(f);
    await conv.model(join(src, dir, 'Export', `${name}.fbx`), { texturesDir: join(src, dir, 'Textures') }, join(out, `${slug}.glb`));
    if (existsSync(join(src, dir, `${name}.png`))) cpSync(join(src, dir, `${name}.png`), join(out, '_preview', `${slug}.png`));
    console.log(`✔ ${slug}`);
  }

  const speeds = {};
  for (const [lib, p] of [['anims-male', 'm'], ['anims-female', 'f']]) {
    const items = [];
    for (const [clip, [stem, moving]] of Object.entries(ANIMS)) {
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
  await download(RAW + 'LICENSE.md', join(out, 'LICENSE.md')).catch(() => {});   // MIT: the notice travels with the files
  writeLicense('Microsoft Rocketbox — avatars + animations', 'https://github.com/microsoft/Microsoft-Rocketbox', 'MIT');
}

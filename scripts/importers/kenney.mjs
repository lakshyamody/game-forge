/** Kenney packs (kenney.nl, CC0): 3D kits → embedded GLBs + previews; 2D packs → sprites and/or sounds. */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { walk } from '../lib/common.mjs';
import { A, io, download, unzip, tempDir, writeLicense } from './shared.mjs';

export async function addKenney(slug, o) {
  let src = o.opt('from') ? resolve(o.opt('from'), slug) : null;
  if (!src || !existsSync(src)) {
    const page = await (await fetch(`https://kenney.nl/assets/${slug}`)).text();
    const url = page.match(new RegExp(`https://kenney\\.nl/media/pages/assets/${slug}/[^"]+\\.zip`))?.[0];
    if (!url) throw new Error(`no download found for "${slug}" — check https://kenney.nl/assets/${slug}`);
    const tmp = tempDir('kenney');
    process.stdout.write(`  ↓ ${slug} … `);
    await download(url, join(tmp, 'pack.zip'));
    unzip(join(tmp, 'pack.zip'), join(tmp, 'x'));
    src = join(tmp, 'x');
  }
  const files = walk(src);
  const glbDir = ['Models/GLB format', 'Models/GLTF format'].map((d) => join(src, d)).find((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.glb')));
  const summary = glbDir ? await importModels(slug, src, glbDir) : importSpritesAndSounds(slug, src, files);
  const lic = files.find((f) => /^license\.txt$/i.test(basename(f)));
  writeLicense(`Kenney — ${slug}`, `https://kenney.nl/assets/${slug}`, lic ? readFileSync(lic, 'utf8').match(/License:?\s*\(?([^)\n]+)/i)?.[1]?.trim() ?? 'CC0' : 'CC0');
  console.log(`✔ ${slug}: ${summary}`);
}

async function importModels(slug, src, glbDir) {
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
  return `${n} models`;
}

function importSpritesAndSounds(slug, src, files) {
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
  const oggs = files.filter((f) => f.endsWith('.ogg'));
  if (oggs.length) {
    const out = join(A, 'sounds', slug); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
    for (const f of oggs) cpSync(f, join(out, basename(f).toLowerCase().replace(/\s+/g, '_')));
    parts.push(`${oggs.length} sounds`);
  }
  return parts.join(' + ') || 'nothing importable';
}

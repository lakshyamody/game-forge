#!/usr/bin/env node
/**
 * Asset library manager. Imports only assets that are free to redistribute (CC0; Rocketbox is MIT).
 * One module per source in scripts/importers/.
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
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cli, usageOf } from './lib/common.mjs';
import { A } from './importers/shared.mjs';
import { catalog } from './importers/catalog.mjs';
import { addKenney } from './importers/kenney.mjs';
import { addKayKit } from './importers/kaykit.mjs';
import * as polyhaven from './importers/polyhaven.mjs';
import * as ambientcg from './importers/ambientcg.mjs';
import { addRocketbox } from './importers/rocketbox.mjs';

const o = cli();
const { cmd, names } = o;

/** import each name; one bad id doesn't abort the batch; the catalog is rebuilt at the end */
async function each(fn) {
  let failed = 0;
  for (const n of names) { try { await fn(n); } catch (e) { failed++; console.error(`✖ ${n}: ${e.message}`); } }
  catalog();
  if (failed) process.exitCode = 1;
}

mkdirSync(A, { recursive: true });
try {
  if (cmd === 'add') await each((n) => addKenney(n, o));
  else if (cmd === 'kaykit') await each(addKayKit);
  else if (cmd in polyhaven.TYPES) {
    if (!names.length) names.push(...(await polyhaven.listIds(cmd, o)));
    const todo = names.filter((id) => o.flag('force') || !polyhaven.have(cmd, id));
    names.splice(0, names.length, ...todo);
    console.log(`  ${todo.length} to import`);
    await each((id) => (cmd === 'model' ? polyhaven.addModel(id, o) : polyhaven.addTextureOrHdri(id, cmd)));
  }
  else if (cmd === 'ambientcg') { if (!names.length) names.push(...(await ambientcg.listIds(o))); await each((id) => ambientcg.addMaterial(id, o)); }
  else if (cmd === 'rocketbox') { await addRocketbox(o); catalog(); }
  else if (cmd === 'catalog') catalog();
  else { console.log(usageOf(readFileSync(fileURLToPath(import.meta.url), 'utf8'))); process.exit(cmd ? 1 : 0); }
} catch (e) { console.error('✖', e.message); process.exit(1); }

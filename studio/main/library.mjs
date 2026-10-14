/**
 * Packaged app only: the realistic asset packs (photoscanned PBR textures, HDRI skies, Poly Haven props, Rocketbox
 * people; ~1.8 GB) aren't in the installer. After launch they download in the background from the repo's
 * `realistic-v1` release, are checked against the manifest's sha256, and unpacked into ~/Game Forge/assets with the
 * system tar (bsdtar reads zip on macOS and Windows 10+). Interrupted downloads start that file again next launch.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT } from './paths.mjs';
import { childEnv, nodeScript, setToolsStatus } from './env.mjs';
import { realisticInstalled, stripLiteNote } from './workspace.mjs';

// STUDIO_REALISTIC_URL: tests point it at a local copy
export const REALISTIC = process.env.STUDIO_REALISTIC_URL ?? 'https://github.com/npmiaman/game-forge/releases/download/realistic-v1/';
const A = join(ROOT, 'assets'), TMP = join(ROOT, '.downloads');
const mb = (n) => `${Math.round(n / 1048576).toLocaleString()} MB`;
const done = (name) => existsSync(join(TMP, `${name}.done`));

/** onStatus(text) after each change ('ready' when finished); never throws */
export async function downloadRealistic(onStatus) {
  const status = (t) => { setToolsStatus(t); onStatus(t); };
  try {
    if (realisticInstalled()) { await catalogIfNeeded(); return; }
    mkdirSync(TMP, { recursive: true });
    const res = await fetch(`${REALISTIC}realistic.json`);
    if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
    const manifest = await res.json();   // { version, files: [{ name, size, sha256 }] }
    const total = manifest.files.reduce((a, f) => a + f.size, 0);
    let before = manifest.files.filter((f) => done(f.name)).reduce((a, f) => a + f.size, 0);
    for (const f of manifest.files) {
      if (done(f.name)) continue;
      const part = join(TMP, `${f.name}.part`);
      const sha = await download(`${REALISTIC}${f.name}`, part, (n) => status(`Downloading realistic textures, skies and people… ${Math.floor(((before + n) / total) * 100)}% (${mb(before + n)} of ${mb(total)})`));
      if (sha !== f.sha256) { rmSync(part, { force: true }); throw new Error(`${f.name} didn't match its checksum`); }
      status(`Unpacking ${f.name}…`);
      await untar(part, A);
      rmSync(part, { force: true }); writeFileSync(join(TMP, `${f.name}.done`), f.sha256);
      before += f.size;
    }
    writeFileSync(join(A, '.realistic'), String(manifest.version ?? 1));
    rmSync(TMP, { recursive: true, force: true });
    stripLiteNote();
    await catalogIfNeeded();
    status('ready');
  } catch (e) {
    status(`Realistic assets didn't finish downloading (${e.message}). Games still work; it tries again next launch.`);
  }
}

async function download(url, file, onBytes) {
  const res = await fetch(url);   // follows GitHub's redirect to its file storage
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const hash = createHash('sha256'); let n = 0, last = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { hash.update(c); n += c.length; if (n - last > 8 * 1048576) { last = n; onBytes(n); } });
  await pipeline(body, createWriteStream(file));
  onBytes(n);
  return hash.digest('hex');
}

const untar = (file, dest) => new Promise((ok, fail) => execFile('tar', ['-xf', file, '-C', dest], { env: childEnv(), windowsHide: true, maxBuffer: 1e7 }, (e, _o, err) => (e ? fail(new Error(`unpack failed: ${String(err || e.message).trim().slice(-200)}`)) : ok())));

/** the asset browser and CATALOG.md (what Claude reads) list the full library once it's in */
async function catalogIfNeeded() {
  if (existsSync(join(A, '.catalog-ok'))) return;
  const r = await nodeScript('scripts/assets.mjs', ['catalog']);
  if (r.code === 0) writeFileSync(join(A, '.catalog-ok'), readFileSync(join(A, '.realistic'), 'utf8'));
}

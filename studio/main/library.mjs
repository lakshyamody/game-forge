/**
 * Packaged app only: the realistic asset packs (photoscanned PBR textures, HDRI skies, Poly Haven props, Rocketbox
 * people; ~1.8 GB) aren't in the installer. After launch they download in the background from the repo's
 * `realistic-v1` release, are checked against the manifest's sha256, and unpacked into ~/Game Forge/assets with the
 * system tar (bsdtar reads zip on macOS and Windows 10+). An interrupted download carries on from its .part next launch.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT, IS_WIN } from './paths.mjs';
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
    if (before) await catalog();   // packs from an earlier launch; an app update may have copied the light CATALOG.md back
    for (const f of manifest.files) {
      if (done(f.name)) continue;
      const part = join(TMP, `${f.name}.part`);
      const sha = await download(`${REALISTIC}${f.name}`, part, f.size, (n) => status(`Downloading realistic textures, skies and people… ${Math.floor(((before + n) / total) * 100)}% (${mb(before + n)} of ${mb(total)})`));
      if (sha !== f.sha256) { rmSync(part, { force: true, maxRetries: 5 }); throw new Error(`${f.name} didn't match its checksum`); }
      status(`Unpacking ${f.name}…`);
      await untar(part, A);
      rmSync(part, { force: true, maxRetries: 5 }); writeFileSync(join(TMP, `${f.name}.done`), f.sha256);
      before += f.size;
      if (f !== manifest.files.at(-1)) await catalog();   // Claude Code can use this pack while the next downloads
    }
    writeFileSync(join(A, '.realistic'), String(manifest.version ?? 1));
    rmSync(TMP, { recursive: true, force: true, maxRetries: 5 });
    stripLiteNote();
    await catalogIfNeeded();
    status('ready');
  } catch (e) {
    status(`Realistic assets didn't finish downloading (${e.message}). Games still work; it tries again next launch.`);
  }
}

/** resumes `file` from what an earlier launch left: hashes those bytes, then asks only for the rest */
async function download(url, file, size, onBytes) {
  let hash = createHash('sha256'), n = 0;
  if (existsSync(file)) for await (const c of createReadStream(file)) { hash.update(c); n += c.length; }
  if (n) onBytes(n);
  if (n === size && size) return hash.digest('hex');   // all there; the app closed before unpacking it
  // follows GitHub's redirect to its file storage, which honours Range (206; 416 when the .part is already too long)
  let res = await fetch(url, n ? { headers: { Range: `bytes=${n}-` } } : undefined);
  const resumed = res.status === 206 && res.headers.get('content-range')?.startsWith(`bytes ${n}-`);
  if (n && !resumed && res.status !== 200) { await res.body?.cancel(); res = await fetch(url); }
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  if (!resumed) { hash = createHash('sha256'); n = 0; }   // whole file coming: start the .part again
  let last = n;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => { hash.update(c); n += c.length; if (n - last > 8 * 1048576) { last = n; onBytes(n); } });
  await pipeline(body, createWriteStream(file, { flags: resumed ? 'a' : 'w' }));
  onBytes(n);
  return hash.digest('hex');
}

// Windows: System32's bsdtar by full path. A PATH `tar` can be GNU tar (Git's usr\bin, MSYS2, Cygwin): it can't read zip and takes `C:` for a host, so the pack would re-download every launch
const TAR = IS_WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const untar = (file, dest) => new Promise((ok, fail) => execFile(TAR, ['-xf', file, '-C', dest], { env: childEnv(), windowsHide: true, maxBuffer: 1e7 }, (e, _o, err) => (e ? fail(new Error(`unpack failed: ${String(err || e.message).trim().slice(-200)}`)) : ok())));

/** the asset browser and CATALOG.md (what Claude reads) list what's on disk; never throws (a stale list beats a failed download) */
const catalog = () => nodeScript('scripts/assets.mjs', ['catalog']).catch(() => ({ code: 1 }));
/** the full library, once it's in (once per pack version) */
async function catalogIfNeeded() {
  if (existsSync(join(A, '.catalog-ok'))) return;
  const r = await catalog();
  if (r.code === 0) writeFileSync(join(A, '.catalog-ok'), readFileSync(join(A, '.realistic'), 'utf8'));
}

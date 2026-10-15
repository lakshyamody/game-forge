#!/usr/bin/env node
/**
 * node scripts/test/realistic-resume.mjs
 * The realistic-pack download (studio/main/library.mjs) on every OS, without Electron or GitHub: a local server that
 * honours Range (like GitHub's file storage) serves two small packs, slowly. Each "launch" is a child process running
 * downloadRealistic; the test kills it mid-file the way closing the app does, launches again, and checks the download
 * carries on from the .part (Range request, 206, progress doesn't go back to 0), the sha256 still passes, every pack
 * unpacks, and CATALOG.md is rebuilt as each pack lands. Also: a server that ignores Range (whole file again), a .part
 * that's already complete (no request), and one that's too long (416, whole file again).
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const T = join(tmpdir(), `gf-realistic-${process.pid}`), PACKS = join(T, 'packs'), MAIN = join(T, 'main'), ROOT = join(T, 'root');
const TMP = join(ROOT, '.downloads'), A = join(ROOT, 'assets');
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const sha = (b) => createHash('sha256').update(b).digest('hex');

let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✔' : '✖'} ${label}${ok ? '' : `\n${detail}`}`); if (!ok) failed++; };

// library.mjs runs as is next to stand-ins for its Electron-side imports; nodeScript logs the catalog runs
rmSync(T, { recursive: true, force: true }); mkdirSync(MAIN, { recursive: true }); mkdirSync(PACKS);
cpSync(join(repo, 'studio/main/library.mjs'), join(MAIN, 'library.mjs'));
writeFileSync(join(MAIN, 'paths.mjs'), `export const ROOT = process.env.TEST_ROOT, IS_WIN = process.platform === 'win32';\n`);
writeFileSync(join(MAIN, 'env.mjs'), `import { appendFileSync } from 'node:fs';
export const childEnv = () => process.env, setToolsStatus = () => {};
export const nodeScript = async (s, a) => { appendFileSync(process.env.TEST_LOG, [s, ...a].join(' ') + '\\n'); return { code: 0 }; };\n`);
writeFileSync(join(MAIN, 'workspace.mjs'), `import { existsSync } from 'node:fs'; import { join } from 'node:path';
export const realisticInstalled = () => existsSync(join(process.env.TEST_ROOT, 'assets', '.realistic')), stripLiteNote = () => {};\n`);
writeFileSync(join(MAIN, 'launch.mjs'), `import { downloadRealistic } from './library.mjs';
await downloadRealistic((t) => console.log(t));\n`);

// two packs of incompressible bytes, zipped by the same system tar the app unpacks with
const files = [];
for (const [name, mb] of [['textures', 6], ['models', 3]]) {
  const src = join(T, `src-${name}`); mkdirSync(join(src, name), { recursive: true });
  writeFileSync(join(src, name, 'data.bin'), randomBytes(mb * 1048576));
  execFileSync(TAR, ['-a', '-cf', join(PACKS, `${name}.zip`), name], { cwd: src });
  const b = readFileSync(join(PACKS, `${name}.zip`));
  files.push({ name: `${name}.zip`, size: b.length, sha256: sha(b), data: sha(readFileSync(join(src, name, 'data.bin'))) });
}
const manifest = JSON.stringify({ version: 1, files: files.map(({ data, ...f }) => f) });

// ~6 MB/s in 64 KB slices, so a launch can be killed partway through a pack
let log = [], sent = {}, honourRange = true;
const server = createServer((req, res) => {
  const name = req.url.slice(1), range = req.headers.range;
  if (name === 'realistic.json') return res.end(manifest);
  const f = files.find((x) => x.name === name); if (!f) { res.statusCode = 404; return res.end(); }
  const buf = readFileSync(join(PACKS, name)), m = honourRange && range && /^bytes=(\d+)-$/.exec(range);
  let start = 0;
  if (m && +m[1] >= buf.length) { log.push({ name, range, status: 416 }); res.writeHead(416, { 'Content-Range': `bytes */${buf.length}` }); return res.end(); }
  if (m) { start = +m[1]; res.writeHead(206, { 'Content-Range': `bytes ${start}-${buf.length - 1}/${buf.length}`, 'Content-Length': buf.length - start }); }
  else res.writeHead(200, { 'Content-Length': buf.length });
  log.push({ name, range, status: m ? 206 : 200 });
  let i = start; const tick = () => { if (res.destroyed) return; if (i >= buf.length) return res.end(); const c = buf.subarray(i, i += 65536); sent[name] = (sent[name] ?? 0) + c.length; res.write(c); setTimeout(tick, 10); };
  tick();
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const URL_ = `http://127.0.0.1:${server.address().port}/`, CATLOG = join(T, 'catalog.log');

/** one app launch; killAt(): kill it once that returns true (polled) */
function launch(killAt) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [join(MAIN, 'launch.mjs')], { env: { ...process.env, STUDIO_REALISTIC_URL: URL_, TEST_ROOT: ROOT, TEST_LOG: CATLOG }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; p.stdout.on('data', (d) => { out += d; });
    const t = killAt && setInterval(() => { if (killAt()) { clearInterval(t); p.kill('SIGKILL'); } }, 15);
    p.on('exit', () => { if (t) clearInterval(t); ok(out.trim().split('\n').filter(Boolean)); });
  });
}
const partSize = (name) => { try { return statSync(join(TMP, `${name}.part`)).size; } catch { return 0; } };
const pct = (line) => +(/(\d+)%/.exec(line ?? '')?.[1] ?? -1);
const unpacked = () => files.every((f) => { const p = join(A, f.name.replace('.zip', ''), 'data.bin'); return existsSync(p) && sha(readFileSync(p)) === f.data; });
const catalogs = () => (existsSync(CATLOG) ? readFileSync(CATLOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);
const reset = () => { rmSync(ROOT, { recursive: true, force: true }); mkdirSync(A, { recursive: true }); rmSync(CATLOG, { force: true }); log = []; sent = {}; honourRange = true; };
const [tex, mod] = files;

try {
  // 1. closed partway through the first pack, then partway through the second
  reset();
  const first = await launch(() => partSize(tex.name) > tex.size * 0.4);
  const kept = partSize(tex.name);
  check(`killed mid-file leaves a .part (${kept} of ${tex.size} bytes)`, kept > 0 && kept < tex.size);
  const second = await launch(() => partSize(mod.name) > mod.size * 0.3);
  const req = log.filter((r) => r.name === tex.name)[1];
  check(`relaunch asks for the rest: Range ${req?.range} → ${req?.status}`, req?.status === 206 && req.range === `bytes=${kept}-`, JSON.stringify(log));
  const total = tex.size + mod.size, want = Math.floor((kept / total) * 100);
  check(`progress starts at what's kept (${want}%), not 0: ${second[0]}`, pct(second[0]) === want && want > 0 && pct(first.at(-1)) <= want, second.join('\n'));
  check('first pack passed its checksum and unpacked', existsSync(join(TMP, `${tex.name}.done`)) && !existsSync(join(TMP, `${tex.name}.part`)), second.join('\n'));
  check('CATALOG.md rebuilt once the first pack is in (before the second finishes)', catalogs() === 1, `${catalogs()} catalog runs`);
  const keptMod = partSize(mod.name);
  const third = await launch();
  const reqMod = log.filter((r) => r.name === mod.name).at(-1);
  check(`second pack resumes too: Range ${reqMod?.range} → ${reqMod?.status}`, reqMod?.status === 206 && reqMod.range === `bytes=${keptMod}-`, JSON.stringify(log));
  check('third launch: ready, both packs unpacked byte for byte', third.at(-1) === 'ready' && unpacked() && existsSync(join(A, '.realistic')), third.join('\n'));
  check('CATALOG.md rebuilt at launch for packs already in, and once all are in', catalogs() === 3, `${catalogs()} catalog runs`);
  check(`first pack's bytes sent once, give or take a slice (${sent[tex.name]} for ${tex.size})`, sent[tex.name] - tex.size < 2 * 65536);

  // 2. a server that ignores Range sends the whole file: start the .part again, checksum still passes
  reset(); honourRange = false;
  await launch(() => partSize(tex.name) > tex.size * 0.4);
  const out = await launch();
  check('server without Range: whole file again (200), ready, checksums pass', out.at(-1) === 'ready' && unpacked() && log.filter((r) => r.name === tex.name).every((r) => r.status === 200), out.join('\n'));

  // 3. a complete .part (closed while unpacking) needs no request; 4. one that's too long gets 416 → whole file
  reset(); mkdirSync(TMP, { recursive: true });
  cpSync(join(PACKS, tex.name), join(TMP, `${tex.name}.part`));
  writeFileSync(join(TMP, `${mod.name}.part`), Buffer.concat([readFileSync(join(PACKS, mod.name)), randomBytes(1000)]));
  const out3 = await launch();
  check('complete .part: unpacked without downloading it again', !log.some((r) => r.name === tex.name), JSON.stringify(log));
  check(`too-long .part: ${log.filter((r) => r.name === mod.name).map((r) => r.status).join(' → ')}, then ready`, out3.at(-1) === 'ready' && unpacked() && log.filter((r) => r.name === mod.name).map((r) => r.status).join() === '416,200', out3.join('\n'));

  // 5. a corrupt .part of the right length fails the checksum and goes, so the next launch starts it clean
  reset(); mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, `${tex.name}.part`), randomBytes(tex.size));
  const bad = await launch();
  check('corrupt .part: checksum error, .part removed', /didn't match its checksum/.test(bad.at(-1)) && !existsSync(join(TMP, `${tex.name}.part`)), bad.join('\n'));
  const good = await launch();
  check('…and the next launch downloads it whole', good.at(-1) === 'ready' && unpacked(), good.join('\n'));
} finally {
  server.close(); server.closeAllConnections();
  rmSync(T, { recursive: true, force: true, maxRetries: 5 });
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

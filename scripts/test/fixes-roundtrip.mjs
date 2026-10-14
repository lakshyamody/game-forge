#!/usr/bin/env node
/**
 * node scripts/test/fixes-roundtrip.mjs
 * Staged fixes without git, on every OS: make a throwaway game, change it (edit, new file, deleted file, CRLF lines),
 * `fixes save` → `apply` → `apply` again → `undo`, and check every file's bytes at each step. Removes the game after.
 * Then, for each game named on the command line, apply and undo each of its real fixes (on Windows the checkout has
 * CRLF line endings while the patches are LF) and check the game comes back byte for byte.
 *
 *   node scripts/test/fixes-roundtrip.mjs [slug…]
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { root, walk } from '../lib/common.mjs';

const slug = 'zz-fixes-roundtrip', G = join(root, 'games', slug), BASE = join(root, '.scratch/fixbase', slug);
const node = (script, ...args) => { try { return execFileSync(process.execPath, [join(root, script), ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { return `${e.stdout}${e.stderr}`; } };
const fixes = (...a) => node('scripts/fixes.mjs', ...a);
const snap = (dir = G) => walk(dir).map((f) => relative(dir, f).split(sep).join('/')).filter((f) => !f.startsWith('fixes/') && f !== 'FIXES.md').sort()
  .map((f) => `${f}:${createHash('sha1').update(readFileSync(join(dir, f))).digest('hex')}`).join('\n');
const clean = () => { rmSync(G, { recursive: true, force: true }); rmSync(BASE, { recursive: true, force: true }); };

let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✔' : '✖'} ${label}${ok ? '' : `\n${detail}`}`); if (!ok) failed++; };
clean();
try {
  node('scripts/new-game.mjs', slug, '--template', 'blank');
  check('throwaway game created', existsSync(join(G, 'game.json')));
  fixes('start', slug);
  const before = snap();
  writeFileSync(join(G, 'config.ts'), readFileSync(join(G, 'config.ts'), 'utf8').replace(/^/gm, '// x\n'));
  writeFileSync(join(G, 'added.ts'), 'export const ADDED = 1;\n');
  appendFileSync(join(G, 'game.json'), '\r\n\r\n');
  rmSync(join(G, 'GAME.md'));
  const edited = snap();
  const saved = fixes('save', slug, '1');
  check('save writes fixes/1.patch', existsSync(join(G, 'fixes/1.patch')), saved);
  check('save rolls the game back to the base', snap() === before);
  const a = fixes('apply', slug, '1');
  check('apply reproduces the edit, new file, deleted file and CRLF lines byte for byte', snap() === edited, a);
  check('applying twice says it is already applied', /already applied/.test(fixes('apply', slug, '1')));
  const u = fixes('undo', slug, '1');
  check('undo restores the base byte for byte', snap() === before, u);
} finally { clean(); }

for (const game of process.argv.slice(2)) {
  const dir = join(root, 'games', game), before = snap(dir);
  for (const f of walk(join(dir, 'fixes')).filter((f) => /\d+\.patch$/.test(f))) {
    const n = f.match(/(\d+)\.patch$/)[1];
    const a = fixes('apply', game, n);
    if (/already applied/.test(a)) { console.log(`· ${game} fix ${n} was already applied, skipped`); continue; }
    check(`${game}: fix ${n} applies and type-checks`, /✔ applied/.test(a) && !/✖/.test(a) && snap(dir) !== before, a);
    const u = fixes('undo', game, n);
    check(`${game}: undo fix ${n} restores the game byte for byte`, snap(dir) === before, u);
  }
}
process.exit(failed ? 1 : 0);

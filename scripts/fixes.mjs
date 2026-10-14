#!/usr/bin/env node
/**
 * Staged fixes: prepare a fix as a patch now, apply it instantly later ("fix 2").
 *
 *   npm run fixes -- start  <slug>          # snapshot the game as the base for staging fixes
 *   npm run fixes -- save   <slug> <n>      # save current edits as fixes/<n>.patch, then roll the game back to the base
 *   npm run fixes -- apply  <slug> <n…|all> # apply staged fix(es), type-check, tick them off in FIXES.md
 *   npm run fixes -- undo   <slug> <n>      # reverse an applied fix
 *   npm run fixes -- list   <slug>          # show staged fixes and their status
 *
 * Patches live in games/<slug>/fixes/<n>.patch next to FIXES.md (the kid-level problem list + fix plans).
 * Each patch is made against the same base, so fixes apply independently in any order unless two touch
 * the same lines — then the second one reports a conflict and you re-implement it from its plan in FIXES.md.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, walk, usageOf, typecheck as tsc } from './lib/common.mjs';
import { planPatch, commit, makePatch } from './lib/patch.mjs';
const [cmd, slug, ...rest] = process.argv.slice(2);
const usage = () => { console.log(usageOf(readFileSync(fileURLToPath(import.meta.url), 'utf8'))); process.exit(1); };
if (!cmd || !slug) usage();
const game = join(root, 'games', slug);
if (!existsSync(game)) { console.error(`✖ no game "${slug}" in games/`); process.exit(1); }
const fixesDir = join(game, 'fixes');
const base = join(root, '.scratch', 'fixbase', slug);
const fixesMd = join(game, 'FIXES.md');
const rel = (p) => relative(root, p).split('\\').join('/');

/** copy a game folder, leaving out its fixes/ dir */
function copyGame(from, to) {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (f !== 'fixes') cpSync(join(from, f), join(to, f), { recursive: true });
}
/** type errors in this game or the shared code (another game's broken file shouldn't block this one); null = clean */
function typecheck() {
  const errs = tsc({ only: (l) => l.startsWith(`games/${slug}/`) || /^(kit|templates|src)\//.test(l) });
  return errs?.length ? errs.slice(0, 15).join('\n') : null;
}
function setStatus(n, done) {
  if (!existsSync(fixesMd)) return;
  const s = readFileSync(fixesMd, 'utf8').replace(new RegExp(`^(## )(⬜|✅) (${n}\\.)`, 'm'), `$1${done ? '✅' : '⬜'} $3`);
  writeFileSync(fixesMd, s);
}
const patchFile = (n) => join(fixesDir, `${n}.patch`);

if (cmd === 'start') {
  copyGame(game, base);
  mkdirSync(fixesDir, { recursive: true });
  console.log(`✔ base snapshot of games/${slug} taken — make fix #1, then: npm run fixes -- save ${slug} 1`);
} else if (cmd === 'save') {
  const n = rest[0];
  if (!n) usage();
  if (!existsSync(base)) { console.error(`✖ no base snapshot — run: npm run fixes -- start ${slug}`); process.exit(1); }
  const err = typecheck();
  if (err) { console.error(`✖ the fix doesn't type-check — fix it before saving:\n${err}`); process.exit(1); }
  // diff base → current (without fixes/), rewrite paths so the patch applies at games/<slug>/
  const cur = join(root, '.scratch', 'fixcur', slug);
  copyGame(game, cur);
  const { text: patch, skipped } = makePatch(base, cur, rel(game));
  rmSync(cur, { recursive: true, force: true });
  if (skipped.length) console.warn(`· binary files changed and are not part of the patch: ${skipped.join(', ')}`);
  if (!patch.trim()) { console.error('✖ no changes since the base snapshot — nothing to save'); process.exit(1); }
  mkdirSync(fixesDir, { recursive: true });
  writeFileSync(patchFile(n), patch);
  // roll the game back to the base so the next fix starts clean
  for (const f of walk(game)) if (!rel(f).startsWith(rel(fixesDir)) && !existsSync(join(base, relative(game, f)))) rmSync(f);
  for (const f of readdirSync(base)) cpSync(join(base, f), join(game, f), { recursive: true });
  const lines = patch.split('\n').filter((l) => /^[+-][^+-]/.test(l)).length;
  console.log(`✔ saved fixes/${n}.patch (${lines} changed lines) and rolled games/${slug} back to the base`);
} else if (cmd === 'apply' || cmd === 'undo') {
  let ns = rest[0] === 'all' ? readdirSync(fixesDir).filter((f) => f.endsWith('.patch')).map((f) => f.replace('.patch', '')).sort((a, b) => a - b) : rest;
  if (cmd === 'undo') ns = [...ns].reverse();   // unwind in reverse order
  if (!ns.length) usage();
  let failed = 0;
  for (const n of ns) {
    if (!existsSync(patchFile(n))) { console.error(`✖ no staged fix #${n} (fixes/${n}.patch)`); failed++; continue; }
    const text = readFileSync(patchFile(n), 'utf8');
    const plan = planPatch(text, root, { reverse: cmd === 'undo' });
    // already in the requested state (applied twice, or undoing one that was never applied) → skip quietly
    if (!plan.ok && planPatch(text, root, { reverse: cmd !== 'undo' }).ok) { console.log(`· fix #${n} ${cmd === 'apply' ? 'is already applied' : "isn't applied"}`); continue; }
    if (!plan.ok) {
      console.error(`✖ fix #${n} doesn't apply cleanly (it overlaps an earlier change). Re-implement it from its plan in FIXES.md.\n  ${plan.error}`);
      failed++; continue;
    }
    commit(plan);
    setStatus(n, cmd === 'apply');
    console.log(`✔ ${cmd === 'apply' ? 'applied' : 'undid'} fix #${n}`);
  }
  const err = typecheck();
  if (err) { console.error(`✖ type errors after ${cmd}:\n${err}`); process.exit(1); }
  if (failed) process.exit(1);
} else if (cmd === 'list') {
  const md = existsSync(fixesMd) ? readFileSync(fixesMd, 'utf8') : '';
  const items = [...md.matchAll(/^## (⬜|✅) (\d+)\. (.+)$/gm)];
  if (!items.length) console.log('(no FIXES.md entries)');
  for (const [, st, n, t] of items) console.log(`${st} ${n}. ${t}${existsSync(patchFile(n)) ? '' : '   (no patch staged!)'}`);
} else usage();

/** Packaged app only: build ~/Game Forge from the bundled tools on every launch, never touching the user's games. */
import { app } from 'electron';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RES, ROOT, GAMES, IS_WIN } from './paths.mjs';

const ENGINE = ['kit', 'scripts', 'templates', 'src', '.claude/skills', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'assets.html', 'preview.html', 'README.md'];

// Windows junctions read back as "\\?\C:\…\" and paths are case-insensitive
const same = (a, b) => { const n = (p) => resolve(p.replace(/^\\\\\?\\/, '')).replace(/[\\/]+$/, ''); return IS_WIN ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b); };
function link(target, path) {
  let st; try { st = lstatSync(path); } catch { /* missing */ }
  if (st?.isSymbolicLink()) { if (same(readlinkSync(path), target)) return; unlinkSync(path); }   // unlink: never recurse through a link
  else if (st) rmSync(path, { recursive: true, force: true });
  symlinkSync(target, path, IS_WIN ? 'junction' : 'dir');
}

export function ensureWorkspace() {
  if (!app.isPackaged) return;
  const fresh = !existsSync(GAMES);
  mkdirSync(ROOT, { recursive: true });
  // refresh the tools on every launch (app updates bring new kit/skills)
  for (const f of ENGINE) if (existsSync(join(RES, f))) cpSync(join(RES, f), join(ROOT, f), { recursive: true, force: true });
  if (existsSync(join(RES, '.claude/settings.json')) && !existsSync(join(ROOT, '.claude/settings.json'))) cpSync(join(RES, '.claude/settings.json'), join(ROOT, '.claude/settings.json'));
  if (fresh) cpSync(join(RES, 'games'), GAMES, { recursive: true });   // showcase games to start from
  // node_modules stays inside the app and is linked in
  link(join(RES, 'node_modules'), join(ROOT, 'node_modules'));
  syncAssets();
  if (realisticInstalled()) stripLiteNote();
}

/**
 * assets/ is a real folder in the workspace: the app's light library, plus the realistic packs downloaded after install
 * (main/library.mjs). The light part is copied again only when the app's version of it changes; downloads are kept.
 */
const A = () => join(ROOT, 'assets');
const read = (p) => { try { return readFileSync(p, 'utf8').trim(); } catch { return ''; } };
export const realisticInstalled = () => existsSync(join(A(), '.realistic'));
function syncAssets() {
  const st = (() => { try { return lstatSync(A()); } catch { return null; } })();
  if (st?.isSymbolicLink()) unlinkSync(A());   // older versions linked it into the app bundle
  const version = read(join(RES, 'assets', '.light-version')) || 'unknown';
  if (existsSync(A()) && read(join(A(), '.light-version')) === version) return;
  cpSync(join(RES, 'assets'), A(), { recursive: true, force: true });   // overlays: downloaded realistic files stay
  writeFileSync(join(A(), '.light-version'), version);
  if (realisticInstalled()) rmSync(join(A(), '.catalog-ok'), { force: true });   // the light catalog just replaced the full one
}
/** the note the build adds to AGENTS.md ("the library here is the light version") stops being true once the packs are in */
export function stripLiteNote() {
  const f = join(ROOT, 'AGENTS.md'), md = read(f);
  if (md.includes('<!-- lite-library -->')) writeFileSync(f, md.replace(/\n?<!-- lite-library -->[\s\S]*?<!-- \/lite-library -->\n?/, '\n') + '\n');
}

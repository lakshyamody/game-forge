/** Packaged app only: build ~/Game Forge from the bundled tools on every launch, never touching the user's games. */
import { app } from 'electron';
import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RES, ROOT, GAMES, IS_WIN } from './paths.mjs';

const ENGINE = ['kit', 'scripts', 'templates', 'src', '.claude/skills', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'assets.html', 'README.md'];

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
  // the big read-only parts stay inside the app and are linked in
  link(join(RES, 'node_modules'), join(ROOT, 'node_modules'));
  link(join(RES, 'assets'), join(ROOT, 'assets'));
}

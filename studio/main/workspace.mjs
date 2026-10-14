/** Packaged app only: build ~/Game Forge from the bundled tools on every launch, never touching the user's games. */
import { app } from 'electron';
import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { RES, ROOT, GAMES, IS_WIN } from './paths.mjs';

const ENGINE = ['kit', 'scripts', 'templates', 'src', '.claude/skills', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'assets.html', 'README.md'];

function link(target, path) {
  try { if (lstatSync(path).isSymbolicLink() && readlinkSync(path) === target) return; rmSync(path, { recursive: true, force: true }); } catch { /* missing */ }
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

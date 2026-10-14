/**
 * Cross-platform process helpers (macOS, Windows, Linux).
 * - Windows can't spawn .cmd files (npm, npx) without a shell since Node 20.12; `npmRun` handles that.
 * - windowsHide everywhere: run from Game Forge Studio there is no console to share, so each child would open a window.
 * - Windows env keys are case-insensitive ("Path"); copying process.env and setting PATH would create two keys.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { delimiter } from 'node:path';

export const IS_WIN = process.platform === 'win32';

/** env with PATH replaced (or extended) safely on every OS */
export function withPath(env, dirs, { prepend = true } = {}) {
  const out = {}; let current = '';
  for (const [k, v] of Object.entries(env)) { if (k.toLowerCase() === 'path') current = v ?? ''; else out[k] = v; }
  out.PATH = (prepend ? [...dirs, current] : [current, ...dirs]).filter(Boolean).join(delimiter);
  return out;
}

/** quote one argument for cmd.exe (only used for npm/npx, whose args we control) */
const winQuote = (a) => (/^[\w./:=@%+,\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);

/** run npm synchronously in cwd (inherits stdio); throws on failure */
export function npmSync(args, opts = {}) {
  const r = IS_WIN ? spawnSync(['npm', ...args.map(winQuote)].join(' '), { stdio: 'inherit', shell: true, windowsHide: true, ...opts }) : spawnSync('npm', args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`npm ${args.join(' ')} failed (${r.status ?? r.error?.message})`);
}
/** start npm asynchronously (e.g. a dev server) */
export const npmSpawn = (args, opts = {}) => (IS_WIN ? spawn(['npm', ...args.map(winQuote)].join(' '), { stdio: 'inherit', shell: true, windowsHide: true, ...opts }) : spawn('npm', args, { stdio: 'inherit', ...opts }));

/** zip a folder's contents → file (zip on macOS/Linux, PowerShell Compress-Archive on Windows) */
export function zipDir(dir, file) {
  if (IS_WIN) execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dir.replace(/'/g, "''")}\\*' -DestinationPath '${file.replace(/'/g, "''")}' -Force`], { stdio: 'inherit', windowsHide: true });
  else execFileSync('zip', ['-qry', file, '.'], { cwd: dir, stdio: 'inherit' });
}

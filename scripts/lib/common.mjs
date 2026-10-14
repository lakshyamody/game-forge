/** Shared helpers for the repo scripts: paths, CLI flags, file walking, type-checking. */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** every file under a directory (empty list if it doesn't exist) */
export const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);

/** `npm run x -- <cmd> a b --flag value --switch` → { cmd, names: [a, b], opt('flag'), flag('switch') } */
export function cli(argv = process.argv.slice(2)) {
  const opt = (n, def) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : def; };
  const flag = (n) => argv.includes(`--${n}`);
  const names = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  return { cmd: argv[0], args: argv, names, opt, flag };
}

/** the doc comment at the top of a script (its usage text) */
export const usageOf = (src) => src.split('*/')[0];

/**
 * `tsc --noEmit` on the project. Returns the error lines (empty = clean), or null if TypeScript isn't installed yet.
 * `only` keeps errors whose file path matches — e.g. one game plus the shared code.
 */
export function typecheck({ only } = {}) {
  const tsc = join(root, 'node_modules/typescript/bin/tsc');
  if (!existsSync(tsc)) return null;
  const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', root], { cwd: root, encoding: 'utf8' });
  if (r.status === 0) return [];
  const lines = `${r.stdout}${r.stderr}`.split('\n').filter(Boolean);
  return only ? lines.filter((l) => /error TS/.test(l) && only(l)) : lines;
}

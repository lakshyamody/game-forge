// `npm run studio` → build the Next.js UI if it changed, then start the Electron app (macOS and Windows).
// `npm run studio:dev` → Next dev server (hot reload) + the app pointed at it.
// Clears ELECTRON_RUN_AS_NODE, which terminals inside VS Code (itself Electron) set — with it the app would start as plain Node.
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { walk } from '../scripts/lib/common.mjs';
import { npmSync, npmSpawn } from '../scripts/lib/platform.mjs';

const here = fileURLToPath(new URL('.', import.meta.url)), ui = join(here, 'ui');
const dev = process.argv.includes('--dev');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

if (!existsSync(join(ui, 'node_modules'))) npmSync(['install'], { cwd: ui });
if (dev) {
  env.STUDIO_UI_DEV = '1';
  npmSpawn(['run', 'dev'], { cwd: ui });
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:3210')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
} else {
  // rebuild when any UI source is newer than the last export
  const built = join(ui, 'out/index.html');
  const newest = Math.max(...['app', 'components', 'lib'].flatMap((d) => walk(join(ui, d))).map((f) => statSync(f).mtimeMs));
  if (!existsSync(built) || newest > statSync(built).mtimeMs) npmSync(['run', 'build'], { cwd: ui });
}
const electron = createRequire(import.meta.url)('electron');   // path to the Electron binary for this OS
const child = spawn(electron, [join(here, 'main.mjs')], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));

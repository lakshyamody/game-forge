/**
 * The machine around the app: finding the user's own `claude` CLI, its sign-in status, the environment child
 * processes get (no API key → usage goes to the user's own login), node/npm/npx stand-ins on the app's built-in
 * Node, and the one-time playtest-browser download.
 */
import { app } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { APP_DIR, RES, ROOT, IS_MAC, IS_WIN } from './paths.mjs';

// apps launched from Finder get a tiny PATH: add the usual install locations
const EXTRA_PATH = [join(homedir(), '.local/bin'), join(homedir(), '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.npm-global/bin'), join(homedir(), 'AppData/Roaming/npm')];
let shimBin = '';

export function childEnv() {
  const env = { ...process.env, PATH: [shimBin, ...EXTRA_PATH, process.env.PATH ?? ''].filter(Boolean).join(delimiter), FORCE_COLOR: '0' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;   // use the user's own Claude login
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
export function findClaude() {
  const names = IS_WIN ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const d of childEnv().PATH.split(delimiter)) for (const n of names) if (d && existsSync(join(d, n))) return join(d, n);
  return null;
}
/** run a command to completion → { code, stdout, stderr } (never rejects) */
export const run = (file, args, opts = {}) => new Promise((res) => execFile(file, args, { cwd: ROOT, env: childEnv(), timeout: 20000, ...opts }, (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })));
/** run one of the repo's node scripts on the app's own Node */
export const nodeScript = (script, args) => run(process.execPath, [join(ROOT, script), ...args], { env: { ...childEnv(), ELECTRON_RUN_AS_NODE: '1' }, timeout: 180000 });

let toolsStatus = 'ready';
/** what the setup screen shows: is Claude Code installed and signed in, are the game tools there */
export async function checkEnv(port) {
  const claude = findClaude();
  const deps = existsSync(join(ROOT, 'node_modules', 'vite'));
  const node = true, tools = toolsStatus;
  if (!claude) return { claude: null, loggedIn: false, node, deps, tools, port };
  const v = await run(claude, ['--version']);
  const st = await run(claude, ['auth', 'status']);
  let info = {}; try { info = JSON.parse(st.stdout); } catch { /* older CLI: text */ }
  return { claude, version: v.stdout.trim(), loggedIn: st.code === 0, authMethod: info.authMethod ?? null, email: info.email ?? info.account?.email ?? null, node, deps, tools, port };
}

/** open a visible terminal window running a command (sign-in and install stay in Anthropic's own tools) */
export function openTerminal(cmd) {
  if (IS_MAC) spawn('osascript', ['-e', `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`, '-e', 'tell application "Terminal" to activate']);
  else if (IS_WIN) spawn('cmd', ['/c', 'start', 'powershell', '-NoExit', '-Command', cmd], { env: childEnv() });
  else spawn('x-terminal-emulator', ['-e', `bash -lc '${cmd}; exec bash'`], { env: childEnv() });
}

/** node / npm / npx (and every package tool) for Claude Code's shell, running on the app's own Node — no Node install needed */
export function installShims() {
  const sys = (process.env.PATH ?? '').split(delimiter).concat(EXTRA_PATH).some((d) => d && existsSync(join(d, IS_WIN ? 'node.exe' : 'node')));
  if (!app.isPackaged && sys) return;   // dev machine: use the real Node
  shimBin = join(app.getPath('userData'), 'bin'); mkdirSync(shimBin, { recursive: true });
  const exe = process.execPath, shim = join(shimBin, 'npm-shim.cjs');
  writeFileSync(shim, readFileSync(join(APP_DIR, 'studio/shim-npm.cjs')));
  const sh = (body) => `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\n${body}\n`;
  const files = {
    node: sh(`exec "${exe}" "$@"`), npm: sh(`SHIM_MODE=npm exec "${exe}" "${shim}" "$@"`), npx: sh(`SHIM_MODE=npx exec "${exe}" "${shim}" "$@"`),
    'node.cmd': `@set ELECTRON_RUN_AS_NODE=1\r\n@"${exe}" %*\r\n`, 'npm.cmd': `@set ELECTRON_RUN_AS_NODE=1\r\n@set SHIM_MODE=npm\r\n@"${exe}" "${shim}" %*\r\n`, 'npx.cmd': `@set ELECTRON_RUN_AS_NODE=1\r\n@set SHIM_MODE=npx\r\n@"${exe}" "${shim}" %*\r\n`,
  };
  // one wrapper per package tool (tsc, vite, playwright…), so npm scripts find them without node_modules/.bin
  const nm = join(RES, 'node_modules');
  if (existsSync(nm)) for (const d of readdirSync(nm).flatMap((d) => (d.startsWith('@') ? readdirSync(join(nm, d)).map((s) => join(d, s)) : [d]))) {
    try {
      const pj = JSON.parse(readFileSync(join(nm, d, 'package.json'), 'utf8'));
      const bins = typeof pj.bin === 'string' ? { [pj.name.split('/').pop()]: pj.bin } : pj.bin ?? {};
      for (const [name, rel] of Object.entries(bins)) if (!files[name] && /^[\w.-]+$/.test(name)) {
        const js = join(nm, d, rel);
        files[name] = sh(`exec "${exe}" "${js}" "$@"`); files[`${name}.cmd`] = `@set ELECTRON_RUN_AS_NODE=1\r\n@"${exe}" "${js}" %*\r\n`;
      }
    } catch { /* not a package */ }
  }
  for (const [n, body] of Object.entries(files)) { writeFileSync(join(shimBin, n), body); if (!n.endsWith('.cmd')) chmodSync(join(shimBin, n), 0o755); }
}

/** headless Chromium for playtests (npm run shot) — downloaded once in the background; onDone(statusText) */
export function ensurePlaywright(onDone) {
  if (!app.isPackaged && !process.env.STUDIO_FORCE_PW) return;
  const cli = join(ROOT, 'node_modules/playwright/cli.js');
  if (!existsSync(cli)) return;
  toolsStatus = 'Downloading the playtest browser (one time, ~150 MB)…';
  const p = spawn(process.execPath, [cli, 'install', 'chromium'], { cwd: ROOT, env: { ...childEnv(), ELECTRON_RUN_AS_NODE: '1' } });
  p.on('close', (code) => { toolsStatus = code === 0 ? 'ready' : 'Playtest browser download failed — games still work; automatic playtests may not.'; onDone(toolsStatus); });
}

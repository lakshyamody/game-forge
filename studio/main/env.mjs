/**
 * The machine around the app (macOS and Windows): finding the user's own `claude` CLI and how to start it, its
 * sign-in status, the environment child processes get (no API key → usage goes to the user's own login),
 * node/npm/npx stand-ins on the app's built-in Node, installing Claude Code in the background (official installer),
 * opening a terminal for sign-in, stopping a process tree, and the playtest browser (bundled in the packaged app).
 */
import { app } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, delimiter, resolve } from 'node:path';
import { APP_DIR, RES, ROOT, IS_MAC, IS_WIN } from './paths.mjs';

// apps launched from Finder / the Start menu get a minimal PATH: add the usual install locations
const H = homedir(), LOCAL = process.env.LOCALAPPDATA ?? join(H, 'AppData/Local'), ROAMING = process.env.APPDATA ?? join(H, 'AppData/Roaming');
// Program Files can be on another drive: ask Windows, fall back to the usual C: spelling
const PF = process.env.ProgramFiles ?? 'C:/Program Files', PF86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)';
const EXTRA_PATH = IS_WIN
  ? [join(H, '.local/bin'), join(ROAMING, 'npm'), join(LOCAL, 'Microsoft/WinGet/Links'), join(LOCAL, 'Programs/nodejs'), join(PF, 'nodejs'), join(PF, 'Git/cmd')]
  : [join(H, '.local/bin'), join(H, '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin', join(H, '.npm-global/bin')];
let shimBin = '';
// the packaged app ships Playwright's Chromium (scripts/build-studio.mjs); playtests find it through this env var
const BROWSERS = join(RES, 'ms-playwright');

/** process.env with our PATH and without API keys. Windows env keys are case-insensitive ("Path"), so rebuild PATH once. */
export function childEnv() {
  const env = {}; let path = '';
  for (const [k, v] of Object.entries(process.env)) {
    if (k.toLowerCase() === 'path') path = v ?? '';
    else env[k] = v;
  }
  // Windows: drop the Store's app-alias folder (WindowsApps). Its pwsh.exe alias breaks Claude Code's PowerShell tool
  // ("pwsh exited with code 1: The command line is too long" on every command); without it Claude Code falls back to
  // the built-in Windows PowerShell, which works. The folder only holds Store app launchers.
  if (IS_WIN) path = path.split(delimiter).filter((d) => !/[\\/]Microsoft[\\/]WindowsApps[\\/]?$/i.test(d)).join(delimiter);
  // Windows: a PSModulePath inherited from PowerShell 7 (pwsh) hides Windows PowerShell 5.1's own modules, so built-in
  // cmdlets go missing ("Get-FileHash is not recognized" in the Claude Code installer). Unset, each shell uses its defaults.
  if (IS_WIN) for (const k of Object.keys(env)) if (k.toLowerCase() === 'psmodulepath') delete env[k];
  env.PATH = [shimBin, ...EXTRA_PATH, path].filter(Boolean).join(delimiter);
  env.FORCE_COLOR = '0';
  if (app.isPackaged && existsSync(BROWSERS)) env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;   // use the user's own Claude login
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
export function findClaude() {
  const names = IS_WIN ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const d of childEnv().PATH.split(delimiter)) for (const n of names) if (d && existsSync(join(d, n))) return join(d, n);
  return null;
}

/**
 * How to start Claude Code without a shell (so prompts never pass through cmd.exe quoting):
 * claude / claude.exe directly; an npm `claude.cmd` launcher is resolved to the binary (or JS entry) it calls.
 */
export function claudeCommand() {
  const p = findClaude();
  if (!p) return null;
  if (!/\.cmd$/i.test(p)) return { file: p, args: [], env: {} };
  // classic npm/pnpm shims mention `%dp0%\node.exe` first (IF EXIST …): take the first target that exists and isn't node.exe
  const full = [...readFileSync(p, 'utf8').matchAll(/%~?dp0%?\\?([^"%\r\n]+\.(?:exe|js|cjs|mjs))/gi)].map((m) => resolve(dirname(p), m[1])).find((f) => !/[\\/]node\.exe$/i.test(f) && existsSync(f));
  if (full) return /\.exe$/i.test(full) ? { file: full, args: [], env: {} } : { file: process.execPath, args: [full], env: { ELECTRON_RUN_AS_NODE: '1' } };
  return { file: p, args: [], env: {}, shell: true };   // unknown launcher: last resort
}

/** run a command to completion → { code, stdout, stderr } (never rejects) */
export const run = (file, args, opts = {}) => new Promise((res) => execFile(file, args, { cwd: ROOT, env: childEnv(), timeout: 20000, windowsHide: true, ...opts }, (err, stdout, stderr) => res({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) })));
const runClaude = (args) => { const c = claudeCommand(); return c ? run(c.file, [...c.args, ...args], { env: { ...childEnv(), ...c.env }, shell: c.shell }) : Promise.resolve({ code: 1, stdout: '', stderr: '' }); };
/** run one of the repo's node scripts on the app's own Node */
export const nodeScript = (script, args) => run(process.execPath, [join(ROOT, script), ...args], { env: { ...childEnv(), ELECTRON_RUN_AS_NODE: '1' }, timeout: 180000 });

/** Git for Windows gives Claude Code its Bash tool (optional: without it Claude Code uses PowerShell) */
const gitBash = () => !IS_WIN || [join(PF, 'Git/bin/bash.exe'), join(PF86, 'Git/bin/bash.exe'), join(LOCAL, 'Programs/Git/bin/bash.exe')].some(existsSync);

let toolsStatus = 'ready';
/** what the setup sheet and sidebar show about the game tools (downloads in progress, problems) */
export const setToolsStatus = (t) => { toolsStatus = t; };
/** what the setup screen shows: is Claude Code installed and signed in, are the game tools there */
export async function checkEnv(port) {
  const claude = findClaude();
  const deps = existsSync(join(ROOT, 'node_modules', 'vite'));
  const base = { platform: process.platform, node: true, deps, tools: toolsStatus, gitBash: gitBash(), port, installing: !!installer, installError };
  if (!claude) return { ...base, claude: null, loggedIn: false };
  const v = await runClaude(['--version']);
  const st = await runClaude(['auth', 'status']);
  let info = {}; try { info = JSON.parse(st.stdout); } catch { /* older CLI: text */ }
  return { ...base, claude, version: v.stdout.trim(), loggedIn: st.code === 0, authMethod: info.authMethod ?? null, email: info.email ?? info.account?.email ?? null };
}

/** open a visible terminal running a command (install and sign-in stay in Anthropic's own tools) */
// every spawn here needs an 'error' listener: ENOENT/EACCES (exe quarantined by Defender, blocked by policy) would otherwise raise Electron's main-process error dialog
export function openTerminal(cmd) {
  if (IS_MAC) spawn('osascript', ['-e', `tell application "Terminal" to do script "${cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`, '-e', 'tell application "Terminal" to activate']).on('error', () => {});
  // a new PowerShell window: Start-Process passes the command as one argument, so `|` stays inside PowerShell
  else if (IS_WIN) spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-Command','${cmd.replace(/'/g, "''")}'`], { env: childEnv(), windowsHide: true }).on('error', () => {});
  else spawn('x-terminal-emulator', ['-e', `bash -lc '${cmd}; exec bash'`], { env: childEnv() }).on('error', () => {});
}
/** official installer commands */
// Windows: the official script, run from a file. `irm … | iex` breaks in Windows PowerShell 5.1 (the script is served as
// application/octet-stream, so irm returns bytes and iex fails with CommandNotFoundException).
export const INSTALL_CMD = IS_WIN
  ? "$p = Join-Path $env:TEMP 'claude-install.ps1'; Invoke-WebRequest -UseBasicParsing -Uri https://claude.ai/install.ps1 -OutFile $p; & $p"
  : 'curl -fsSL https://claude.ai/install.sh | bash';

let installer = null, installError = null;
/**
 * Install Claude Code with Anthropic's official installer, in the background (no terminal window). The packaged app
 * calls this on launch when `claude` isn't found, so only signing in is left for the user. onDone(ok) when finished.
 */
export function installClaude(onDone = () => {}) {
  if (installer || findClaude()) return;
  installError = null;
  const [file, args] = IS_WIN ? ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', INSTALL_CMD]] : ['/bin/bash', ['-c', INSTALL_CMD]];
  let log = '';
  installer = spawn(file, args, { cwd: H, env: childEnv(), windowsHide: true });
  installer.stdout.on('data', (d) => { log = (log + d).slice(-2000); });
  installer.stderr.on('data', (d) => { log = (log + d).slice(-2000); });
  const timer = setTimeout(() => installer?.kill(), 10 * 60 * 1000);
  const finish = (code, err) => {
    if (!installer) return;   // 'error' and 'close' can both fire
    clearTimeout(timer); installer = null;
    const ok = !err && code === 0 && !!findClaude();
    if (!ok) installError = (err ?? (log.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-4).join(' · ') || `installer exited with ${code}`)).slice(0, 400);
    onDone(ok);
  };
  installer.on('close', (code) => finish(code));
  installer.on('error', (e) => finish(1, e.message));
}

let updater = null, updated = Promise.resolve();
/**
 * Keep Claude Code current. Its own auto-updater only runs in interactive sessions, and the app only ever runs
 * `claude -p`, so without this an installed CLI stays on whatever version it had. Runs `claude update` in the
 * background (no window); the app calls it on launch and then once a day. onDone(ok) when finished.
 */
export function updateClaude(onDone = () => {}) {
  if (updater || installer || process.env.DISABLE_AUTOUPDATER) return;
  const c = claudeCommand();
  if (!c) return;
  let done; updated = new Promise((r) => (done = r));
  updater = spawn(c.file, [...c.args, 'update'], { cwd: H, env: { ...childEnv(), ...c.env }, shell: c.shell, windowsHide: true, stdio: 'ignore' });
  const timer = setTimeout(() => updater?.kill(), 5 * 60 * 1000);
  const finish = (code) => { if (!updater) return; clearTimeout(timer); updater = null; done(); onDone(code === 0); };
  updater.on('close', (code) => finish(code));
  updater.on('error', () => finish(1));
}
/** wait for a `claude update` in progress, so a chat never starts claude.exe while it is being replaced */
export const claudeUpdating = () => !!updater;
export const claudeUpdated = () => updated;
export const loginCmd = () => (IS_WIN ? `& '${(findClaude() ?? 'claude').replace(/'/g, "''")}' auth login` : 'claude auth login');   // full path: a fresh install may not be on PATH yet

/** stop a process and everything it started (Claude Code runs shells, Vite, Chromium…) */
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
  else child.kill('SIGINT');
}

/** node / npm / npx (and every package tool) for Claude Code's shell, running on the app's own Node — no Node install needed */
export function installShims() {
  const sys = (process.env.PATH ?? '').split(delimiter).concat(EXTRA_PATH).some((d) => d && existsSync(join(d, IS_WIN ? 'node.exe' : 'node')));
  if (!app.isPackaged && sys) return;   // dev machine: use the real Node
  shimBin = join(app.getPath('userData'), 'bin'); mkdirSync(shimBin, { recursive: true });
  const exe = process.execPath, shim = join(shimBin, 'npm-shim.cjs');
  writeFileSync(shim, readFileSync(join(APP_DIR, 'studio/shim-npm.cjs')));
  // POSIX sh wrappers serve macOS and Git Bash on Windows (forward slashes work there); .cmd wrappers serve PowerShell / cmd
  const fwd = (p) => p.split('\\').join('/');
  const sh = (body) => `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\n${body}\n`;
  // chcp 65001 first: cmd reads batch files in the OEM code page, so the UTF-8 paths below (usernames like "José Łukasz") would break every wrapper
  const cmd = (body) => `@chcp 65001 >nul\r\n@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n${body}\r\n`;
  const files = {
    node: sh(`exec "${fwd(exe)}" "$@"`), npm: sh(`SHIM_MODE=npm exec "${fwd(exe)}" "${fwd(shim)}" "$@"`), npx: sh(`SHIM_MODE=npx exec "${fwd(exe)}" "${fwd(shim)}" "$@"`),
  };
  if (IS_WIN) Object.assign(files, { 'node.cmd': cmd(`"${exe}" %*`), 'npm.cmd': cmd(`set SHIM_MODE=npm\r\n"${exe}" "${shim}" %*`), 'npx.cmd': cmd(`set SHIM_MODE=npx\r\n"${exe}" "${shim}" %*`) });
  // one wrapper per package tool (tsc, vite, playwright…), so npm scripts find them without node_modules/.bin
  const nm = join(RES, 'node_modules');
  // tsc: TypeScript 7's native compiler directly. Its JS launcher starts it without windowsHide, so from Studio (no
  // console) every `npm run check` / `npx tsc` flashed a terminal window on Windows
  const tscExe = join(nm, '@typescript', `typescript-${process.platform}-${process.arch}`, 'lib', IS_WIN ? 'tsc.exe' : 'tsc');
  if (existsSync(tscExe)) { files.tsc = sh(`exec "${fwd(tscExe)}" "$@"`); if (IS_WIN) files['tsc.cmd'] = cmd(`"${tscExe}" %*`); }
  if (existsSync(nm)) for (const d of readdirSync(nm).flatMap((d) => (d.startsWith('@') ? readdirSync(join(nm, d)).map((s) => join(d, s)) : [d]))) {
    try {
      const pj = JSON.parse(readFileSync(join(nm, d, 'package.json'), 'utf8'));
      const bins = typeof pj.bin === 'string' ? { [pj.name.split('/').pop()]: pj.bin } : pj.bin ?? {};
      for (const [name, rel] of Object.entries(bins)) if (!files[name] && /^[\w.-]+$/.test(name)) {
        const js = join(nm, d, rel);
        files[name] = sh(`exec "${fwd(exe)}" "${fwd(js)}" "$@"`);
        if (IS_WIN) files[`${name}.cmd`] = cmd(`"${exe}" "${js}" %*`);
      }
    } catch { /* not a package */ }
  }
  for (const [n, body] of Object.entries(files)) { writeFileSync(join(shimBin, n), body); if (!IS_WIN) chmodSync(join(shimBin, n), 0o755); }
}

/** headless Chromium for playtests (npm run shot): bundled in the packaged app; otherwise downloaded once in the background; onDone(statusText) */
export function ensurePlaywright(onDone) {
  if (!app.isPackaged && !process.env.STUDIO_FORCE_PW) return;
  if (existsSync(BROWSERS)) return;   // bundled with the app
  const cli = join(ROOT, 'node_modules/playwright/cli.js');
  if (!existsSync(cli)) return;
  toolsStatus = 'Downloading the playtest browser (one time, ~150 MB)…';
  const p = spawn(process.execPath, [cli, 'install', 'chromium'], { cwd: ROOT, env: { ...childEnv(), ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true });
  let over = false; const finish = (t) => { if (over) return; over = true; toolsStatus = t; onDone(t); };   // 'error' and 'close' can both fire
  p.on('close', (code) => finish(code === 0 ? 'ready' : 'Playtest browser download failed. Games still work; automatic playtests may not.'));
  p.on('error', (e) => finish(`Playtest browser couldn't start (${e.message}). Games still work; automatic playtests may not.`));
}

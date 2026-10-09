/**
 * Game Forge Studio — desktop app for making games with Claude Code, no terminal needed.
 *
 * How it talks to Claude: it runs the user's own installed, unmodified `claude` CLI (`claude -p … --output-format
 * stream-json`) in this repo. Sign-in happens entirely in Anthropic's own flow (`claude auth login` in a terminal
 * window); the app only reads `claude auth status`. It never sees, stores or passes on Claude credentials, and it
 * strips ANTHROPIC_API_KEY from the child env so usage goes to the user's own login, not an API key by accident.
 *
 *   npm run studio
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, watch, mkdirSync, cpSync, symlinkSync, lstatSync, rmSync, chmodSync, readlinkSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // repo (dev) or app.asar (packaged)
// Packaged: the game tools ship read-only in Resources/forge and the user's games live in ~/Game Forge.
// Dev (npm run studio): everything is this repo.
const RES = app.isPackaged ? join(process.resourcesPath, 'forge') : APP_DIR;
const ROOT = app.isPackaged ? join(homedir(), 'Game Forge') : APP_DIR;   // home folder: no macOS privacy prompt (Documents would ask)
const GAMES = join(ROOT, 'games');
const IS_MAC = platform() === 'darwin', IS_WIN = platform() === 'win32';
let win = null, vite = null, port = 0;

// ------------------------------------------------------------------ app state (sessions per game, extra permissions)
const statePath = () => join(app.getPath('userData'), 'studio-state.json');
let state = { sessions: {}, allowed: [] };
function loadState() { try { state = { ...state, ...JSON.parse(readFileSync(statePath(), 'utf8')) }; } catch { /* first run */ } }
function saveState() { mkdirSync(dirname(statePath()), { recursive: true }); writeFileSync(statePath(), JSON.stringify(state, null, 2)); }

// ------------------------------------------------------------------ zero-setup workspace (packaged app)
const ENGINE = ['kit', 'scripts', 'templates', 'src', '.claude/skills', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'assets.html', 'README.md'];
function link(target, path) {
  try { if (lstatSync(path).isSymbolicLink() && readlinkSync(path) === target) return; rmSync(path, { recursive: true, force: true }); } catch { /* missing */ }
  symlinkSync(target, path, IS_WIN ? 'junction' : 'dir');
}
function ensureWorkspace() {
  if (!app.isPackaged) return;
  const fresh = !existsSync(GAMES);
  mkdirSync(ROOT, { recursive: true });
  // refresh the tools on every launch (app updates bring new kit/skills); never touch the user's games
  for (const f of ENGINE) if (existsSync(join(RES, f))) cpSync(join(RES, f), join(ROOT, f), { recursive: true, force: true });
  if (existsSync(join(RES, '.claude/settings.json')) && !existsSync(join(ROOT, '.claude/settings.json'))) cpSync(join(RES, '.claude/settings.json'), join(ROOT, '.claude/settings.json'));
  if (fresh) cpSync(join(RES, 'games'), GAMES, { recursive: true });   // showcase games to start from
  link(join(RES, 'node_modules'), join(ROOT, 'node_modules'));
  link(join(RES, 'assets'), join(ROOT, 'assets'));
}
/** node / npm / npx for Claude Code's shell, running on the app's own Node — no Node install needed */
let SHIM_BIN = '';
function installShims() {
  const sys = (process.env.PATH ?? '').split(delimiter).concat(EXTRA_PATH).some((d) => d && existsSync(join(d, IS_WIN ? 'node.exe' : 'node')));
  if (!app.isPackaged && sys) return;   // dev machine: use the real Node
  SHIM_BIN = join(app.getPath('userData'), 'bin'); mkdirSync(SHIM_BIN, { recursive: true });
  const exe = process.execPath, shim = join(SHIM_BIN, 'npm-shim.cjs');
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
  for (const [n, body] of Object.entries(files)) { writeFileSync(join(SHIM_BIN, n), body); if (!n.endsWith('.cmd')) chmodSync(join(SHIM_BIN, n), 0o755); }
}
/** headless Chromium for playtests (npm run shot) — downloaded once in the background */
let toolsStatus = 'ready';
function ensurePlaywright() {
  if (!app.isPackaged && !process.env.STUDIO_FORCE_PW) return;
  const cli = join(ROOT, 'node_modules/playwright/cli.js');
  if (!existsSync(cli)) return;
  toolsStatus = 'Downloading the playtest browser (one time, ~150 MB)…';
  const p = spawn(process.execPath, [cli, 'install', 'chromium'], { cwd: ROOT, env: { ...childEnv(), ELECTRON_RUN_AS_NODE: '1' } });
  p.on('close', (code) => { toolsStatus = code === 0 ? 'ready' : 'Playtest browser download failed — games still work; automatic playtests may not.'; win?.webContents.send('tools:status', toolsStatus); });
}

// ------------------------------------------------------------------ finding claude (apps launched from Finder get a tiny PATH)
const EXTRA_PATH = [join(homedir(), '.local/bin'), join(homedir(), '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.npm-global/bin'), join(homedir(), 'AppData/Roaming/npm')];
const childEnv = () => {
  const env = { ...process.env, PATH: [SHIM_BIN, ...EXTRA_PATH, process.env.PATH ?? ''].filter(Boolean).join(delimiter), FORCE_COLOR: '0' };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;   // use the user's own Claude login
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
};
function findClaude() {
  const names = IS_WIN ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const d of childEnv().PATH.split(delimiter)) for (const n of names) if (d && existsSync(join(d, n))) return join(d, n);
  return null;
}
const run = (file, args, opts = {}) => new Promise((res) => execFile(file, args, { cwd: ROOT, env: childEnv(), timeout: 20000, ...opts }, (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })));

async function checkEnv() {
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
function openTerminal(cmd) {
  if (IS_MAC) spawn('osascript', ['-e', `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`, '-e', 'tell application "Terminal" to activate']);
  else if (IS_WIN) spawn('cmd', ['/c', 'start', 'powershell', '-NoExit', '-Command', cmd], { env: childEnv() });
  else spawn('x-terminal-emulator', ['-e', `bash -lc '${cmd}; exec bash'`], { env: childEnv() });
}

// ------------------------------------------------------------------ games
function listGames() {
  if (!existsSync(GAMES)) return [];
  return readdirSync(GAMES).filter((d) => existsSync(join(GAMES, d, 'game.json'))).map((slug) => {
    let meta = {}; try { meta = JSON.parse(readFileSync(join(GAMES, slug, 'game.json'), 'utf8')); } catch { /* half-written */ }
    const fixesMd = join(GAMES, slug, 'FIXES.md');
    const fixes = existsSync(fixesMd) ? [...readFileSync(fixesMd, 'utf8').matchAll(/^## (⬜|✅) (\d+)\. (.+)$/gm)].map(([, st, n, text]) => ({ n: Number(n), done: st === '✅', text: text.replace(/^"|"$/g, '') })) : [];
    return { slug, title: meta.title ?? slug, tagline: meta.tagline ?? '', color: meta.color ?? '#7c5cff', controls: meta.controls ?? '', fixes, session: !!state.sessions[slug] };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
const nodeScript = (script, args) => run(process.execPath, [join(ROOT, script), ...args], { env: { ...childEnv(), ELECTRON_RUN_AS_NODE: '1' }, timeout: 180000 });

// ------------------------------------------------------------------ talking to Claude Code
const STUDIO_PROMPT = `You are running inside Game Forge Studio, a desktop app for people who are not programmers.
- Reply in short, friendly plain language. Do not paste code unless the user asks for it. Say what changed in the game, not which functions changed.
- The app already runs the game dev server and shows a live preview that reloads on save. Never run \`npm run dev\` or \`npm run play\`, and never open a browser.
- Headless checks (\`npm run shot\`, \`npm run check\`, Playwright scripts) are fine and encouraged.
- When you create a new game, use \`npm run new\` so it lands in games/<slug>/ with a game.json, and say the game's name when you're done.
- The user can apply staged kid-check fixes with buttons in the app; if they ask you to "fix 2", run \`npm run fixes -- apply <slug> 2\`.`;
const BASE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Skill', 'TodoWrite', 'WebSearch', 'WebFetch',
  'Bash(npm run *)', 'Bash(npm install *)', 'Bash(npx tsc *)', 'Bash(node scripts/*)', 'Bash(node .scratch/*)', 'Bash(ls *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)',
  'Bash(grep *)', 'Bash(wc *)', 'Bash(mkdir *)', 'Bash(date*)', 'Bash(cp *)', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(sed -n *)', 'Bash(find *)', 'Bash(python3 *)'];
const jobs = new Map();   // key → child process

function sendChat(key, text, slug) {
  const claude = findClaude();
  if (!claude) return win?.webContents.send('chat:event', { key, type: 'error', text: 'Claude Code is not installed yet.' });
  if (jobs.has(key)) return win?.webContents.send('chat:event', { key, type: 'error', text: 'Still working on the last request — wait for it or press Stop.' });
  const prompt = slug ? `[Working on the game in games/${slug}/ — read its GAME.md first if you haven't this session.]\n\n${text}` : text;
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    '--append-system-prompt', STUDIO_PROMPT, '--allowedTools', ...BASE_TOOLS, ...state.allowed];
  if (state.sessions[key]) args.push('--resume', state.sessions[key]);
  const before = new Set(listGames().map((g) => g.slug));
  const child = spawn(claude, args, { cwd: ROOT, env: childEnv() });
  jobs.set(key, child);
  win?.webContents.send('chat:event', { key, type: 'start' });
  let buf = '', errText = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.session_id) { state.sessions[key] = ev.session_id; }
      if (ev.type === 'assistant') for (const b of ev.message?.content ?? []) {
        if (b.type === 'text' && b.text.trim()) win?.webContents.send('chat:event', { key, type: 'text', text: b.text });
        if (b.type === 'tool_use') win?.webContents.send('chat:event', { key, type: 'tool', text: describeTool(b.name, b.input ?? {}) });
      }
      if (ev.type === 'result') {
        win?.webContents.send('chat:event', { key, type: 'result', ok: !ev.is_error, text: ev.is_error ? (ev.result || (ev.errors ?? []).join('\n')) : '', denials: (ev.permission_denials ?? []).map((p) => ({ tool: p.tool_name, input: p.tool_input })) });
      }
    }
  });
  child.stderr.on('data', (d) => (errText += d));
  child.on('close', (code) => {
    jobs.delete(key); saveState();
    // a brand-new game appeared during a "new game" chat → hand the session to that game
    const fresh = listGames().map((g) => g.slug).filter((s) => !before.has(s));
    if (key === '__new__' && fresh.length) { state.sessions[fresh[0]] = state.sessions.__new__; delete state.sessions.__new__; saveState(); }
    const authProblem = /not logged in|login expired|run \/login|invalid api key|authentication/i.test(errText);
    win?.webContents.send('chat:event', { key, type: 'end', code, newGame: fresh[0] ?? null, error: code && !authProblem ? errText.trim().slice(-600) : '', auth: authProblem });
  });
}
function describeTool(name, i) {
  const f = (p) => String(p ?? '').replace(ROOT + '/', '');
  if (name === 'Write') return `✏️ Writing ${f(i.file_path)}`;
  if (name === 'Edit' || name === 'MultiEdit') return `✏️ Editing ${f(i.file_path)}`;
  if (name === 'Read') return `📖 Reading ${f(i.file_path)}`;
  if (name === 'Bash') return `⚙️ ${i.description || String(i.command).slice(0, 80)}`;
  if (name === 'Grep' || name === 'Glob') return '🔎 Looking through the code';
  if (name === 'Skill') return `📘 Following the ${i.skill ?? ''} guide`;
  if (name === 'WebSearch' || name === 'WebFetch') return '🌐 Searching the web';
  if (name === 'TodoWrite') return '📝 Planning the steps';
  return `🛠 ${name}`;
}

// ------------------------------------------------------------------ IPC
function wire() {
  ipcMain.handle('env:check', checkEnv);
  ipcMain.handle('auth:login', () => openTerminal('claude auth login'));
  ipcMain.handle('claude:install', () => openTerminal(IS_WIN ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash'));
  ipcMain.handle('games:list', listGames);
  ipcMain.handle('chat:send', (_e, { key, text, slug }) => sendChat(key, text, slug));
  ipcMain.handle('chat:stop', (_e, key) => { jobs.get(key)?.kill('SIGINT'); });
  ipcMain.handle('chat:reset', (_e, key) => { delete state.sessions[key]; saveState(); });
  ipcMain.handle('perm:allow', (_e, rule) => { if (!state.allowed.includes(rule)) state.allowed.push(rule); saveState(); });
  ipcMain.handle('fixes:apply', (_e, { slug, n }) => nodeScript('scripts/fixes.mjs', ['apply', slug, String(n)]));
  ipcMain.handle('fixes:undo', (_e, { slug, n }) => nodeScript('scripts/fixes.mjs', ['undo', slug, String(n)]));
  ipcMain.handle('game:export', async (_e, slug) => { const r = await nodeScript('scripts/ship.mjs', [slug]); if (r.code === 0) shell.showItemInFolder(join(ROOT, 'ship', `${slug}.zip`)); return r; });
  ipcMain.handle('open:external', (_e, url) => shell.openExternal(url));
  ipcMain.handle('open:folder', (_e, slug) => shell.openPath(slug ? join(GAMES, slug) : ROOT));
}

// ------------------------------------------------------------------ game server (Vite runs inside the app's own Node)
async function startVite() {
  const { createServer } = await import(join(ROOT, 'node_modules/vite/dist/node/index.js'));
  vite = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port: 5199, strictPort: false, open: false }, logLevel: 'error' });
  await vite.listen();
  port = vite.httpServer.address().port;
}

app.whenReady().then(async () => {
  loadState(); ensureWorkspace(); installShims(); wire(); ensurePlaywright();
  try { await startVite(); } catch (e) { console.error('vite failed', e); }
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1000, minHeight: 640, title: 'Game Forge Studio', backgroundColor: '#12131a',
    webPreferences: { preload: join(APP_DIR, 'studio/preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(join(APP_DIR, 'studio/index.html'));
  if (existsSync(GAMES)) watch(GAMES, { recursive: true }, (_t, f) => { if (f && /game\.json|FIXES\.md/.test(f)) win?.webContents.send('games:changed'); });
  if (process.env.STUDIO_SCREENSHOT) setTimeout(async () => { const img = await win.webContents.capturePage(); writeFileSync(process.env.STUDIO_SCREENSHOT, img.toPNG()); if (process.env.STUDIO_QUIT) app.quit(); }, Number(process.env.STUDIO_DELAY ?? 6000));
});
// quit promptly: stop Claude jobs, give the game server a moment to close, never hang on it
app.on('window-all-closed', () => app.quit());
let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault(); quitting = true;
  for (const c of jobs.values()) c.kill('SIGINT');
  Promise.race([vite?.close(), new Promise((r) => setTimeout(r, 1500))]).finally(() => app.exit(0));
});

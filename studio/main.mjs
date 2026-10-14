/**
 * Game Forge Studio — desktop app for making games with Claude Code, no terminal needed.
 *
 * How it talks to Claude: it runs the user's own installed, unmodified `claude` CLI (`claude -p … --output-format
 * stream-json`) in this repo. Sign-in happens entirely in Anthropic's own flow (`claude auth login` in a terminal
 * window); the app only reads `claude auth status`. It never sees, stores or passes on Claude credentials, and it
 * strips ANTHROPIC_API_KEY from the child env so usage goes to the user's own login, not an API key by accident.
 *
 *   npm run studio
 *
 * This file: window, IPC and the game server. The rest lives in main/: paths, state, env (Claude + shims),
 * workspace (packaged setup), games (sidebar list), claude (chat runner), ui (serves the Next.js UI in studio/ui).
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { existsSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, RES, ROOT, GAMES, IS_WIN } from './main/paths.mjs';
import { state, loadState, saveState } from './main/state.mjs';
import { checkEnv, ensurePlaywright, installShims, nodeScript, openTerminal } from './main/env.mjs';
import { ensureWorkspace } from './main/workspace.mjs';
import { listGames } from './main/games.mjs';
import { jobs, sendChat } from './main/claude.mjs';
import { serveUi, setMenu, uiUrl } from './main/ui.mjs';

let win = null, vite = null, port = 0;
const send = (channel, payload) => win?.webContents.send(channel, payload);

function wire() {
  ipcMain.handle('env:check', () => checkEnv(port));
  ipcMain.handle('auth:login', () => openTerminal('claude auth login'));
  ipcMain.handle('claude:install', () => openTerminal(IS_WIN ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash'));
  ipcMain.handle('games:list', listGames);
  ipcMain.handle('chat:send', (_e, { key, text, slug }) => sendChat(key, text, slug, (ev) => send('chat:event', ev)));
  ipcMain.handle('chat:stop', (_e, key) => { jobs.get(key)?.kill('SIGINT'); });
  ipcMain.handle('chat:reset', (_e, key) => { delete state.sessions[key]; saveState(); });
  ipcMain.handle('perm:allow', (_e, rule) => { if (!state.allowed.includes(rule)) state.allowed.push(rule); saveState(); });
  ipcMain.handle('fixes:apply', (_e, { slug, n }) => nodeScript('scripts/fixes.mjs', ['apply', slug, String(n)]));
  ipcMain.handle('fixes:undo', (_e, { slug, n }) => nodeScript('scripts/fixes.mjs', ['undo', slug, String(n)]));
  ipcMain.handle('game:export', async (_e, slug) => { const r = await nodeScript('scripts/ship.mjs', [slug]); if (r.code === 0) shell.showItemInFolder(join(ROOT, 'ship', `${slug}.zip`)); return r; });
  ipcMain.handle('open:external', (_e, url) => shell.openExternal(url));
  ipcMain.handle('open:folder', (_e, slug) => shell.openPath(slug ? join(GAMES, slug) : ROOT));
}

/** the game preview server — Vite running inside the app's own Node */
async function startVite() {
  const { createServer } = await import(join(ROOT, 'node_modules/vite/dist/node/index.js'));
  // packaged: node_modules/assets are links into the app bundle (RES) — let Vite serve files from there too
  vite = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port: 5199, strictPort: false, open: false, fs: { allow: [ROOT, RES] } }, logLevel: 'error' });
  await vite.listen();
  port = vite.httpServer.address().port;
}

app.whenReady().then(async () => {
  loadState(); ensureWorkspace(); installShims(); wire(); serveUi(); setMenu((action) => send('menu', action)); ensurePlaywright((status) => send('tools:status', status));
  try { await startVite(); } catch (e) { console.error('vite failed', e); }
  win = new BrowserWindow({
    width: 1560, height: 960, minWidth: 1100, minHeight: 680, title: 'Game Forge Studio', backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 12 },   // macOS buttons sit inside the app's own title bar
    webPreferences: { preload: join(APP_DIR, 'studio/preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(uiUrl());
  if (existsSync(GAMES)) watch(GAMES, { recursive: true }, (_t, f) => { if (f && /game\.json|FIXES\.md/.test(f)) send('games:changed'); });
  // debug: STUDIO_SCREENSHOT=out.png [STUDIO_QUIT=1] [STUDIO_DELAY=ms] captures the window after load
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

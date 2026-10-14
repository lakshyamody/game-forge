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
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { APP_DIR, RES, ROOT, GAMES, IS_MAC } from './main/paths.mjs';
import { state, loadState, saveState } from './main/state.mjs';
// tests: a throwaway profile (sessions, allowed tools, shims) instead of the user's own
if (process.env.STUDIO_USER_DATA) app.setPath('userData', process.env.STUDIO_USER_DATA);
import { checkEnv, ensurePlaywright, installClaude, installShims, killTree, nodeScript, openTerminal, updateClaude, INSTALL_CMD, loginCmd } from './main/env.mjs';
import { ensureWorkspace } from './main/workspace.mjs';
import { listGames } from './main/games.mjs';
import { jobs, resetChat, sendChat } from './main/claude.mjs';
import { serveUi, setMenu, uiUrl } from './main/ui.mjs';

let win = null, vite = null, port = 0;
const send = (channel, payload) => win?.webContents.send(channel, payload);

function wire() {
  ipcMain.handle('env:check', () => checkEnv(port));
  ipcMain.handle('auth:login', () => openTerminal(loginCmd()));
  // background install; { terminal: true } opens a terminal instead (fallback when the background install failed)
  ipcMain.handle('claude:install', (_e, opts) => (opts?.terminal ? openTerminal(INSTALL_CMD) : installClaude(() => send('env:changed'))));
  ipcMain.handle('git:install', () => shell.openExternal('https://git-scm.com/downloads/win'));
  // Windows draws its own caption buttons over our title row: keep their colours in step with the theme
  ipcMain.handle('theme:set', (_e, dark) => { if (!IS_MAC) win?.setTitleBarOverlay?.({ color: dark ? '#161617' : '#ffffff', symbolColor: dark ? '#ececed' : '#1b1b1b', height: 56 }); });
  ipcMain.handle('games:list', listGames);
  ipcMain.handle('chat:send', (_e, { key, text, slug }) => sendChat(key, text, slug, (ev) => send('chat:event', ev)));
  ipcMain.handle('chat:stop', (_e, key) => killTree(jobs.get(key)));
  ipcMain.handle('chat:reset', (_e, key) => resetChat(key));
  ipcMain.handle('perm:allow', (_e, rule) => { if (!state.allowed.includes(rule)) state.allowed.push(rule); saveState(); });
  ipcMain.handle('fixes:apply', (_e, { slug, n }) => nodeScript('scripts/fixes.mjs', ['apply', slug, String(n)]));
  ipcMain.handle('fixes:undo', (_e, { slug, n }) => nodeScript('scripts/fixes.mjs', ['undo', slug, String(n)]));
  ipcMain.handle('game:export', async (_e, slug) => { const r = await nodeScript('scripts/ship.mjs', [slug]); if (r.code === 0) shell.showItemInFolder(join(ROOT, 'ship', `${slug}.zip`)); return r; });
  ipcMain.handle('open:external', (_e, url) => shell.openExternal(url));
  ipcMain.handle('open:folder', (_e, slug) => shell.openPath(slug ? join(GAMES, slug) : GAMES));
}

/** the game preview server — Vite running inside the app's own Node */
async function startVite() {
  // import() needs a file:// URL: a bare C:\… path fails on Windows
  const { createServer } = await import(pathToFileURL(join(ROOT, 'node_modules/vite/dist/node/index.js')).href);
  // packaged: node_modules/assets are links into the app bundle (RES) — let Vite serve files from there too
  vite = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port: 5199, strictPort: false, open: false, fs: { allow: [ROOT, RES] } }, logLevel: 'error' });
  await vite.listen();
  port = vite.httpServer.address().port;
}

app.whenReady().then(async () => {
  // macOS, unsigned app: once the user has allowed it, clear the download quarantine from the whole bundle so the
  // tools inside (Chromium for playtests, native modules) aren't blocked by Gatekeeper one by one
  if (IS_MAC && app.isPackaged) try { execFileSync('xattr', ['-dr', 'com.apple.quarantine', resolve(process.execPath, '../../..')], { stdio: 'ignore', timeout: 30000 }); } catch { /* read-only (translocated) or already clear */ }
  loadState(); ensureWorkspace(); installShims(); wire(); serveUi(); setMenu((action) => send('menu', action)); ensurePlaywright((status) => send('tools:status', status));
  // packaged app: install Claude Code on first launch, so only signing in is left
  if (app.isPackaged || process.env.STUDIO_AUTO_INSTALL) installClaude(() => send('env:changed'));
  // …and keep it up to date: now, then daily (skipped while Claude is working, so a running claude.exe isn't swapped out;
  // not in dev or tests, which use the developer's own CLI)
  if (app.isPackaged && !process.env.STUDIO_HIDDEN) {
    const update = () => { if (!jobs.size) updateClaude(() => send('env:changed')); };
    update(); setInterval(update, 24 * 60 * 60 * 1000).unref();
  }
  try { await startVite(); } catch (e) { console.error('vite failed', e); }
  win = new BrowserWindow({
    show: !process.env.STUDIO_HIDDEN,   // tests: render without putting a window on screen (stray clicks)
    width: 1560, height: 960, minWidth: 1100, minHeight: 680, title: 'Game Forge Studio', backgroundColor: '#ffffff',
    // the window buttons sit inside the app's own top row: traffic lights on macOS, caption buttons on Windows
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 21 } } : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#ffffff', symbolColor: '#1b1b1b', height: 56 } }),
    webPreferences: { preload: join(APP_DIR, 'studio/preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  if (process.env.STUDIO_HIDDEN) win.webContents.setAudioMuted(true);   // tests: no game music out of the speakers
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
  for (const c of jobs.values()) killTree(c);
  Promise.race([vite?.close(), new Promise((r) => setTimeout(r, 1500))]).finally(() => app.exit(0));
});

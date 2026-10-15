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
import { app, BrowserWindow, ipcMain, Menu, screen, shell } from 'electron';
import { existsSync, watch, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { APP_DIR, RES, ROOT, GAMES, IS_MAC, IS_WIN } from './main/paths.mjs';
import { state, loadState, saveState } from './main/state.mjs';
// tests: a throwaway profile (sessions, allowed tools, shims) instead of the user's own
if (process.env.STUDIO_USER_DATA) app.setPath('userData', process.env.STUDIO_USER_DATA);
// one Studio per profile (must come after setPath: the lock is per userData): the first start takes ~24 s before the window shows, and a second
// double-click would run a second Vite, a second asset download into the same .part file, and clobber state
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
import { checkEnv, ensurePlaywright, installClaude, installShims, killTree, nodeScript, openTerminal, updateClaude, INSTALL_CMD, loginCmd } from './main/env.mjs';
import { ensureWorkspace } from './main/workspace.mjs';
import { downloadRealistic } from './main/library.mjs';
import { listGames } from './main/games.mjs';
import { answerAsk, jobs, resetChat, sendChat } from './main/claude.mjs';
import { serveUi, setMenu, uiUrl } from './main/ui.mjs';

let win = null, vite = null, port = 0;
const send = (channel, payload) => win?.webContents.send(channel, payload);
// launched again: bring the running window forward (before it exists, the first start's window is about to appear anyway)
app.on('second-instance', () => { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); });

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
  ipcMain.handle('choices:answer', (_e, { slug, picks }) => answerAsk(slug, picks));
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
  const make = (port) => createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { port, strictPort: false, open: false, fs: { allow: [ROOT, RES] } }, logLevel: 'error' });
  vite = await make(5199);
  // Vite only moves on to the next port when it's in use (EADDRINUSE); Windows' reserved ranges (Hyper-V, WSL, Docker) fail with EACCES,
  // which would leave every game preview blank — so on any listen error ask the OS for a free port instead
  try { await vite.listen(); } catch (e) { console.error('vite listen failed, retrying on a free port', e); await vite.close().catch(() => {}); vite = await make(0); await vite.listen(); }
  port = vite.httpServer.address().port;
}

app.whenReady().then(async () => {
  if (!gotLock) return;   // a second instance: quitting (see above), set nothing up
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
  // never taller/wider than the screen's work area: at 125-150 % scaling on a 1080p laptop it is ~1536x816 or 1280x680, and the composer would sit under the taskbar
  const { width: aw, height: ah } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    show: !process.env.STUDIO_HIDDEN,   // tests: render without putting a window on screen (stray clicks)
    width: Math.min(1560, aw), height: Math.min(960, ah), minWidth: Math.min(1100, aw), minHeight: Math.min(680, ah), title: 'Game Forge Studio', backgroundColor: '#ffffff',
    // the window buttons sit inside the app's own top row: traffic lights on macOS, caption buttons on Windows
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 21 } } : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#ffffff', symbolColor: '#1b1b1b', height: 56 } }),
    // macOS takes the icon from the .app bundle; Windows and Linux need it on the window
    ...(IS_MAC ? {} : { icon: join(APP_DIR, IS_WIN ? 'studio/icon.ico' : 'studio/icon.png') }),
    webPreferences: { preload: join(APP_DIR, 'studio/preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  if (process.env.STUDIO_HIDDEN) win.webContents.setAudioMuted(true);   // tests: no game music out of the speakers
  // Electron has no right-click menu of its own: without this the chat composer and address bar offer no Cut/Copy/Paste
  win.webContents.on('context-menu', (_e, p) => {
    const f = p.editFlags, t = [];
    if (p.isEditable) t.push({ role: 'undo', enabled: f.canUndo }, { role: 'redo', enabled: f.canRedo }, { type: 'separator' }, { role: 'cut', enabled: f.canCut });
    if (p.isEditable || p.selectionText) t.push({ role: 'copy', enabled: f.canCopy });
    if (p.isEditable) t.push({ role: 'paste', enabled: f.canPaste }, { type: 'separator' }, { role: 'selectAll', enabled: f.canSelectAll });
    if (t.length) Menu.buildFromTemplate(t).popup({ window: win });
  });
  win.loadURL(uiUrl());
  // packaged app: fetch the realistic asset packs in the background (progress shows in the sidebar)
  if (app.isPackaged && !process.env.STUDIO_SKIP_ASSET_DOWNLOAD) void downloadRealistic((t) => send('tools:status', t));
  if (existsSync(GAMES)) {
    const w = watch(GAMES, { recursive: true }, (_t, f) => { if (f && /game\.json|FIXES\.md/.test(f)) send('games:changed'); });
    w.on('error', () => w.close());   // Windows: if the folder is deleted or renamed an unhandled watcher keeps firing and pegs the main thread
  }
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

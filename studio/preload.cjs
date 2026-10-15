// The only bridge between the page and the app: a small, explicit API (no Node in the page).
const { contextBridge, ipcRenderer } = require('electron');

/** subscribe to a channel from the main process; returns an unsubscribe (React effects call it on cleanup) */
const on = (channel, map = (_e, x) => x) => (fn) => {
  const handler = (e, x) => fn(map(e, x));
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('studio', {
  platform: process.platform,
  setTheme: (dark) => ipcRenderer.invoke('theme:set', dark),
  installGit: () => ipcRenderer.invoke('git:install'),
  checkEnv: () => ipcRenderer.invoke('env:check'),
  login: () => ipcRenderer.invoke('auth:login'),
  installClaude: (opts) => ipcRenderer.invoke('claude:install', opts),
  games: () => ipcRenderer.invoke('games:list'),
  send: (key, text, slug) => ipcRenderer.invoke('chat:send', { key, text, slug }),
  stop: (key) => ipcRenderer.invoke('chat:stop', key),
  resetChat: (key) => ipcRenderer.invoke('chat:reset', key),
  answerChoices: (slug, picks) => ipcRenderer.invoke('choices:answer', { slug, picks }),
  allow: (rule) => ipcRenderer.invoke('perm:allow', rule),
  applyFix: (slug, n) => ipcRenderer.invoke('fixes:apply', { slug, n }),
  undoFix: (slug, n) => ipcRenderer.invoke('fixes:undo', { slug, n }),
  exportGame: (slug) => ipcRenderer.invoke('game:export', slug),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  openFolder: (slug) => ipcRenderer.invoke('open:folder', slug),
  onChat: on('chat:event'),
  onMenu: on('menu'),
  onTools: on('tools:status'),
  onEnvChanged: on('env:changed', () => undefined),
  onGamesChanged: on('games:changed', () => undefined),
});

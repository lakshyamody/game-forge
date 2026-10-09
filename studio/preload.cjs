// The only bridge between the page and the app: a small, explicit API (no Node in the page).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  checkEnv: () => ipcRenderer.invoke('env:check'),
  login: () => ipcRenderer.invoke('auth:login'),
  installClaude: () => ipcRenderer.invoke('claude:install'),
  games: () => ipcRenderer.invoke('games:list'),
  send: (key, text, slug) => ipcRenderer.invoke('chat:send', { key, text, slug }),
  stop: (key) => ipcRenderer.invoke('chat:stop', key),
  resetChat: (key) => ipcRenderer.invoke('chat:reset', key),
  allow: (rule) => ipcRenderer.invoke('perm:allow', rule),
  applyFix: (slug, n) => ipcRenderer.invoke('fixes:apply', { slug, n }),
  undoFix: (slug, n) => ipcRenderer.invoke('fixes:undo', { slug, n }),
  exportGame: (slug) => ipcRenderer.invoke('game:export', slug),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  openFolder: (slug) => ipcRenderer.invoke('open:folder', slug),
  onChat: (fn) => ipcRenderer.on('chat:event', (_e, ev) => fn(ev)),
  onTools: (fn) => ipcRenderer.on('tools:status', (_e, t) => fn(t)),
  onGamesChanged: (fn) => ipcRenderer.on('games:changed', () => fn()),
});

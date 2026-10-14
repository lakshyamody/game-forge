/**
 * The window's UI: a Next.js app (studio/ui) exported as static files and served over a private studio:// scheme
 * (absolute /_next/… URLs just work). `STUDIO_UI_DEV=1` loads the Next dev server instead, with hot reload.
 */
import { app, protocol, net, Menu } from 'electron';
import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_DIR, IS_MAC } from './paths.mjs';

const OUT = join(APP_DIR, 'studio/ui/out');
export const DEV_URL = 'http://localhost:3210';

// must run before app is ready
protocol.registerSchemesAsPrivileged([{ scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

export function serveUi() {
  protocol.handle('studio', (req) => {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(OUT, path));
    if (!file.startsWith(OUT)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(existsSync(file) ? file : `${file}.html`).toString());
  });
}

export const uiUrl = () => (process.env.STUDIO_UI_DEV ? DEV_URL : 'studio://app/');
export const uiBuilt = () => existsSync(join(OUT, 'index.html'));

/** a small native menu: keeps copy/paste and quit, and frees ⌘R/⌘W/⌘N/⌘B/⌘J for the app's own shortcuts */
export function setMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(IS_MAC ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'toggleDevTools', accelerator: 'Alt+CmdOrCtrl+I' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ]));
}

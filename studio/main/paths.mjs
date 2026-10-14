/**
 * Where things live. Dev (`npm run studio`): everything is this repo.
 * Packaged: the game tools ship read-only in Resources/forge; the user's games live in ~/Game Forge
 * (home folder, so macOS doesn't show a privacy prompt the way Documents would).
 */
import { app } from 'electron';
import { homedir, platform } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');   // repo (dev) or Resources/app (packaged)
export const RES = app.isPackaged ? join(process.resourcesPath, 'forge') : APP_DIR;
export const ROOT = app.isPackaged ? join(homedir(), 'Game Forge') : APP_DIR;
export const GAMES = join(ROOT, 'games');
export const IS_MAC = platform() === 'darwin', IS_WIN = platform() === 'win32';

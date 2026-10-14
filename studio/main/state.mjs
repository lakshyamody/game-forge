/** Persisted app state: Claude Code session id per game (so chats resume) and extra tools the user allowed. */
import { app } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const path = () => join(app.getPath('userData'), 'studio-state.json');
export const state = { sessions: {}, allowed: [] };
export function loadState() { try { Object.assign(state, JSON.parse(readFileSync(path(), 'utf8'))); } catch { /* first run */ } }
export function saveState() { mkdirSync(dirname(path()), { recursive: true }); writeFileSync(path(), JSON.stringify(state, null, 2)); }

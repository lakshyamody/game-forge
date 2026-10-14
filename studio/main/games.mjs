/** The games sidebar: every games/<slug>/ with a game.json, plus its kid-check fixes from FIXES.md. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAMES } from './paths.mjs';
import { state } from './state.mjs';

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; } };   // half-written while Claude edits
const readFixes = (md) => existsSync(md) ? [...readFileSync(md, 'utf8').matchAll(/^## (⬜|✅) (\d+)\. (.+)$/gm)].map(([, st, n, text]) => ({ n: Number(n), done: st === '✅', text: text.replace(/^"|"$/g, '') })) : [];

export function listGames() {
  if (!existsSync(GAMES)) return [];
  return readdirSync(GAMES).filter((d) => existsSync(join(GAMES, d, 'game.json'))).map((slug) => {
    const meta = readJson(join(GAMES, slug, 'game.json'));
    return { slug, title: meta.title ?? slug, tagline: meta.tagline ?? '', color: meta.color ?? '#7c5cff', controls: meta.controls ?? '', fixes: readFixes(join(GAMES, slug, 'FIXES.md')), session: !!state.sessions[slug] };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

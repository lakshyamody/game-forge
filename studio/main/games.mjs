/** The games list: every games/<slug>/ with a game.json, with what the UI shows about it. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GAMES } from './paths.mjs';
import { state } from './state.mjs';

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return {}; } };   // half-written while Claude edits
const readFixes = (md) => [...read(md).matchAll(/^## (⬜|✅) (\d+)\. (.+)$/gm)].map(([, st, n, text]) => ({ n: Number(n), done: st === '✅', text: text.replace(/^"|"$/g, '') }));
/** first paragraph under "## Pitch" in GAME.md */
const pitch = (md) => (md.match(/^## Pitch\s*\n+([\s\S]*?)(\n\n|\n## |$)/m)?.[1] ?? '').trim().replace(/(\*\*|\*|__|`)(.+?)\1/g, '$2');   // plain text
const engine = (dir, meta) => meta.engine === 'three' || /from 'three'/.test(read(join(dir, 'main.ts'))) ? 'Three.js' : 'Phaser';
const created = (dir) => { try { const s = statSync(join(dir, 'GAME.md')); return Math.min(s.birthtimeMs || s.mtimeMs, s.mtimeMs); } catch { return 0; } };

export function listGames() {
  if (!existsSync(GAMES)) return [];
  return readdirSync(GAMES).filter((d) => existsSync(join(GAMES, d, 'game.json'))).map((slug) => {
    const dir = join(GAMES, slug), meta = readJson(join(dir, 'game.json'));
    return {
      slug, title: meta.title ?? slug, tagline: meta.tagline ?? '', color: meta.color ?? '#7c5cff', controls: meta.controls ?? '',
      engine: engine(dir, meta), pitch: pitch(read(join(dir, 'GAME.md'))), created: created(dir),
      thumb: existsSync(join(dir, 'thumb.jpg')), fixes: readFixes(join(dir, 'FIXES.md')), session: !!state.sessions[slug],
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

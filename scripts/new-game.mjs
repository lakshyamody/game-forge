#!/usr/bin/env node
/**
 * Scaffold a new game.
 *
 *   npm run new                                              # list templates + existing games
 *   npm run new -- my-game                                   # blank template
 *   npm run new -- my-game --template platformer --title "Moon Jump" --tagline "Low gravity, high stakes"
 *   npm run new -- my-game --from neon-swarm                 # remix an existing game
 *
 * Creates games/<slug>/ and replaces {{TITLE}}, {{SLUG}}, {{TAGLINE}}.
 */
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { root, walk } from './lib/common.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const slug = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

const TEMPLATES = {
  blank: 'Minimal complete loop (move, collect, dodge, timer). Start here for anything 2D that fits no genre below.',
  topdown: 'Twin-stick arena: hundreds of enemies, waves, XP, level-up cards. Shooters, survivors-likes, top-down action.',
  platformer: 'Pixel-art side-scroller: arcade physics, coyote time, ASCII levels, stomp enemies. Platformers, metroidvania rooms.',
  puzzle: 'Grid puzzle (Sokoban) with undo, restart, level progression. Any turn-based / tile / logic game.',
  physics: 'Matter.js slingshot destruction. Anything with real rigid bodies: stacking, ragdolls, marble runs, golf.',
  '3d': 'Three.js world that already looks good: HDRI sky + sun shadows, textured ground, nature props, animated character, third-person camera, clean HUD. Start here for anything 3D.',
  '3d-neon': 'Three.js neon arena (grid, glow, bloom). Only for an abstract neon style.',
};
const games = () => readdirSync(resolve(root, 'games')).filter((d) => existsSync(resolve(root, 'games', d, 'game.json')));

if (!slug) {
  console.log('Templates:');
  for (const [k, v] of Object.entries(TEMPLATES)) console.log(`  ${k.padEnd(11)} ${v}`);
  console.log('\nExisting games (remix with --from):\n  ' + games().join('\n  '));
  console.log('\nusage: npm run new -- <slug> [--template name | --from game] [--title "Title"] [--tagline "..."]');
  process.exit(0);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.error('slug must be kebab-case, e.g. space-golf'); process.exit(1); }
const dest = resolve(root, 'games', slug);
if (existsSync(dest)) { console.error(`games/${slug} already exists`); process.exit(1); }

const from = opt('from');
const template = opt('template', 'blank');
if (from && !games().includes(from)) { console.error(`no game "${from}". Existing: ${games().join(', ')}`); process.exit(1); }
if (!from && !TEMPLATES[template]) { console.error(`unknown template "${template}". Available: ${Object.keys(TEMPLATES).join(', ')}`); process.exit(1); }

const title = opt('title', slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
const tagline = opt('tagline', 'A new game.');
const src = from ? resolve(root, 'games', from) : resolve(root, 'templates', template);
const oldTitle = from ? JSON.parse(readFileSync(join(src, 'game.json'), 'utf8')).title : null;
cpSync(src, dest, { recursive: true });

for (const f of walk(dest)) {
  if (!/\.(ts|js|json|html|css|md)$/.test(f)) continue;
  let s = readFileSync(f, 'utf8');
  const before = s;
  s = s.replaceAll('{{TITLE}}', title).replaceAll('{{SLUG}}', slug).replaceAll('{{TAGLINE}}', tagline);
  if (from) {
    s = s.replaceAll(`'${from}'`, `'${slug}'`).replaceAll(`"${from}"`, `"${slug}"`);   // save keys etc.
    if (oldTitle) s = s.replaceAll(oldTitle, title).replaceAll(oldTitle.toUpperCase(), title.toUpperCase());
    if (f.endsWith('game.json')) { const j = JSON.parse(s); delete j.featured; j.tagline = tagline === 'A new game.' ? `Remix of ${oldTitle}.` : tagline; s = JSON.stringify(j, null, 2) + '\n'; }
  }
  if (s !== before) writeFileSync(f, s);
}
console.log(`✔ created games/${slug} from ${from ? `games/${from}` : `templates/${template}`}`);
console.log(`  play:     npm run play -- ${slug}`);
console.log(`  playtest: npm run shot -- ${slug} --gpu`);
console.log(`  tune:     open with ?tune for live sliders`);

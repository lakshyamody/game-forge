#!/usr/bin/env node
/**
 * "Choose the look": put 2–3 rendered options for each key visual in front of the user before building.
 *   npm run ask -- <slug> <draft.json>
 * draft.json:
 *   { "title": "Choose the look for Frostlight",
 *     "questions": [
 *       { "id": "player", "question": "What should the player look like?",
 *         "options": [
 *           { "label": "Mountain explorer", "asset": "mini-characters/character-male-c", "note": "cute, chunky" },
 *           { "label": "Knight in furs", "asset": "kaykit-adventurers/Knight", "tint": "#d9c7a8" },
 *           { "label": "Lantern keeper (new)", "asset": "code:games/frostlight/art/keeper.ts", "note": "made for this game" } ] } ] }
 * asset: "pack/name" (library model, CATALOG.md) · "texture:<id>" · "hdri:<id>" · "code:<path.ts>" (a model you built:
 * default export returns a THREE.Object3D). Every option is rendered to games/<slug>/choices/<id>-<n>.png and the set is
 * written to games/<slug>/choices/ask.json, which Game Forge Studio shows as a picker. The user's picks come back as
 * the next message.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './lib/common.mjs';
import { renderPreviews } from './preview.mjs';

const [slug, draftPath] = process.argv.slice(2);
const fail = (m) => { console.error(`✖ ${m}`); process.exit(1); };
if (!slug || !draftPath) fail('usage: npm run ask -- <slug> <draft.json>');
const game = join(root, 'games', slug);
if (!existsSync(join(game, 'game.json'))) fail(`no game "${slug}" — scaffold it first (npm run new -- ${slug} …)`);
let draft; try { draft = JSON.parse(readFileSync(resolve(root, draftPath), 'utf8')); } catch (e) { fail(`can't read ${draftPath}: ${e.message}`); }

/** image:<path> → a file under assets/ or the repo */
function imagePath(a) { const p = a.slice(6).replace(/^\/+/, ''); return [join(root, 'assets', p), join(root, p)].find((f) => existsSync(f)); }

// ---- validate (clear messages: Claude fixes the draft and runs it again)
const cat = JSON.parse(readFileSync(join(root, 'assets/catalog.json'), 'utf8'));
const models = new Set(Object.entries(cat.models).flatMap(([p, l]) => l.map((m) => `${p}/${m.name}`)));
const problems = [];
const qs = draft.questions ?? [];
if (!qs.length || qs.length > 6) problems.push('ask 1–6 questions (the 3–5 things that decide how the game looks)');
const ids = new Set();
for (const q of qs) {
  if (!q.id || !/^[a-z0-9-]+$/.test(q.id) || ids.has(q.id)) problems.push(`question id "${q.id}" must be unique, lowercase, letters/digits/dashes`); ids.add(q.id);
  if (!q.question) problems.push(`${q.id}: missing "question" (e.g. "What should the player look like?")`);
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 3) problems.push(`${q.id}: give 2 or 3 options`);
  for (const o of q.options ?? []) {
    const a = String(o.asset ?? '');
    if (!o.label) problems.push(`${q.id}: an option has no label`);
    if (a.startsWith('texture:')) { if (!cat.textures.includes(a.slice(8))) problems.push(`${q.id}: no texture "${a.slice(8)}" in the library`); }
    else if (a.startsWith('hdri:')) { if (!cat.hdri.includes(a.slice(5))) problems.push(`${q.id}: no HDRI "${a.slice(5)}" in the library`); }
    else if (a.startsWith('code:')) { if (!existsSync(join(root, a.slice(5)))) problems.push(`${q.id}: ${a.slice(5)} doesn't exist`); }
    else if (a.startsWith('image:')) { if (!imagePath(a)) problems.push(`${q.id}: no image ${a.slice(6)} (a path under assets/ or the repo)`); }
    else if (!models.has(a)) problems.push(`${q.id}: no model "${a}" in the library (CATALOG.md; import with npm run assets -- add/model/kaykit, or build it in code)`);
  }
}
if (problems.length) fail(`the choices need fixing:\n  ${problems.join('\n  ')}`);

// ---- render every option
const out = join(game, 'choices');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const jobs = qs.flatMap((q) => q.options.map((o, i) => ({ target: o.asset, tint: o.tint, out: join(out, `${q.id}-${i + 1}.png`), q: q.id, i })));
console.log(`▸ rendering ${jobs.length} previews…`);
// 2D images are scaled onto the same card (nearest-neighbour keeps pixel art crisp); everything else is rendered in 3D
const sharp = (await import('sharp')).default;
for (const j of jobs.filter((j) => j.target.startsWith('image:'))) await sharp(imagePath(j.target)).resize(560, 400, { fit: 'contain', kernel: 'nearest', background: '#e9edf1' }).extend({ top: 40, bottom: 40, left: 40, right: 40, background: '#e9edf1' }).png().toFile(j.out);
const results = [...jobs.filter((j) => j.target.startsWith('image:')), ...await renderPreviews(jobs.filter((j) => !j.target.startsWith('image:')))];
const bad = results.filter((r) => r.error);
if (bad.length) fail(`some previews failed:\n  ${bad.map((r) => `${r.q} option ${r.i + 1} (${r.target}): ${r.error}`).join('\n  ')}`);

const ask = {
  status: 'pending', created: Date.now(), title: draft.title ?? 'Choose the look',
  questions: qs.map((q) => ({ id: q.id, question: q.question, options: q.options.map((o, i) => ({ label: o.label, note: o.note ?? '', asset: o.asset, tint: o.tint ?? null, image: `choices/${q.id}-${i + 1}.png` })) })),
};
writeFileSync(join(out, 'ask.json'), JSON.stringify(ask, null, 2));
console.log(`✔ ${qs.length} questions, ${jobs.length} options → games/${slug}/choices/ (open the PNGs to check them)`);
if (process.env.GAME_FORGE_STUDIO) console.log('\nGame Forge Studio now shows these as a picker. END YOUR TURN NOW: don\'t build further. The user\'s picks arrive as your next message.');
else console.log(`\nAsk the user in chat which option they want for each:\n${ask.questions.map((q) => `  ${q.question}\n${q.options.map((o, i) => `    ${i + 1}. ${o.label}${o.note ? ` — ${o.note}` : ''} (${o.asset})`).join('\n')}`).join('\n')}`);

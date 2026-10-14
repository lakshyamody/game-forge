#!/usr/bin/env node
/**
 * Automated playtest: boots the dev server, opens a game in headless Chromium, mashes inputs
 * like a (bad) player, saves screenshots, and reports console errors + window.__playtest state.
 *
 *   npm run shot -- neon-swarm                    # 8s bot run
 *   npm run shot -- neon-swarm --seconds 20       # longer
 *   npm run shot -- templates/phaser              # any path under the repo
 *   npm run shot -- arcade --no-bot               # the launcher page
 *   npm run shot -- neon-swarm --no-bot           # just load + screenshot
 *   npm run shot -- neon-swarm --keys "Space,KeyD" # extra keys the bot should mash
 *   npm run shot -- neon-swarm --query "god&wave=5" # URL params (games can read them for debug)
 *   npm run shot -- my-game --eval "__game.scene.getScene('Play').xp = 99"   # force a state after start
 *
 * Exit code 1 if the page threw any errors. Screenshots land in .shots/<name>/.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { root } from './lib/common.mjs';
import { devServer, launchChromium } from './lib/browser.mjs';
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--') && !/^\d/.test(a)) ?? 'neon-swarm';
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const seconds = Number(opt('seconds', 8));
const bot = !args.includes('--no-bot');
const extraKeys = (opt('keys', '') || '').split(',').filter(Boolean);
const [vw, vh] = opt('size', '1280x720').split('x').map(Number);
const query = opt('query', '');   // e.g. --query "god&autoaim&wave=5"
const clicks = !args.includes('--no-click');
const evalJs = opt('eval', '');    // JS run in the page after start, e.g. --eval "__game.scene.getScene('Play').xp = 99"
const isRoot = target === '.' || target === '/' || target === 'arcade';
const path = isRoot ? '' : target.includes('/') ? target.replace(/\/?$/, '/') : `games/${target}/`;
const name = isRoot ? 'arcade' : basename(target);
const out = resolve(root, '.shots', name);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const dev = await devServer();
const base = dev.base;
// --gpu uses the real GPU (accurate visuals, real fps); default is SwiftShader software GL (works anywhere/CI).
const gpu = args.includes('--gpu');
const browser = await launchChromium({ gpu });
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
const warnings = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors.push(`console.error: ${t}`);
  else if (m.type() === 'warning' && !/AudioContext|GPU stall|GroupMarkerNotSet|WebGL/i.test(t)) warnings.push(t);
});

let shotN = 0;
const shot = async (label) => {
  const file = resolve(out, `${String(++shotN).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  return file;
};

const url = base + path + (query ? `?${query}` : '');
console.log(`▶ ${url}`);
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const files = [await shot('load')];

if (bot) {
  // start the game the usual ways
  await page.mouse.click(vw / 2, vh / 2);
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  if (evalJs) { await page.evaluate(evalJs); await page.waitForTimeout(700); }
  files.push(await shot('start'));

  const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const held = new Set();
  const end = Date.now() + seconds * 1000;
  const every = Math.max(1500, (seconds * 1000) / 5);
  let nextShot = Date.now() + every;
  let a = 0;
  while (Date.now() < end) {
    // change held movement keys
    for (const k of held) if (Math.random() < 0.4) { await page.keyboard.up(k); held.delete(k); }
    const k = moveKeys[(Math.random() * 4) | 0];
    if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    // sweep the mouse around the centre
    a += 0.7;
    await page.mouse.move(vw / 2 + Math.cos(a) * vw * 0.3, vh / 2 + Math.sin(a) * vh * 0.3, { steps: 3 });
    if (Math.random() < 0.15) await page.keyboard.press('Space');
    if (clicks && Math.random() < 0.1) await page.mouse.down().then(() => page.mouse.up());
    // pick upgrades / dismiss dialogs if any are up
    if (Math.random() < 0.1) await page.keyboard.press(['Digit1', 'Digit2', 'Digit3'][(Math.random() * 3) | 0]);
    for (const x of extraKeys) if (Math.random() < 0.3) await page.keyboard.press(x);
    await page.waitForTimeout(220);
    if (Date.now() >= nextShot) { files.push(await shot(`t${Math.round((Date.now() - t0) / 1000)}s`)); nextShot += every; }
  }
  for (const k of held) await page.keyboard.up(k);
  files.push(await shot('end'));
}

const state = await page.evaluate(() => {
  const g = window.__game;
  const scenes = g?.scene?.getScenes?.(true)?.map((s) => s.scene.key);
  const fps = g?.loop?.actualFps ? Math.round(g.loop.actualFps) : undefined;
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : undefined;
  return { playtest: window.__playtest ?? null, activeScenes: scenes, fps, renderer };
});

await browser.close();
await dev.close();

console.log(`\nscreenshots (${files.length}) → ${out}`);
for (const f of files) console.log(`  ${f}`);   // exact paths: open these, don't guess names (they depend on timing)
console.log('state:', JSON.stringify(state));
if (warnings.length) console.log(`\nwarnings (${warnings.length}):\n  ` + [...new Set(warnings)].slice(0, 10).join('\n  '));
if (errors.length) {
  console.log(`\n✖ ${errors.length} error(s):\n` + [...new Set(errors)].slice(0, 15).join('\n'));
  process.exit(1);
}
console.log('\n✔ no runtime errors');

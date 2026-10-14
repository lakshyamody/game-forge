#!/usr/bin/env node
/**
 * Game thumbnails for the arcade and Game Forge Studio: loads each game's title screen on the GPU and saves
 * games/<slug>/thumb.jpg (640×400).
 *
 *   npm run thumbs              # every game that has no thumb yet
 *   npm run thumbs -- blast-ball --force
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, cli } from './lib/common.mjs';
import { devServer, launchChromium } from './lib/browser.mjs';

const o = cli(['_', ...process.argv.slice(2)]);
const all = readdirSync(join(root, 'games')).filter((d) => existsSync(join(root, 'games', d, 'game.json')));
const slugs = (o.names.length ? o.names : all).filter((s) => o.flag('force') || !existsSync(join(root, 'games', s, 'thumb.jpg')));
if (!slugs.length) { console.log('✔ every game has a thumbnail'); process.exit(0); }
const dev = await devServer(), browser = await launchChromium({ gpu: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const slug of slugs) {
  try {
    await page.goto(dev.url(`games/${slug}/?freelook`), { waitUntil: 'load' });
    await page.waitForTimeout(5000);   // models, textures and the menu attract mode
    await page.screenshot({ path: join(root, 'games', slug, 'thumb.jpg'), type: 'jpeg', quality: 82, scale: 'css', clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log(`✔ ${slug}`);
  } catch (e) { console.error(`✖ ${slug}: ${e.message}`); }
}
await browser.close(); await dev.close();

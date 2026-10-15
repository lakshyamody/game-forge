#!/usr/bin/env node
/**
 * Render asset previews (640×480 PNG), framed the same way every time (preview.html):
 *   npm run preview -- <target> [--out file.png]
 *   target: "pack/name" (library model) · "texture:<id>" · "hdri:<id>" · "code:games/<slug>/art/<name>.ts"
 * The Studio's "choose the look" step (scripts/ask.mjs) renders every option through renderPreviews().
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, root } from './lib/common.mjs';
import { devServer, launchChromium } from './lib/browser.mjs';

/** jobs: [{ target, out, tint? }] → [{ target, out, error? }] (never throws for one bad target) */
export async function renderPreviews(jobs, { gpu = true } = {}) {
  const dev = await devServer(), browser = await launchChromium({ gpu });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const results = [];
  try {
    for (const j of jobs) {
      try {
        await page.goto(dev.url(`preview.html?target=${encodeURIComponent(j.target)}${j.tint ? `&tint=${encodeURIComponent(j.tint)}` : ''}`));
        await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
        const err = await page.evaluate(() => window.__error);
        if (err) throw new Error(err);
        mkdirSync(dirname(j.out), { recursive: true });
        await page.locator('canvas').screenshot({ path: j.out });
        results.push({ ...j });
      } catch (e) { results.push({ ...j, error: String(e.message ?? e).split('\n')[0] }); }
    }
  } finally { await browser.close(); await dev.close(); }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = cli(['_', ...process.argv.slice(2)]);
  const target = o.names[0];
  if (!target) { console.error('usage: npm run preview -- <pack/name | texture:id | hdri:id | code:path.ts> [--out file.png]'); process.exit(1); }
  const out = resolve(root, o.opt('out', `.shots/preview/${target.replace(/[^\w.-]+/g, '_')}.png`));
  const [r] = await renderPreviews([{ target, out }]);
  if (r.error) { console.error(`✖ ${target}: ${r.error}`); process.exitCode = 1; } else console.log(`✔ ${out}`);
}

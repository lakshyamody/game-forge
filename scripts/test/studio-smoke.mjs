#!/usr/bin/env node
/**
 * Smoke-test Game Forge Studio on this OS: launch it (hidden), wait for the Claude Code check, open a game, check the
 * live preview serves and draws a canvas, apply + revert a staged fix through the UI. Exits 1 on any page error.
 *
 *   node scripts/test/studio-smoke.mjs [--packaged] [--shot file.png]
 *     --packaged   the app from `npm run studio:build` (dist-studio/…) instead of studio/main.mjs from this repo.
 *                  Also checks what the download promises: Claude Code installs itself when missing, and a playtest
 *                  runs on the app's own Node + bundled Chromium (no Node or browser on the machine needed).
 */
import { _electron as electron } from 'playwright';
import { dirname, join } from 'node:path';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { root, cli } from '../lib/common.mjs';

const o = cli(['_', ...process.argv.slice(2)]);
const name = 'Game Forge Studio';
const exe = process.platform === 'win32' ? join(root, 'dist-studio/win', name, `${name}.exe`) : join(root, `dist-studio/${name}.app/Contents/MacOS/${name}`);
const resources = process.platform === 'win32' ? join(root, 'dist-studio/win', name, 'resources') : join(root, `dist-studio/${name}.app/Contents/Resources`);
if (!process.argv.includes('--packaged') && !existsSync(join(root, 'studio/ui/out/index.html'))) { console.error('✖ the Studio UI isn\'t built: run  npm ci --prefix studio/ui && npm run build --prefix studio/ui  (or npm run studio once)'); process.exit(1); }
const env = { ...process.env, STUDIO_SKIP_ASSET_DOWNLOAD: '1', STUDIO_HIDDEN: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch(o.flag('packaged') ? { executablePath: exe, env } : { args: [join(root, 'studio/main.mjs')], env, cwd: root });
const page = await app.firstWindow();
// closing: the game server stops before the window, and the preview's live-reload client logs "connection refused"
// while it retries; that's shutdown noise, not a page error
let closing = false;
const errs = []; page.on('pageerror', (e) => { if (!closing) errs.push(e.message); }); page.on('console', (m) => { if (m.type() === 'error' && !closing) errs.push(m.text().slice(0, 300)); });
const step = (s) => console.log(`▸ ${s}`);
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  // first launch of the packaged app copies the game tools into ~/Game Forge (and may install Claude Code), so allow time
  await page.waitForSelector('text=/What should we make/', { timeout: 120000 });
  if (await page.locator('text=Installing Claude Code').count()) step('installing Claude Code in the background…');
  // the top-right pill settles on "Account" (ready) or "Set up" (not installed / not signed in)
  await page.waitForFunction(() => !/Checking…|Installing Claude Code/.test(document.body.innerText), null, { timeout: 300000 });
  const ready = await page.locator('main button', { hasText: /^Account$/ }).count() > 0;
  const envNow = await page.evaluate(() => window.studio.checkEnv());
  if (envNow.installError) step(`Claude Code background install failed: ${envNow.installError}`);
  step(`Claude Code: ${ready ? 'installed and signed in' : (await page.locator('main .rounded-full', { hasText: 'Set up' }).first().textContent())?.replace('Set up', '').trim()}`);
  await page.keyboard.press('Escape');   // not signed in (CI): the setup sheet opens on launch; it can be dismissed
  const game = page.locator('aside button', { hasText: 'Blast Ball' }).first();
  await game.waitFor({ timeout: 30000 }); await game.click();
  const frame = page.locator('iframe[title="Preview"]').first();
  await frame.waitFor({ timeout: 90000 });
  const src = await frame.getAttribute('src');
  step(`preview: ${src}`);
  await page.frameLocator('iframe[title="Preview"]').first().locator('canvas').first().waitFor({ timeout: 90000 });
  step('the game draws a canvas');
  await page.locator('main button', { hasText: /^Apply$/ }).first().click();
  await page.waitForSelector('text=Applied fix 1', { timeout: 120000 }); step('applied fix 1 from the UI');
  await page.locator('main button', { hasText: /^Revert$/ }).first().click();
  await page.waitForSelector('text=Reverted fix 1', { timeout: 120000 }); step('reverted fix 1');
} catch (e) { errs.push(`step failed: ${e.message.split('\n')[0]}`); }
const shot = o.opt('shot'); if (shot) await page.screenshot({ path: shot }).catch(() => {});
closing = true;
await app.close();
if (o.flag('packaged')) {
  step('playtest on the app\'s own Node + bundled Chromium');
  try {
    // output goes to a file, not a pipe: on Windows, piped stdout from a process that dies early can come back empty
    const logFile = join(homedir(), 'Game Forge', '.scratch', 'smoke-playtest.log'); mkdirSync(dirname(logFile), { recursive: true });
    const fd = openSync(logFile, 'w');
    try {
      execFileSync(exe, [join(homedir(), 'Game Forge/scripts/shot.mjs'), 'blast-ball', '--seconds', '3'], {
        cwd: join(homedir(), 'Game Forge'), stdio: ['ignore', fd, fd], timeout: 240000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PLAYWRIGHT_BROWSERS_PATH: join(resources, 'forge/ms-playwright') },
      });
    } catch (e) { closeSync(fd); throw Object.assign(e, { stdout: readFileSync(logFile, 'utf8') }); }
    closeSync(fd);
    const out = readFileSync(logFile, 'utf8');
    if (!/no runtime errors/.test(out)) errs.push(`bundled playtest: ${out.slice(-400)}`); else step('bundled playtest ran clean');
  } catch (e) { errs.push(`bundled playtest failed (exit ${e.status ?? '-'}, signal ${e.signal ?? '-'}${e.signal === 'SIGTERM' ? ', timed out' : ''}):\n${`${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim().slice(-1500) || e.message}`); }
}
console.log(errs.length ? `✖ ${errs.join('\n✖ ')}` : '✔ Studio smoke test passed');
process.exit(errs.length ? 1 : 0);

#!/usr/bin/env node
/**
 * End-to-end test of Game Forge Studio's UI, in a hidden window with a throwaway profile (sessions, allowed tools).
 * Opening Finder / the browser is stubbed and recorded instead. Every step runs even if an earlier one failed.
 *
 *   node scripts/test/studio-e2e.mjs [--claude] [--shots dir]
 *     --claude   also chat with the real Claude Code (uses your plan: a reply, a permission prompt, Stop, and the
 *                new-game flow, which creates and then removes games/zz-e2e)
 *
 * Touches blast-ball's fixes (applied and reverted) and writes ship/blast-ball.zip.
 */
import { _electron as electron } from 'playwright';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root, cli } from '../lib/common.mjs';

const o = cli(['_', ...process.argv.slice(2)]);
const shots = o.opt('shots'); if (shots) mkdirSync(shots, { recursive: true });
const GAME = 'blast-ball', OTHER = 'neon-swarm';
if (!process.argv.includes('--packaged') && !existsSync(join(root, 'studio/ui/out/index.html'))) { console.error('✖ the Studio UI isn\'t built: run  npm ci --prefix studio/ui && npm run build --prefix studio/ui  (or npm run studio once)'); process.exit(1); }
const env = { ...process.env, STUDIO_HIDDEN: '1', STUDIO_USER_DATA: mkdtempSync(join(tmpdir(), 'studio-e2e-')) }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [join(root, 'studio/main.mjs')], env, cwd: root });
let mainLog = '';
app.process().stderr.on('data', (d) => { mainLog = (mainLog + d).slice(-3000); for (const l of String(d).split('\n')) if (/GONE/.test(l)) console.log(`  ⚠ ${l}`); });
app.process().on('exit', (code, sig) => console.log(`  (the app exited: code ${code}, signal ${sig})\n  last main-process output:\n${mainLog.split('\n').slice(-12).map((l) => `    ${l}`).join('\n')}`));
await app.evaluate(({ app: a, shell }) => {
  // crashes of the page or the GPU process show up in the log instead of as a mysterious "page closed"
  a.on('render-process-gone', (_e, _wc, d) => console.error(`RENDERER GONE ${JSON.stringify(d)}`));
  a.on('child-process-gone', (_e, d) => console.error(`CHILD GONE ${JSON.stringify(d)}`));
  globalThis.__calls = [];
  shell.openExternal = async (u) => { globalThis.__calls.push(['external', u]); };
  shell.openPath = async (p) => { globalThis.__calls.push(['path', p]); return ''; };
  shell.showItemInFolder = (p) => { globalThis.__calls.push(['show', p]); };
});
const calls = () => app.evaluate(() => globalThis.__calls.splice(0));
const menu = (label) => app.evaluate(({ Menu }, l) => {
  const find = (items) => { for (const i of items) { if (i.label === l) return i; const r = i.submenu && find(i.submenu.items); if (r) return r; } };
  find(Menu.getApplicationMenu().items).click();
}, label).then(() => page.waitForTimeout(250));   // the action reaches the page over IPC
const page = await app.firstWindow();
let watchGames = false;   // errors inside game previews only count while a test watches a game load
const pageErrors = [];
// a game frame torn down mid-load rejects its fetches: only count that while a test watches a game load
page.on('pageerror', (e) => { if (!watchGames && /Failed to fetch|Couldn't load texture blob/.test(e.message)) return; pageErrors.push(e.message); });
page.on('crash', () => console.log('  ⚠ the Studio page crashed'));
page.on('close', () => console.log('  ⚠ the Studio page closed'));
page.on('console', (m) => {
  if (m.type() !== 'error' || /favicon/.test(m.text())) return;
  if (m.location().url.startsWith('http://localhost') && !watchGames) return;
  pageErrors.push(m.text().slice(0, 300));
});
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
await page.evaluate(() => localStorage.clear()); await page.reload();

const results = [];
async function t(name, fn) {
  console.log(`… ${name}`);
  const before = pageErrors.length;
  try { await fn(); const errs = pageErrors.slice(before); if (errs.length) throw new Error(`page errors: ${errs.join(' | ')}`); results.push([true, name]); console.log(`✔ ${name}`); }
  catch (e) {
    results.push([false, name, e.message]); console.log(`✖ ${name}\n    ${e.message.split('\n').slice(0, 9).join('\n    ')}`);
    if (shots) await page.screenshot({ path: join(shots, `fail-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const shot = (n) => shots && page.screenshot({ path: join(shots, `${n}.png`) });
const tabs = () => page.$$eval('[role=tab]', (ts) => ts.map((x) => x.textContent?.trim()));
const activeTab = () => page.$eval('[role=tab][aria-selected=true]', (x) => x.textContent?.trim());
const sidebar = (name) => page.locator('aside button', { hasText: name }).first();
const iframeSrc = () => page.$eval('iframe[title=Preview]', (f) => f.getAttribute('src'));
const draft = () => page.$eval('textarea[aria-label=Message]', (x) => x.value);
const title = async (slug) => JSON.parse(readFileSync(join(root, 'games', slug, 'game.json'), 'utf8')).title;
const [G, O] = [await title(GAME), await title(OTHER)];

// ------------------------------------------------------------------ boot
await t('boots: Claude Code status, games list, home page', async () => {
  await page.waitForSelector('text=/What should we make/', { timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Checking…'), null, { timeout: 30000 });
  await page.keyboard.press('Escape');   // not signed in (CI): close the setup sheet that opens on launch
  await sidebar(G).waitFor({ timeout: 10000 });
  assert((await tabs()).length === 1, `expected one tab, got ${await tabs()}`);
  assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isAudioMuted()), 'test window is not muted (game music would play)');
  await shot('home');
});

// ------------------------------------------------------------------ home
await t('home: template card and starting-point menu fill the message', async () => {
  await page.locator('main button', { hasText: 'Platformer' }).first().click();
  assert((await draft()).startsWith('Make a platformer game where'), `draft: ${await draft()}`);
  await page.getByLabel('Starting point').click();
  await page.locator('main button', { hasText: 'Puzzle' }).last().click();
  assert((await draft()).startsWith('Make a puzzle game where'), `draft: ${await draft()}`);
});
await t('home: surprise me writes an idea', async () => {
  await page.getByLabel('Surprise me').click();
  assert((await draft()).length > 30, `draft: ${await draft()}`);
});
await t('home: tray links open the arcade, asset library and games folder', async () => {
  await page.locator('main button', { hasText: 'Arcade' }).first().click();
  assert(await activeTab() === 'Arcade', `active: ${await activeTab()}`);
  await page.waitForSelector('iframe[title=Preview]');
  await page.getByRole('tab', { name: /New game/ }).click();
  await page.locator('main button', { hasText: 'Asset library' }).first().click();
  assert(await activeTab() === 'Asset library', `active: ${await activeTab()}`);
  assert((await iframeSrc()).endsWith('/assets.html'), `src ${await iframeSrc()}`);
  await page.getByRole('tab', { name: /New game/ }).click();
  await calls();
  await page.locator('main button', { hasText: 'Games folder' }).click();
  const c = await calls(); assert(c.some(([k, p]) => k === 'path' && /[\\/]games$/.test(p)), JSON.stringify(c));
});

// ------------------------------------------------------------------ search + tabs
await t('search: ⌘K focuses, typing filters, arrows + Return open, no stray newline in the chat', async () => {
  await menu('Search Games');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Search games', 'search not focused');
  await page.keyboard.type(G.slice(0, 4).toLowerCase());
  await page.keyboard.press('Enter');
  await page.waitForSelector('iframe[title=Preview]');
  assert(await activeTab() === G, `active: ${await activeTab()}`);
  assert(await draft() === '', `chat box got ${JSON.stringify(await draft())}`);
  await page.getByLabel('Search games').fill('zzzz-nothing');
  assert(await page.locator('text=/No games match/').count() === 1, 'no empty state');
  await page.keyboard.press('Escape');
  assert(await page.getByLabel('Search games').inputValue() === '', 'escape did not clear');
});
await t('tabs: open, next/prev, close active picks a neighbour, middle-click, last tab', async () => {
  await sidebar(O).click(); await sidebar('Arcade').click();
  let ts = await tabs(); const n = ts.length, at = ts.indexOf('Arcade');
  assert(ts.includes(O) && at >= 0, `tabs ${ts}`);
  await menu('Previous Tab'); assert(await activeTab() === ts[(at - 1 + n) % n], `prev → ${await activeTab()} in ${ts}`);
  await menu('Next Tab'); await menu('Next Tab'); assert(await activeTab() === ts[(at + 1) % n], `next → ${await activeTab()} in ${ts}`);
  await sidebar(O).click(); const oi = ts.indexOf(O); await menu('Close Tab');
  ts = await tabs(); assert(!ts.includes(O) && ts.length === n - 1, `after close ${ts}`);
  assert(await activeTab() === ts[Math.max(0, oi - 1)], `after close the active tab is ${await activeTab()}, expected the left neighbour ${ts[Math.max(0, oi - 1)]}`);
  await page.getByRole('tab', { name: 'Arcade' }).click({ button: 'middle' });
  ts = await tabs(); assert(!ts.includes('Arcade'), `middle-click ${ts}`);
  for (const _ of await tabs()) { await page.getByRole('tab').first().click(); await page.getByRole('tab').first().getByRole('button').click(); }
  ts = await tabs(); assert(ts.length === 1 && ts[0] === 'New game', `all closed → ${ts}`);
  await menu('New Game'); assert(await activeTab() === 'New game', 'menu New Game');
});

// ------------------------------------------------------------------ game page + preview
await t('game page: preview draws, address flags apply and stay with their game', async () => {
  await sidebar(G).click(); watchGames = true;
  await page.frameLocator('iframe[title=Preview]').locator('canvas').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000); watchGames = false;   // let the game finish loading its models
  const addr = page.getByLabel('Address');
  await addr.fill(`${(await iframeSrc()).replace(/^http:\/\//, '')}?god`); await addr.press('Enter');
  await page.waitForTimeout(300);
  assert((await iframeSrc()).endsWith('?god'), `src ${await iframeSrc()}`);
  await sidebar(O).click(); await page.waitForTimeout(300);
  assert(!(await iframeSrc()).includes('?god'), `?god leaked into ${O}: ${await iframeSrc()}`);
  await sidebar(G).click(); await page.waitForTimeout(300);
});
await t('preview: reload, phone size, expand / back, open in browser, ⌘L', async () => {
  const before = await page.$eval('iframe[title=Preview]', (f) => { f.dataset.mark = '1'; return f.src; });
  await page.getByLabel(/Reload/).first().click(); await page.waitForTimeout(200);
  assert(await page.$eval('iframe[title=Preview]', (f) => !f.dataset.mark), 'reload did not replace the iframe');
  await page.getByLabel('Phone size').click();
  assert(await page.$eval('iframe[title=Preview]', (f) => f.className.includes('aspect-[390/844]')), 'phone size');
  await page.getByLabel('Fit').click();
  await page.getByLabel('Expand').click(); assert(await page.locator('h1').count() === 0, 'expand kept the details');
  await menu('Focus Address Bar');
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Address', 'address not focused');
  await page.getByLabel('Back to details').click(); await page.locator('h1').waitFor();
  await calls(); await page.getByLabel('Open in browser').click();
  const c = await calls(); assert(c.some(([k, u]) => k === 'external' && u.startsWith(before.split('?')[0])), JSON.stringify(c));
  await menu('Reload Game');
});

// ------------------------------------------------------------------ fixes + export
await t('fixes: apply / revert one, apply all, revert all (game files restored)', async () => {
  const row = (n) => page.locator('main section .divide-y > div').nth(n - 1);
  await row(1).getByRole('button', { name: 'Apply' }).click();
  await page.waitForSelector('text=Applied fix 1.', { timeout: 120000 });
  assert(await row(1).getByText('Applied').count() === 1, 'row 1 not marked applied');
  await row(1).getByRole('button', { name: 'Revert' }).click();
  await page.waitForSelector('text=Reverted fix 1.', { timeout: 120000 });
  await page.getByRole('button', { name: 'Apply all' }).click();
  await page.waitForSelector('text=Applied all fixes.', { timeout: 180000 });
  await page.waitForFunction(() => document.body.innerText.includes('5/5 applied'), null, { timeout: 10000 });
  await page.getByRole('button', { name: 'Revert all' }).click();
  await page.waitForSelector('text=Reverted all fixes.', { timeout: 180000 });
  await page.waitForFunction(() => document.body.innerText.includes('0/5 applied'), null, { timeout: 10000 });
});
await t('export: zip made and shown in the file manager (⌘E)', async () => {
  rmSync(join(root, 'ship', `${GAME}.zip`), { force: true }); await calls();
  await menu('Export for itch.io…');
  await page.waitForSelector(`text=/Exported ${GAME}.zip/`, { timeout: 180000 });
  assert(existsSync(join(root, 'ship', `${GAME}.zip`)), 'no zip');
  const c = await calls(); assert(c.some(([k, p]) => k === 'show' && p.endsWith(`${GAME}.zip`)), JSON.stringify(c));
});

// ------------------------------------------------------------------ layout + chrome
await t('chat panel: hide / ⌘J, resize, new chat clears it', async () => {
  const aside = () => page.locator('aside', { hasText: 'Chat' });
  const w0 = (await aside().boundingBox()).width;
  const handle = page.locator('[title="Drag to resize"]'); const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + 2, hb.y + 200); await page.mouse.down(); await page.mouse.move(hb.x - 98, hb.y + 200, { steps: 5 }); await page.mouse.up();
  const w1 = (await aside().boundingBox()).width; assert(Math.abs(w1 - w0 - 100) < 8, `resize ${w0} → ${w1}`);
  await page.getByLabel(/Hide chat/).click(); assert(await aside().count() === 0, 'not hidden');
  await menu('Toggle Chat'); assert(await aside().count() === 1, 'not shown again');
  assert(await page.locator('aside >> text=Applied fix 1.').count() > 0, 'expected fix messages in the chat');
  await page.getByLabel('New chat').click();
  await page.locator('aside >> text=Applied fix 1.').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => { throw new Error('chat not cleared'); });
});
await t('sidebar ⌘B, appearance cycles and persists across reload', async () => {
  await menu('Toggle Sidebar'); assert(await page.locator('aside', { hasText: 'Asset library' }).count() === 0, 'sidebar not hidden');
  await menu('Toggle Sidebar');
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  assert(await theme() === 'light', `default theme ${await theme()}`);
  await page.getByRole('button', { name: /Appearance/ }).click(); assert(await theme() === 'dark', 'not dark');
  await page.reload(); await page.waitForSelector('text=/What should we make/');
  await page.keyboard.press('Escape');   // not signed in (CI): the setup sheet opens again after a reload
  assert(await theme() === 'dark', 'dark not kept after reload');
  await page.getByRole('button', { name: /Appearance/ }).click(); await page.getByRole('button', { name: /Appearance/ }).click();
  assert(await theme() === 'light', `back to light: ${await theme()}`);
});
await t('account sheet: menu opens it, Escape and Done close it, Help opens the readme', async () => {
  await menu('Account…'); await page.waitForSelector('text=Game tools');
  await page.waitForTimeout(3500);   // the background account re-check must not close a sheet the user opened
  assert(await page.locator('text=Game tools').count() === 1, 'the Account sheet closed by itself');
  await page.keyboard.press('Escape'); assert(await page.locator('text=Game tools').count() === 0, 'escape');
  // the sidebar's account button: "Account" when signed in, "Set up Claude Code" when not (CI)
  await page.getByRole('button', { name: /^(Account|Set up Claude Code)$/ }).first().click(); await page.getByRole('button', { name: /Done|Later/ }).click();
  assert(await page.locator('text=Game tools').count() === 0, 'done');
  await calls(); await page.getByRole('button', { name: 'Help' }).click();
  const c = await calls(); assert(c.some(([k, u]) => k === 'external' && u.includes('github.com')), JSON.stringify(c));
});
await t('small window (1100×680): nothing spills sideways', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 680));
  for (const open of [() => page.getByRole('tab', { name: /New game/ }).click(), () => sidebar(G).click()]) {
    await open(); await page.waitForTimeout(400);
    const over = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`).slice(0, 5));
    assert(!over.length, `overflow: ${over.join(', ')}`);
    await shot(`small-${await activeTab()}`);
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
});

// ------------------------------------------------------------------ real Claude Code (--claude)
if (o.flag('claude')) {
  const composer = () => page.locator('textarea[aria-label=Message]');
  // send, and wait until Claude Code has started (the Stop button), so idle() can't see the Send button from before
  const say = async (text) => { await composer().fill(text); await composer().press('Enter'); await page.waitForSelector('[aria-label=Stop]', { timeout: 15000 }); };
  const idle = (ms = 240000) => page.waitForSelector('[aria-label=Send]', { timeout: ms });
  await t('claude: a game chat replies, shows it working, and lands in Recents', async () => {
    await sidebar(G).click();
    await say('This is an automated test of the app. Reply with exactly the word pong and nothing else. Do not use any tools.');
    assert(await page.locator('text=/Claude Code is working/').count() > 0, 'no working indicator');
    await idle();
    await page.waitForSelector('aside >> text=/^pong\\.?$/i', { timeout: 5000 });
    assert(await page.locator('aside', { hasText: 'Recents' }).locator('button', { hasText: 'Reply with exactly the word pong' }).count() === 1, 'not in Recents');
  });
  await t('claude: a blocked command asks for permission, Allow lets it run', async () => {
    // network commands aren't pre-allowed (simple file commands like touch are auto-approved, so they can't test this)
    await say('Automated test: run exactly this shell command and nothing else: curl -sI https://example.com');
    await idle();
    await page.waitForSelector('text=/needs permission to run/', { timeout: 5000 });
    const cards = await page.locator('text=/needs permission to run/').count();
    await page.getByRole('button', { name: 'Allow' }).last().click();
    await page.waitForSelector('[aria-label=Stop]', { timeout: 15000 }); await idle();
    assert(await page.locator('text=/needs permission to run/').count() === cards, 'asked for permission again after Allow');
    assert(await page.getByRole('button', { name: 'Done' }).count() > 0, 'the Allow button did not turn into Done');
  });
  await t('claude: a message typed while it works is queued, then sent', async () => {
    await say('Automated test: reply with exactly the word one and nothing else. No tools.');
    await composer().fill('Automated test: reply with exactly the word two and nothing else. No tools.'); await composer().press('Enter');
    await page.waitForSelector('text=/Queued · sends when/', { timeout: 3000 });
    assert(await composer().inputValue() === '', 'composer not cleared after queueing');
    await page.waitForSelector('aside >> text=/^two\\.?$/i', { timeout: 240000 });
    await idle();
    assert(await page.locator('text=/Queued · sends when/').count() === 0, 'queue not emptied');
  });
  await t('claude: Stop ends a long request with a quiet "Stopped."', async () => {
    await say('Automated test: read every file in kit/ one at a time and summarise each in a sentence.');
    await page.waitForTimeout(6000);
    await page.getByLabel('Stop').click();
    await idle(20000);
    await page.waitForSelector('aside >> text=Stopped.', { timeout: 3000 });
    assert(await page.locator('text=/stopped before it finished/').count() === 0, 'a deliberate Stop shows as a failure');
    await shot('after-stop');
  });
  await t('claude: New chat during a run, then a message right away, stays working until its reply', async () => {
    await say('Automated test: read every file in kit/ one at a time and summarise each in a sentence.');
    await page.waitForTimeout(4000);
    await page.getByLabel('New chat').click();
    await say('Automated test: reply with exactly the word fresh and nothing else. No tools.');
    // the stopped run's late exit must not mark this new run as finished
    for (let i = 0; i < 1200 && !(await page.locator('aside >> text=/^fresh\\.?$/i').count()); i++) {
      assert(await page.locator('[aria-label=Stop]').count() === 1, 'the new run showed as finished before its reply arrived');
      await page.waitForTimeout(200);
    }
    await idle();
    assert(await page.locator('aside:has([aria-label="New chat"]) >> text=/read every file in kit/').count() === 0, 'the old conversation came back');   // the chat panel (Recents in the sidebar keeps the prompt)
  });
  await t('claude: the new-game chat becomes the new game\'s tab', async () => {
    rmSync(join(root, 'games/zz-e2e'), { recursive: true, force: true });
    await page.getByRole('tab', { name: /New game/ }).click();
    await say('Automated test of the app, not a real game request: run exactly `npm run new -- zz-e2e --template blank`, then reply "done". Do nothing else.');
    await idle(300000);
    await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent?.includes('Zz E2e'), null, { timeout: 10000 });
    assert(await page.locator('aside', { hasText: 'Chat' }).locator('text=/npm run new/').count() > 0, 'conversation did not move to the new game');
    assert(await sidebar('Zz E2e').count() === 1, 'not in the sidebar');
    await shot('new-game');
  });
  rmSync(join(root, 'games/zz-e2e'), { recursive: true, force: true });
}

await app.close();
const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

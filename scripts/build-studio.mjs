#!/usr/bin/env node
/**
 * Package Game Forge Studio as a standalone desktop app (no Node, npm or git needed by the person you give it to).
 *
 *   npm run studio:build              → the app for this computer's OS
 *   npm run studio:build -- --mac     → dist-studio/Game Forge Studio.app + Game-Forge-Studio.dmg   (on a Mac)
 *   npm run studio:build -- --win     → dist-studio/win/Game Forge Studio/ + Game-Forge-Studio-win-x64.zip
 *                                        (on Windows, or cross-built from a Mac: Windows Electron is downloaded and the
 *                                        game tools' native packages are installed for win32-x64)
 *
 * Layout (Electron's manual packaging): <resources>/app = the Studio UI + main process, <resources>/forge = the game
 * tools (kit, scripts, templates, skills, showcase games, asset library, node_modules). On first launch the app copies
 * the tools into ~/Game Forge and links node_modules/assets back. The playtest browser (Playwright's Chromium for the
 * target OS) ships in <resources>/forge/ms-playwright, so nothing is downloaded on first launch. Not code-signed: macOS asks for right-click → Open,
 * Windows SmartScreen shows "More info → Run anyway" the first time.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, symlinkSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { root, cli } from './lib/common.mjs';
import { IS_WIN, npmSync, zipDir } from './lib/platform.mjs';

const o = cli(['_', ...process.argv.slice(2)]);
const target = o.flag('win') ? 'win' : o.flag('mac') ? 'mac' : IS_WIN ? 'win' : 'mac';
if (target === 'mac' && process.platform !== 'darwin') { console.error('The macOS app has to be built on a Mac (codesign, hdiutil).'); process.exit(1); }
const out = join(root, 'dist-studio'), name = 'Game Forge Studio';
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const electronVersion = require('electron/package.json').version;
const SHOWCASE = ['neon-swarm', 'block-racer', 'hollow-house', 'blast-ball', 'siteline', 'banner-raid', 'sunset-district'];
const ENGINE = ['kit', 'scripts', 'templates', 'src', '.claude/skills', '.claude/settings.json', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'assets.html', 'README.md'];
const NOT_NEEDED = new Set(['electron', '@electron', 'electron-builder', 'app-builder-lib', 'app-builder-bin', 'dmg-builder', '7zip-bin', '.cache', '.vite']);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const step = (s) => console.log(`▸ ${s}`);

/** the app code (+ the exported Next.js UI, without its sources or node_modules) and the game tools */
function fillResources(R, nodeModules, target) {
  step('app code + UI');
  const ui = join(root, 'studio/ui');
  if (!existsSync(join(ui, 'node_modules'))) npmSync(['ci'], { cwd: ui });
  npmSync(['run', 'build'], { cwd: ui });
  mkdirSync(join(R, 'app'), { recursive: true });
  cpSync(join(root, 'studio'), join(R, 'app/studio'), { recursive: true, filter: (src) => { const p = src.split('\\').join('/'); return !/\/studio\/ui\/(?!out(\/|$))/.test(p); } });
  writeFileSync(join(R, 'app/package.json'), JSON.stringify({ name: 'game-forge-studio', productName: name, version: pkg.version, main: 'studio/main.mjs' }, null, 2));

  step('game tools, showcase games, asset library, libraries (the big part)');
  const F = join(R, 'forge'); mkdirSync(join(F, 'games'), { recursive: true });
  for (const f of ENGINE) if (existsSync(join(root, f))) cpSync(join(root, f), join(F, f), { recursive: true });
  for (const g of SHOWCASE) if (existsSync(join(root, 'games', g))) cpSync(join(root, 'games', g), join(F, 'games', g), { recursive: true });
  cpSync(join(root, 'assets'), join(F, 'assets'), { recursive: true });
  // Windows: no .bin (its POSIX symlinks don't survive a zip; the app's own shims call each package's bin directly)
  for (const d of readdirSync(nodeModules)) if (!NOT_NEEDED.has(d) && !(target === 'win' && d === '.bin')) cpSync(join(nodeModules, d), join(F, 'node_modules', d), { recursive: true, verbatimSymlinks: true });
  bundleChromium(join(F, 'ms-playwright'), target);
}

/**
 * Playwright's full Chromium for the target OS (playtests use it for --gpu, and as the headless browser when the
 * smaller headless shell isn't there). Downloaded once into .scratch/browsers-<target> and reused; on a Mac the
 * copy Playwright already installed is reused when its revision matches.
 */
function bundleChromium(dest, target) {
  const rev = JSON.parse(readFileSync(join(root, 'node_modules/playwright-core/browsers.json'), 'utf8')).browsers.find((b) => b.name === 'chromium').revision;
  const cache = join(root, `.scratch/browsers-${target}`), dir = `chromium-${rev}`;
  step(`playtest browser (Chromium ${rev} for ${target})`);
  if (!existsSync(join(cache, dir, 'INSTALLATION_COMPLETE'))) {
    const mine = join(homedir(), 'Library/Caches/ms-playwright', dir);
    if (target === 'mac' && existsSync(join(mine, 'INSTALLATION_COMPLETE'))) { mkdirSync(cache, { recursive: true }); sh('cp', ['-R', mine, cache]); }
    else {
      const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cache };
      if (target === 'win' && !IS_WIN) env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = 'win64';
      sh(process.execPath, [join(root, 'node_modules/playwright/cli.js'), 'install', 'chromium', '--no-shell'], { env });
    }
  }
  mkdirSync(dest, { recursive: true });
  if (IS_WIN) cpSync(join(cache, dir), join(dest, dir), { recursive: true });
  else sh('cp', ['-R', join(cache, dir), dest]);   // cp -R keeps the macOS framework symlinks
}

// ------------------------------------------------------------------ macOS: .app + .dmg
function buildMac() {
  const appPath = join(out, `${name}.app`), R = join(appPath, 'Contents/Resources');
  step('Electron (macOS)');
  rmSync(appPath, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  sh('cp', ['-R', join(dirname(require.resolve('electron')), 'dist/Electron.app'), appPath]);   // cp -R keeps the framework symlinks
  rmSync(join(R, 'default_app.asar'), { force: true });
  fillResources(R, join(root, 'node_modules'), 'mac');
  step('naming + signing');
  const plist = join(appPath, 'Contents/Info.plist');
  // Electron treats an executable named "Electron" as dev mode (app.isPackaged = false), so give it the app's name
  renameSync(join(appPath, 'Contents/MacOS/Electron'), join(appPath, 'Contents/MacOS', name));
  for (const [k, v] of [['CFBundleExecutable', name], ['CFBundleName', name], ['CFBundleDisplayName', name], ['CFBundleIdentifier', 'dev.gameforge.studio'], ['CFBundleShortVersionString', pkg.version]]) {
    try { sh('plutil', ['-replace', k, '-string', v, plist]); } catch { sh('plutil', ['-insert', k, '-string', v, plist]); }
  }
  sh('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'ignore' });   // ad-hoc: required for Apple Silicon to run it
  step('dmg');
  const stage = join(out, 'dmg'); rmSync(stage, { recursive: true, force: true }); mkdirSync(stage);
  sh('cp', ['-R', appPath, stage]); symlinkSync('/Applications', join(stage, 'Applications'));
  sh('hdiutil', ['create', '-volname', name, '-srcfolder', stage, '-ov', '-format', 'UDZO', join(out, 'Game-Forge-Studio.dmg')], { stdio: 'ignore' });
  rmSync(stage, { recursive: true, force: true });
  return [appPath, join(out, 'Game-Forge-Studio.dmg')];
}

// ------------------------------------------------------------------ Windows: folder + zip (native or cross-built)
async function buildWin() {
  const dir = join(out, 'win', name), R = join(dir, 'resources');
  rmSync(join(out, 'win'), { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  step(`Electron ${electronVersion} (Windows x64)`);
  let dist = join(dirname(require.resolve('electron')), 'dist');
  if (!IS_WIN) {
    const { downloadArtifact } = require('@electron/get');
    const zip = await downloadArtifact({ version: electronVersion, platform: 'win32', arch: 'x64', artifactName: 'electron' });
    dist = join(root, '.scratch/electron-win32-x64'); rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true });
    sh('unzip', ['-q', zip, '-d', dist]);
  }
  cpSync(dist, dir, { recursive: true });
  rmSync(join(R, 'default_app.asar'), { force: true });
  // an exe named electron.exe runs in dev mode (app.isPackaged = false), so name it after the app
  renameSync(join(dir, 'electron.exe'), join(dir, `${name}.exe`));

  let nodeModules = join(root, 'node_modules');
  if (!IS_WIN) {
    step('game tools for win32-x64 (npm ci --os=win32 --cpu=x64)');
    const stage = join(root, '.scratch/win-deps'); rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
    for (const f of ['package.json', 'package-lock.json']) cpSync(join(root, f), join(stage, f));
    npmSync(['ci', '--os=win32', '--cpu=x64', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage });
    nodeModules = join(stage, 'node_modules');
  }
  fillResources(R, nodeModules, 'win');
  step('zip');
  const zip = join(out, 'Game-Forge-Studio-win-x64.zip'); rmSync(zip, { force: true });
  zipDir(join(out, 'win'), zip);
  return [dir, zip];
}

const made = target === 'mac' ? buildMac() : await buildWin();
const size = (p) => { try { return execFileSync(IS_WIN ? 'powershell' : 'du', IS_WIN ? ['-NoProfile', '-Command', `"{0:N0} MB" -f ((Get-ChildItem -Recurse '${p}' | Measure-Object Length -Sum).Sum / 1MB)`] : ['-sh', p]).toString().split('\t')[0].trim(); } catch { return '?'; } };
for (const p of made) console.log(`✔ ${p} (${size(p)})`);

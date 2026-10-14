#!/usr/bin/env node
/**
 * Package Game Forge Studio as a standalone macOS app + .dmg (no Node, npm or git needed by the person you give it to).
 *
 *   npm run studio:build        → dist-studio/Game Forge Studio.app + dist-studio/Game-Forge-Studio.dmg
 *
 * Layout (Electron's documented manual packaging):
 *   Game Forge Studio.app/Contents/Resources/app/    the Studio UI + main process (studio/)
 *   Game Forge Studio.app/Contents/Resources/forge/  the game tools: kit, scripts, templates, skills, showcase games,
 *                                                    asset library and node_modules (Vite, Three, Phaser, Playwright…)
 * On first launch the app copies the tools into ~/Game Forge and links node_modules/assets back here.
 * Signing: ad-hoc only. Without an Apple Developer ID, people must right-click → Open the first time.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

if (process.platform !== 'darwin') { console.error('studio:build currently packages the macOS app (run it on a Mac).'); process.exit(1); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-studio'), name = 'Game Forge Studio';
const appPath = join(out, `${name}.app`), R = join(appPath, 'Contents/Resources');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const SHOWCASE = ['neon-swarm', 'block-racer', 'hollow-house', 'blast-ball', 'siteline', 'banner-raid'];
const ENGINE = ['kit', 'scripts', 'templates', 'src', '.claude/skills', '.claude/settings.json', 'CLAUDE.md', 'AGENTS.md', 'package.json', 'vite.config.ts', 'tsconfig.json', 'index.html', 'assets.html', 'README.md'];
const NOT_NEEDED = ['electron', '@electron', 'electron-builder', 'app-builder-lib', 'app-builder-bin', 'dmg-builder', '7zip-bin'];

console.log('▸ copying Electron');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const electronApp = join(dirname(createRequire(import.meta.url).resolve('electron')), 'dist/Electron.app');
sh('cp', ['-R', electronApp, appPath]);
rmSync(join(R, 'default_app.asar'), { force: true });

console.log('▸ app code (+ the Next.js UI, exported)');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm', uiDir = join(root, 'studio/ui');
if (!existsSync(join(uiDir, 'node_modules'))) sh(npm, ['ci'], { cwd: uiDir });
sh(npm, ['run', 'build'], { cwd: uiDir });
mkdirSync(join(R, 'app'), { recursive: true });
// the UI ships as its static export only — not its node_modules or sources
cpSync(join(root, 'studio'), join(R, 'app/studio'), { recursive: true, filter: (src) => !/studio\/ui\/(?!out(\/|$))/.test(src.split('\\').join('/')) || /studio\/ui$/.test(src) });
writeFileSync(join(R, 'app/package.json'), JSON.stringify({ name: 'game-forge-studio', productName: name, version: pkg.version, main: 'studio/main.mjs' }, null, 2));

console.log('▸ game tools, showcase games, asset library, libraries (this is the big part)');
const F = join(R, 'forge'); mkdirSync(join(F, 'games'), { recursive: true });
for (const f of ENGINE) if (existsSync(join(root, f))) cpSync(join(root, f), join(F, f), { recursive: true });
for (const g of SHOWCASE) cpSync(join(root, 'games', g), join(F, 'games', g), { recursive: true });
sh('rsync', ['-a', join(root, 'assets') + '/', join(F, 'assets') + '/']);
sh('rsync', ['-a', ...NOT_NEEDED.flatMap((n) => ['--exclude', `/${n}/`]), '--exclude', '.cache/', '--exclude', '/.vite/', join(root, 'node_modules') + '/', join(F, 'node_modules') + '/']);

console.log('▸ naming + signing');
const plist = join(appPath, 'Contents/Info.plist');
// Electron treats an executable named "Electron" as dev mode (app.isPackaged = false), so give it the app's name
sh('mv', [join(appPath, 'Contents/MacOS/Electron'), join(appPath, 'Contents/MacOS', name)]);
for (const [k, v] of [['CFBundleExecutable', name], ['CFBundleName', name], ['CFBundleDisplayName', name], ['CFBundleIdentifier', 'dev.gameforge.studio'], ['CFBundleShortVersionString', pkg.version]]) {
  try { sh('plutil', ['-replace', k, '-string', v, plist]); } catch { sh('plutil', ['-insert', k, '-string', v, plist]); }
}
sh('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'ignore' });   // ad-hoc: required for Apple Silicon to run it

console.log('▸ dmg');
const stage = join(out, 'dmg'); mkdirSync(stage);
sh('cp', ['-R', appPath, stage]); symlinkSync('/Applications', join(stage, 'Applications'));
sh('hdiutil', ['create', '-volname', name, '-srcfolder', stage, '-ov', '-format', 'UDZO', join(out, 'Game-Forge-Studio.dmg')], { stdio: 'ignore' });
rmSync(stage, { recursive: true, force: true });
const size = (p) => execFileSync('du', ['-sh', p]).toString().split('\t')[0];
console.log(`✔ ${appPath} (${size(appPath)})\n✔ ${join(out, 'Game-Forge-Studio.dmg')} (${size(join(out, 'Game-Forge-Studio.dmg'))})`);

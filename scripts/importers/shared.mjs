/** What every importer needs: the library path, glTF IO, polite HTTP, unzip, and the licence table. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { root } from '../lib/common.mjs';
import { IS_WIN, winTar } from '../lib/platform.mjs';

export const A = join(root, 'assets');
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);   // keep texture transforms, materials etc. intact

// Poly Haven's API terms ask every client to identify itself; we credit Poly Haven + ambientCG in README, LICENSES and the asset browser
const UA = { 'User-Agent': 'GameForge-AssetImporter/1.0 (+https://github.com/npmiaman/game-forge)' };
export const getJson = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };
export async function download(url, dest) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}
export function unzip(zip, dir) {
  mkdirSync(dir, { recursive: true });
  // Windows: System32's bsdtar (unzip is rarely installed there, and Git Bash's GNU tar can't read zip)
  if (IS_WIN) return void execFileSync(winTar(), ['-xf', zip, '-C', dir], { windowsHide: true });
  try { execFileSync('unzip', ['-qo', zip, '-d', dir]); } catch { execFileSync('tar', ['-xf', zip, '-C', dir]); }
}
export const tempDir = (prefix) => mkdtempSync(join(tmpdir(), `${prefix}-`));

/** read-modify-write a JSON side file (e.g. models/polyhaven/_meta.json) */
export function updateJson(path, fn) {
  const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  fn(data); writeFileSync(path, JSON.stringify(data, null, 1));
}

/** add or replace one row of assets/LICENSES.md */
export function writeLicense(title, url, license) {
  const p = join(A, 'LICENSES.md');
  const head = '# Asset licenses\n\nEvery asset here is free for commercial use and redistribution. Almost all are public domain (CC0, credit appreciated, not required); the Microsoft Rocketbox people are MIT — keep `models/rocketbox/LICENSE.md` with them. Poly Haven and ambientCG assets were fetched through their APIs (thanks!).\n\n| Asset | Source | License |\n|---|---|---|\n';
  const lines = existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Asset')) : [];
  const row = `| ${title} | ${url} | ${license.includes('CC0') || license.includes('Zero') ? 'CC0' : license} |`;
  const rows = [...new Set([...lines.filter((l) => !l.startsWith(`| ${title} |`)), row])].sort();
  writeFileSync(p, head + rows.join('\n') + '\n');
}

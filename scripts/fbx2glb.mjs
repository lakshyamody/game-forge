/**
 * FBX → GLB in headless Chromium (three's FBXLoader + GLTFExporter), so FBX-only packs become normal library GLBs.
 *   import { fbxConverter } from './fbx2glb.mjs';
 *   const c = await fbxConverter();  await c.model(fbxPath, { texturesDir }, outGlb);  await c.anims([{ path, name, inPlace }], outGlb);  await c.close();
 * Textures: TGA/PNG/JPG found by file name in texturesDir, downscaled to 1024, converted to PBR (Phong specular → roughness 0.72).
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function fbxConverter() {
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), server: { port: 0, open: false }, logLevel: 'error' });
  await server.listen();
  const base = `http://localhost:${server.httpServer.address().port}`;
  const url = (p) => `${base}/${relative(root, resolve(p)).split('\\').join('/')}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(`${base}/scripts/tools/fbx2glb.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  return {
    async model(fbx, { texturesDir }, out) {
      const textures = {};
      if (texturesDir && existsSync(texturesDir)) for (const f of readdirSync(texturesDir)) if (/\.(tga|png|jpe?g)$/i.test(f)) textures[f.toLowerCase()] = url(join(texturesDir, f));
      const b64 = await page.evaluate((a) => window.convertModel(a), { url: url(fbx), textures });
      writeFileSync(out, Buffer.from(b64, 'base64'));
    },
    async anims(items, out) {
      const r = await page.evaluate((a) => window.convertAnims(a), { items: items.map((i) => ({ ...i, url: url(i.path) })) });
      writeFileSync(out, Buffer.from(r.glb, 'base64'));
      return r.speeds;
    },
    async close() { await browser.close(); await server.close(); },
  };
}

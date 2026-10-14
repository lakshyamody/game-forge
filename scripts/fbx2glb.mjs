/**
 * FBX → GLB in headless Chromium (three's FBXLoader + GLTFExporter), so FBX-only packs become normal library GLBs.
 *   import { fbxConverter } from './fbx2glb.mjs';
 *   const c = await fbxConverter();  await c.model(fbxPath, { texturesDir }, outGlb);  await c.anims([{ path, name, inPlace }], outGlb);  await c.close();
 * Textures: TGA/PNG/JPG found by file name in texturesDir, downscaled to 1024, converted to PBR (Phong specular → roughness 0.72).
 */
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { root } from './lib/common.mjs';
import { devServer, launchChromium } from './lib/browser.mjs';
export async function fbxConverter() {
  const dev = await devServer();
  const url = (p) => dev.url(relative(root, resolve(p)).split('\\').join('/'));
  const browser = await launchChromium();   // software GL is plenty: this page only parses and exports
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(dev.url('scripts/tools/fbx2glb.html'));
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
    async close() { await browser.close(); await dev.close(); },
  };
}

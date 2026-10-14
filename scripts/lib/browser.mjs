/** Vite dev server + headless Chromium, shared by the playtest bot (shot.mjs) and the FBX converter (fbx2glb.mjs). */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { root } from './common.mjs';

/** start the repo's Vite dev server on a free port; `url('games/x/')` builds page URLs */
export async function devServer() {
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), server: { port: 0, open: false }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  return { server, base, url: (path = '') => base + path.replace(/^\//, ''), close: () => server.close() };
}

/**
 * Headless Chromium. `gpu: true` renders on the real GPU (accurate visuals, real fps); default is SwiftShader
 * software GL, which works anywhere (CI) but is slow.
 */
export async function launchChromium({ gpu = false } = {}) {
  const angle = process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'd3d11' : 'vulkan';
  const opts = (channel) => ({
    channel,
    args: [
      ...(gpu ? [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',   // games still run their audio code (errors still show); nothing comes out of the speakers
    ],
  });
  // the full chromium (not headless-shell) is needed for real-GPU rendering
  if (gpu) return chromium.launch(opts('chromium'));
  // Game Forge Studio ships only the full chromium: use it when the headless shell isn't installed
  try { return await chromium.launch(opts(undefined)); }
  catch (e) { if (/Executable doesn't exist/i.test(String(e?.message))) return chromium.launch(opts('chromium')); throw e; }
}

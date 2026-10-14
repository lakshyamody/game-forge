import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
// Every games/<slug>/index.html becomes its own page in the production build.
// GAME=<slug> builds just that game (used by `npm run ship`); otherwise the arcade + every game.
const only = process.env.GAME;
const games = readdirSync(resolve(root, 'games'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(root, 'games', d.name, 'index.html')))
  .map((d) => d.name)
  .filter((g) => !only || g === only);
// in Game Forge Studio, node_modules and assets are links into the app bundle: let the dev server read through them
const linked = ['node_modules', 'assets'].map((d) => resolve(root, d)).filter(existsSync).map((d) => realpathSync(d));

export default defineConfig({
  base: './',
  // dependency cache in the project, not node_modules/.vite (in the Studio app node_modules lives inside the signed app bundle)
  cacheDir: '.vite-cache',
  // the CC0 asset library is served as-is (stable paths for models/textures/sounds) — see kit/assets.ts
  publicDir: only ? false : 'assets',
  resolve: { alias: { '@kit': resolve(root, 'kit') } },
  server: { port: 5173, open: false, fs: { allow: [root, ...linked] } },
  build: {
    target: 'es2022',
    outDir: only ? `ship/${only}` : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        ...(only ? {} : { main: resolve(root, 'index.html'), assets: resolve(root, 'assets.html') }),
        ...Object.fromEntries(games.map((g) => [g, resolve(root, 'games', g, 'index.html')])),
      },
    },
  },
});

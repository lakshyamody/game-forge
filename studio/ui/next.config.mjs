/** Static export: Electron serves ./out over its own studio:// protocol (see studio/main/ui.mjs). */
import { fileURLToPath } from 'node:url';

export default {
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },   // this UI has its own package (not the repo root)
  output: 'export',
  images: { unoptimized: true },
  devIndicators: false,
};

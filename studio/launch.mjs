// `npm run studio`: start the Electron app. Clears ELECTRON_RUN_AS_NODE, which terminals inside VS Code
// (itself an Electron app) set — with it Electron would start as plain Node and the app would crash.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const electron = createRequire(import.meta.url)('electron');   // path to the Electron binary
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [fileURLToPath(new URL('./main.mjs', import.meta.url))], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));

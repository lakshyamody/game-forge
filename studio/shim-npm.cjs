// `npm` / `npx` stand-ins for the packaged app, run on Studio's built-in Node (ELECTRON_RUN_AS_NODE).
// Enough for this repo: `npm run <script> [-- args]`, `npx <bin> [args]`; installs are no-ops (everything is bundled).
const { spawn } = require('node:child_process');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const { join, dirname, delimiter } = require('node:path');

const mode = process.env.SHIM_MODE || 'npm';
let argv = process.argv.slice(2);
let root = process.cwd();
while (!existsSync(join(root, 'package.json')) && dirname(root) !== root) root = dirname(root);
const bin = join(root, 'node_modules', '.bin');
// Windows env keys are case-insensitive ("Path"): rebuild PATH once instead of adding a second key
const env = {}; let path = '';
for (const [k, v] of Object.entries(process.env)) { if (k.toLowerCase() === 'path') path = v || ''; else env[k] = v; }
env.PATH = [bin, path].filter(Boolean).join(delimiter);
delete env.SHIM_MODE;
// windowsHide on every spawn: Studio starts Claude Code without a console, so any console child that isn't hidden
// (cmd.exe for `npm run`, node for tools) would pop up a terminal window of its own
const done = (p) => p.on('exit', (c) => process.exit(c ?? 0));

/** find a tool's JS entry from the packages' "bin" fields (node_modules/.bin may be flattened by packagers) */
function resolveBin(name) {
  const nm = join(root, 'node_modules');
  const dirs = require('node:fs').readdirSync(nm).flatMap((d) => (d.startsWith('@') ? require('node:fs').readdirSync(join(nm, d)).map((s) => join(d, s)) : [d]));
  for (const d of dirs) {
    try { const pj = JSON.parse(readFileSync(join(nm, d, 'package.json'), 'utf8')); const b = typeof pj.bin === 'string' ? { [pj.name.split('/').pop()]: pj.bin } : pj.bin || {}; if (b[name]) return join(nm, d, b[name]); } catch { /* not a package */ }
  }
  return null;
}
/** run a node tool (tsc, vite, playwright…) on our Node */
function runBin(name, args) {
  const p = resolveBin(name);
  if (!p) { console.error(`${name}: not available in Game Forge Studio`); process.exit(127); }
  done(spawn(process.execPath, [realpathSync(p), ...args], { stdio: 'inherit', env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true }));
}

if (mode === 'npx') {
  if (argv[0] === '--yes' || argv[0] === '-y') argv = argv.slice(1);
  runBin(argv[0], argv.slice(1));
} else {
  const [cmd, ...rest] = argv;
  if (cmd === '-v' || cmd === '--version') { console.log('10.0.0 (Game Forge Studio)'); process.exit(0); }
  if (['install', 'i', 'ci', 'add', 'update'].includes(cmd)) { console.log('Dependencies come bundled with Game Forge Studio — nothing to install.'); process.exit(0); }
  if (cmd === 'exec') runBin(rest[0], rest.slice(1));
  else if (cmd === 'run' || cmd === 'run-script' || cmd === 'test' || cmd === 'start') {
    const name = cmd === 'test' || cmd === 'start' ? cmd : rest.shift();
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts || {};
    if (!name) { console.log(Object.keys(scripts).join('\n')); process.exit(0); }
    if (!scripts[name]) { console.error(`npm: no script "${name}"`); process.exit(1); }
    const extra = rest[0] === '--' ? rest.slice(1) : rest;
    const win = process.platform === 'win32';
    // quoting for the shell that runs the line: sh takes '…'; cmd.exe has no single quotes, only "…" (with \" inside).
    // Single quotes on Windows split `--title "Goal Rush"` into 'Goal and Rush' and new games started broken.
    const quote = (a) => (/^[\w./:=@+,-]+$/.test(a) ? a : win ? `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"` : `'${a.replace(/'/g, `'\\''`)}'`);
    const line = `${scripts[name]} ${extra.map(quote).join(' ')}`.trim();
    console.log(`\n> ${name}\n> ${line}\n`);
    // `node <script>` (most of this repo's scripts): run it on our Node directly, args as a list, no shell to re-parse them
    const direct = /^node\s+([\w./-]+)$/.exec(scripts[name]);
    if (direct) done(spawn(process.execPath, [join(root, direct[1]), ...extra], { stdio: 'inherit', cwd: root, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true }));
    else done(win ? spawn(line, { stdio: 'inherit', env, shell: true, windowsHide: true }) : spawn('/bin/sh', ['-c', line], { stdio: 'inherit', env }));
  } else { console.error(`npm ${cmd ?? ''}: not supported in Game Forge Studio (try: npm run <script>)`); process.exit(1); }
}

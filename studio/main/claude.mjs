/**
 * Chatting with Claude Code: one `claude -p … --output-format stream-json` run per message, resumed per game
 * (session ids in state), translated into friendly events for the page: start → text / tool … → result → end.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RES, ROOT, GAMES, IS_WIN } from './paths.mjs';
import { state, saveState } from './state.mjs';
import { childEnv, claudeCommand, claudeUpdated, claudeUpdating, killTree } from './env.mjs';
import { listGames } from './games.mjs';

export const NEW = '__new__';   // chat key for "make a new game" before the game exists
const STUDIO_PROMPT = `You are running inside Game Forge Studio, a desktop app for people who are not programmers.
- Reply in short, friendly plain language. Do not paste code unless the user asks for it. Say what changed in the game, not which functions changed.
- The app already runs the game dev server and shows a live preview that reloads on save. Never run \`npm run dev\` or \`npm run play\`, and never open a browser.
- Headless checks (\`npm run shot\`, \`npm run check\`, Playwright scripts) are fine and encouraged. Read the screenshots \`npm run shot\` lists (exact paths) and look at every one before saying a game looks right. For a scripted playtest, import \`devServer\` and \`launchChromium\` from scripts/lib/browser.mjs instead of starting vite yourself.
- Keep scratch files (logs, scripts) in .scratch/ inside the workspace, not /tmp or other folders outside it.
- If \`npm run shot\` reports a SwiftShader or "Basic Render" renderer, this computer has no usable GPU: the fps it shows is not the game's real speed, so don't chase the fps target; judge the screenshots and mention it.
- New game: after \`npm run new\`, run the choose-look skill (the user picks how the key things look from rendered options in a popup) and END YOUR TURN; build once their picks arrive. Same when they ask to change how something looks.
- When you create a new game, use \`npm run new\` so it lands in games/<slug>/ with a game.json, and say the game's name when you're done. The user plays it in the app: tell them to open its tab, never to run npm commands (they have no terminal).
- Only the games in games/ exist in this workspace: skip reference games that AGENTS.md names but aren't there.
- The user can apply staged kid-check fixes with buttons in the app; if they ask you to "fix 2", run \`npm run fixes -- apply <slug> 2\`.${IS_WIN ? `
- This is Windows. The workspace path has a space in it: quote paths. The PowerShell tool runs Windows PowerShell 5.1 (no \`&&\`, \`head\`, \`tail\`, \`grep\` or \`sed\`), so prefer the Read, Grep, Glob and Edit tools for files. Git, Python and unzip may not be installed; node, npm and npx always are.
- Windows won't recreate a folder right after deleting it while the preview server watches it (EPERM on mkdir): change files in place instead of deleting and recreating folders, and if a mkdir fails with EPERM, wait a second and retry.
- In \`npm run shot -- … --query\`, separate URL params with \`;\` instead of \`&\` (cmd.exe treats \`&\` as a second command).` : ''}`;
const BASE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Skill', 'TodoWrite', 'WebSearch', 'WebFetch',
  'Bash(npm run *)', 'Bash(npm install *)', 'Bash(npx tsc *)', 'Bash(node scripts/*)', 'Bash(node .scratch/*)', 'Bash(ls *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)',
  'Bash(grep *)', 'Bash(wc *)', 'Bash(mkdir *)', 'Bash(date*)', 'Bash(cp *)', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(sed -n *)', 'Bash(find *)', 'Bash(python3 *)',
  // the everyday glue of a build session (claude -p can't ask, so anything missing here just fails)
  'Bash(cd *)', 'Bash(echo *)', 'Bash(printf *)', 'Bash(node *)', 'Bash(npx *)', 'Bash(sort *)', 'Bash(uniq *)', 'Bash(cut *)', 'Bash(tr *)', 'Bash(awk *)',
  'Bash(jq *)', 'Bash(sleep *)', 'Bash(test *)', 'Bash(true*)', 'Bash(pwd*)', 'Bash(which *)', 'Bash(xargs *)', 'Bash(diff *)', 'Bash(touch *)', 'Bash(mv *)', 'Bash(rm .scratch/*)', 'Bash(rm -f .scratch/*)', 'Bash(rm -rf .scratch/*)',
  'Bash(sed -i *)',   // in-place edits, same reach as Edit (denied in Windows sessions: "requires approval: sed -i …")
  // subagents and deferred tools, for bigger builds
  'Agent', 'Task', 'ToolSearch',
  // Windows: Claude Code's main shell there is the PowerShell tool (even with Git Bash installed), and Bash(…) rules
  // don't cover it, so without these every command (npm run shot, node, listing assets) was denied: no playtests,
  // no screenshots. Same commands as above, in PowerShell's words (aliases like ls/cat/rm resolve to these cmdlets).
  ...(IS_WIN ? [
    'npm run *', 'npm install *', 'npx *', 'node *', 'git status*', 'git diff*', 'git log*', 'python *', 'py *',
    'Get-ChildItem *', 'Get-Content *', 'Get-Item *', 'Test-Path *', 'Resolve-Path *', 'Split-Path *', 'Join-Path *', 'Get-Location*', 'Set-Location *',
    'Select-String *', 'Select-Object *', 'Where-Object *', 'ForEach-Object *', 'Sort-Object *', 'Measure-Object*', 'Group-Object *', 'Compare-Object *',
    'Format-List*', 'Format-Table*', 'Out-String*', 'ConvertFrom-Json*', 'ConvertTo-Json*', 'Write-Output *', 'Write-Host *', 'Get-Date*', 'Start-Sleep *', 'Get-Command *',
    'New-Item *', 'Copy-Item *', 'Move-Item *', 'Rename-Item *', 'Remove-Item .scratch*', 'Remove-Item -Recurse -Force .scratch*', 'Remove-Item -Force -Recurse .scratch*',
  ].map((c) => `PowerShell(${c})`) : []),
];
/**
 * Full access (macOS and Windows): claude -p can't ask for approval, and real build sessions keep needing commands no
 * allow list anticipates (compound commands, redirects, `cd x && sed -i …`, scratch files outside the workspace), so
 * each one was simply denied and builds stopped testing their games. bypassPermissions runs every tool without an
 * approval step; BASE_TOOLS still documents the expected set and applies if this is ever switched back to acceptEdits.
 * Trade-off: Claude Code can run any command as the user.
 */
const PERMISSION_MODE = 'bypassPermissions';
/**
 * The session is Studio's, not the user's Claude Code setup: only this workspace's settings (project + local), and no
 * personal MCP servers. Otherwise personal plugins and hooks ran inside Studio (seen: a "talk like a caveman" hook, a
 * "brainstorm first" plugin, a user-level model override that pointed at an unavailable model, Gmail/Drive connectors),
 * changing how Claude talks and builds. The login is unaffected (credentials aren't a setting source).
 */
const ISOLATION = ['--setting-sources', 'project,local', '--strict-mcp-config'];
export const jobs = new Map();   // chat key → running claude process
const resets = new Map();   // chat key → how many times it was reset ("New chat")

/** `emit(event)` delivers { key, type, … } to the page */
export async function sendChat(key, text, slug, emit) {
  let waited = false;
  if (claudeUpdating()) {
    const gen = resets.get(key);
    // show it as working while it waits, so the page queues anything typed meanwhile instead of sending it twice
    emit({ key, type: 'start' }); emit({ key, type: 'tool', text: '⬆️ Updating Claude Code first' }); await claudeUpdated(); waited = true;
    if (resets.get(key) !== gen) return;   // the chat was reset while waiting: drop this message (the page already cleared it)
  }
  const fail = (text) => { emit({ key, type: 'error', text }); if (waited) emit({ key, type: 'end', code: 1, newGame: null, error: '', auth: false }); };
  const claude = claudeCommand();
  if (!claude) return fail('Claude Code is not installed yet.');
  if (jobs.has(key)) return fail('Still working on the last request — wait for it or press Stop.');
  const prompt = slug ? `[Working on the game in games/${slug}/ — read its GAME.md first if you haven't this session.]\n\n${text}` : text;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', PERMISSION_MODE, ...ISOLATION,
    '--append-system-prompt', STUDIO_PROMPT, '--allowedTools', ...BASE_TOOLS, ...state.allowed,
    // packaged app: assets/ and node_modules/ are links into the app bundle; without this Claude Code may not read them
    ...(RES !== ROOT ? ['--add-dir', RES] : [])];
  if (state.sessions[key]) args.push('--resume', state.sessions[key]);
  const before = new Set(listGames().map((g) => g.slug));
  // the prompt goes in on stdin: no command-line length limit (Windows: 32,767 chars, so a pasted log made spawn throw
  // and the message just vanished) and nothing for a shell to re-parse. Ending stdin also spares claude -p its 3 s wait
  // for more piped input on every message.
  let child;
  const startedAt = Date.now();
  // GAME_FORGE_STUDIO: scripts/ask.mjs tells Claude the Studio will show its "choose the look" options as a picker
  try { child = spawn(claude.file, [...claude.args, ...args], { cwd: ROOT, env: { ...childEnv(), ...claude.env, GAME_FORGE_STUDIO: '1' }, shell: claude.shell, windowsHide: true }); }
  catch (e) { return fail(`Couldn't start Claude Code: ${e.message}`); }
  child.stdin.on('error', () => {});   // it exited before reading: 'close' reports why
  child.stdin.end(prompt);
  // couldn't start at all (ENOENT/EACCES: missing, quarantined, or mid-update): say so instead of an Electron error dialog
  child.on('error', (e) => { if (child.pid || jobs.get(key) !== child) return; jobs.delete(key); emit({ key, type: 'error', text: `Couldn't start Claude Code: ${e.message}` }); emit({ key, type: 'end', code: 1, newGame: null, error: '', auth: false }); });
  jobs.set(key, child);
  emit({ key, type: 'start' });
  let buf = '', errText = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      // a chat reset while this run was going: keep its session id from coming back
      if (line && jobs.get(key) === child) handleLine(line, key, emit);
    }
  });
  child.stderr.on('data', (d) => (errText += d));
  child.on('close', (code) => {
    if (jobs.get(key) !== child) return;   // reset ("New chat"): that conversation is gone, and the page already moved on
    jobs.delete(key); saveState();
    // a brand-new game appeared during a "new game" chat → hand the session to that game
    const fresh = listGames().map((g) => g.slug).filter((s) => !before.has(s));
    if (key === NEW && fresh.length) { state.sessions[fresh[0]] = state.sessions[NEW]; delete state.sessions[NEW]; saveState(); }
    const auth = /not logged in|login expired|run \/login|invalid api key|authentication/i.test(errText);
    // "choose the look": the run left options waiting for the user (scripts/ask.mjs) → the page shows the picker
    const ask = pendingAsk(slug ?? fresh[0], startedAt);
    emit({ key, type: 'end', code, newGame: fresh[0] ?? null, error: code && !auth ? errText.trim().slice(-600) : '', auth, ask });
  });
}

/** "New chat": stop any run on this chat and forget its session, so the next message starts a fresh conversation */
export function resetChat(key) {
  const child = jobs.get(key);
  jobs.delete(key); killTree(child);
  resets.set(key, (resets.get(key) ?? 0) + 1);
  delete state.sessions[key]; saveState();
}

/** one stream-json line → page events */
// with full access the only denials left are Claude Code's own guards (e.g. rm -rf with a glob): no allow rule lifts them,
// so no "Allow" card for them (Claude works around them itself)
function handleLine(line, key, emit) {
  let ev; try { ev = JSON.parse(line); } catch { return; }
  if (ev.session_id) state.sessions[key] = ev.session_id;
  if (ev.type === 'assistant') for (const b of ev.message?.content ?? []) {
    if (b.type === 'text' && b.text.trim()) emit({ key, type: 'text', text: b.text });
    if (b.type === 'tool_use') emit({ key, type: 'tool', text: describeTool(b.name, b.input ?? {}) });
  }
  if (ev.type === 'result') emit({ key, type: 'result', ok: !ev.is_error, text: ev.is_error ? (ev.result || (ev.errors ?? []).join('\n')) : '', denials: (PERMISSION_MODE === 'bypassPermissions' ? [] : ev.permission_denials ?? []).map((p) => ({ tool: p.tool_name, input: p.tool_input })) });
}

/** a tool call in plain words, for the progress lines under a message */
function describeTool(name, i) {
  // workspace-relative, with / (Windows paths arrive as C:\Users\…\Game Forge\games\…, in any case)
  const root = ROOT.replace(/\\/g, '/').replace(/\/?$/, '/').toLowerCase();
  const f = (p) => { const s = String(p ?? '').replace(/\\/g, '/'); return s.toLowerCase().startsWith(root) ? s.slice(root.length) : s; };
  if (name === 'Write') return `✏️ Writing ${f(i.file_path)}`;
  if (name === 'Edit' || name === 'MultiEdit') return `✏️ Editing ${f(i.file_path)}`;
  if (name === 'Read') return `📖 Reading ${f(i.file_path)}`;
  if (name === 'Bash' || name === 'PowerShell') return `⚙️ ${i.description || String(i.command).slice(0, 80)}`;
  if (name === 'Grep' || name === 'Glob') return '🔎 Looking through the code';
  if (name === 'Skill') return `📘 Following the ${i.skill ?? ''} guide`;
  if (name === 'WebSearch' || name === 'WebFetch') return '🌐 Searching the web';
  if (name === 'TodoWrite') return '📝 Planning the steps';
  return `🛠 ${name}`;
}

/** options from scripts/ask.mjs still waiting for the user (written during this run) → { slug, title, questions } */
function pendingAsk(slug, since) {
  if (!slug) return null;
  try {
    const a = JSON.parse(readFileSync(join(GAMES, slug, 'choices', 'ask.json'), 'utf8'));
    return a.status === 'pending' && a.created >= since - 1000 ? { slug, ...a } : null;
  } catch { return null; }
}
/** the user's picks: recorded next to the options (the picks themselves go to Claude as the next message) */
export function answerAsk(slug, picks) {
  const f = join(GAMES, slug, 'choices', 'ask.json');
  try { const a = JSON.parse(readFileSync(f, 'utf8')); writeFileSync(f, JSON.stringify({ ...a, status: 'answered', picks, answered: Date.now() }, null, 2)); } catch { /* gone */ }
}

/**
 * Chatting with Claude Code: one `claude -p … --output-format stream-json` run per message, resumed per game
 * (session ids in state), translated into friendly events for the page: start → text / tool … → result → end.
 */
import { spawn } from 'node:child_process';
import { ROOT } from './paths.mjs';
import { state, saveState } from './state.mjs';
import { childEnv, claudeCommand, claudeUpdated, claudeUpdating, killTree } from './env.mjs';
import { listGames } from './games.mjs';

export const NEW = '__new__';   // chat key for "make a new game" before the game exists
const STUDIO_PROMPT = `You are running inside Game Forge Studio, a desktop app for people who are not programmers.
- Reply in short, friendly plain language. Do not paste code unless the user asks for it. Say what changed in the game, not which functions changed.
- The app already runs the game dev server and shows a live preview that reloads on save. Never run \`npm run dev\` or \`npm run play\`, and never open a browser.
- Headless checks (\`npm run shot\`, \`npm run check\`, Playwright scripts) are fine and encouraged.
- When you create a new game, use \`npm run new\` so it lands in games/<slug>/ with a game.json, and say the game's name when you're done.
- Only the games in games/ exist in this workspace: skip reference games that AGENTS.md names but aren't there.
- The user can apply staged kid-check fixes with buttons in the app; if they ask you to "fix 2", run \`npm run fixes -- apply <slug> 2\`.`;
const BASE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Skill', 'TodoWrite', 'WebSearch', 'WebFetch',
  'Bash(npm run *)', 'Bash(npm install *)', 'Bash(npx tsc *)', 'Bash(node scripts/*)', 'Bash(node .scratch/*)', 'Bash(ls *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)',
  'Bash(grep *)', 'Bash(wc *)', 'Bash(mkdir *)', 'Bash(date*)', 'Bash(cp *)', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(sed -n *)', 'Bash(find *)', 'Bash(python3 *)'];
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
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    '--append-system-prompt', STUDIO_PROMPT, '--allowedTools', ...BASE_TOOLS, ...state.allowed];
  if (state.sessions[key]) args.push('--resume', state.sessions[key]);
  const before = new Set(listGames().map((g) => g.slug));
  const child = spawn(claude.file, [...claude.args, ...args], { cwd: ROOT, env: { ...childEnv(), ...claude.env }, shell: claude.shell, windowsHide: true });
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
    emit({ key, type: 'end', code, newGame: fresh[0] ?? null, error: code && !auth ? errText.trim().slice(-600) : '', auth });
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
function handleLine(line, key, emit) {
  let ev; try { ev = JSON.parse(line); } catch { return; }
  if (ev.session_id) state.sessions[key] = ev.session_id;
  if (ev.type === 'assistant') for (const b of ev.message?.content ?? []) {
    if (b.type === 'text' && b.text.trim()) emit({ key, type: 'text', text: b.text });
    if (b.type === 'tool_use') emit({ key, type: 'tool', text: describeTool(b.name, b.input ?? {}) });
  }
  if (ev.type === 'result') emit({ key, type: 'result', ok: !ev.is_error, text: ev.is_error ? (ev.result || (ev.errors ?? []).join('\n')) : '', denials: (ev.permission_denials ?? []).map((p) => ({ tool: p.tool_name, input: p.tool_input })) });
}

/** a tool call in plain words, for the progress lines under a message */
function describeTool(name, i) {
  const f = (p) => String(p ?? '').replace(ROOT + '/', '');
  if (name === 'Write') return `✏️ Writing ${f(i.file_path)}`;
  if (name === 'Edit' || name === 'MultiEdit') return `✏️ Editing ${f(i.file_path)}`;
  if (name === 'Read') return `📖 Reading ${f(i.file_path)}`;
  if (name === 'Bash') return `⚙️ ${i.description || String(i.command).slice(0, 80)}`;
  if (name === 'Grep' || name === 'Glob') return '🔎 Looking through the code';
  if (name === 'Skill') return `📘 Following the ${i.skill ?? ''} guide`;
  if (name === 'WebSearch' || name === 'WebFetch') return '🌐 Searching the web';
  if (name === 'TodoWrite') return '📝 Planning the steps';
  return `🛠 ${name}`;
}

// Game Forge Studio — page logic. Talks to the app only through window.studio (see preload.cjs).
const $ = (id) => document.getElementById(id);
const S = window.studio;
const NEW = '__new__';
let env = null, games = [], current = NEW;     // current = selected game slug, or NEW
const chats = {};                               // key → [{kind, text, ...}]
const busy = new Set();

const IDEAS = ['A racing game in a city made of blocks', 'Dodge falling meteors with a tiny spaceship', 'A cooking game where orders get faster', 'Knights defend a castle from skeletons', 'A platformer where you collect stars'];
const TWEAKS = ['Make it harder', 'Make it easier', 'Add a boss', 'Make it look nicer', 'Add sound effects', 'Add a high score'];

// ------------------------------------------------------------------ setup / sign-in
async function check() {
  env = await S.checkEnv();
  const ready = !!env.claude && env.loggedIn && env.deps;
  $('setup').hidden = ready;
  $('stepInstall').classList.toggle('done', !!env.claude);
  $('installNote').textContent = env.claude ? `Installed (${env.version})` : 'Opens a terminal window with the official installer.';
  $('stepLogin').classList.toggle('done', env.loggedIn);
  $('loginBtn').disabled = !env.claude;
  $('stepTools').classList.toggle('done', env.deps);
  $('toolsNote').textContent = !env.deps ? 'Game tools are missing — reinstall Game Forge Studio.' : env.tools === 'ready' ? 'Ready' : env.tools;
  const st = $('status');
  st.className = 'status ' + (ready ? 'ok' : 'bad');
  $('statusText').textContent = !env.claude ? 'Claude Code not installed' : !env.loggedIn ? 'Not signed in — click to sign in' : `Claude Code · signed in${env.email ? ' as ' + env.email : ''}`;
  if (ready && !games.length) await refreshGames();
  return ready;
}
let poll = null;
function pollUntilReady() { clearInterval(poll); poll = setInterval(async () => { if (await check()) clearInterval(poll); }, 2500); }
$('installBtn').onclick = () => { S.installClaude(); pollUntilReady(); };
$('loginBtn').onclick = () => { S.login(); pollUntilReady(); };
$('recheck').onclick = check;
$('status').onclick = () => { if (!env?.loggedIn) { $('setup').hidden = false; } };

// ------------------------------------------------------------------ games list
async function refreshGames() {
  games = await S.games();
  $('games').innerHTML = '';
  for (const g of games) {
    const el = document.createElement('div');
    el.className = 'game' + (g.slug === current ? ' sel' : '');
    el.innerHTML = `<span class="sw"></span><div><div class="t"></div><div class="g"></div></div>${busy.has(g.slug) ? '<span class="busy">working</span>' : ''}`;
    el.querySelector('.sw').style.background = g.color;
    el.querySelector('.t').textContent = g.title;
    el.querySelector('.g').textContent = g.tagline;
    el.onclick = () => select(g.slug);
    $('games').appendChild(el);
  }
  renderHeader(); renderFixes();
}
function game() { return games.find((g) => g.slug === current) ?? null; }
function select(slug) { current = slug; refreshGames(); renderChat(); loadPreview(); $('input').focus(); }
$('newGame').onclick = () => select(NEW);
$('openFolder').onclick = () => S.openFolder(current === NEW ? null : current);

function renderHeader() {
  const g = game();
  $('chatTitle').textContent = g ? g.title : 'New game';
  $('chatSub').textContent = g ? (g.controls || g.tagline) : 'Describe the game you want and Claude Code will build it (about 20–30 minutes).';
  $('exportBtn').hidden = !g;
  $('previewTitle').textContent = g ? g.title : 'Preview';
  $('input').placeholder = g ? `Ask for a change to ${g.title}…` : 'Describe your game…';
  $('chips').innerHTML = '';
  for (const t of g ? TWEAKS : IDEAS) {
    const c = document.createElement('button'); c.className = 'chip'; c.textContent = t;
    c.onclick = () => { $('input').value = g ? t : `Make a game: ${t.toLowerCase()}`; $('input').focus(); };
    $('chips').appendChild(c);
  }
  const b = busy.has(key());
  $('send').hidden = b; $('stop').hidden = !b;
}
function renderFixes() {
  const g = game(), box = $('fixes');
  const open = g?.fixes.filter((f) => !f.done) ?? [];
  box.hidden = !g || !g.fixes.length;
  if (box.hidden) return;
  box.innerHTML = '<span class="lbl">Quick fixes:</span>';
  for (const f of g.fixes) {
    const b = document.createElement('button'); b.className = 'fix' + (f.done ? ' done' : '');
    b.textContent = `${f.done ? '✓' : f.n + '.'} ${f.text}`; b.title = `${f.text}\n${f.done ? 'Applied — click to undo' : 'Click to apply this fix'}`;
    b.onclick = () => runFix(g.slug, f.n, f.done);
    box.appendChild(b);
  }
  if (open.length > 1) { const a = document.createElement('button'); a.className = 'fix all'; a.textContent = 'Fix all'; a.onclick = () => runFix(g.slug, 'all', false); box.appendChild(a); }
}
async function runFix(slug, n, undo) {
  push(slug, { kind: 'tool', text: `${undo ? '↩️ Undoing' : '🔧 Applying'} fix ${n}…` });
  const r = undo ? await S.undoFix(slug, n) : await S.applyFix(slug, n);
  push(slug, r.code === 0 ? { kind: 'bot', text: undo ? `Undid fix ${n}.` : `Done — fix ${n === 'all' ? 'all' : n} is in. The preview has reloaded.` } : { kind: 'err', text: (r.stderr || r.stdout).trim().slice(-500) + '\n\nYou can also ask Claude to make this fix.' });
  await refreshGames();
}

// ------------------------------------------------------------------ chat
/** tiny safe markdown for Claude's replies: escape first, then **bold**, `code`, - bullets */
const md = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^- /gm, '• ');
const key = () => current;
function push(k, m) { (chats[k] ??= []).push(m); if (k === key()) renderChat(); }
function renderChat() {
  const box = $('messages'), list = chats[key()] ?? [];
  box.innerHTML = '';
  if (!list.length) {
    const g = game(), w = document.createElement('div'); w.className = 'welcome';
    w.innerHTML = g ? `<h2></h2>Ask for any change in plain words: <i>"make the enemies slower"</i>, <i>"add a jump"</i>, <i>"change the colours to purple"</i>. The preview updates by itself.` : '<h2>What do you want to make?</h2>Describe any game in a sentence or two. Claude Code designs it, builds it, plays it to test it, and lists 5 things to polish — each one a single click to fix.';
    if (g) w.querySelector('h2').textContent = g.title;
    box.appendChild(w);
  }
  for (const m of list) {
    const el = document.createElement('div');
    if (m.kind === 'retry') {
      el.className = 'perm'; el.innerHTML = '<div></div>'; el.firstChild.textContent = m.text;
      const b = document.createElement('button'); b.className = 'primary small'; b.textContent = m.used ? 'Retried' : 'Retry'; b.disabled = !!m.used;
      b.onclick = () => { m.used = true; send('Please continue where you left off.'); };
      el.appendChild(b);
    } else if (m.kind === 'perm') {
      el.className = 'perm';
      el.innerHTML = '<div>Claude Code wants to run <code></code></div>';
      el.querySelector('code').textContent = m.what;
      const b = document.createElement('button'); b.className = 'primary small'; b.textContent = m.allowed ? 'Allowed' : 'Allow & continue'; b.disabled = !!m.allowed;
      b.onclick = async () => { m.allowed = true; await S.allow(m.rule); send(`I've allowed ${m.what}. Please continue.`); };
      el.appendChild(b);
    } else { el.className = m.kind === 'tool' ? 'tool' : 'msg ' + m.kind; if (m.kind === 'bot') el.innerHTML = md(m.text); else el.textContent = m.text; }
    box.appendChild(el);
  }
  if (busy.has(key())) { const w = document.createElement('div'); w.className = 'working'; w.textContent = 'Claude Code is working'; box.appendChild(w); }
  box.scrollTop = box.scrollHeight;
  renderHeader();
}
async function send(text) {
  text = text.trim(); if (!text) return;
  if (!(await check())) return;
  const k = key();
  push(k, { kind: 'user', text });
  await S.send(k, text, k === NEW ? null : k);
}
$('composer').onsubmit = (e) => { e.preventDefault(); const t = $('input').value; $('input').value = ''; send(t); };
$('input').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); } };
$('stop').onclick = () => S.stop(key());
$('resetChat').onclick = async () => { await S.resetChat(key()); chats[key()] = []; renderChat(); };
$('exportBtn').onclick = async () => {
  const g = game(); if (!g) return;
  push(g.slug, { kind: 'tool', text: '📦 Packing the game into a zip for itch.io…' });
  const r = await S.exportGame(g.slug);
  push(g.slug, r.code === 0 ? { kind: 'bot', text: `Exported! The zip is open in Finder — upload it to itch.io as an HTML game (tick "played in the browser").` } : { kind: 'err', text: (r.stderr || r.stdout).trim().slice(-500) });
};

S.onChat(async (ev) => {
  const k = ev.key;
  if (ev.type === 'start') { busy.add(k); renderChat(); refreshGames(); }
  else if (ev.type === 'text') push(k, { kind: 'bot', text: ev.text });
  else if (ev.type === 'tool') push(k, { kind: 'tool', text: ev.text });
  else if (ev.type === 'error') push(k, { kind: 'err', text: ev.text });
  else if (ev.type === 'result') {
    if (!ev.ok) push(k, { kind: 'retry', text: /\[|_diagnostic|stop_reason/.test(ev.text || '') || !ev.text ? 'Claude Code stopped before finishing.' : ev.text });
    for (const d of ev.denials ?? []) {
      const cmd = d.tool === 'Bash' ? String(d.input?.command ?? '') : d.tool;
      const rule = d.tool === 'Bash' ? `Bash(${cmd.trim().split(/\s+/)[0]} *)` : d.tool;
      push(k, { kind: 'perm', what: d.tool === 'Bash' ? cmd.slice(0, 120) : d.tool, rule });
    }
  } else if (ev.type === 'end') {
    busy.delete(k);
    if (ev.auth) { push(k, { kind: 'err', text: 'Claude Code needs you to sign in again.' }); $('setup').hidden = false; check(); }
    else if (ev.error) push(k, { kind: 'err', text: ev.error });
    if (ev.newGame) { chats[ev.newGame] = [...(chats[NEW] ?? []), ...(chats[ev.newGame] ?? [])]; chats[NEW] = []; await refreshGames(); if (current === NEW) select(ev.newGame); }
    else { await refreshGames(); if (k === key()) renderChat(); if (k === current) loadPreview(true); }
  }
});
S.onTools?.((t) => { if (env) env.tools = t; check(); });
S.onGamesChanged(() => { clearTimeout(window.__gt); window.__gt = setTimeout(async () => { await refreshGames(); if (current === NEW && busy.has(NEW)) { /* the new game shows once the build finishes */ } }, 400); });

// ------------------------------------------------------------------ preview
let lastSrc = '';
function loadPreview(force = false) {
  const g = game();
  $('emptyPreview').hidden = !!g;
  if (!g || !env?.port) { $('frame').src = 'about:blank'; lastSrc = ''; return; }
  const src = `http://localhost:${env.port}/games/${g.slug}/`;
  if (force || src !== lastSrc) { $('frame').src = src; lastSrc = src; }
}
$('reload').onclick = () => loadPreview(true);
$('openBrowser').onclick = () => { const g = game(); if (g && env?.port) S.openExternal(`http://localhost:${env.port}/games/${g.slug}/`); };
$('togglePreview').onclick = () => document.querySelector('.layout').classList.toggle('noPreview');

(async () => { await check(); await refreshGames(); renderChat(); if (!env?.loggedIn || !env?.claude) pollUntilReady(); })();

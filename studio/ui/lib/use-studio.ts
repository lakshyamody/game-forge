'use client';
/**
 * All app state in one hook: environment (Claude Code install / sign-in), games, open tabs, per-tab chats,
 * busy flags and preview reloads. Mirrors the main process's chat events (start → text/tool → result → end).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { studio, NEW, FILE_MANAGER, type ChatEvent, type Env, type Game } from './studio';

export type Msg =
  | { id: number; kind: 'user' | 'bot' | 'err' | 'tool' | 'note'; text: string }
  | { id: number; kind: 'perm'; what: string; rule: string; done?: boolean }
  | { id: number; kind: 'retry'; text: string; done?: boolean };
type NewMsg = Msg extends infer M ? (M extends Msg ? Omit<M, 'id'> : never) : never;

/** a prompt the user sent, for the sidebar's Recents (kept in this computer's local storage) */
export type Recent = { key: string; text: string; at: number };
const loadRecents = (): Recent[] => { try { return JSON.parse(localStorage.getItem('studio:recents') ?? '[]') as Recent[]; } catch { return []; } };
const saveRecents = (r: Recent[]) => { try { localStorage.setItem('studio:recents', JSON.stringify(r)); } catch { /* private mode */ } };

let nextId = 1;
const ready = (e: Env | null) => !!e?.claude && e.loggedIn && e.deps;

export function useStudio() {
  const api = studio();
  const [env, setEnv] = useState<Env | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [tabs, setTabs] = useState<string[]>([NEW]);
  const [active, setActive] = useState<string>(NEW);
  const [chats, setChats] = useState<Record<string, Msg[]>>({});
  const [busy, setBusy] = useState<Map<string, number>>(new Map());   // chat key → start time
  const [reloads, setReloads] = useState<Record<string, number>>({});
  const [setupOpen, setSetupOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});   // unsent composer text per tab
  const setDraft = useCallback((key: string, text: string) => setDrafts((d) => ({ ...d, [key]: text })), []);
  const [recents, setRecentsState] = useState<Recent[]>([]);
  const setRecents = useCallback((f: (r: Recent[]) => Recent[]) => setRecentsState((r) => { const n = f(r).slice(0, 8); saveRecents(n); return n; }), []);
  useEffect(() => setRecentsState(loadRecents()), []);
  const activeRef = useRef(active); activeRef.current = active;
  const chatsRef = useRef(chats); chatsRef.current = chats;
  const busyRef = useRef(busy); busyRef.current = busy;
  const [queued, setQueued] = useState<Record<string, string>>({});   // typed while Claude Code was working: sent when it finishes
  const queuedRef = useRef(queued); queuedRef.current = queued;
  const queue = useCallback((key: string, text: string) => setQueued((q) => ({ ...q, [key]: q[key] ? `${q[key]}\n\n${text}` : text })), []);
  const stopped = useRef(new Set<string>());   // chats the user stopped: their end isn't an error

  const push = useCallback((key: string, m: NewMsg) => setChats((c) => ({ ...c, [key]: [...(c[key] ?? []), { ...m, id: nextId++ } as Msg] })), []);
  const patch = useCallback((key: string, id: number, p: Partial<Msg>) => setChats((c) => ({ ...c, [key]: (c[key] ?? []).map((m) => (m.id === id ? ({ ...m, ...p } as Msg) : m)) })), []);
  const reload = useCallback((slug: string) => setReloads((r) => ({ ...r, [slug]: (r[slug] ?? 0) + 1 })), []);

  const refreshGames = useCallback(async () => { if (api) setGames(await api.games()); }, [api]);
  const envRef = useRef(env); envRef.current = env;
  const check = useCallback(async () => {
    if (!api) return false;
    const before = envRef.current;   // null until the first check after launch
    const e = await api.checkEnv(); setEnv(e);
    if (ready(e) && before && !ready(before)) setSetupOpen(false);   // setup just finished: close the sheet (not when Account was opened on purpose)
    return ready(e);
  }, [api]);

  // ---- tabs
  const open = useCallback((key: string) => { setTabs((t) => (t.includes(key) ? t : [...t, key])); setActive(key); }, []);
  const close = useCallback((key: string) => {
    setTabs((t) => {
      const i = t.indexOf(key), next = t.filter((k) => k !== key);
      if (activeRef.current === key) setActive(next[Math.max(0, i - 1)] ?? NEW);
      return next.length ? next : [NEW];
    });
  }, []);

  // ---- chat
  const send = useCallback(async (text: string, key = activeRef.current) => {
    text = text.trim(); if (!text || !api) return;
    if (!(await check())) { setSetupOpen(true); return; }
    push(key, { kind: 'user', text });
    setRecents((r) => [{ key, text: text.slice(0, 140), at: Date.now() }, ...r.filter((x) => x.text !== text.slice(0, 140))]);
    await api.send(key, text, key === NEW ? null : key);
  }, [api, check, push, setRecents]);

  const runFix = useCallback(async (slug: string, n: number | 'all', undo: boolean) => {
    if (!api) return;
    push(slug, { kind: 'tool', text: `npm run fixes -- ${undo ? 'undo' : 'apply'} ${slug} ${n}` });
    const r = undo ? await api.undoFix(slug, n) : await api.applyFix(slug, n);
    push(slug, r.code === 0
      ? { kind: 'bot', text: n === 'all' ? (undo ? 'Reverted all fixes.' : 'Applied all fixes.') : undo ? `Reverted fix ${n}.` : `Applied fix ${n}.` }
      : { kind: 'err', text: (r.stderr || r.stdout).trim().slice(-500) + '\n\nYou can ask the agent to make this change instead.' });
    await refreshGames();
  }, [api, push, refreshGames]);

  const exportGame = useCallback(async (slug: string) => {
    if (!api) return;
    push(slug, { kind: 'tool', text: `npm run ship -- ${slug}` });
    const r = await api.exportGame(slug);
    push(slug, r.code === 0 ? { kind: 'bot', text: `Exported **${slug}.zip** (shown in ${FILE_MANAGER}). On itch.io, upload it as an HTML game and select **This file will be played in the browser**.` } : { kind: 'err', text: (r.stderr || r.stdout).trim().slice(-500) });
  }, [api, push]);

  const stop = useCallback(async (key: string) => { stopped.current.add(key); await api?.stop(key); }, [api]);

  // "New chat": clear the conversation here and in the main process (which also stops a run in progress;
  // that run sends no end event, so it's no longer busy from here on)
  const resetChat = useCallback(async (key: string) => {
    stopped.current.delete(key);
    setBusy((b) => { const n = new Map(b); n.delete(key); return n; });
    setQueued(({ [key]: _, ...rest }) => rest);
    setChats((c) => ({ ...c, [key]: [] }));
    await api?.resetChat(key);
  }, [api]);
  // "New game" (sidebar, File menu): a fresh start, unless the last new-game chat is still working
  const newGame = useCallback(() => {
    if (chatsRef.current[NEW]?.length && !busyRef.current.has(NEW)) void resetChat(NEW);
    open(NEW);
  }, [open, resetChat]);

  // ---- events from the main process
  useEffect(() => {
    if (!api) return;
    const offChat = api.onChat((ev: ChatEvent) => {
      const k = ev.key;
      if (ev.type === 'start') setBusy((b) => new Map(b).set(k, Date.now()));
      else if (ev.type === 'text') push(k, { kind: 'bot', text: ev.text });
      else if (ev.type === 'tool') push(k, { kind: 'tool', text: ev.text });
      else if (ev.type === 'error') push(k, { kind: 'err', text: ev.text });
      else if (ev.type === 'result') {
        if (!ev.ok && !stopped.current.has(k)) push(k, { kind: 'retry', text: /\[|_diagnostic|stop_reason/.test(ev.text || '') || !ev.text ? 'The agent stopped before it finished.' : ev.text });
        for (const d of ev.denials ?? []) {
          // shell tools (Bash, and PowerShell on Windows): allow that command, never the whole shell
          const shell = d.tool === 'Bash' || d.tool === 'PowerShell';
          const cmd = shell ? String(d.input?.command ?? '') : d.tool;
          push(k, { kind: 'perm', what: shell ? cmd.slice(0, 120) : d.tool, rule: shell ? `${d.tool}(${cmd.trim().split(/\s+/)[0]} *)` : d.tool });
        }
      } else if (ev.type === 'end') {
        setBusy((b) => { const n = new Map(b); n.delete(k); return n; });
        if (stopped.current.delete(k)) push(k, { kind: 'note', text: 'Stopped.' });
        else if (ev.auth) { push(k, { kind: 'err', text: 'Your Claude session expired. Sign in again to continue.' }); setSetupOpen(true); void check(); }
        else if (ev.error) push(k, { kind: 'err', text: ev.error });
        const next = queuedRef.current[k];
        if (next) { setQueued(({ [k]: _, ...rest }) => rest); void send(next, k); }
        void refreshGames().then(() => {
          if (ev.newGame) {
            const slug = ev.newGame;
            // the new-game conversation becomes that game's conversation, in a tab of its own
            setChats((c) => ({ ...c, [slug]: [...(c[NEW] ?? []), ...(c[slug] ?? [])], [NEW]: [] }));
            setRecents((r) => r.map((x) => (x.key === NEW ? { ...x, key: slug } : x)));
            setTabs((t) => [...t.filter((x) => x !== NEW && x !== slug), slug]);
            setActive(slug);
          } else if (k !== NEW) reload(k);
        });
      }
    });
    const offTools = api.onTools((t) => setEnv((e) => (e ? { ...e, tools: t } : e)));
    const offEnv = api.onEnvChanged(() => void check());
    let timer: ReturnType<typeof setTimeout>;
    const offGames = api.onGamesChanged(() => { clearTimeout(timer); timer = setTimeout(() => void refreshGames(), 400); });
    void refreshGames();   // the games list doesn't depend on the Claude Code check — show it right away
    void check().then((ok) => { if (!ok) setSetupOpen(true); });
    return () => { offChat(); offTools(); offEnv(); offGames(); clearTimeout(timer); };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // poll while setup isn't complete (Claude Code installing in the background, sign-in in the browser)
  useEffect(() => {
    if (!setupOpen) return;
    const t = setInterval(() => void check(), 2500);
    return () => clearInterval(t);
  }, [setupOpen, check]);

  const game = games.find((g) => g.slug === active) ?? null;
  return {
    api, env, ready: ready(env), games, game, tabs, active, chats, busy, reloads, setupOpen, recents,
    drafts, setDraft, queued, queue, setActive, open, close, send, stop, runFix, exportGame, resetChat, newGame, reload, check, setSetupOpen, push, patch,
    previewUrl: (slug: string) => (env?.port ? `http://localhost:${env.port}/games/${slug}/` : ''),
    thumbUrl: (g: Game) => (env?.port && g.thumb ? `http://localhost:${env.port}/games/${g.slug}/thumb.jpg` : ''),
  };
}
export type Studio = ReturnType<typeof useStudio>;

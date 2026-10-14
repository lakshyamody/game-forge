'use client';
/**
 * All app state in one hook: environment (Claude Code install / sign-in), games, open tabs, per-tab chats,
 * busy flags and preview reloads. Mirrors the main process's chat events (start → text/tool → result → end).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { studio, NEW, type ChatEvent, type Env, type Game } from './studio';

export type Msg =
  | { id: number; kind: 'user' | 'bot' | 'err' | 'tool'; text: string }
  | { id: number; kind: 'perm'; what: string; rule: string; done?: boolean }
  | { id: number; kind: 'retry'; text: string; done?: boolean };
type NewMsg = Msg extends infer M ? (M extends Msg ? Omit<M, 'id'> : never) : never;

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
  const activeRef = useRef(active); activeRef.current = active;

  const push = useCallback((key: string, m: NewMsg) => setChats((c) => ({ ...c, [key]: [...(c[key] ?? []), { ...m, id: nextId++ } as Msg] })), []);
  const patch = useCallback((key: string, id: number, p: Partial<Msg>) => setChats((c) => ({ ...c, [key]: (c[key] ?? []).map((m) => (m.id === id ? ({ ...m, ...p } as Msg) : m)) })), []);
  const reload = useCallback((slug: string) => setReloads((r) => ({ ...r, [slug]: (r[slug] ?? 0) + 1 })), []);

  const refreshGames = useCallback(async () => { if (api) setGames(await api.games()); }, [api]);
  const check = useCallback(async () => {
    if (!api) return false;
    const e = await api.checkEnv(); setEnv(e);
    if (ready(e)) setSetupOpen(false);
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
    await api.send(key, text, key === NEW ? null : key);
  }, [api, check, push]);

  const runFix = useCallback(async (slug: string, n: number | 'all', undo: boolean) => {
    if (!api) return;
    push(slug, { kind: 'tool', text: `npm run fixes -- ${undo ? 'undo' : 'apply'} ${slug} ${n}` });
    const r = undo ? await api.undoFix(slug, n) : await api.applyFix(slug, n);
    push(slug, r.code === 0
      ? { kind: 'bot', text: undo ? `Reverted fix ${n}.` : n === 'all' ? 'Applied all fixes.' : `Applied fix ${n}.` }
      : { kind: 'err', text: (r.stderr || r.stdout).trim().slice(-500) + '\n\nYou can ask the agent to make this change instead.' });
    await refreshGames();
  }, [api, push, refreshGames]);

  const exportGame = useCallback(async (slug: string) => {
    if (!api) return;
    push(slug, { kind: 'tool', text: `npm run ship -- ${slug}` });
    const r = await api.exportGame(slug);
    push(slug, r.code === 0 ? { kind: 'bot', text: `Exported **${slug}.zip** (shown in Finder). On itch.io, upload it as an HTML game and select **This file will be played in the browser**.` } : { kind: 'err', text: (r.stderr || r.stdout).trim().slice(-500) });
  }, [api, push]);

  const resetChat = useCallback(async (key: string) => { await api?.resetChat(key); setChats((c) => ({ ...c, [key]: [] })); }, [api]);

  // ---- events from the main process
  useEffect(() => {
    if (!api) return;
    api.onChat((ev: ChatEvent) => {
      const k = ev.key;
      if (ev.type === 'start') setBusy((b) => new Map(b).set(k, Date.now()));
      else if (ev.type === 'text') push(k, { kind: 'bot', text: ev.text });
      else if (ev.type === 'tool') push(k, { kind: 'tool', text: ev.text });
      else if (ev.type === 'error') push(k, { kind: 'err', text: ev.text });
      else if (ev.type === 'result') {
        if (!ev.ok) push(k, { kind: 'retry', text: /\[|_diagnostic|stop_reason/.test(ev.text || '') || !ev.text ? 'The agent stopped before it finished.' : ev.text });
        for (const d of ev.denials ?? []) {
          const cmd = d.tool === 'Bash' ? String(d.input?.command ?? '') : d.tool;
          push(k, { kind: 'perm', what: d.tool === 'Bash' ? cmd.slice(0, 120) : d.tool, rule: d.tool === 'Bash' ? `Bash(${cmd.trim().split(/\s+/)[0]} *)` : d.tool });
        }
      } else if (ev.type === 'end') {
        setBusy((b) => { const n = new Map(b); n.delete(k); return n; });
        if (ev.auth) { push(k, { kind: 'err', text: 'Your Claude session expired. Sign in again to continue.' }); setSetupOpen(true); void check(); }
        else if (ev.error) push(k, { kind: 'err', text: ev.error });
        void refreshGames().then(() => {
          if (ev.newGame) {
            const slug = ev.newGame;
            // the new-game conversation becomes that game's conversation, in a tab of its own
            setChats((c) => ({ ...c, [slug]: [...(c[NEW] ?? []), ...(c[slug] ?? [])], [NEW]: [] }));
            setTabs((t) => [...t.filter((x) => x !== NEW && x !== slug), slug]);
            setActive(slug);
          } else if (k !== NEW) reload(k);
        });
      }
    });
    api.onTools((t) => setEnv((e) => (e ? { ...e, tools: t } : e)));
    let timer: ReturnType<typeof setTimeout>;
    api.onGamesChanged(() => { clearTimeout(timer); timer = setTimeout(() => void refreshGames(), 400); });
    void (async () => { const ok = await check(); await refreshGames(); if (!ok) setSetupOpen(true); })();
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // poll while setup isn't complete (install / sign-in happen in a terminal window)
  useEffect(() => {
    if (!setupOpen) return;
    const t = setInterval(() => void check(), 2500);
    return () => clearInterval(t);
  }, [setupOpen, check]);

  const game = games.find((g) => g.slug === active) ?? null;
  return {
    api, env, ready: ready(env), games, game, tabs, active, chats, busy, reloads, setupOpen,
    drafts, setDraft, setActive, open, close, send, runFix, exportGame, resetChat, reload, check, setSetupOpen, push, patch,
    previewUrl: (slug: string) => (env?.port ? `http://localhost:${env.port}/games/${slug}/` : ''),
    thumbUrl: (g: Game) => (env?.port && g.thumb ? `http://localhost:${env.port}/games/${g.slug}/thumb.jpg` : ''),
  };
}
export type Studio = ReturnType<typeof useStudio>;

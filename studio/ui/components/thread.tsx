'use client';
/** The right panel: the conversation with Claude Code for the active tab, styled as a chat thread. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, PanelRightClose, SquarePen, Terminal, PencilLine, FileText, Search, BookOpen, Globe, ListChecks, ShieldAlert, RotateCcw, ArrowUp, Square as StopIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NEW, kbd } from '@/lib/studio';
import type { Msg, Studio } from '@/lib/use-studio';
import { Avatar, Button, IconButton, Square } from './ui';

const md = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^[-•] /gm, '• ');

const EMOJI = /^\p{Extended_Pictographic}️?\s*/u;
function step(text: string) {
  const e = text.match(EMOJI)?.[0].trim() ?? '';
  const Icon = { '✏️': PencilLine, '✏': PencilLine, '📖': FileText, '⚙️': Terminal, '⚙': Terminal, '🔎': Search, '📘': BookOpen, '🌐': Globe, '📝': ListChecks }[e] ?? Terminal;
  return { Icon, label: text.replace(EMOJI, '') };
}

/** consecutive messages from the same side form a group: one avatar, stacked bubbles */
type Group = { who: 'me' | 'agent'; items: Msg[] };
function groups(list: Msg[]): Group[] {
  const out: Group[] = [];
  for (const m of list) {
    const who = m.kind === 'user' ? 'me' : 'agent';
    const last = out[out.length - 1];
    if (last?.who === who) last.items.push(m); else out.push({ who, items: [m] });
  }
  return out;
}
const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const date = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Thread({ s, width, onHide }: { s: Studio; width: number; onHide: () => void }) {
  const key = s.games.some((g) => g.slug === s.active) ? s.active : NEW;   // arcade / assets tabs use the new-game thread
  const g = s.games.find((x) => x.slug === key) ?? null;
  const list = s.chats[key] ?? [], started = s.busy.get(key);
  const gs = useMemo(() => groups(list), [list]);
  const me = s.env?.email ?? 'You';
  const scroller = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  useEffect(() => { if (!started) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [started]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [list.length, started]);

  return (
    <aside className="flex shrink-0 flex-col overflow-hidden rounded-lg bg-panel" style={{ width }}>
      <header className="flex h-11 shrink-0 items-center gap-2 pl-4 pr-2">
        <span className="truncate text-[13px] font-medium">Thread <span className="text-subtle">{g ? g.slug : 'new'}</span></span>
        <div className="flex-1" />
        <IconButton label="New thread" onClick={() => void s.resetChat(key)}><SquarePen size={13} strokeWidth={1.9} /></IconButton>
        <IconButton label={`Hide thread (${kbd('J')})`} onClick={onHide}><PanelRightClose size={14} strokeWidth={1.9} /></IconButton>
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
        <div className="flex-1" />
        <div className="flex flex-col items-center py-6 text-center">
          {g ? <Square color={g.color} size={22} /> : <Avatar glyph={<Bot size={13} strokeWidth={2} />} tone="#a78bfa" />}
          <p className="mt-2 text-[12.5px] leading-snug text-muted">
            {g ? <><span className="text-fg">{g.title}</span> was created<br />{g.created ? `on ${date(g.created)}.` : ''}</> : <>Describe a game and the agent<br />will build it here.</>}
          </p>
        </div>
        <div className="space-y-4 pb-3">
          {gs.map((grp, i) => <GroupView key={grp.items[0].id} grp={grp} me={me} s={s} chatKey={key} last={i === gs.length - 1} />)}
        </div>
      </div>

      <Composer s={s} chatKey={key} game={g?.title ?? null} started={started} />
    </aside>
  );
}

function GroupView({ grp, me, s, chatKey }: { grp: Group; me: string; s: Studio; chatKey: string; last: boolean }) {
  return (
    <div className="flex items-end gap-2">
      {grp.who === 'me' ? <Avatar label={me} tone="#38bdf8" /> : <Avatar glyph={<Bot size={13} strokeWidth={2} />} tone="#a78bfa" />}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {chunk(grp.items).map((c) => c.kind === 'tools' ? <Tools key={`t${c.items[0].id}`} items={c.items} /> : <Bubble key={c.m.id} m={c.m} s={s} chatKey={chatKey} />)}
      </div>
    </div>
  );
}

type Chunk = { kind: 'tools'; items: { id: number; text: string }[] } | { kind: 'msg'; m: Msg };
function chunk(items: Msg[]): Chunk[] {
  const out: Chunk[] = [];
  for (const m of items) {
    const last = out[out.length - 1];
    if (m.kind === 'tool') { if (last?.kind === 'tools') last.items.push(m); else out.push({ kind: 'tools', items: [m] }); }
    else out.push({ kind: 'msg', m });
  }
  return out;
}

/** tool calls as small chips (like the reference's linked-issue chips); long runs collapse */
function Tools({ items }: { items: { id: number; text: string }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(-3);
  return (
    <div className="flex max-w-full flex-col items-start gap-1">
      {!all && items.length > 3 && <button onClick={() => setAll(true)} className="rounded-md px-1.5 text-[11.5px] text-subtle hover:text-fg">+{items.length - 3} earlier steps</button>}
      {shown.map((m) => { const st = step(m.text); return (
        <span key={m.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-bubble px-2 py-[3px] text-[12px] text-muted ring-1 ring-line">
          <st.Icon size={12} strokeWidth={1.9} className="shrink-0 text-subtle" /><span className="truncate">{st.label}</span>
        </span>
      ); })}
    </div>
  );
}

function Bubble({ m, s, chatKey }: { m: Msg; s: Studio; chatKey: string }) {
  const base = 'max-w-full rounded-xl px-3 py-[7px] text-[13px] leading-[1.55] whitespace-pre-wrap break-words';
  if (m.kind === 'user') return <div className={cn(base, 'bg-bubble')}>{m.text}</div>;
  if (m.kind === 'bot') return <div className={cn(base, 'md bg-bubble')} dangerouslySetInnerHTML={{ __html: md(m.text) }} />;
  if (m.kind === 'err') return <div className={cn(base, 'bg-bad/12 text-bad')}>{m.text}</div>;
  if (m.kind === 'tool') return null;
  const a = m as Extract<Msg, { kind: 'perm' | 'retry' }>;
  return (
    <div className={cn(base, 'bg-warn/10')}>
      <div className="flex items-start gap-2">
        {a.kind === 'perm' ? <ShieldAlert size={14} className="mt-[2px] shrink-0 text-warn" /> : <RotateCcw size={14} className="mt-[2px] shrink-0 text-warn" />}
        <span>{a.kind === 'perm' ? <>Needs permission to run <code className="font-mono text-[12px]">{a.what}</code></> : a.text}</span>
      </div>
      <Button size="sm" variant="primary" className="mt-2" disabled={a.done} onClick={async () => {
        s.patch(chatKey, a.id, { done: true });
        if (a.kind === 'perm') { await s.api?.allow(a.rule); await s.send(`I've allowed ${a.what}. Please continue.`, chatKey); }
        else await s.send('Please continue where you left off.', chatKey);
      }}>{a.done ? 'Done' : a.kind === 'perm' ? 'Allow' : 'Continue'}</Button>
    </div>
  );
}

function Composer({ s, chatKey, game, started }: { s: Studio; chatKey: string; game: string | null; started?: number }) {
  const text = s.drafts[chatKey] ?? '', setText = (t: string) => s.setDraft(chatKey, t);
  const ta = useRef<HTMLTextAreaElement>(null);
  const hasText = text !== '';
  useEffect(() => { const t = ta.current; if (t) { t.style.height = '0'; t.style.height = `${Math.min(160, t.scrollHeight)}px`; } }, [text]);
  useEffect(() => { const t = ta.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, [chatKey, hasText]);
  const submit = () => { if (!text.trim() || started) return; void s.send(text, chatKey); setText(''); };
  return (
    <div className="shrink-0 px-3 pb-2">
      <div className="flex items-end gap-1 rounded-lg bg-raised py-1 pr-1 pl-3 ring-1 ring-line focus-within:ring-line-strong">
        <textarea ref={ta} rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={!s.ready && !!s.env}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Message…" aria-label="Message"
          className="max-h-[160px] min-w-0 flex-1 resize-none bg-transparent py-[5px] text-[13px] leading-[1.5] outline-none placeholder:text-subtle" />
        {started
          ? <IconButton label="Stop" onClick={() => void s.api?.stop(chatKey)} className="h-7 w-7 text-fg"><StopIcon size={11} fill="currentColor" /></IconButton>
          : <IconButton label="Send" onClick={submit} disabled={!text.trim()} className="h-7 w-7 text-fg"><ArrowUp size={15} strokeWidth={2.2} /></IconButton>}
      </div>
      <div className="h-6 px-1 pt-1 text-[12px] text-subtle">
        {started ? <><span className="font-medium text-muted">Claude Code</span> is working… {clock(Date.now() - started)}</> : <span>Return to send · Shift-Return for a new line</span>}
      </div>
    </div>
  );
}
